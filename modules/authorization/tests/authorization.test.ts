import { assert, describe, it } from "@effect/vitest"
import * as Effect from "effect/Effect"

import { IdentityCapabilities } from "../../identity/mod.ts"
import {
  AuthorizationCapabilities,
  AuthorizationDenied,
  AuthorizationService,
  CapabilityAlreadyGranted,
  makeAuthorizationTestLayer,
  TenantMembershipAlreadyExists,
  TenantMembershipNotFound,
} from "../mod.ts"

const principal = { userAccountId: "admin", sessionId: "session" }
const initialGrant = {
  userAccountId: principal.userAccountId,
  tenantId: "tenant-a",
  capability: IdentityCapabilities.userAccountRead,
}

const withAuthorization = <A, E>(program: Effect.Effect<A, E, AuthorizationService>) =>
  Effect.provide(program, makeAuthorizationTestLayer([initialGrant]))

describe("authorization contract", () => {
  it.effect("allows an explicit tenant-scoped capability", () =>
    withAuthorization(Effect.gen(function* () {
      const service = yield* AuthorizationService
      const decision = yield* service.authorize({
        principal,
        tenantId: "tenant-a",
        capability: IdentityCapabilities.userAccountRead,
      })
      assert.strictEqual(decision.allowed, true)
      assert.strictEqual(decision.grant, "membership")
    })))

  it.effect("authorizes Process Studio reads and runtime controls only when granted", () =>
    Effect.provide(
      Effect.gen(function* () {
        const service = yield* AuthorizationService
        for (
          const capability of [
            "process.catalog.read",
            "process.runtime.retry",
          ] as const
        ) {
          assert.strictEqual(
            (yield* service.authorize({
              principal,
              tenantId: "tenant-a",
              capability,
            })).allowed,
            true,
          )
        }
      }),
      makeAuthorizationTestLayer([
        initialGrant,
        { ...initialGrant, capability: "process.catalog.read" },
        { ...initialGrant, capability: "process.runtime.retry" },
      ]),
    ))

  it.effect("denies by default and on scope mismatch", () =>
    withAuthorization(Effect.gen(function* () {
      const service = yield* AuthorizationService
      const error = yield* Effect.flip(service.authorize({
        principal,
        tenantId: "tenant-b",
        capability: IdentityCapabilities.userAccountRead,
      }))
      assert.instanceOf(error, AuthorizationDenied)
    })))

  it.effect("rejects duplicate grants", () =>
    withAuthorization(Effect.gen(function* () {
      const service = yield* AuthorizationService
      const error = yield* Effect.flip(service.grant(initialGrant))
      assert.instanceOf(error, CapabilityAlreadyGranted)
    })))

  it.effect("suspends tenant access without deleting the global account", () =>
    withAuthorization(Effect.gen(function* () {
      const service = yield* AuthorizationService
      yield* service.suspendMember({
        userAccountId: principal.userAccountId,
        tenantId: "tenant-a",
      })
      assert.instanceOf(
        yield* Effect.flip(service.authorize({
          principal,
          tenantId: "tenant-a",
          capability: IdentityCapabilities.userAccountRead,
        })),
        AuthorizationDenied,
      )
      yield* service.activateMember({
        userAccountId: principal.userAccountId,
        tenantId: "tenant-a",
      })
      assert.strictEqual(
        (yield* service.authorize({
          principal,
          tenantId: "tenant-a",
          capability: IdentityCapabilities.userAccountRead,
        })).allowed,
        true,
      )
    })))

  it.effect("lists memberships with optional status and limit filters", () =>
    Effect.provide(
      Effect.gen(function* () {
        const service = yield* AuthorizationService
        yield* service.addMember({ userAccountId: "user-c", tenantId: "tenant-a" })
        yield* service.addMember({ userAccountId: "user-a", tenantId: "tenant-a" })
        yield* service.addMember({ userAccountId: "user-b", tenantId: "tenant-a" })
        yield* service.addMember({ userAccountId: "user-z", tenantId: "tenant-b" })
        yield* service.suspendMember({ userAccountId: "user-b", tenantId: "tenant-a" })

        assert.deepStrictEqual(
          (yield* service.listMembers({ tenantId: "tenant-a" })).map(({ userAccountId }) =>
            userAccountId
          ),
          ["user-a", "user-b", "user-c"],
        )
        assert.deepStrictEqual(
          yield* service.listMembers({ tenantId: "tenant-a", search: "USER-B" }),
          [{ userAccountId: "user-b", tenantId: "tenant-a", status: "suspended" }],
        )
        assert.deepStrictEqual(
          yield* service.listMembers({ tenantId: "tenant-a", status: "suspended" }),
          [{ userAccountId: "user-b", tenantId: "tenant-a", status: "suspended" }],
        )
        assert.deepStrictEqual(
          (yield* service.listMembers({ tenantId: "tenant-a", limit: 1 })).map(
            ({ userAccountId }) => userAccountId,
          ),
          ["user-a"],
        )
      }),
      makeAuthorizationTestLayer(),
    ))

  it.effect("lists only active tenants for the requested user account", () =>
    Effect.provide(
      Effect.gen(function* () {
        const service = yield* AuthorizationService
        yield* service.addMember({ userAccountId: principal.userAccountId, tenantId: "tenant-b" })
        yield* service.addMember({ userAccountId: principal.userAccountId, tenantId: "tenant-c" })
        yield* service.suspendMember({
          userAccountId: principal.userAccountId,
          tenantId: "tenant-a",
        })
        yield* service.addMember({ userAccountId: "other-user", tenantId: "tenant-a" })

        assert.deepStrictEqual(
          yield* service.listAccessibleTenants({
            userAccountId: principal.userAccountId,
            tenantId: "tenant-not-selected",
          }),
          [
            { userAccountId: principal.userAccountId, tenantId: "tenant-b", status: "active" },
            { userAccountId: principal.userAccountId, tenantId: "tenant-c", status: "active" },
          ],
        )
      }),
      makeAuthorizationTestLayer([initialGrant]),
    ))

  it.effect("lists direct grants deterministically across suspension and tenant boundaries", () =>
    Effect.provide(
      Effect.gen(function* () {
        const service = yield* AuthorizationService
        const input = { userAccountId: principal.userAccountId, tenantId: "tenant-a" }

        assert.deepStrictEqual(yield* service.listDirectGrants(input), [
          { ...input, capability: AuthorizationCapabilities.capabilityGrant, scope: "tenant" },
          { ...input, capability: IdentityCapabilities.userAccountRead, scope: "tenant" },
        ])
        yield* service.suspendMember(input)
        assert.strictEqual((yield* service.listDirectGrants(input)).length, 2)

        yield* service.addMember({ userAccountId: principal.userAccountId, tenantId: "tenant-b" })
        yield* service.grant({
          userAccountId: principal.userAccountId,
          tenantId: "tenant-b",
          capability: AuthorizationCapabilities.capabilityGrant,
        })
        assert.strictEqual((yield* service.listDirectGrants(input)).length, 2)
        assert.instanceOf(
          yield* Effect.flip(service.listDirectGrants({ ...input, tenantId: "tenant-c" })),
          TenantMembershipNotFound,
        )

        yield* service.removeMember(input)
        yield* service.addMember(input)
        assert.deepStrictEqual(yield* service.listDirectGrants(input), [])
      }),
      makeAuthorizationTestLayer([
        { ...initialGrant, capability: IdentityCapabilities.userAccountRead },
        { ...initialGrant, capability: AuthorizationCapabilities.capabilityGrant },
      ]),
    ))

  it.effect("manages membership lifecycle and rejects missing members", () =>
    Effect.provide(
      Effect.gen(function* () {
        const service = yield* AuthorizationService
        const added = yield* service.addMember({
          userAccountId: "new-user",
          tenantId: "tenant-a",
        })
        assert.strictEqual(added.status, "active")
        assert.instanceOf(
          yield* Effect.flip(service.addMember({
            userAccountId: "new-user",
            tenantId: "tenant-a",
          })),
          TenantMembershipAlreadyExists,
        )
        yield* service.removeMember({ userAccountId: "new-user", tenantId: "tenant-a" })
        assert.instanceOf(
          yield* Effect.flip(
            service.getMember({ userAccountId: "new-user", tenantId: "tenant-a" }),
          ),
          TenantMembershipNotFound,
        )
      }),
      makeAuthorizationTestLayer(),
    ))
})

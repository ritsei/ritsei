import { assert, it } from "@effect/vitest"
import * as Effect from "effect/Effect"

import { makeAuthService } from "../../auth/mod.ts"
import { IdentityCapabilities } from "../../identity/mod.ts"
import {
  AuthorizationCapabilities,
  AuthorizationDenied,
  makeAuthorizationService,
  TenantMembershipAlreadyExists,
  TenantMembershipNotFound,
  TenantMembershipUserAccountNotFound,
} from "../mod.ts"
import { makeUserAccountService, UserAccountService } from "../../identity/mod.ts"
import { Database, uuidv7 } from "../../../foundation/mod.ts"
import { makePostgresDatabase, runMigrations, WebCryptoLive } from "../../../platform/mod.ts"
import { withTemporaryDatabase } from "../../../tests/support/postgres-database.ts"

const databaseUrl = Deno.env.get("DATABASE_URL")

it.effect.skipIf(databaseUrl === undefined)(
  "enforces tenant membership lifecycle and capability scope in PostgreSQL",
  () =>
    withTemporaryDatabase(databaseUrl!, (client) =>
      Effect.gen(function* () {
        yield* runMigrations(client)
        const database = makePostgresDatabase(client)
        const userAccounts = yield* makeUserAccountService.pipe(
          Effect.provideService(Database, database),
        )
        const user = yield* userAccounts.create({ email: "membership@example.test" })
        const activeUser = yield* userAccounts.create({ email: "membership-active@example.test" })
        const suspendedUser = yield* userAccounts.create({
          email: "membership-suspended@example.test",
        })
        const auth = yield* makeAuthService.pipe(
          Effect.provideService(Database, database),
          Effect.provide(WebCryptoLive),
          Effect.provideService(UserAccountService, userAccounts),
        )
        const tenant = yield* auth.createTenant({ slug: `membership-${uuidv7()}` })
        const authorization = yield* makeAuthorizationService.pipe(
          Effect.provideService(Database, database),
        )
        const capability = IdentityCapabilities.userAccountRead
        const principal = { userAccountId: user.id, sessionId: "membership-session" }

        yield* authorization.addMember({ userAccountId: user.id, tenantId: tenant.id })
        yield* authorization.addMember({ userAccountId: activeUser.id, tenantId: tenant.id })
        yield* authorization.addMember({ userAccountId: suspendedUser.id, tenantId: tenant.id })
        yield* authorization.suspendMember({ userAccountId: suspendedUser.id, tenantId: tenant.id })
        assert.deepStrictEqual(
          yield* authorization.listAccessibleTenants({ userAccountId: user.id }),
          [{ userAccountId: user.id, tenantId: tenant.id, status: "active" }],
        )
        assert.deepStrictEqual(
          yield* authorization.listAccessibleTenants({ userAccountId: suspendedUser.id }),
          [],
        )
        const orderedUserIds = [user.id, activeUser.id, suspendedUser.id].sort()
        assert.deepStrictEqual(
          (yield* authorization.listMembers({ tenantId: tenant.id })).map(({ userAccountId }) =>
            userAccountId
          ),
          orderedUserIds,
        )
        assert.deepStrictEqual(
          yield* authorization.listMembers({
            tenantId: tenant.id,
            search: suspendedUser.id.slice(-8),
          }),
          [{ userAccountId: suspendedUser.id, tenantId: tenant.id, status: "suspended" }],
        )
        assert.deepStrictEqual(
          yield* authorization.listMembers({ tenantId: tenant.id, status: "suspended" }),
          [{ userAccountId: suspendedUser.id, tenantId: tenant.id, status: "suspended" }],
        )
        assert.deepStrictEqual(
          yield* authorization.listMembers({ tenantId: tenant.id, search: "%" }),
          [],
        )
        assert.deepStrictEqual(
          (yield* authorization.listMembers({ tenantId: tenant.id, limit: 2 })).map(
            ({ userAccountId }) => userAccountId,
          ),
          orderedUserIds.slice(0, 2),
        )
        assert.instanceOf(
          yield* Effect.flip(authorization.addMember({
            userAccountId: user.id,
            tenantId: tenant.id,
          })),
          TenantMembershipAlreadyExists,
        )
        yield* authorization.grant({
          userAccountId: user.id,
          tenantId: tenant.id,
          capability,
        })
        yield* authorization.grant({
          userAccountId: user.id,
          tenantId: tenant.id,
          capability: AuthorizationCapabilities.capabilityGrant,
        })
        assert.deepStrictEqual(
          yield* authorization.listDirectGrants({
            userAccountId: user.id,
            tenantId: tenant.id,
          }),
          [
            {
              userAccountId: user.id,
              tenantId: tenant.id,
              capability: AuthorizationCapabilities.capabilityGrant,
              scope: "tenant",
            },
            { userAccountId: user.id, tenantId: tenant.id, capability, scope: "tenant" },
          ],
        )
        assert.strictEqual(
          (yield* authorization.authorize({
            principal,
            tenantId: tenant.id,
            capability,
          })).allowed,
          true,
        )

        yield* authorization.suspendMember({ userAccountId: user.id, tenantId: tenant.id })
        assert.strictEqual(
          (yield* authorization.listDirectGrants({
            userAccountId: user.id,
            tenantId: tenant.id,
          })).length,
          2,
        )
        assert.instanceOf(
          yield* Effect.flip(authorization.authorize({
            principal,
            tenantId: tenant.id,
            capability,
          })),
          AuthorizationDenied,
        )
        yield* authorization.activateMember({ userAccountId: user.id, tenantId: tenant.id })

        const otherTenant = yield* auth.createTenant({ slug: `membership-other-${uuidv7()}` })
        yield* authorization.addMember({ userAccountId: user.id, tenantId: otherTenant.id })
        yield* authorization.grant({
          userAccountId: user.id,
          tenantId: otherTenant.id,
          capability,
        })
        assert.strictEqual(
          (yield* authorization.listDirectGrants({
            userAccountId: user.id,
            tenantId: tenant.id,
          })).length,
          2,
        )
        assert.instanceOf(
          yield* Effect.flip(authorization.listDirectGrants({
            userAccountId: user.id,
            tenantId: "00000000-0000-0000-0000-000000000000",
          })),
          TenantMembershipNotFound,
        )

        yield* authorization.removeMember({ userAccountId: user.id, tenantId: tenant.id })
        yield* authorization.addMember({ userAccountId: user.id, tenantId: tenant.id })
        assert.deepStrictEqual(
          yield* authorization.listDirectGrants({
            userAccountId: user.id,
            tenantId: tenant.id,
          }),
          [],
        )
        assert.instanceOf(
          yield* Effect.flip(authorization.authorize({
            principal,
            tenantId: tenant.id,
            capability,
          })),
          AuthorizationDenied,
        )
      })),
)

it.effect.skipIf(databaseUrl === undefined)(
  "maps missing membership user accounts in PostgreSQL",
  () =>
    withTemporaryDatabase(databaseUrl!, (client) =>
      Effect.gen(function* () {
        yield* runMigrations(client)
        const database = makePostgresDatabase(client)
        const userAccounts = yield* makeUserAccountService.pipe(
          Effect.provideService(Database, database),
        )
        const auth = yield* makeAuthService.pipe(
          Effect.provideService(Database, database),
          Effect.provide(WebCryptoLive),
          Effect.provideService(UserAccountService, userAccounts),
        )
        const tenant = yield* auth.createTenant({ slug: `missing-member-${uuidv7()}` })
        const authorization = yield* makeAuthorizationService.pipe(
          Effect.provideService(Database, database),
        )
        const missingUser = "00000000-0000-0000-0000-000000000000"
        assert.instanceOf(
          yield* Effect.flip(authorization.addMember({
            userAccountId: missingUser,
            tenantId: tenant.id,
          })),
          TenantMembershipUserAccountNotFound,
        )
      })),
)

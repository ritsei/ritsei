import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"

import {
  AddTenantMembershipInput,
  AuthorizationDecision,
  AuthorizationInput,
  AuthorizationService,
  type DirectCapabilityGrant,
  GrantCapabilityInput,
  ListAccessibleTenantsInput,
  ListTenantMembershipsInput,
  TenantMembership,
  TenantMembershipInput,
} from "./contract.ts"
import {
  AuthorizationDenied,
  CapabilityAlreadyGranted,
  TenantMembershipAlreadyExists,
  TenantMembershipNotActive,
  TenantMembershipNotFound,
} from "./errors.ts"
import { membershipKey } from "./store.ts"

export const makeMemoryAuthorizationService = (
  initialGrants: ReadonlyArray<Schema.Schema.Type<typeof GrantCapabilityInput>> = [],
): AuthorizationService => {
  const membershipsStore = new Map<string, TenantMembership>()
  const grants = new Set<string>()

  for (const grant of initialGrants) {
    const key = membershipKey(grant.userAccountId, grant.tenantId)
    membershipsStore.set(key, { ...grant, status: "active" })
    grants.add(`${key}:${grant.capability}`)
  }

  const member = (input: Schema.Schema.Type<typeof TenantMembershipInput>) => {
    const found = membershipsStore.get(membershipKey(input.userAccountId, input.tenantId))
    return found === undefined
      ? Effect.fail(new TenantMembershipNotFound(input))
      : Effect.succeed(found)
  }

  return {
    authorize: Effect.fn("AuthorizationService.authorize")((input: unknown) =>
      Effect.gen(function* () {
        const decoded = yield* Schema.decodeUnknownEffect(AuthorizationInput)(input)
        const current = membershipsStore.get(
          membershipKey(decoded.principal.userAccountId, decoded.tenantId),
        )
        const key = `${
          membershipKey(decoded.principal.userAccountId, decoded.tenantId)
        }:${decoded.capability}`
        if (current?.status !== "active" || !grants.has(key)) {
          return yield* Effect.fail(
            new AuthorizationDenied({ tenantId: decoded.tenantId, capability: decoded.capability }),
          )
        }
        return {
          allowed: true as const,
          tenantId: decoded.tenantId,
          capability: decoded.capability,
          grant: "membership" as const,
        } satisfies Schema.Schema.Type<typeof AuthorizationDecision>
      })
    ),
    addMember: Effect.fn("AuthorizationService.addMember")((input: unknown) =>
      Effect.gen(function* () {
        const decoded = yield* Schema.decodeUnknownEffect(AddTenantMembershipInput)(input)
        const key = membershipKey(decoded.userAccountId, decoded.tenantId)
        if (membershipsStore.has(key)) {
          return yield* Effect.fail(new TenantMembershipAlreadyExists(decoded))
        }
        const created = { ...decoded, status: "active" as const }
        membershipsStore.set(key, created)
        return created
      })
    ),
    getMember: Effect.fn("AuthorizationService.getMember")((input: unknown) =>
      Schema.decodeUnknownEffect(TenantMembershipInput)(input).pipe(Effect.flatMap(member))
    ),
    listMembers: Effect.fn("AuthorizationService.listMembers")((input: unknown) =>
      Effect.gen(function* () {
        const decoded = yield* Schema.decodeUnknownEffect(ListTenantMembershipsInput)(input)
        return [...membershipsStore.values()]
          .filter((member) =>
            member.tenantId === decoded.tenantId &&
            (decoded.search === undefined ||
              member.userAccountId.toLocaleLowerCase().includes(
                decoded.search.toLocaleLowerCase(),
              )) &&
            (decoded.status === undefined || member.status === decoded.status)
          )
          .sort((left, right) => left.userAccountId.localeCompare(right.userAccountId))
          .slice(0, decoded.limit ?? 200)
      })
    ),
    listAccessibleTenants: Effect.fn("AuthorizationService.listAccessibleTenants")((
      input: unknown,
    ) =>
      Effect.gen(function* () {
        const decoded = yield* Schema.decodeUnknownEffect(ListAccessibleTenantsInput)(input)
        return [...membershipsStore.values()]
          .filter((member) =>
            member.userAccountId === decoded.userAccountId && member.status === "active"
          )
          .sort((left, right) => left.tenantId.localeCompare(right.tenantId))
      })
    ),
    listDirectGrants: Effect.fn("AuthorizationService.listDirectGrants")((input: unknown) =>
      Effect.gen(function* () {
        const decoded = yield* Schema.decodeUnknownEffect(TenantMembershipInput)(input)
        yield* member(decoded)
        const prefix = `${membershipKey(decoded.userAccountId, decoded.tenantId)}:`
        return [...grants]
          .filter((grant) => grant.startsWith(prefix))
          .map((grant): DirectCapabilityGrant => ({
            ...decoded,
            capability: grant.slice(prefix.length) as DirectCapabilityGrant["capability"],
            scope: "tenant",
          }))
          .sort((left, right) => left.capability.localeCompare(right.capability))
      })
    ),
    suspendMember: Effect.fn("AuthorizationService.suspendMember")((input: unknown) =>
      updateMember(input, "suspended")
    ),
    activateMember: Effect.fn("AuthorizationService.activateMember")((input: unknown) =>
      updateMember(input, "active")
    ),
    removeMember: Effect.fn("AuthorizationService.removeMember")((input: unknown) =>
      Effect.gen(function* () {
        const decoded = yield* Schema.decodeUnknownEffect(TenantMembershipInput)(input)
        const key = membershipKey(decoded.userAccountId, decoded.tenantId)
        if (!membershipsStore.delete(key)) {
          return yield* Effect.fail(new TenantMembershipNotFound(decoded))
        }
        for (const grant of [...grants]) if (grant.startsWith(`${key}:`)) grants.delete(grant)
      })
    ),
    grant: Effect.fn("AuthorizationService.grant")((input: unknown) =>
      Effect.gen(function* () {
        const decoded = yield* Schema.decodeUnknownEffect(GrantCapabilityInput)(input)
        const current = yield* member(decoded)
        if (current.status !== "active") {
          return yield* Effect.fail(
            new TenantMembershipNotActive({
              userAccountId: decoded.userAccountId,
              tenantId: decoded.tenantId,
            }),
          )
        }
        const key = `${
          membershipKey(decoded.userAccountId, decoded.tenantId)
        }:${decoded.capability}`
        if (grants.has(key)) return yield* Effect.fail(new CapabilityAlreadyGranted(decoded))
        grants.add(key)
      })
    ),
  }

  function updateMember(input: unknown, status: "active" | "suspended") {
    return Effect.gen(function* () {
      const decoded = yield* Schema.decodeUnknownEffect(TenantMembershipInput)(input)
      const current = yield* member(decoded)
      const updated = { ...current, status }
      membershipsStore.set(membershipKey(decoded.userAccountId, decoded.tenantId), updated)
      return updated
    })
  }
}

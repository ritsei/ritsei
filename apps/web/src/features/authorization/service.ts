import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import {
  AddTenantMembershipInput,
  authorizationRoutes,
  CapabilityDefinition,
  DirectCapabilityGrant,
  GrantCapabilityInput,
  ListTenantMembershipsInput,
  TenantMembership,
} from "../../shared/contracts/generated/authorization.ts"
import {
  BrowserConnection,
  decodeInput,
  decodeResponse,
  definedFields,
  mutationRequest,
  querySuffix,
  RequestFailure,
  requestJson,
  responseListMatches,
  responseMatches,
} from "../../shared/api.ts"

const Uuid = Schema.String.check(Schema.isUUID())
const MembershipList = Schema.Array(TenantMembership).check(Schema.isMaxLength(200))
const DirectGrantList = Schema.Array(DirectCapabilityGrant).check(Schema.isMaxLength(200))
const CapabilityCatalog = Schema.Array(CapabilityDefinition).check(Schema.isMaxLength(200))

const routeWithUserAccountId = (route: string, userAccountId: string) =>
  route.replace(":userAccountId", encodeURIComponent(userAccountId))

export const listMemberships = Effect.fn("Frontend.Authorization.listMemberships")(
  function* (input: unknown = {}) {
    const decoded = yield* decodeInput(ListTenantMembershipsInput, input)
    const connection = yield* BrowserConnection
    const body = yield* requestJson(
      `${authorizationRoutes.list}${querySuffix(decoded)}`,
    )
    const memberships = yield* decodeResponse(MembershipList, body, "invalid-response")
    if (
      !responseListMatches(memberships, {
        tenantId: connection.tenantId,
        ...definedFields({ status: decoded.status }),
      }) ||
      !memberships.every((membership) =>
        decoded.search === undefined ||
        membership.userAccountId.toLocaleLowerCase().includes(decoded.search.toLocaleLowerCase())
      )
    ) {
      return yield* Effect.fail(new RequestFailure({ kind: "invalid-response" }))
    }
    return memberships
  },
)

export const getMembership = Effect.fn("Frontend.Authorization.getMembership")(
  function* (userAccountId: unknown) {
    const decodedId = yield* decodeInput(Uuid, userAccountId)
    const connection = yield* BrowserConnection
    const body = yield* requestJson(routeWithUserAccountId(authorizationRoutes.get, decodedId))
    const membership = yield* decodeResponse(TenantMembership, body, "invalid-response")
    if (
      !responseMatches(membership, {
        userAccountId: decodedId,
        tenantId: connection.tenantId,
      })
    ) {
      return yield* Effect.fail(new RequestFailure({ kind: "invalid-response" }))
    }
    return membership
  },
)

export const listDirectGrants = Effect.fn("Frontend.Authorization.listDirectGrants")(
  function* (userAccountId: unknown) {
    const decodedId = yield* decodeInput(Uuid, userAccountId)
    const connection = yield* BrowserConnection
    const body = yield* requestJson(
      routeWithUserAccountId(authorizationRoutes.listDirectGrants, decodedId),
    )
    const grants = yield* decodeResponse(DirectGrantList, body, "invalid-response")
    if (
      !responseListMatches(grants, {
        userAccountId: decodedId,
        tenantId: connection.tenantId,
      })
    ) {
      return yield* Effect.fail(new RequestFailure({ kind: "invalid-response" }))
    }
    return grants
  },
)

export const listCapabilityDefinitions = Effect.fn(
  "Frontend.Authorization.listCapabilityDefinitions",
)(function* () {
  const body = yield* requestJson(authorizationRoutes.listCapabilityDefinitions)
  return yield* decodeResponse(CapabilityCatalog, body, "invalid-response")
})

export const addMembership = Effect.fn("Frontend.Authorization.addMembership")(
  function* (input: unknown) {
    const decoded = yield* decodeInput(AddTenantMembershipInput, input)
    const connection = yield* BrowserConnection
    const body = yield* mutationRequest(authorizationRoutes.add, "POST", decoded)
    const membership = yield* decodeResponse(TenantMembership, body, "unknown-outcome")
    if (
      !responseMatches(membership, {
        userAccountId: decoded.userAccountId,
        tenantId: connection.tenantId,
      })
    ) {
      return yield* Effect.fail(new RequestFailure({ kind: "unknown-outcome" }))
    }
    return membership
  },
)

export const suspendMembership = Effect.fn("Frontend.Authorization.suspendMembership")(
  function* (userAccountId: unknown) {
    const decodedId = yield* decodeInput(Uuid, userAccountId)
    const connection = yield* BrowserConnection
    const body = yield* mutationRequest(
      routeWithUserAccountId(authorizationRoutes.suspend, decodedId),
      "POST",
    )
    const membership = yield* decodeResponse(TenantMembership, body, "unknown-outcome")
    if (
      !responseMatches(membership, {
        userAccountId: decodedId,
        tenantId: connection.tenantId,
        status: "suspended",
      })
    ) {
      return yield* Effect.fail(new RequestFailure({ kind: "unknown-outcome" }))
    }
    return membership
  },
)

export const activateMembership = Effect.fn("Frontend.Authorization.activateMembership")(
  function* (userAccountId: unknown) {
    const decodedId = yield* decodeInput(Uuid, userAccountId)
    const connection = yield* BrowserConnection
    const body = yield* mutationRequest(
      routeWithUserAccountId(authorizationRoutes.activate, decodedId),
      "POST",
    )
    const membership = yield* decodeResponse(TenantMembership, body, "unknown-outcome")
    if (
      !responseMatches(membership, {
        userAccountId: decodedId,
        tenantId: connection.tenantId,
        status: "active",
      })
    ) {
      return yield* Effect.fail(new RequestFailure({ kind: "unknown-outcome" }))
    }
    return membership
  },
)

export const removeMembership = Effect.fn("Frontend.Authorization.removeMembership")(
  function* (userAccountId: unknown) {
    const decodedId = yield* decodeInput(Uuid, userAccountId)
    yield* mutationRequest(
      routeWithUserAccountId(authorizationRoutes.remove, decodedId),
      "DELETE",
    )
  },
)

export const grantCapability = Effect.fn("Frontend.Authorization.grantCapability")(
  function* (input: unknown) {
    const decoded = yield* decodeInput(GrantCapabilityInput, input)
    yield* mutationRequest(authorizationRoutes.grant, "POST", decoded)
  },
)

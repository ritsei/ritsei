import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import {
  AssignPartyRoleInput,
  AttachPartyIdentifierInput,
  Branch,
  CreateBranchInput,
  CreatePartyInput,
  CreatePartyRelationshipInput,
  CreatePartyRepresentationInput,
  ExternalIdentifier,
  LegalEntity,
  ListPartiesInput,
  ListRelatedPartyPathsInput,
  Party,
  PartyDetail,
  PartyDirectoryEntry,
  PartyRelationship,
  PartyRepresentation,
  partyRoutes,
  RelatedPartyPath,
  SetPartyRepresentationActiveInput,
} from "../../shared/contracts/generated/party.ts"
import {
  decodeInput,
  decodeResponse,
  mutationRequest,
  querySuffix,
  RequestFailure,
  requestJson,
  responseListMatches,
  responseMatches,
  routeWithId,
} from "../../shared/api.ts"

const PartyDirectory = Schema.Array(PartyDirectoryEntry).check(Schema.isMaxLength(200))
const PartyId = Schema.String.check(Schema.isUUID())

export const listParties = Effect.fn("Frontend.Party.listParties")(
  function* (input: unknown = {}) {
    const decoded = yield* decodeInput(ListPartiesInput, input)
    const body = yield* requestJson(`${partyRoutes.list}${querySuffix(decoded)}`)
    return yield* decodeResponse(PartyDirectory, body, "invalid-response")
  },
)

export const getPartyDetail = Effect.fn("Frontend.Party.getPartyDetail")(
  function* (id: unknown) {
    const decodedId = yield* decodeInput(PartyId, id)
    const body = yield* requestJson(routeWithId(partyRoutes.get, decodedId))
    const detail = yield* decodeResponse(PartyDetail, body, "invalid-response")
    if (detail.party.id !== decodedId) {
      return yield* Effect.fail(new RequestFailure({ kind: "invalid-response" }))
    }
    return detail
  },
)

export const findRelatedPartyPaths = Effect.fn("Frontend.Party.findRelatedPartyPaths")(
  function* (partyId: unknown, input: unknown = {}) {
    const decodedId = yield* decodeInput(PartyId, partyId)
    const decoded = yield* decodeInput(ListRelatedPartyPathsInput, input)
    const body = yield* requestJson(
      `${routeWithId(partyRoutes.findRelatedPartyPaths, decodedId)}${querySuffix(decoded)}`,
    )
    const paths = yield* decodeResponse(
      Schema.Array(RelatedPartyPath).check(Schema.isMaxLength(100)),
      body,
      "invalid-response",
    )
    if (!responseListMatches(paths, { sourcePartyId: decodedId })) {
      return yield* Effect.fail(new RequestFailure({ kind: "invalid-response" }))
    }
    return paths
  },
)

export const createParty = Effect.fn("Frontend.Party.createParty")(
  function* (input: unknown) {
    const decoded = yield* decodeInput(CreatePartyInput, input)
    const body = yield* mutationRequest(partyRoutes.create, "POST", decoded)
    return yield* decodeResponse(Party, body, "unknown-outcome")
  },
)

export const createLegalEntity = Effect.fn("Frontend.Party.createLegalEntity")(
  function* (partyId: unknown) {
    const decodedPartyId = yield* decodeInput(PartyId, partyId)
    const body = yield* mutationRequest(
      routeWithId(partyRoutes.createLegalEntity, decodedPartyId),
      "POST",
    )
    const legalEntity = yield* decodeResponse(LegalEntity, body, "unknown-outcome")
    if (!responseMatches(legalEntity, { organizationId: decodedPartyId })) {
      return yield* Effect.fail(new RequestFailure({ kind: "unknown-outcome" }))
    }
    return legalEntity
  },
)

export const createBranch = Effect.fn("Frontend.Party.createBranch")(
  function* (legalEntityId: unknown, input: unknown) {
    const decodedId = yield* decodeInput(PartyId, legalEntityId)
    const decoded = yield* decodeInput(CreateBranchInput, input)
    const body = yield* mutationRequest(
      routeWithId(partyRoutes.createBranch, decodedId),
      "POST",
      decoded,
    )
    const branch = yield* decodeResponse(Branch, body, "unknown-outcome")
    if (!responseMatches(branch, { legalEntityId: decodedId })) {
      return yield* Effect.fail(new RequestFailure({ kind: "unknown-outcome" }))
    }
    return branch
  },
)

export const assignPartyRole = Effect.fn("Frontend.Party.assignPartyRole")(
  function* (partyId: unknown, input: unknown) {
    const decodedId = yield* decodeInput(PartyId, partyId)
    const decoded = yield* decodeInput(AssignPartyRoleInput, input)
    yield* mutationRequest(routeWithId(partyRoutes.assignRole, decodedId), "POST", decoded)
  },
)

export const attachPartyIdentifier = Effect.fn("Frontend.Party.attachPartyIdentifier")(
  function* (partyId: unknown, input: unknown) {
    const decodedId = yield* decodeInput(PartyId, partyId)
    const decoded = yield* decodeInput(AttachPartyIdentifierInput, input)
    const body = yield* mutationRequest(
      routeWithId(partyRoutes.attachIdentifier, decodedId),
      "POST",
      decoded,
    )
    const identifier = yield* decodeResponse(ExternalIdentifier, body, "unknown-outcome")
    if (
      !responseMatches(identifier, {
        partyId: decodedId,
        legalEntityId: decoded.legalEntityId ?? null,
      })
    ) {
      return yield* Effect.fail(new RequestFailure({ kind: "unknown-outcome" }))
    }
    return identifier
  },
)

export const createPartyRelationship = Effect.fn("Frontend.Party.createPartyRelationship")(
  function* (partyId: unknown, input: unknown) {
    const decodedId = yield* decodeInput(PartyId, partyId)
    const decoded = yield* decodeInput(CreatePartyRelationshipInput, input)
    const body = yield* mutationRequest(
      routeWithId(partyRoutes.createRelationship, decodedId),
      "POST",
      decoded,
    )
    const relationship = yield* decodeResponse(PartyRelationship, body, "unknown-outcome")
    if (
      !responseMatches(relationship, {
        partyId: decodedId,
        legalEntityId: decoded.legalEntityId,
        kind: decoded.kind,
      })
    ) {
      return yield* Effect.fail(new RequestFailure({ kind: "unknown-outcome" }))
    }
    return relationship
  },
)

export const createPartyRepresentation = Effect.fn("Frontend.Party.createPartyRepresentation")(
  function* (partyId: unknown, input: unknown) {
    const decodedId = yield* decodeInput(PartyId, partyId)
    const decoded = yield* decodeInput(CreatePartyRepresentationInput, input)
    const body = yield* mutationRequest(
      routeWithId(partyRoutes.createRepresentation, decodedId),
      "POST",
      decoded,
    )
    const representation = yield* decodeResponse(PartyRepresentation, body, "unknown-outcome")
    if (
      !responseMatches(representation, {
        partyId: decodedId,
        userAccountId: decoded.userAccountId,
        kind: decoded.kind,
      })
    ) {
      return yield* Effect.fail(new RequestFailure({ kind: "unknown-outcome" }))
    }
    return representation
  },
)

export const setPartyRepresentationActive = Effect.fn(
  "Frontend.Party.setPartyRepresentationActive",
)(function* (representationId: unknown, input: unknown) {
  const decodedId = yield* decodeInput(PartyId, representationId)
  const decoded = yield* decodeInput(SetPartyRepresentationActiveInput, input)
  const body = yield* mutationRequest(
    routeWithId(partyRoutes.setRepresentationActive, decodedId),
    "PATCH",
    decoded,
  )
  const representation = yield* decodeResponse(PartyRepresentation, body, "unknown-outcome")
  if (
    !responseMatches(representation, {
      id: decodedId,
      active: decoded.active,
    })
  ) {
    return yield* Effect.fail(new RequestFailure({ kind: "unknown-outcome" }))
  }
  return representation
})

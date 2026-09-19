import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"

import { AuthorizationService } from "../../authorization/mod.ts"
import { Database, uuidv7 } from "../../../foundation/mod.ts"
import { PartyCapabilities } from "./capabilities.ts"
import { PartyCreatedEvent, PartyCreatedEventPayload, PartyEventPublisher } from "./events.ts"
import {
  AssignPartyRoleInput,
  AttachExternalIdentifierInput,
  CreateBranchInput,
  CreateLegalEntityInput,
  CreatePartyInput,
  CreatePartyRelationshipInput,
  CreatePartyRepresentationInput,
  FindRelatedPartyPathsInput,
  GetPartyDetailInput,
  GetPartyRelationshipInput,
  ListPartiesInput,
  PartyService,
  SetPartyRepresentationActiveInput,
} from "./contract.ts"
import type { PartyStore } from "./store.ts"

export const makePartyServiceFromStore = <R>(
  store: Effect.Effect<PartyStore, never, R>,
): Effect.Effect<
  PartyService,
  never,
  R | import("../../authorization/mod.ts").AuthorizationService
> =>
  Effect.gen(function* () {
    const partyStore = yield* store
    const authorization = yield* AuthorizationService
    const databaseOption = yield* Effect.serviceOption(Database)
    const publisherOption = yield* Effect.serviceOption(PartyEventPublisher)

    const list = Effect.fn("PartyService.list")(function* (input: unknown) {
      const decoded = yield* Schema.decodeUnknownEffect(ListPartiesInput)(input)
      yield* authorization.authorize({
        principal: decoded.principal,
        tenantId: decoded.tenantId,
        capability: PartyCapabilities.partyRead,
      })
      return yield* partyStore.list(
        decoded.tenantId,
        decoded.search ?? null,
        decoded.kind ?? null,
        decoded.limit ?? 200,
      )
    })
    const getDetail = Effect.fn("PartyService.getDetail")(function* (input: unknown) {
      const decoded = yield* Schema.decodeUnknownEffect(GetPartyDetailInput)(input)
      yield* authorization.authorize({
        principal: decoded.principal,
        tenantId: decoded.tenantId,
        capability: PartyCapabilities.partyRead,
      })
      return yield* partyStore.getDetail(decoded.tenantId, decoded.partyId)
    })
    const create = Effect.fn("PartyService.create")(function* (input: unknown) {
      const decoded = yield* Schema.decodeUnknownEffect(CreatePartyInput)(input)
      yield* authorization.authorize({
        principal: decoded.principal,
        tenantId: decoded.tenantId,
        capability: PartyCapabilities.partyCreate,
      })
      const createAndPublish = Effect.gen(function* () {
        const party = yield* partyStore.create(decoded.tenantId, decoded.kind, decoded.name.trim())
        if (Option.isNone(publisherOption)) return party
        const payload = yield* Schema.decodeUnknownEffect(PartyCreatedEventPayload)({
          partyId: party.id,
          kind: party.kind,
        })
        yield* publisherOption.value.append({
          eventId: uuidv7(),
          eventType: PartyCreatedEvent.id,
          eventVersion: PartyCreatedEvent.version,
          tenantId: decoded.tenantId,
          aggregateType: PartyCreatedEvent.aggregateType,
          aggregateId: party.id,
          commandId: `party.create:${party.id}`,
          correlationId: `party:${party.id}`,
          causationId: null,
          idempotencyKey: `party.created:${party.id}`,
          actorPrincipalId: decoded.principal.userAccountId,
          occurredAt: new Date().toISOString(),
          payload,
        })
        return party
      })
      return Option.isSome(databaseOption)
        ? yield* databaseOption.value.withTransaction(createAndPublish, "party.create.atomic")
        : yield* createAndPublish
    })
    const createLegalEntity = Effect.fn("PartyService.createLegalEntity")(
      function* (input: unknown) {
        const decoded = yield* Schema.decodeUnknownEffect(CreateLegalEntityInput)(input)
        yield* authorization.authorize({
          principal: decoded.principal,
          tenantId: decoded.tenantId,
          capability: PartyCapabilities.legalEntityCreate,
        })
        return yield* partyStore.createLegalEntity(decoded.tenantId, decoded.organizationId)
      },
    )
    const createBranch = Effect.fn("PartyService.createBranch")(function* (input: unknown) {
      const decoded = yield* Schema.decodeUnknownEffect(CreateBranchInput)(input)
      yield* authorization.authorize({
        principal: decoded.principal,
        tenantId: decoded.tenantId,
        capability: PartyCapabilities.branchCreate,
      })
      return yield* partyStore.createBranch(
        decoded.tenantId,
        decoded.legalEntityId,
        decoded.name.trim(),
        decoded.timezone?.trim() ?? null,
        decoded.localTaxRegistration?.trim() ?? null,
        decoded.dedicatedJournalCode?.trim() ?? null,
      )
    })
    const createPartyRepresentation = Effect.fn("PartyService.createPartyRepresentation")(
      function* (input: unknown) {
        const decoded = yield* Schema.decodeUnknownEffect(CreatePartyRepresentationInput)(input)
        yield* authorization.authorize({
          principal: decoded.principal,
          tenantId: decoded.tenantId,
          capability: PartyCapabilities.partyRepresentationCreate,
        })
        return yield* partyStore.createPartyRepresentation(
          decoded.tenantId,
          decoded.userAccountId,
          decoded.partyId,
          decoded.kind.trim(),
        )
      },
    )
    const setPartyRepresentationActive = Effect.fn("PartyService.setPartyRepresentationActive")(
      function* (input: unknown) {
        const decoded = yield* Schema.decodeUnknownEffect(SetPartyRepresentationActiveInput)(input)
        yield* authorization.authorize({
          principal: decoded.principal,
          tenantId: decoded.tenantId,
          capability: decoded.active
            ? PartyCapabilities.partyRepresentationActivate
            : PartyCapabilities.partyRepresentationDeactivate,
        })
        return yield* partyStore.setPartyRepresentationActive(
          decoded.tenantId,
          decoded.representationId,
          decoded.active,
        )
      },
    )
    const assignRole = Effect.fn("PartyService.assignRole")(function* (input: unknown) {
      const decoded = yield* Schema.decodeUnknownEffect(AssignPartyRoleInput)(input)
      yield* authorization.authorize({
        principal: decoded.principal,
        tenantId: decoded.tenantId,
        capability: PartyCapabilities.partyRoleAssign,
      })
      return yield* partyStore.assignRole(decoded.tenantId, decoded.partyId, decoded.role)
    })
    const createRelationship = Effect.fn("PartyService.createRelationship")(
      function* (input: unknown) {
        const decoded = yield* Schema.decodeUnknownEffect(CreatePartyRelationshipInput)(input)
        yield* authorization.authorize({
          principal: decoded.principal,
          tenantId: decoded.tenantId,
          capability: PartyCapabilities.partyRelationshipCreate,
        })
        return yield* partyStore.createRelationship(
          decoded.tenantId,
          decoded.partyId,
          decoded.legalEntityId,
          decoded.kind,
        )
      },
    )
    const getRelationship = Effect.fn("PartyService.getRelationship")(function* (input: unknown) {
      const decoded = yield* Schema.decodeUnknownEffect(GetPartyRelationshipInput)(input)
      yield* authorization.authorize({
        principal: decoded.principal,
        tenantId: decoded.tenantId,
        capability: PartyCapabilities.partyRelationshipRead,
      })
      return yield* partyStore.getRelationship(decoded.tenantId, decoded.relationshipId)
    })
    const findRelatedPartyPaths = Effect.fn("PartyService.findRelatedPartyPaths")(
      function* (input: unknown) {
        const decoded = yield* Schema.decodeUnknownEffect(FindRelatedPartyPathsInput)(input)
        yield* authorization.authorize({
          principal: decoded.principal,
          tenantId: decoded.tenantId,
          capability: PartyCapabilities.partyRelationshipRead,
        })
        return yield* partyStore.findRelatedPartyPaths(
          decoded.tenantId,
          decoded.sourcePartyId,
          decoded.limit ?? 100,
        )
      },
    )
    const attachIdentifier = Effect.fn("PartyService.attachIdentifier")(function* (input: unknown) {
      const decoded = yield* Schema.decodeUnknownEffect(AttachExternalIdentifierInput)(input)
      yield* authorization.authorize({
        principal: decoded.principal,
        tenantId: decoded.tenantId,
        capability: PartyCapabilities.partyIdentifierAttach,
      })
      return yield* partyStore.attachIdentifier(
        decoded.tenantId,
        decoded.partyId,
        decoded.provider.trim().toUpperCase(),
        decoded.scheme.trim().toUpperCase(),
        decoded.scope.trim(),
        decoded.legalEntityId ?? null,
        decoded.value.trim(),
      )
    })

    return {
      list,
      getDetail,
      create,
      createLegalEntity,
      createBranch,
      createPartyRepresentation,
      setPartyRepresentationActive,
      assignRole,
      createRelationship,
      getRelationship,
      findRelatedPartyPaths,
      attachIdentifier,
    } satisfies PartyService
  })

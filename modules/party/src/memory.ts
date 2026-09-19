import * as Effect from "effect/Effect"

import { uuidv7 } from "../../../foundation/mod.ts"
import type { PartyStore } from "./store.ts"
import type {
  Branch,
  ExternalIdentifier,
  LegalEntity,
  Party,
  PartyDetail,
  PartyDirectoryEntry,
  PartyRelationship,
  PartyRepresentation,
  PartyRepresentationKind,
  PartyRole,
} from "./contract.ts"
import {
  BranchAlreadyExists,
  ExternalIdentifierAlreadyAssigned,
  LegalEntityAlreadyExists,
  LegalEntityNotFound,
  OrganizationRequired,
  PartyNotFound,
  PartyRelationshipAlreadyExists,
  PartyRelationshipNotFound,
  PartyRelationshipRoleNotAssigned,
  PartyRepresentationAlreadyExists,
  PartyRepresentationNotFound,
  PartyRepresentationUserAccountNotFound,
  PartyRoleAlreadyAssigned,
} from "./errors.ts"

export const makePartyMemoryStore = (validUserAccountIds?: ReadonlySet<string>): PartyStore => {
  const stored = new Map<string, Party>()
  const legalEntities = new Map<string, LegalEntity>()
  const branches = new Map<string, Branch>()
  const roles = new Set<string>()
  const relationships = new Map<string, PartyRelationship>()
  const identifiers = new Map<string, ExternalIdentifier>()
  const representations = new Map<string, PartyRepresentation>()
  const id = uuidv7
  const list = Effect.fn("PartyStore.memory.list")(
    (tenantId: string, search: string | null, kind: Party["kind"] | null, limit: number) =>
      Effect.sync(() => {
        const normalizedSearch = search?.toLocaleLowerCase()
        return [...stored.values()]
          .filter((party) =>
            party.tenantId === tenantId &&
            (kind === null || party.kind === kind) &&
            (normalizedSearch === undefined ||
              party.name.toLocaleLowerCase().includes(normalizedSearch))
          )
          .sort((left, right) =>
            left.name.localeCompare(right.name) || left.id.localeCompare(right.id)
          )
          .slice(0, limit)
          .map((party): PartyDirectoryEntry => ({
            party,
            legalEntityId: [...legalEntities.values()].find((entity) =>
              entity.tenantId === tenantId && entity.organizationId === party.id
            )?.id ?? null,
          }))
      }),
  )
  const getDetail = Effect.fn("PartyStore.memory.getDetail")(
    function* (tenantId: string, partyId: string) {
      const party = stored.get(partyId)
      if (party === undefined || party.tenantId !== tenantId) {
        return yield* Effect.fail(new PartyNotFound({ tenantId, partyId }))
      }
      const legalEntity =
        [...legalEntities.values()].find((entity) =>
          entity.tenantId === tenantId && entity.organizationId === partyId
        ) ?? null
      const rolePrefix = `${tenantId}:${partyId}:`
      return {
        party,
        roles: [...roles]
          .filter((key) => key.startsWith(rolePrefix))
          .map((key) => key.slice(rolePrefix.length) as PartyRole)
          .sort(),
        identifiers: [...identifiers.values()]
          .filter((identifier) =>
            identifier.tenantId === tenantId && identifier.partyId === partyId
          )
          .sort((left, right) =>
            left.provider.localeCompare(right.provider) ||
            left.scheme.localeCompare(right.scheme) || left.scope.localeCompare(right.scope) ||
            left.value.localeCompare(right.value) || left.id.localeCompare(right.id)
          ),
        legalEntity,
        branches: legalEntity === null ? [] : [...branches.values()]
          .filter((branch) =>
            branch.tenantId === tenantId && branch.legalEntityId === legalEntity.id
          )
          .sort((left, right) =>
            left.name.localeCompare(right.name) || left.id.localeCompare(right.id)
          ),
        relationships: [...relationships.values()]
          .filter((relationship) =>
            relationship.tenantId === tenantId && relationship.partyId === partyId
          )
          .sort((left, right) =>
            left.kind.localeCompare(right.kind) ||
            left.legalEntityId.localeCompare(right.legalEntityId) || left.id.localeCompare(right.id)
          ),
        representations: [...representations.values()]
          .filter((representation) =>
            representation.tenantId === tenantId && representation.partyId === partyId
          )
          .sort((left, right) =>
            left.kind.localeCompare(right.kind) ||
            left.userAccountId.localeCompare(right.userAccountId) || left.id.localeCompare(right.id)
          ),
      } satisfies PartyDetail
    },
  )
  const create = Effect.fn("PartyStore.memory.create")((
    tenantId: string,
    kind: Party["kind"],
    name: string,
  ) =>
    Effect.sync(() => {
      const party = { id: id(), tenantId, kind, name }
      stored.set(party.id, party)
      return party
    })
  )
  const createLegalEntity = Effect.fn("PartyStore.memory.createLegalEntity")(
    function* (tenantId: string, organizationId: string) {
      const party = stored.get(organizationId)
      if (party === undefined || party.tenantId !== tenantId) {
        return yield* Effect.fail(new PartyNotFound({ tenantId, partyId: organizationId }))
      }
      if (party.kind !== "organization") {
        return yield* Effect.fail(new OrganizationRequired({ tenantId, partyId: organizationId }))
      }
      if (
        [...legalEntities.values()].some((x) =>
          x.tenantId === tenantId && x.organizationId === organizationId
        )
      ) return yield* Effect.fail(new LegalEntityAlreadyExists({ tenantId, organizationId }))
      const result = { id: id(), tenantId, organizationId }
      legalEntities.set(result.id, result)
      return result
    },
  )
  const createBranch = Effect.fn("PartyStore.memory.createBranch")(
    function* (
      tenantId: string,
      legalEntityId: string,
      name: string,
      timezone: string | null,
      localTaxRegistration: string | null,
      dedicatedJournalCode: string | null,
    ) {
      const entity = legalEntities.get(legalEntityId)
      if (entity === undefined || entity.tenantId !== tenantId) {
        return yield* Effect.fail(new LegalEntityNotFound({ tenantId, legalEntityId }))
      }
      if (
        [...branches.values()].some((x) =>
          x.tenantId === tenantId && x.legalEntityId === legalEntityId && x.name === name
        )
      ) return yield* Effect.fail(new BranchAlreadyExists({ tenantId, legalEntityId, name }))
      const result = {
        id: id(),
        tenantId,
        legalEntityId,
        name,
        timezone,
        localTaxRegistration,
        dedicatedJournalCode,
      }
      branches.set(result.id, result)
      return result
    },
  )
  const createPartyRepresentation = Effect.fn("PartyStore.memory.createPartyRepresentation")(
    function* (
      tenantId: string,
      userAccountId: string,
      partyId: string,
      kind: PartyRepresentationKind,
    ) {
      if (validUserAccountIds !== undefined && !validUserAccountIds.has(userAccountId)) {
        return yield* Effect.fail(
          new PartyRepresentationUserAccountNotFound({ tenantId, userAccountId }),
        )
      }
      if (stored.get(partyId)?.tenantId !== tenantId) {
        return yield* Effect.fail(new PartyNotFound({ tenantId, partyId }))
      }
      if (
        [...representations.values()].some((x) =>
          x.tenantId === tenantId && x.userAccountId === userAccountId && x.partyId === partyId &&
          x.kind === kind
        )
      ) {
        return yield* Effect.fail(
          new PartyRepresentationAlreadyExists({ tenantId, userAccountId, partyId, kind }),
        )
      }
      const result = { id: id(), tenantId, userAccountId, partyId, kind, active: true }
      representations.set(result.id, result)
      return result
    },
  )
  const setPartyRepresentationActive = Effect.fn("PartyStore.memory.setPartyRepresentationActive")(
    function* (tenantId: string, representationId: string, active: boolean) {
      const current = representations.get(representationId)
      if (current === undefined || current.tenantId !== tenantId) {
        return yield* Effect.fail(new PartyRepresentationNotFound({ tenantId, representationId }))
      }
      const result = { ...current, active }
      representations.set(result.id, result)
      return result
    },
  )
  const assignRole = Effect.fn("PartyStore.memory.assignRole")(
    function* (tenantId: string, partyId: string, role: PartyRole) {
      if (stored.get(partyId)?.tenantId !== tenantId) {
        return yield* Effect.fail(new PartyNotFound({ tenantId, partyId }))
      }
      const key = `${tenantId}:${partyId}:${role}`
      if (roles.has(key)) {
        return yield* Effect.fail(new PartyRoleAlreadyAssigned({ tenantId, partyId, role }))
      }
      roles.add(key)
    },
  )
  const createRelationship = Effect.fn("PartyStore.memory.createRelationship")(
    function* (
      tenantId: string,
      partyId: string,
      legalEntityId: string,
      kind: PartyRelationship["kind"],
    ) {
      if (stored.get(partyId)?.tenantId !== tenantId) {
        return yield* Effect.fail(new PartyNotFound({ tenantId, partyId }))
      }
      if (legalEntities.get(legalEntityId)?.tenantId !== tenantId) {
        return yield* Effect.fail(new LegalEntityNotFound({ tenantId, legalEntityId }))
      }
      if (!roles.has(`${tenantId}:${partyId}:${kind}`)) {
        return yield* Effect.fail(new PartyRelationshipRoleNotAssigned({ tenantId, partyId, kind }))
      }
      const key = `${tenantId}:${partyId}:${legalEntityId}:${kind}`
      if (relationships.has(key)) {
        return yield* Effect.fail(
          new PartyRelationshipAlreadyExists({ tenantId, partyId, legalEntityId, kind }),
        )
      }
      const result = { id: id(), tenantId, partyId, legalEntityId, kind, active: true }
      relationships.set(key, result)
      return result
    },
  )
  const getRelationship = Effect.fn("PartyStore.memory.getRelationship")(
    function* (tenantId: string, relationshipId: string) {
      const result = [...relationships.values()].find((x) =>
        x.tenantId === tenantId && x.id === relationshipId
      )
      if (result === undefined) {
        return yield* Effect.fail(new PartyRelationshipNotFound({ tenantId, relationshipId }))
      }
      return result
    },
  )
  const findRelatedPartyPaths = Effect.fn("PartyStore.memory.findRelatedPartyPaths")(
    (tenantId: string, sourcePartyId: string, limit: number) =>
      Effect.sync(() =>
        [...relationships.values()]
          .filter((relationship) =>
            relationship.tenantId === tenantId && relationship.partyId === sourcePartyId &&
            relationship.active
          )
          .map((relationship) => ({
            tenantId,
            sourcePartyId,
            targetPartyId: legalEntities.get(relationship.legalEntityId)!.organizationId,
            legalEntityId: relationship.legalEntityId,
            relationshipId: relationship.id,
            relationshipKind: relationship.kind,
            depth: 2 as const,
          }))
          .filter((path) => path.targetPartyId !== sourcePartyId)
          .sort((left, right) =>
            left.legalEntityId.localeCompare(right.legalEntityId) ||
            left.relationshipId.localeCompare(right.relationshipId)
          )
          .slice(0, limit)
      ),
  )
  const attachIdentifier = Effect.fn("PartyStore.memory.attachIdentifier")(
    function* (
      tenantId: string,
      partyId: string,
      provider: string,
      scheme: string,
      scope: string,
      legalEntityId: string | null,
      value: string,
    ) {
      if (stored.get(partyId)?.tenantId !== tenantId) {
        return yield* Effect.fail(new PartyNotFound({ tenantId, partyId }))
      }
      if (legalEntityId !== null && legalEntities.get(legalEntityId)?.tenantId !== tenantId) {
        return yield* Effect.fail(new LegalEntityNotFound({ tenantId, legalEntityId }))
      }
      const key = `${tenantId}:${provider}:${scheme}:${scope}:${legalEntityId ?? "tenant"}:${value}`
      if (identifiers.has(key)) {
        return yield* Effect.fail(
          new ExternalIdentifierAlreadyAssigned({
            tenantId,
            provider,
            scheme,
            scope,
            legalEntityId,
            value,
          }),
        )
      }
      const result: ExternalIdentifier = {
        id: id(),
        tenantId,
        partyId,
        provider,
        scheme,
        scope,
        legalEntityId,
        value,
      }
      identifiers.set(key, result)
      return result
    },
  )
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
  }
}

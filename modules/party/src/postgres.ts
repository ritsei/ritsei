import { and, asc, eq, ilike, ne } from "drizzle-orm"
import * as Effect from "effect/Effect"

import {
  branches,
  legalEntities,
  parties,
  partyIdentifiers,
  partyRelationships,
  partyRepresentations,
  partyRoles,
  relatedPartyPaths,
} from "../../../db/schema/party.ts"
import { Database, isDatabaseConstraint } from "../../../foundation/mod.ts"
import type { PartyStore } from "./store.ts"
import type {
  PartyDetail,
  PartyKind,
  PartyRelationshipKind,
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

const partySelection = {
  id: parties.id,
  tenantId: parties.tenantId,
  kind: parties.kind,
  name: parties.name,
}
const identifierSelection = {
  id: partyIdentifiers.id,
  tenantId: partyIdentifiers.tenantId,
  partyId: partyIdentifiers.partyId,
  provider: partyIdentifiers.provider,
  scheme: partyIdentifiers.scheme,
  scope: partyIdentifiers.scope,
  legalEntityId: partyIdentifiers.legalEntityId,
  value: partyIdentifiers.value,
}
const legalEntitySelection = {
  id: legalEntities.id,
  tenantId: legalEntities.tenantId,
  organizationId: legalEntities.organizationPartyId,
}
const branchSelection = {
  id: branches.id,
  tenantId: branches.tenantId,
  legalEntityId: branches.legalEntityId,
  name: branches.name,
  timezone: branches.timezone,
  localTaxRegistration: branches.localTaxRegistration,
  dedicatedJournalCode: branches.dedicatedJournalCode,
}
const partyRepresentationSelection = {
  id: partyRepresentations.id,
  tenantId: partyRepresentations.tenantId,
  userAccountId: partyRepresentations.userAccountId,
  partyId: partyRepresentations.partyId,
  kind: partyRepresentations.kind,
  active: partyRepresentations.active,
}
const relationshipSelection = {
  id: partyRelationships.id,
  tenantId: partyRelationships.tenantId,
  partyId: partyRelationships.partyId,
  legalEntityId: partyRelationships.legalEntityId,
  kind: partyRelationships.kind,
  active: partyRelationships.active,
}
const relatedPartyPathSelection = {
  tenantId: relatedPartyPaths.tenantId,
  sourcePartyId: relatedPartyPaths.sourcePartyId,
  targetPartyId: relatedPartyPaths.targetPartyId,
  legalEntityId: relatedPartyPaths.legalEntityId,
  relationshipId: relatedPartyPaths.relationshipId,
  relationshipKind: relatedPartyPaths.relationshipKind,
  depth: relatedPartyPaths.depth,
}

export const makePartyPostgresStore = Effect.gen(function* () {
  const database = yield* Database
  const list = Effect.fn("PartyStore.list")(
    function* (tenantId: string, search: string | null, kind: PartyKind | null, limit: number) {
      const rows = yield* database.query(
        (db) =>
          db.select({ ...partySelection, legalEntityId: legalEntities.id }).from(parties).leftJoin(
            legalEntities,
            and(
              eq(legalEntities.tenantId, parties.tenantId),
              eq(legalEntities.organizationPartyId, parties.id),
            ),
          ).where(and(
            eq(parties.tenantId, tenantId),
            search === null ? undefined : ilike(parties.name, `%${search}%`),
            kind === null ? undefined : eq(parties.kind, kind),
          )).orderBy(asc(parties.name), asc(parties.id)).limit(limit),
        "party.list",
      )
      return rows.map(({ legalEntityId, ...party }) => ({ party, legalEntityId }))
    },
  )
  const getDetail = Effect.fn("PartyStore.getDetail")(
    function* (tenantId: string, partyId: string) {
      const rows = yield* database.query(
        (db) =>
          db.select({
            ...partySelection,
            legalEntityId: legalEntities.id,
            legalEntityTenantId: legalEntities.tenantId,
            legalEntityOrganizationId: legalEntities.organizationPartyId,
          }).from(parties).leftJoin(
            legalEntities,
            and(
              eq(legalEntities.tenantId, parties.tenantId),
              eq(legalEntities.organizationPartyId, parties.id),
            ),
          ).where(and(eq(parties.tenantId, tenantId), eq(parties.id, partyId))),
        "party.detail.get",
      )
      const row = rows[0]
      if (row === undefined) {
        return yield* Effect.fail(new PartyNotFound({ tenantId, partyId }))
      }
      const {
        legalEntityId,
        legalEntityTenantId,
        legalEntityOrganizationId,
        ...party
      } = row
      const roles = yield* database.query(
        (db) =>
          db.select({ role: partyRoles.role }).from(partyRoles).where(
            and(eq(partyRoles.tenantId, tenantId), eq(partyRoles.partyId, partyId)),
          ).orderBy(asc(partyRoles.role)),
        "party.detail.roles",
      )
      const identifiers = yield* database.query(
        (db) =>
          db.select(identifierSelection).from(partyIdentifiers).where(
            and(eq(partyIdentifiers.tenantId, tenantId), eq(partyIdentifiers.partyId, partyId)),
          ).orderBy(
            asc(partyIdentifiers.provider),
            asc(partyIdentifiers.scheme),
            asc(partyIdentifiers.scope),
            asc(partyIdentifiers.value),
            asc(partyIdentifiers.id),
          ),
        "party.detail.identifiers",
      )
      const legalEntity = legalEntityId === null ? null : {
        id: legalEntityId,
        tenantId: legalEntityTenantId!,
        organizationId: legalEntityOrganizationId!,
      }
      const partyBranches = legalEntity === null ? [] : yield* database.query(
        (db) =>
          db.select(branchSelection).from(branches).where(
            and(eq(branches.tenantId, tenantId), eq(branches.legalEntityId, legalEntity.id)),
          ).orderBy(asc(branches.name), asc(branches.id)),
        "party.detail.branches",
      )
      const relationships = yield* database.query(
        (db) =>
          db.select(relationshipSelection).from(partyRelationships).where(
            and(eq(partyRelationships.tenantId, tenantId), eq(partyRelationships.partyId, partyId)),
          ).orderBy(
            asc(partyRelationships.kind),
            asc(partyRelationships.legalEntityId),
            asc(partyRelationships.id),
          ),
        "party.detail.relationships",
      )
      const representations = yield* database.query(
        (db) =>
          db.select(partyRepresentationSelection).from(partyRepresentations).where(
            and(
              eq(partyRepresentations.tenantId, tenantId),
              eq(partyRepresentations.partyId, partyId),
            ),
          ).orderBy(
            asc(partyRepresentations.kind),
            asc(partyRepresentations.userAccountId),
            asc(partyRepresentations.id),
          ),
        "party.detail.representations",
      )
      return {
        party,
        roles: roles.map(({ role }) => role),
        identifiers,
        legalEntity,
        branches: partyBranches,
        relationships,
        representations,
      } satisfies PartyDetail
    },
  )
  const create = Effect.fn("PartyStore.create")(
    function* (tenantId: string, kind: PartyKind, name: string) {
      const rows = yield* database.query(
        (db) => db.insert(parties).values({ tenantId, kind, name }).returning(partySelection),
        "party.create",
      )
      return rows[0]!
    },
  )
  const createLegalEntity = Effect.fn("PartyStore.createLegalEntity")(
    function* (tenantId: string, organizationId: string) {
      const rows = yield* database.query(
        (db) =>
          db.select({ id: parties.id, kind: parties.kind }).from(parties).where(
            and(eq(parties.tenantId, tenantId), eq(parties.id, organizationId)),
          ),
        "party.legal_entity.party.get",
      )
      const party = rows[0]
      if (party === undefined) {
        return yield* Effect.fail(new PartyNotFound({ tenantId, partyId: organizationId }))
      }
      if (party.kind !== "organization") {
        return yield* Effect.fail(new OrganizationRequired({ tenantId, partyId: organizationId }))
      }
      const result = yield* database.query(
        (db) =>
          db.insert(legalEntities).values({ tenantId, organizationPartyId: organizationId })
            .returning(legalEntitySelection),
        "party.legal_entity.create",
      ).pipe(
        Effect.mapError((error) =>
          isDatabaseConstraint(error, "legal_entities_tenant_organization_party_key")
            ? new LegalEntityAlreadyExists({ tenantId, organizationId })
            : error
        ),
      )
      return result[0]!
    },
  )
  const createBranch = Effect.fn("PartyStore.createBranch")(
    function* (
      tenantId: string,
      legalEntityId: string,
      name: string,
      timezone: string | null,
      localTaxRegistration: string | null,
      dedicatedJournalCode: string | null,
    ) {
      const exists = yield* database.query(
        (db) =>
          db.select({ id: legalEntities.id }).from(legalEntities).where(
            and(eq(legalEntities.tenantId, tenantId), eq(legalEntities.id, legalEntityId)),
          ),
        "party.branch.legal_entity.get",
      )
      if (exists[0] === undefined) {
        return yield* Effect.fail(new LegalEntityNotFound({ tenantId, legalEntityId }))
      }
      const rows = yield* database.query((db) =>
        db.insert(branches).values({
          tenantId,
          legalEntityId,
          name,
          timezone,
          localTaxRegistration,
          dedicatedJournalCode,
        }).returning(branchSelection), "party.branch.create").pipe(
          Effect.mapError((error) =>
            isDatabaseConstraint(error, "branches_tenant_legal_entity_name_key")
              ? new BranchAlreadyExists({ tenantId, legalEntityId, name })
              : error
          ),
        )
      return rows[0]!
    },
  )
  const createPartyRepresentation = Effect.fn("PartyStore.createPartyRepresentation")(
    function* (
      tenantId: string,
      userAccountId: string,
      partyId: string,
      kind: PartyRepresentationKind,
    ) {
      const rows = yield* database.query((db) =>
        db.insert(partyRepresentations).values({
          tenantId,
          userAccountId,
          partyId,
          kind,
          active: true,
        }).returning(partyRepresentationSelection), "party.representation.create").pipe(
          Effect.mapError((error) => {
            if (isDatabaseConstraint(error, "party_representations_user_account_fkey", "23503")) {
              return new PartyRepresentationUserAccountNotFound({ tenantId, userAccountId })
            }
            if (isDatabaseConstraint(error, "party_representations_party_fkey", "23503")) {
              return new PartyNotFound({ tenantId, partyId })
            }
            if (
              isDatabaseConstraint(
                error,
                "party_representations_tenant_user_account_party_kind_key",
              )
            ) {
              return new PartyRepresentationAlreadyExists({
                tenantId,
                userAccountId,
                partyId,
                kind,
              })
            }
            return error
          }),
        )
      return rows[0]!
    },
  )
  const setPartyRepresentationActive = Effect.fn("PartyStore.setPartyRepresentationActive")(
    function* (tenantId: string, representationId: string, active: boolean) {
      const rows = yield* database.query(
        (db) =>
          db.update(partyRepresentations).set({ active }).where(
            and(
              eq(partyRepresentations.tenantId, tenantId),
              eq(partyRepresentations.id, representationId),
            ),
          ).returning(partyRepresentationSelection),
        "party.representation.set-active",
      )
      const representation = rows[0]
      if (representation === undefined) {
        return yield* Effect.fail(new PartyRepresentationNotFound({ tenantId, representationId }))
      }
      return representation
    },
  )
  const assignRole = Effect.fn("PartyStore.assignRole")(
    function* (tenantId: string, partyId: string, role: PartyRole) {
      yield* database.query(
        (db) => db.insert(partyRoles).values({ tenantId, partyId, role }),
        "party.role.assign",
      ).pipe(
        Effect.mapError((error) =>
          isDatabaseConstraint(error, "party_roles_tenant_party_fkey", "23503")
            ? new PartyNotFound({ tenantId, partyId })
            : isDatabaseConstraint(error, "party_roles_pkey")
            ? new PartyRoleAlreadyAssigned({ tenantId, partyId, role })
            : error
        ),
      )
    },
  )
  const createRelationship = Effect.fn("PartyStore.createRelationship")(
    function* (
      tenantId: string,
      partyId: string,
      legalEntityId: string,
      kind: PartyRelationshipKind,
    ) {
      const rows = yield* database.query((db) =>
        db.insert(partyRelationships).values({
          tenantId,
          partyId,
          legalEntityId,
          kind,
          active: true,
        }).returning(relationshipSelection), "party.relationship.create").pipe(
          Effect.mapError((error) => {
            if (isDatabaseConstraint(error, "party_relationships_tenant_party_fkey", "23503")) {
              return new PartyNotFound({ tenantId, partyId })
            }
            if (
              isDatabaseConstraint(error, "party_relationships_tenant_legal_entity_fkey", "23503")
            ) {
              return new LegalEntityNotFound({ tenantId, legalEntityId })
            }
            if (
              isDatabaseConstraint(error, "party_relationships_tenant_party_role_fkey", "23503")
            ) return new PartyRelationshipRoleNotAssigned({ tenantId, partyId, kind })
            if (
              isDatabaseConstraint(error, "party_relationships_tenant_party_legal_entity_kind_key")
            ) return new PartyRelationshipAlreadyExists({ tenantId, partyId, legalEntityId, kind })
            return error
          }),
        )
      return rows[0]!
    },
  )
  const getRelationship = Effect.fn("PartyStore.getRelationship")(
    function* (tenantId: string, relationshipId: string) {
      const rows = yield* database.query(
        (db) =>
          db.select(relationshipSelection).from(partyRelationships).where(
            and(
              eq(partyRelationships.tenantId, tenantId),
              eq(partyRelationships.id, relationshipId),
            ),
          ),
        "party.relationship.get",
      )
      const relationship = rows[0]
      if (relationship === undefined) {
        return yield* Effect.fail(new PartyRelationshipNotFound({ tenantId, relationshipId }))
      }
      return relationship
    },
  )
  const findRelatedPartyPaths = Effect.fn("PartyStore.findRelatedPartyPaths")(
    function* (tenantId: string, sourcePartyId: string, limit: number) {
      const rows = yield* database.query(
        (db) =>
          db.select(relatedPartyPathSelection).from(relatedPartyPaths).where(
            and(
              eq(relatedPartyPaths.tenantId, tenantId),
              eq(relatedPartyPaths.sourcePartyId, sourcePartyId),
              ne(relatedPartyPaths.targetPartyId, sourcePartyId),
            ),
          ).orderBy(
            asc(relatedPartyPaths.depth),
            asc(relatedPartyPaths.legalEntityId),
            asc(relatedPartyPaths.relationshipId),
          ).limit(limit),
        "party.related-party-paths.find",
      )
      return rows.map((row) => ({ ...row, depth: 2 as const }))
    },
  )
  const attachIdentifier = Effect.fn("PartyStore.attachIdentifier")(
    function* (
      tenantId: string,
      partyId: string,
      provider: string,
      scheme: string,
      scope: string,
      legalEntityId: string | null,
      value: string,
    ) {
      const rows = yield* database.query((db) =>
        db.insert(partyIdentifiers).values({
          tenantId,
          partyId,
          provider,
          scheme,
          scope,
          legalEntityId,
          value,
        }).returning(identifierSelection), "party.identifier.attach").pipe(
          Effect.mapError((error) => {
            if (isDatabaseConstraint(error, "party_identifiers_tenant_party_fkey", "23503")) {
              return new PartyNotFound({ tenantId, partyId })
            }
            if (
              legalEntityId !== null &&
              isDatabaseConstraint(error, "party_identifiers_tenant_legal_entity_fkey", "23503")
            ) {
              return new LegalEntityNotFound({ tenantId, legalEntityId })
            }
            if (
              isDatabaseConstraint(error, "party_identifiers_tenant_provider_scope_value_uq") ||
              isDatabaseConstraint(error, "party_identifiers_tenant_provider_entity_scope_value_uq")
            ) {
              return new ExternalIdentifierAlreadyAssigned({
                tenantId,
                provider,
                scheme,
                scope,
                legalEntityId,
                value,
              })
            }
            return error
          }),
        )
      return rows[0]!
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
  } satisfies PartyStore
})

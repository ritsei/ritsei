import type * as Effect from "effect/Effect"
import type { DatabaseFailure } from "../../../foundation/mod.ts"
import type {
  Branch,
  ExternalIdentifier,
  LegalEntity,
  Party,
  PartyDetail,
  PartyDirectoryEntry,
  PartyKind,
  PartyRelationship,
  PartyRelationshipKind,
  PartyRepresentation,
  PartyRepresentationKind,
  PartyRole,
  RelatedPartyPath,
} from "./contract.ts"
import type {
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

type Failure = DatabaseFailure

export interface PartyStore {
  readonly list: (
    tenantId: string,
    search: string | null,
    kind: PartyKind | null,
    limit: number,
  ) => Effect.Effect<ReadonlyArray<PartyDirectoryEntry>, Failure>
  readonly getDetail: (
    tenantId: string,
    partyId: string,
  ) => Effect.Effect<PartyDetail, PartyNotFound | Failure>
  readonly create: (
    tenantId: string,
    kind: PartyKind,
    name: string,
  ) => Effect.Effect<Party, Failure>
  readonly createLegalEntity: (
    tenantId: string,
    organizationId: string,
  ) => Effect.Effect<
    LegalEntity,
    PartyNotFound | OrganizationRequired | LegalEntityAlreadyExists | Failure
  >
  readonly createBranch: (
    tenantId: string,
    legalEntityId: string,
    name: string,
    timezone: string | null,
    localTaxRegistration: string | null,
    dedicatedJournalCode: string | null,
  ) => Effect.Effect<Branch, LegalEntityNotFound | BranchAlreadyExists | Failure>
  readonly createPartyRepresentation: (
    tenantId: string,
    userAccountId: string,
    partyId: string,
    kind: PartyRepresentationKind,
  ) => Effect.Effect<
    PartyRepresentation,
    | PartyRepresentationUserAccountNotFound
    | PartyRepresentationAlreadyExists
    | PartyNotFound
    | Failure
  >
  readonly setPartyRepresentationActive: (
    tenantId: string,
    representationId: string,
    active: boolean,
  ) => Effect.Effect<PartyRepresentation, PartyRepresentationNotFound | Failure>
  readonly assignRole: (
    tenantId: string,
    partyId: string,
    role: PartyRole,
  ) => Effect.Effect<void, PartyNotFound | PartyRoleAlreadyAssigned | Failure>
  readonly createRelationship: (
    tenantId: string,
    partyId: string,
    legalEntityId: string,
    kind: PartyRelationshipKind,
  ) => Effect.Effect<
    PartyRelationship,
    | LegalEntityNotFound
    | PartyNotFound
    | PartyRelationshipAlreadyExists
    | PartyRelationshipRoleNotAssigned
    | Failure
  >
  readonly getRelationship: (
    tenantId: string,
    relationshipId: string,
  ) => Effect.Effect<PartyRelationship, PartyRelationshipNotFound | Failure>
  readonly findRelatedPartyPaths: (
    tenantId: string,
    sourcePartyId: string,
    limit: number,
  ) => Effect.Effect<ReadonlyArray<RelatedPartyPath>, Failure>
  readonly attachIdentifier: (
    tenantId: string,
    partyId: string,
    provider: string,
    scheme: string,
    scope: string,
    legalEntityId: string | null,
    value: string,
  ) => Effect.Effect<
    ExternalIdentifier,
    LegalEntityNotFound | PartyNotFound | ExternalIdentifierAlreadyAssigned | Failure
  >
}

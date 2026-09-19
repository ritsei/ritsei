import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import { Principal } from "../../auth/mod.ts"
import type { AuthorizationDenied } from "../../authorization/mod.ts"
import type { DatabaseFailure } from "../../../foundation/mod.ts"
import type { EventIdempotencyConflict } from "../../messaging/mod.ts"
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

const NonBlankString = Schema.String.check(Schema.isPattern(/\S/))
const TrimmedNonBlankString = Schema.String.check(
  Schema.isPattern(/\S/),
  Schema.isTrimmed(),
)
const UpperTrimmedNonBlankString = Schema.String.check(
  Schema.isPattern(/\S/),
  Schema.isTrimmed(),
  Schema.isUppercased(),
)
const Uuid = Schema.String.check(Schema.isUUID())

export const PartyKind = Schema.Literals(["person", "organization"])
export const PartyRole = Schema.Literals(["customer", "supplier", "employee", "partner"])
export const PartyRelationshipKind = Schema.Literals([
  "customer",
  "supplier",
  "employee",
  "partner",
])

export const Party = Schema.Struct({
  id: Uuid,
  tenantId: Uuid,
  kind: PartyKind,
  name: TrimmedNonBlankString,
})

export const ExternalIdentifier = Schema.Struct({
  id: Uuid,
  tenantId: Uuid,
  partyId: Uuid,
  provider: UpperTrimmedNonBlankString,
  scheme: UpperTrimmedNonBlankString,
  scope: TrimmedNonBlankString,
  legalEntityId: Schema.NullOr(Uuid),
  value: TrimmedNonBlankString,
})

export const LegalEntity = Schema.Struct({
  id: Uuid,
  tenantId: Uuid,
  organizationId: Uuid,
})

export const Branch = Schema.Struct({
  id: Uuid,
  tenantId: Uuid,
  legalEntityId: Uuid,
  name: TrimmedNonBlankString,
  timezone: Schema.NullOr(TrimmedNonBlankString),
  localTaxRegistration: Schema.NullOr(TrimmedNonBlankString),
  dedicatedJournalCode: Schema.NullOr(TrimmedNonBlankString),
})

export const PartyRepresentationKind = TrimmedNonBlankString

export const PartyRepresentation = Schema.Struct({
  id: Uuid,
  tenantId: Uuid,
  userAccountId: Uuid,
  partyId: Uuid,
  kind: PartyRepresentationKind,
  active: Schema.Boolean,
})

export const PartyRelationship = Schema.Struct({
  id: Uuid,
  tenantId: Uuid,
  partyId: Uuid,
  legalEntityId: Uuid,
  kind: PartyRelationshipKind,
  active: Schema.Boolean,
})

export const RelatedPartyPath = Schema.Struct({
  tenantId: Uuid,
  sourcePartyId: Uuid,
  targetPartyId: Uuid,
  legalEntityId: Uuid,
  relationshipId: Uuid,
  relationshipKind: PartyRelationshipKind,
  depth: Schema.Literal(2),
})

export type Party = Schema.Schema.Type<typeof Party>
export type ExternalIdentifier = Schema.Schema.Type<typeof ExternalIdentifier>
export type LegalEntity = Schema.Schema.Type<typeof LegalEntity>
export type Branch = Schema.Schema.Type<typeof Branch>
export type PartyRepresentation = Schema.Schema.Type<typeof PartyRepresentation>
export type PartyRelationship = Schema.Schema.Type<typeof PartyRelationship>
export type RelatedPartyPath = Schema.Schema.Type<typeof RelatedPartyPath>
export type PartyRepresentationKind = Schema.Schema.Type<typeof PartyRepresentationKind>
export type PartyRole = Schema.Schema.Type<typeof PartyRole>
export type PartyKind = Schema.Schema.Type<typeof PartyKind>
export type PartyRelationshipKind = Schema.Schema.Type<typeof PartyRelationshipKind>

export const PartyDirectoryEntry = Schema.Struct({
  party: Party,
  legalEntityId: Schema.NullOr(Uuid),
})

export const PartyDetail = Schema.Struct({
  party: Party,
  roles: Schema.Array(PartyRole),
  identifiers: Schema.Array(ExternalIdentifier),
  legalEntity: Schema.NullOr(LegalEntity),
  branches: Schema.Array(Branch),
  relationships: Schema.Array(PartyRelationship),
  representations: Schema.Array(PartyRepresentation),
})

export type PartyDirectoryEntry = Schema.Schema.Type<typeof PartyDirectoryEntry>
export type PartyDetail = Schema.Schema.Type<typeof PartyDetail>

export const ListPartiesInput = Schema.Struct({
  principal: Principal,
  tenantId: Uuid,
  search: Schema.optionalKey(TrimmedNonBlankString),
  kind: Schema.optionalKey(PartyKind),
  limit: Schema.optionalKey(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 200 }))),
})

export const GetPartyDetailInput = Schema.Struct({
  principal: Principal,
  tenantId: Uuid,
  partyId: Uuid,
})

export const CreatePartyInput = Schema.Struct({
  principal: Principal,
  tenantId: Uuid,
  kind: PartyKind,
  name: NonBlankString,
})

export const AssignPartyRoleInput = Schema.Struct({
  principal: Principal,
  tenantId: Uuid,
  partyId: Uuid,
  role: PartyRole,
})

export const CreatePartyRelationshipInput = Schema.Struct({
  principal: Principal,
  tenantId: Uuid,
  partyId: Uuid,
  legalEntityId: Uuid,
  kind: PartyRelationshipKind,
})

export const GetPartyRelationshipInput = Schema.Struct({
  principal: Principal,
  tenantId: Uuid,
  relationshipId: Uuid,
})

export const FindRelatedPartyPathsInput = Schema.Struct({
  principal: Principal,
  tenantId: Uuid,
  sourcePartyId: Uuid,
  limit: Schema.optionalKey(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 100 }))),
})

export const AttachExternalIdentifierInput = Schema.Struct({
  principal: Principal,
  tenantId: Uuid,
  partyId: Uuid,
  provider: NonBlankString,
  scheme: NonBlankString,
  scope: NonBlankString,
  legalEntityId: Schema.optionalKey(Uuid),
  value: NonBlankString,
})

export const CreateLegalEntityInput = Schema.Struct({
  principal: Principal,
  tenantId: Uuid,
  organizationId: Uuid,
})

export const CreateBranchInput = Schema.Struct({
  principal: Principal,
  tenantId: Uuid,
  legalEntityId: Uuid,
  name: NonBlankString,
  timezone: Schema.optionalKey(NonBlankString),
  localTaxRegistration: Schema.optionalKey(NonBlankString),
  dedicatedJournalCode: Schema.optionalKey(NonBlankString),
})

export const CreatePartyRepresentationInput = Schema.Struct({
  principal: Principal,
  tenantId: Uuid,
  userAccountId: Uuid,
  partyId: Uuid,
  kind: PartyRepresentationKind,
})

export const SetPartyRepresentationActiveInput = Schema.Struct({
  principal: Principal,
  tenantId: Uuid,
  representationId: Uuid,
  active: Schema.Boolean,
})

export interface PartyService {
  readonly list: (
    input: unknown,
  ) => Effect.Effect<
    ReadonlyArray<PartyDirectoryEntry>,
    AuthorizationDenied | DatabaseFailure | Schema.SchemaError
  >
  readonly getDetail: (
    input: unknown,
  ) => Effect.Effect<
    PartyDetail,
    PartyNotFound | AuthorizationDenied | DatabaseFailure | Schema.SchemaError
  >
  readonly create: (
    input: unknown,
  ) => Effect.Effect<
    Party,
    | AuthorizationDenied
    | DatabaseFailure
    | EventIdempotencyConflict
    | Schema.SchemaError
  >
  readonly createLegalEntity: (
    input: unknown,
  ) => Effect.Effect<
    LegalEntity,
    | PartyNotFound
    | OrganizationRequired
    | LegalEntityAlreadyExists
    | AuthorizationDenied
    | DatabaseFailure
    | Schema.SchemaError
  >
  readonly createBranch: (
    input: unknown,
  ) => Effect.Effect<
    Branch,
    | LegalEntityNotFound
    | BranchAlreadyExists
    | AuthorizationDenied
    | DatabaseFailure
    | Schema.SchemaError
  >
  readonly createPartyRepresentation: (
    input: unknown,
  ) => Effect.Effect<
    PartyRepresentation,
    | PartyRepresentationUserAccountNotFound
    | PartyRepresentationAlreadyExists
    | PartyNotFound
    | AuthorizationDenied
    | DatabaseFailure
    | Schema.SchemaError
  >
  readonly setPartyRepresentationActive: (
    input: unknown,
  ) => Effect.Effect<
    PartyRepresentation,
    PartyRepresentationNotFound | AuthorizationDenied | DatabaseFailure | Schema.SchemaError
  >
  readonly assignRole: (
    input: unknown,
  ) => Effect.Effect<
    void,
    | PartyNotFound
    | PartyRoleAlreadyAssigned
    | AuthorizationDenied
    | DatabaseFailure
    | Schema.SchemaError
  >
  readonly createRelationship: (
    input: unknown,
  ) => Effect.Effect<
    PartyRelationship,
    | LegalEntityNotFound
    | PartyNotFound
    | PartyRelationshipAlreadyExists
    | PartyRelationshipRoleNotAssigned
    | AuthorizationDenied
    | DatabaseFailure
    | Schema.SchemaError
  >
  readonly getRelationship: (
    input: unknown,
  ) => Effect.Effect<
    PartyRelationship,
    PartyRelationshipNotFound | AuthorizationDenied | DatabaseFailure | Schema.SchemaError
  >
  readonly findRelatedPartyPaths: (
    input: unknown,
  ) => Effect.Effect<
    ReadonlyArray<RelatedPartyPath>,
    AuthorizationDenied | DatabaseFailure | Schema.SchemaError
  >
  readonly attachIdentifier: (
    input: unknown,
  ) => Effect.Effect<
    ExternalIdentifier,
    | LegalEntityNotFound
    | PartyNotFound
    | ExternalIdentifierAlreadyAssigned
    | AuthorizationDenied
    | DatabaseFailure
    | Schema.SchemaError
  >
}

export const PartyService = Context.Service<PartyService>("RITSEI/PartyService")

export {
  AuthorizationCapabilities,
  CapabilityCatalog,
  CapabilityDefinition,
  CapabilityDefinitions,
  CapabilityId,
  CapabilityIds,
  CapabilityOwner,
  CapabilityScope,
  CapabilityStability,
  getCapabilityDefinition,
  isCapabilityIdShape,
  isKnownCapability,
  LegacyCapabilityIds,
} from "./src/capabilities.ts"
export type { CapabilityDefinition as CapabilityDefinitionType } from "./src/capabilities.ts"

export {
  AddTenantMembershipInput,
  AuthorizationDecision,
  AuthorizationInput,
  AuthorizationService,
  Capability,
  DirectCapabilityGrant,
  GrantCapabilityInput,
  ListAccessibleTenantsInput,
  ListTenantMembershipsInput,
  TenantMembership,
  TenantMembershipInput,
  TenantMembershipStatus,
} from "./src/contract.ts"
export type {
  AuthorizationService as AuthorizationServiceShape,
  Capability as CapabilityType,
  DirectCapabilityGrant as DirectCapabilityGrantType,
  ListAccessibleTenantsInput as ListAccessibleTenantsInputType,
  ListTenantMembershipsInput as ListTenantMembershipsInputType,
  TenantMembership as TenantMembershipType,
  TenantMembershipStatus as TenantMembershipStatusType,
} from "./src/contract.ts"

export {
  AuthorizationDenied,
  CapabilityAlreadyGranted,
  TenantMembershipAlreadyExists,
  TenantMembershipNotActive,
  TenantMembershipNotFound,
  TenantMembershipUserAccountNotFound,
} from "./src/errors.ts"

export { makeAuthorizationService } from "./src/service.ts"
export {
  makeMemoryRelationshipEngine,
  makePostgresRelationshipEngine,
  RelationshipDecision,
  RelationshipEngine,
  RelationshipInput,
  RelationshipResult,
} from "./src/relationship.ts"
export type {
  RelationshipDecision as RelationshipDecisionType,
  RelationshipEngine as RelationshipEngineShape,
  RelationshipInput as RelationshipInputType,
  RelationshipResult as RelationshipResultType,
} from "./src/relationship.ts"
export {
  evaluateSeparationOfDuties,
  SeparationOfDutiesDecision,
  SeparationOfDutiesInput,
} from "./src/sod.ts"
export type {
  SeparationOfDutiesDecision as SeparationOfDutiesDecisionType,
  SeparationOfDutiesInput as SeparationOfDutiesInputType,
} from "./src/sod.ts"
export { AuthorizationLive, makeAuthorizationTestLayer, RelationshipLive } from "./src/layers.ts"

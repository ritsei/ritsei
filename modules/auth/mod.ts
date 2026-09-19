export {
  AuthService,
  CreateTenantInput,
  ExternalIdentity,
  IdentityProvider,
  IssueSessionInput,
  Principal,
  Session,
  Tenant,
} from "./src/contract.ts"
export type {
  AuthService as AuthServiceShape,
  ExternalIdentity as ExternalIdentityType,
  IdentityProvider as IdentityProviderShape,
  IssuedSession,
  Principal as PrincipalType,
  Session as SessionType,
  Tenant as TenantType,
} from "./src/contract.ts"

export {
  ExternalProviderUnavailable,
  InvalidExternalAssertion,
  InvalidSessionToken,
  SessionUserAccountDisabled,
  SessionUserAccountNotFound,
  TenantAlreadyExists,
} from "./src/errors.ts"

export { makeAuthService } from "./src/service.ts"
export { AuthLive, makeAuthTestLayer } from "./src/layers.ts"

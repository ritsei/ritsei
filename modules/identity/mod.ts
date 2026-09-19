export { IdentityCapabilities } from "./src/capabilities.ts"
export {
  IdentityCreateUserAccountAction,
  IdentityTypedActionCatalog,
  IdentityTypedEventCatalog,
} from "./src/catalog.ts"
export {
  IdentityAccountAuthorizer,
  IdentityEventPublisher,
  IdentityPrincipal,
  UserAccountCreatedEvent,
  UserAccountCreatedEventPayload,
} from "./src/events.ts"

export {
  BindExternalSubjectInput,
  CreateUserAccountForTenantInput,
  CreateUserAccountInput,
  ExternalSubject,
  UpdateUserAccountInput,
  UserAccount,
  UserAccountAuthenticationState,
  UserAccountService,
  UserAccountStatus,
} from "./src/contract.ts"
export type { UserAccountService as UserAccountServiceShape } from "./src/contract.ts"
export {
  ExternalSubjectAlreadyBound,
  ExternalSubjectNotFound,
  IdentityAuthorizationDenied,
  UserAccountAlreadyExists,
  UserAccountNotFound,
} from "./src/errors.ts"
export {
  IdentityEventPublisherLive,
  IdentityLive,
  makeUserAccountService,
  makeUserAccountTestLayer,
} from "./src/layers.ts"

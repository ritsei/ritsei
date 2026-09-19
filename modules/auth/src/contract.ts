import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"

export { ExternalIdentity, IdentityProvider } from "./provider.ts"
export type {
  ExternalIdentity as ExternalIdentityType,
  IdentityProvider as IdentityProviderShape,
} from "./provider.ts"

const PositiveSeconds = Schema.Int.check(Schema.isGreaterThan(0))
const NonBlankString = Schema.String.check(Schema.isPattern(/\S/))
const Uuid = Schema.String.check(Schema.isUUID())

export const CreateTenantInput = Schema.Struct({
  slug: Schema.String,
  timezone: Schema.optionalKey(NonBlankString),
})
export const IssueSessionInput = Schema.Struct({
  userAccountId: Schema.String,
  ttlSeconds: PositiveSeconds,
})
export const Tenant = Schema.Struct({
  id: Uuid,
  slug: Schema.String,
  timezone: Schema.String,
})
export const Session = Schema.Struct({
  id: Schema.String,
  userAccountId: Schema.String,
  expiresAt: Schema.String,
})
export const Principal = Schema.Struct({
  userAccountId: Schema.String,
  sessionId: Schema.String,
  authentication: Schema.optionalKey(Schema.Literals(["local", "external"])),
  externalIssuer: Schema.optionalKey(Schema.String),
  externalSubject: Schema.optionalKey(Schema.String),
})

export type Tenant = Schema.Schema.Type<typeof Tenant>
export type Session = Schema.Schema.Type<typeof Session>
export type Principal = Schema.Schema.Type<typeof Principal>

export interface IssuedSession {
  readonly token: string
  readonly session: Session
}

export interface AuthService {
  readonly findTenantBySlug: (
    slug: string,
  ) => Effect.Effect<
    Tenant | undefined,
    import("../../../foundation/mod.ts").DatabaseFailure
  >
  readonly createTenant: (
    input: unknown,
  ) => Effect.Effect<
    Tenant,
    | import("./errors.ts").TenantAlreadyExists
    | import("../../../foundation/mod.ts").DatabaseFailure
    | Schema.SchemaError
  >
  readonly issueSession: (
    input: unknown,
  ) => Effect.Effect<
    IssuedSession,
    | import("./errors.ts").SessionUserAccountNotFound
    | import("./errors.ts").SessionUserAccountDisabled
    | import("../../../foundation/mod.ts").DatabaseFailure
    | Schema.SchemaError
  >
  readonly authenticate: (
    token: string,
  ) => Effect.Effect<
    Principal,
    | import("./errors.ts").InvalidSessionToken
    | import("./errors.ts").InvalidExternalAssertion
    | import("./errors.ts").ExternalProviderUnavailable
    | import("../../../foundation/mod.ts").DatabaseFailure
  >
  readonly revoke: (
    sessionId: string,
  ) => Effect.Effect<
    void,
    import("./errors.ts").InvalidSessionToken | import("../../../foundation/mod.ts").DatabaseFailure
  >
}

export const AuthService = Context.Service<AuthService>("RITSEI/AuthService")

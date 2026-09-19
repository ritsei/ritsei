import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"

const NonBlankString = Schema.String.check(Schema.isPattern(/\S/), Schema.isTrimmed())

/** Provider-neutral identity facts produced after external assertion validation. */
export const ExternalIdentity = Schema.Struct({
  issuer: NonBlankString,
  subject: NonBlankString,
  issuedAt: Schema.Int.check(Schema.isGreaterThan(0)),
})
export type ExternalIdentity = Schema.Schema.Type<typeof ExternalIdentity>

export interface IdentityProvider {
  readonly authenticate: (
    assertion: string,
  ) => Effect.Effect<
    ExternalIdentity,
    | import("./errors.ts").InvalidExternalAssertion
    | import("./errors.ts").ExternalProviderUnavailable
  >
}

export const IdentityProvider = Context.Service<IdentityProvider>(
  "RITSEI/IdentityProvider",
)

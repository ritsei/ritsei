import * as Schema from "effect/Schema"

export class TenantAlreadyExists
  extends Schema.TaggedError<TenantAlreadyExists>()("TenantAlreadyExists", {
    slug: Schema.String,
  }) {}

export class SessionUserAccountNotFound
  extends Schema.TaggedError<SessionUserAccountNotFound>()("SessionUserAccountNotFound", {
    userAccountId: Schema.String,
  }) {}

export class SessionUserAccountDisabled
  extends Schema.TaggedError<SessionUserAccountDisabled>()("SessionUserAccountDisabled", {
    userAccountId: Schema.String,
  }) {}

export class InvalidSessionToken
  extends Schema.TaggedError<InvalidSessionToken>()("InvalidSessionToken", {}) {}

export class InvalidExternalAssertion
  extends Schema.TaggedError<InvalidExternalAssertion>()("InvalidExternalAssertion", {}) {}

export class ExternalProviderUnavailable
  extends Schema.TaggedError<ExternalProviderUnavailable>()("ExternalProviderUnavailable", {}) {}

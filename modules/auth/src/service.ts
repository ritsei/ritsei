import * as Clock from "effect/Clock"
import * as Crypto from "effect/Crypto"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"

import {
  ExternalSubjectNotFound,
  UserAccountNotFound,
  UserAccountService,
} from "../../identity/mod.ts"
import { DatabaseFailure } from "../../../foundation/mod.ts"
import {
  AuthService,
  CreateTenantInput,
  IdentityProvider,
  type IssuedSession,
  IssueSessionInput,
  Principal,
  Tenant,
} from "./contract.ts"
import {
  InvalidSessionToken,
  SessionUserAccountDisabled,
  SessionUserAccountNotFound,
} from "./errors.ts"
import { makePostgresAuthStore } from "./postgres.ts"

const encodeToken = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "")

const makeToken = (crypto: Crypto.Crypto) =>
  crypto.randomBytes(32).pipe(
    Effect.map(encodeToken),
    Effect.mapError((cause) => new DatabaseFailure({ operation: "session-token-generate", cause })),
  )

const hashToken = (crypto: Crypto.Crypto, token: string) =>
  crypto.digest("SHA-256", new TextEncoder().encode(token)).pipe(
    Effect.map((digest) =>
      Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("")
    ),
    Effect.mapError((cause) => new DatabaseFailure({ operation: "session-token-hash", cause })),
  )

const normalizeTenant = (input: Schema.Schema.Type<typeof CreateTenantInput>) => ({
  slug: input.slug.trim().toLowerCase(),
  timezone: input.timezone?.trim() ?? "UTC",
})

export const makeAuthService = Effect.gen(function* () {
  const store = yield* makePostgresAuthStore
  const userAccounts = yield* UserAccountService
  const crypto = yield* Crypto.Crypto
  const clock = yield* Clock.Clock
  const identityProvider = yield* Effect.serviceOption(IdentityProvider)
  const now = () => new Date(clock.currentTimeMillisUnsafe())

  const findTenantBySlug = Effect.fn("auth.findTenantBySlug")(function* (slug: string) {
    const normalized = slug.trim().toLowerCase()
    return yield* store.findTenantBySlug(normalized).pipe(
      Effect.map((tenant) => tenant === undefined ? undefined : { ...tenant } satisfies Tenant),
    )
  })

  const createTenant = Effect.fn("auth.createTenant")(function* (input: unknown) {
    const decoded = yield* Schema.decodeUnknownEffect(CreateTenantInput)(input)
    const { slug, timezone } = normalizeTenant(decoded)
    return yield* store.createTenant(slug, timezone).pipe(
      Effect.map((tenant) => ({ ...tenant } satisfies Tenant)),
    )
  })

  const issueSession = Effect.fn("auth.issueSession")(function* (input: unknown) {
    const decoded = yield* Schema.decodeUnknownEffect(IssueSessionInput)(input)
    const account = yield* userAccounts.getAuthenticationState(decoded.userAccountId).pipe(
      Effect.mapError((error) =>
        error instanceof UserAccountNotFound || error instanceof Schema.SchemaError
          ? new SessionUserAccountNotFound({ userAccountId: decoded.userAccountId })
          : error
      ),
    )
    if (account.status === "disabled") {
      return yield* Effect.fail(
        new SessionUserAccountDisabled({ userAccountId: decoded.userAccountId }),
      )
    }
    const token = yield* makeToken(crypto)
    const tokenHash = yield* hashToken(crypto, token)
    const row = yield* store.createSession(
      decoded.userAccountId,
      tokenHash,
      new Date(clock.currentTimeMillisUnsafe() + decoded.ttlSeconds * 1000),
    )
    return {
      token,
      session: {
        id: row.id,
        userAccountId: row.userAccountId,
        expiresAt: row.expiresAt.toISOString(),
      },
    } satisfies IssuedSession
  })

  const authenticate = Effect.fn("auth.authenticate")(function* (token: string) {
    if (Option.isNone(identityProvider)) {
      const tokenHash = yield* hashToken(crypto, token)
      const row = yield* store.findActiveSession(tokenHash, now())
      if (row === undefined) return yield* Effect.fail(new InvalidSessionToken({}))
      const account = yield* userAccounts.getAuthenticationState(row.userAccountId).pipe(
        Effect.mapError((error) =>
          error instanceof UserAccountNotFound || error instanceof Schema.SchemaError
            ? new InvalidSessionToken({})
            : error
        ),
      )
      if (
        account.status === "disabled" ||
        (account.sessionInvalidatedAt !== null &&
          row.createdAt.getTime() <= Date.parse(account.sessionInvalidatedAt))
      ) return yield* Effect.fail(new InvalidSessionToken({}))
      return {
        userAccountId: row.userAccountId,
        sessionId: row.id,
        authentication: "local" as const,
      } satisfies Schema.Schema.Type<typeof Principal>
    }

    const external = yield* identityProvider.value.authenticate(token)
    const account = yield* userAccounts.resolveExternalSubject({
      issuer: external.issuer,
      subject: external.subject,
    }).pipe(
      Effect.mapError((error) =>
        error instanceof ExternalSubjectNotFound || error instanceof Schema.SchemaError
          ? new InvalidSessionToken({})
          : error
      ),
    )
    const state = yield* userAccounts.getAuthenticationState(account.id).pipe(
      Effect.mapError((error) =>
        error instanceof UserAccountNotFound || error instanceof Schema.SchemaError
          ? new InvalidSessionToken({})
          : error
      ),
    )
    if (
      state.status === "disabled" ||
      (state.sessionInvalidatedAt !== null &&
        external.issuedAt * 1_000 <= Date.parse(state.sessionInvalidatedAt))
    ) return yield* Effect.fail(new InvalidSessionToken({}))
    const sessionId = yield* hashToken(crypto, `${external.issuer}\u0000${external.subject}`).pipe(
      Effect.map((hash) => `external:${hash}`),
    )
    return {
      userAccountId: account.id,
      sessionId,
      authentication: "external" as const,
      externalIssuer: external.issuer,
      externalSubject: external.subject,
    } satisfies Schema.Schema.Type<typeof Principal>
  })

  const revoke = Effect.fn("auth.revoke")(function* (sessionId: string) {
    if (sessionId.startsWith("external:")) return
    if (!(yield* store.revokeSession(sessionId, now()))) {
      return yield* Effect.fail(new InvalidSessionToken({}))
    }
  })

  return {
    findTenantBySlug,
    createTenant,
    issueSession,
    authenticate,
    revoke,
  } satisfies AuthService
})

import * as Clock from "effect/Clock"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"

import { uuidv7 } from "../../../foundation/mod.ts"
import { AuthService, CreateTenantInput, IssueSessionInput, type Tenant } from "./contract.ts"
import {
  InvalidSessionToken,
  SessionUserAccountDisabled,
  SessionUserAccountNotFound,
  TenantAlreadyExists,
} from "./errors.ts"

export const makeMemoryAuthLayer = (
  validUserAccountIds?: ReadonlySet<string>,
  disabledUserAccountIds: ReadonlySet<string> = new Set(),
) =>
  Layer.effect(
    AuthService,
    Effect.gen(function* () {
      const clock = yield* Clock.Clock
      const storedTenants = new Map<string, Tenant>()
      const storedSessions = new Map<
        string,
        { userAccountId: string; sessionId: string; expiresAt: number }
      >()
      let nextSessionId = 1

      const findTenantBySlug = Effect.fn("auth.findTenantBySlug")((slug: string) => {
        const normalized = slug.trim().toLowerCase()
        return Effect.succeed(
          [...storedTenants.values()].find((tenant) => tenant.slug === normalized),
        )
      })

      const createTenant = Effect.fn("auth.createTenant")(function* (input: unknown) {
        const decoded = yield* Schema.decodeUnknownEffect(CreateTenantInput)(input)
        const slug = decoded.slug.trim().toLowerCase()
        const timezone = decoded.timezone?.trim() ?? "UTC"
        if ([...storedTenants.values()].some((tenant) => tenant.slug === slug)) {
          return yield* Effect.fail(new TenantAlreadyExists({ slug }))
        }
        const tenant = { id: uuidv7(), slug, timezone }
        storedTenants.set(tenant.id, tenant)
        return tenant
      })

      const issueSession = Effect.fn("auth.issueSession")(function* (input: unknown) {
        const decoded = yield* Schema.decodeUnknownEffect(IssueSessionInput)(input)
        if (validUserAccountIds !== undefined && !validUserAccountIds.has(decoded.userAccountId)) {
          return yield* Effect.fail(
            new SessionUserAccountNotFound({ userAccountId: decoded.userAccountId }),
          )
        }
        if (disabledUserAccountIds.has(decoded.userAccountId)) {
          return yield* Effect.fail(
            new SessionUserAccountDisabled({ userAccountId: decoded.userAccountId }),
          )
        }
        const sequence = nextSessionId++
        const token = `test-token-${sequence}`
        const sessionId = `session-${sequence}`
        const expiresAt = clock.currentTimeMillisUnsafe() + decoded.ttlSeconds * 1000
        storedSessions.set(token, {
          userAccountId: decoded.userAccountId,
          sessionId,
          expiresAt,
        })
        return {
          token,
          session: {
            id: sessionId,
            userAccountId: decoded.userAccountId,
            expiresAt: new Date(expiresAt).toISOString(),
          },
        }
      })

      const authenticate = Effect.fn("auth.authenticate")(function* (token: string) {
        const session = storedSessions.get(token)
        if (
          session === undefined ||
          session.expiresAt <= clock.currentTimeMillisUnsafe() ||
          disabledUserAccountIds.has(session.userAccountId)
        ) return yield* Effect.fail(new InvalidSessionToken({}))
        return {
          userAccountId: session.userAccountId,
          sessionId: session.sessionId,
          authentication: "local" as const,
        }
      })

      const revoke = Effect.fn("auth.revoke")(function* (sessionId: string) {
        if (sessionId.startsWith("external:")) return
        for (const [token, session] of storedSessions) {
          if (session.sessionId === sessionId) {
            storedSessions.delete(token)
            return
          }
        }
        return yield* Effect.fail(new InvalidSessionToken({}))
      })

      return {
        findTenantBySlug,
        createTenant,
        issueSession,
        authenticate,
        revoke,
      } satisfies AuthService
    }),
  )

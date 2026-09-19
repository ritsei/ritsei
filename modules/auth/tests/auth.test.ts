import { assert, describe, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"

import {
  AuthService,
  InvalidSessionToken,
  makeAuthTestLayer,
  SessionUserAccountDisabled,
  SessionUserAccountNotFound,
  Tenant,
  TenantAlreadyExists,
} from "../mod.ts"

const withAuth = <A, E>(program: Effect.Effect<A, E, AuthService>) =>
  Effect.provide(program, makeAuthTestLayer(new Set(["user-account-1"])))

describe("auth contract", () => {
  it.effect("creates tenants and rejects duplicate slugs", () =>
    withAuth(Effect.gen(function* () {
      const auth = yield* AuthService
      const tenant = yield* auth.createTenant({ slug: " ACME ", timezone: " Asia/Jakarta " })
      yield* Schema.decodeUnknownEffect(Tenant)(tenant)
      assert.strictEqual(tenant.slug, "acme")
      assert.strictEqual(tenant.timezone, "Asia/Jakarta")
      const defaultTenant = yield* auth.createTenant({ slug: "default-timezone" })
      assert.strictEqual(defaultTenant.timezone, "UTC")
      assert.instanceOf(
        yield* Effect.flip(auth.createTenant({ slug: "acme" })),
        TenantAlreadyExists,
      )
    })))

  it.effect("issues, authenticates, and revokes opaque user-account sessions", () =>
    withAuth(Effect.gen(function* () {
      const auth = yield* AuthService
      const issued = yield* auth.issueSession({ userAccountId: "user-account-1", ttlSeconds: 60 })
      const principal = yield* auth.authenticate(issued.token)
      assert.strictEqual(principal.userAccountId, "user-account-1")
      assert.strictEqual(principal.authentication, "local")
      yield* auth.revoke("external:stateless-session")
      yield* auth.revoke(issued.session.id)
      assert.instanceOf(yield* Effect.flip(auth.authenticate(issued.token)), InvalidSessionToken)
    })))

  it.effect("rejects sessions for unknown user accounts", () =>
    withAuth(Effect.gen(function* () {
      const auth = yield* AuthService
      assert.instanceOf(
        yield* Effect.flip(auth.issueSession({ userAccountId: "missing", ttlSeconds: 60 })),
        SessionUserAccountNotFound,
      )
    })))

  it.effect("rejects sessions for disabled user accounts", () =>
    Effect.provide(
      Effect.gen(function* () {
        const auth = yield* AuthService
        assert.instanceOf(
          yield* Effect.flip(auth.issueSession({ userAccountId: "disabled", ttlSeconds: 60 })),
          SessionUserAccountDisabled,
        )
      }),
      makeAuthTestLayer(new Set(["disabled"]), new Set(["disabled"])),
    ))
})

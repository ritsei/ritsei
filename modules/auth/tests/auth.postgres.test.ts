import { assert, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as TestClock from "effect/testing/TestClock"

import {
  IdentityProvider,
  InvalidExternalAssertion,
  InvalidSessionToken,
  makeAuthService,
  SessionUserAccountDisabled,
} from "../mod.ts"
import { makeUserAccountService, UserAccountService } from "../../identity/mod.ts"
import { Database } from "../../../foundation/mod.ts"
import { makePostgresDatabase, runMigrations, WebCryptoLive } from "../../../platform/mod.ts"
import { withTemporaryDatabase } from "../../../tests/support/postgres-database.ts"

const databaseUrl = Deno.env.get("DATABASE_URL")

it.effect.skipIf(databaseUrl === undefined)(
  "authenticates issuer-scoped external subjects and invalidates disabled accounts",
  () =>
    withTemporaryDatabase(databaseUrl!, (client) =>
      TestClock.withLive(Effect.gen(function* () {
        yield* runMigrations(client)
        const database = makePostgresDatabase(client)
        const userAccounts = yield* makeUserAccountService.pipe(
          Effect.provideService(Database, database),
        )
        const user = yield* userAccounts.create({ email: "external-session@example.test" })
        const issuer = "https://issuer.example.test"
        const issuedAt = Math.floor(Date.now() / 1_000)
        yield* userAccounts.bindExternalSubject({
          issuer,
          subject: "subject-1",
          userAccountId: user.id,
        })
        const auth = yield* makeAuthService.pipe(
          Effect.provideService(Database, database),
          Effect.provide(WebCryptoLive),
          Effect.provideService(UserAccountService, userAccounts),
          Effect.provideService(IdentityProvider, {
            authenticate: (assertion) =>
              assertion === "valid-external-token"
                ? Effect.succeed({ issuer, subject: "subject-1", issuedAt })
                : Effect.fail(new InvalidExternalAssertion({})),
          }),
        )

        const principal = yield* auth.authenticate("valid-external-token")
        assert.strictEqual(principal.userAccountId, user.id)
        assert.strictEqual(principal.authentication, "external")
        assert.strictEqual(principal.externalIssuer, issuer)
        assert.strictEqual(principal.externalSubject, "subject-1")
        assert.isTrue(principal.sessionId.startsWith("external:"))
        yield* auth.revoke(principal.sessionId)

        yield* userAccounts.disable(user.id)
        assert.instanceOf(
          yield* Effect.flip(auth.authenticate("valid-external-token")),
          InvalidSessionToken,
        )
      }))),
)

it.effect.skipIf(databaseUrl === undefined)(
  "invalidates existing sessions when a PostgreSQL user account is disabled",
  () =>
    withTemporaryDatabase(databaseUrl!, (client) =>
      TestClock.withLive(Effect.gen(function* () {
        yield* runMigrations(client)
        const database = makePostgresDatabase(client)
        const userAccounts = yield* makeUserAccountService.pipe(
          Effect.provideService(Database, database),
        )
        const user = yield* userAccounts.create({ email: "session@example.test" })
        const auth = yield* makeAuthService.pipe(
          Effect.provideService(Database, database),
          Effect.provide(WebCryptoLive),
          Effect.provideService(UserAccountService, userAccounts),
        )

        const issued = yield* auth.issueSession({ userAccountId: user.id, ttlSeconds: 60 })
        assert.strictEqual((yield* auth.authenticate(issued.token)).userAccountId, user.id)

        yield* userAccounts.disable(user.id)
        assert.instanceOf(yield* Effect.flip(auth.authenticate(issued.token)), InvalidSessionToken)
        assert.instanceOf(
          yield* Effect.flip(auth.issueSession({ userAccountId: user.id, ttlSeconds: 60 })),
          SessionUserAccountDisabled,
        )

        yield* userAccounts.enable(user.id)
        const replacement = yield* auth.issueSession({ userAccountId: user.id, ttlSeconds: 60 })
        assert.strictEqual((yield* auth.authenticate(replacement.token)).userAccountId, user.id)
        assert.instanceOf(yield* Effect.flip(auth.authenticate(issued.token)), InvalidSessionToken)
      }))),
)

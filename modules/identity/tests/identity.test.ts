import { assert, describe, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"

import {
  CreateUserAccountForTenantInput,
  ExternalSubjectAlreadyBound,
  ExternalSubjectNotFound,
  IdentityAccountAuthorizer,
  IdentityAuthorizationDenied,
  IdentityEventPublisher,
  makeUserAccountService,
  makeUserAccountTestLayer,
  UpdateUserAccountInput,
  UserAccount,
  UserAccountAlreadyExists,
  UserAccountAuthenticationState,
  UserAccountCreatedEvent,
  UserAccountNotFound,
  UserAccountService,
} from "../mod.ts"
import type { EventEnvelopeShape } from "../../messaging/mod.ts"
import { makeUserAccountMemoryStore } from "../src/memory.ts"
import { makeUserAccountServiceFromStore } from "../src/service.ts"
import {
  Database,
  DatabaseFailure,
  type DatabaseService,
  type DrizzleDatabase,
  type DrizzleTransaction,
} from "../../../foundation/mod.ts"

const identityTenantId = "00000000-0000-4000-8000-000000000001"
const identityDeniedTenantId = "00000000-0000-4000-8000-000000000002"
const missingUserAccountId = "00000000-0000-4000-8000-000000000099"

const withUserAccount = <A, E>(program: Effect.Effect<A, E, UserAccountService>) =>
  Effect.provide(program, makeUserAccountTestLayer())

describe("user account contract", () => {
  it.effect("authorizes tenant account creation and publishes its owner event", () =>
    Effect.gen(function* () {
      const published: EventEnvelopeShape[] = []
      const service = yield* Effect.provide(
        makeUserAccountServiceFromStore(Effect.succeed(makeUserAccountMemoryStore())),
        Layer.mergeAll(
          Layer.succeed(IdentityAccountAuthorizer, {
            authorize: ({ tenantId }) =>
              tenantId === identityTenantId ? Effect.void : Effect.fail(
                new IdentityAuthorizationDenied({
                  tenantId,
                  capability: "identity.user_account.create",
                }),
              ),
          }),
          Layer.succeed(IdentityEventPublisher, {
            append: (input) => {
              published.push(input as EventEnvelopeShape)
              return Effect.succeed(input as EventEnvelopeShape)
            },
          }),
        ),
      )
      const principal = { userAccountId: "actor", sessionId: "session" }
      const invalidTenant = yield* Effect.flip(
        Schema.decodeUnknownEffect(CreateUserAccountForTenantInput)({
          principal,
          tenantId: "not-a-uuid",
          email: "invalid@example.com",
        }),
      )
      assert.strictEqual(invalidTenant._tag, "SchemaError")
      const created = yield* service.createForTenant({
        principal,
        tenantId: identityTenantId,
        email: "  USER@Example.COM ",
      })

      yield* Schema.decodeUnknownEffect(UserAccount)(created)
      assert.strictEqual(created.email, "user@example.com")
      assert.strictEqual(published.length, 1)
      assert.strictEqual(published[0].eventType, UserAccountCreatedEvent.id)
      assert.strictEqual(published[0].tenantId, identityTenantId)
      assert.strictEqual(published[0].aggregateId, created.id)
      assert.deepStrictEqual(published[0].payload, {
        userAccountId: created.id,
        email: created.email,
      })

      const denied = yield* Effect.flip(service.createForTenant({
        principal,
        tenantId: identityDeniedTenantId,
        email: "denied@example.com",
      }))
      assert.instanceOf(denied, IdentityAuthorizationDenied)
      assert.strictEqual((yield* service.list()).length, 1)
    }))

  it.effect("creates a normalized user account", () =>
    withUserAccount(
      Effect.gen(function* () {
        const userAccount = yield* UserAccountService.use((service) =>
          service.create({ email: "  USER@Example.COM " })
        )

        assert.strictEqual(userAccount.email, "user@example.com")
        assert.strictEqual(
          (yield* Effect.flip(
            Schema.decodeUnknownEffect(UserAccount)({
              ...userAccount,
              email: " USER@EXAMPLE.COM ",
            }),
          ))._tag,
          "SchemaError",
        )
        assert.match(
          userAccount.id,
          /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
        )
        assert.strictEqual(userAccount.status, "active")
      }),
    ))

  it.effect("binds and resolves an issuer-scoped external subject", () =>
    withUserAccount(
      Effect.gen(function* () {
        const service = yield* UserAccountService
        const account = yield* service.create({ email: "external@example.com" })
        const subject = { issuer: "https://issuer.example.test", subject: "subject-1" }
        assert.strictEqual(
          (yield* service.bindExternalSubject({ ...subject, userAccountId: account.id })).id,
          account.id,
        )
        assert.strictEqual((yield* service.resolveExternalSubject(subject)).id, account.id)
        assert.strictEqual(
          (yield* service.bindExternalSubject({ ...subject, userAccountId: account.id })).id,
          account.id,
        )
        const other = yield* service.create({ email: "other-external@example.com" })
        assert.instanceOf(
          yield* Effect.flip(service.bindExternalSubject({ ...subject, userAccountId: other.id })),
          ExternalSubjectAlreadyBound,
        )
        assert.instanceOf(
          yield* Effect.flip(service.resolveExternalSubject({ ...subject, subject: "missing" })),
          ExternalSubjectNotFound,
        )
      }),
    ))

  it.effect("rejects duplicate email", () =>
    withUserAccount(
      Effect.gen(function* () {
        const create = UserAccountService.use((service) =>
          service.create({ email: "duplicate@example.com" })
        )
        yield* create
        const error = yield* Effect.flip(create)

        assert.instanceOf(error, UserAccountAlreadyExists)
        assert.strictEqual(error.email, "duplicate@example.com")
      }),
    ))

  it.effect("lists, updates, and removes user accounts", () =>
    withUserAccount(
      Effect.gen(function* () {
        const service = yield* UserAccountService
        const created = yield* service.create({ email: "before@example.com" })
        assert.strictEqual((yield* service.getById(created.id)).id, created.id)
        assert.strictEqual((yield* service.list()).length, 1)
        assert.strictEqual(
          (yield* service.update({ id: created.id, email: "after@example.com" })).email,
          "after@example.com",
        )
        yield* service.remove(created.id)
        assert.instanceOf(yield* Effect.flip(service.getById(created.id)), UserAccountNotFound)
      }),
    ))

  it.effect("rejects duplicate and missing updates", () =>
    withUserAccount(
      Effect.gen(function* () {
        const service = yield* UserAccountService
        const invalidId = yield* Effect.flip(
          Schema.decodeUnknownEffect(UpdateUserAccountInput)({
            id: "not-a-uuid",
            email: "invalid@example.com",
          }),
        )
        assert.strictEqual(invalidId._tag, "SchemaError")
        const first = yield* service.create({ email: "first@example.com" })
        const second = yield* service.create({ email: "second@example.com" })

        assert.instanceOf(
          yield* Effect.flip(service.update({ id: first.id, email: second.email })),
          UserAccountAlreadyExists,
        )
        assert.instanceOf(
          yield* Effect.flip(service.update({
            id: missingUserAccountId,
            email: "missing@example.com",
          })),
          UserAccountNotFound,
        )
        assert.instanceOf(
          yield* Effect.flip(service.remove(missingUserAccountId)),
          UserAccountNotFound,
        )
        const invalidLifecycleId = yield* Effect.flip(service.remove("not-a-uuid"))
        assert.strictEqual(invalidLifecycleId._tag, "SchemaError")
      }),
    ))

  it.effect("propagates non-constraint database failures", () => {
    const databaseFailure = new DatabaseFailure({
      operation: "user-account.test",
      cause: new Error("database unavailable"),
    })
    const database: DatabaseService = {
      query: <A>(_operation: (database: DrizzleDatabase) => Promise<A>) =>
        Effect.fail(databaseFailure),
      transaction: <A>(_operation: (transaction: DrizzleTransaction) => Promise<A>) =>
        Effect.fail(databaseFailure),
      withTransaction: <A, E, R>(_operation: Effect.Effect<A, E, R>) =>
        Effect.fail(databaseFailure),
    }

    return Effect.provide(
      Effect.gen(function* () {
        const service = yield* makeUserAccountService
        assert.instanceOf(
          yield* Effect.flip(service.create({ email: "failure@example.com" })),
          DatabaseFailure,
        )
        assert.instanceOf(
          yield* Effect.flip(service.update({
            id: missingUserAccountId,
            email: "failure@example.com",
          })),
          DatabaseFailure,
        )
      }),
      Layer.succeed(Database, database),
    )
  })

  it.effect("disables and enables authentication state", () =>
    withUserAccount(
      Effect.gen(function* () {
        const service = yield* UserAccountService
        const created = yield* service.create({ email: "status@example.com" })
        assert.strictEqual(
          (yield* service.getAuthenticationState(created.id)).status,
          "active",
        )
        const disabled = yield* service.disable(created.id)
        assert.strictEqual(disabled.status, "disabled")
        const disabledState = yield* service.getAuthenticationState(created.id)
        yield* Schema.decodeUnknownEffect(UserAccountAuthenticationState)(disabledState)
        assert.strictEqual(disabledState.status, "disabled")
        assert.ok(disabledState.sessionInvalidatedAt !== null)
        assert.strictEqual((yield* service.enable(created.id)).status, "active")
        assert.strictEqual(
          (yield* service.getAuthenticationState(created.id)).status,
          "active",
        )
      }),
    ))

  it.effect("reads multiple accounts and rejects missing lifecycle records", () =>
    withUserAccount(
      Effect.gen(function* () {
        const service = yield* UserAccountService
        const created = yield* service.create({ email: "many@example.com" })
        assert.deepStrictEqual(yield* service.getByIds([]), [])
        assert.deepStrictEqual(
          yield* service.getByIds([created.id, missingUserAccountId]),
          [created],
        )
        assert.instanceOf(
          yield* Effect.flip(service.getAuthenticationState(missingUserAccountId)),
          UserAccountNotFound,
        )
        assert.instanceOf(
          yield* Effect.flip(service.disable(missingUserAccountId)),
          UserAccountNotFound,
        )
        assert.instanceOf(
          yield* Effect.flip(service.enable(missingUserAccountId)),
          UserAccountNotFound,
        )
      }),
    ))

  it.effect("rejects invalid input", () =>
    withUserAccount(
      Effect.gen(function* () {
        const error = yield* Effect.flip(
          UserAccountService.use((service) => service.create({ email: 42 })),
        )

        assert.instanceOf(error, Error)
        assert.match(error.message, /email/)
      }),
    ))
})

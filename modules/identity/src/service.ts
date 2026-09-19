import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"

import { Database, DatabaseFailure, uuidv7 } from "../../../foundation/mod.ts"
import {
  IdentityAccountAuthorizer,
  IdentityEventPublisher,
  UserAccountCreatedEvent,
  UserAccountCreatedEventPayload,
} from "./events.ts"
import {
  BindExternalSubjectInput,
  CreateUserAccountForTenantInput,
  CreateUserAccountInput,
  ExternalSubject,
  UpdateUserAccountInput,
  UserAccountId,
  UserAccountService,
} from "./contract.ts"
import type { UserAccountStore } from "./store.ts"
import { normalizeEmail } from "./store.ts"

export const makeUserAccountServiceFromStore = <R>(
  store: Effect.Effect<UserAccountStore, never, R>,
): Effect.Effect<UserAccountService, never, R> =>
  Effect.gen(function* () {
    const accountStore = yield* store
    const databaseOption = yield* Effect.serviceOption(Database)
    const authorizerOption = yield* Effect.serviceOption(IdentityAccountAuthorizer)
    const publisherOption = yield* Effect.serviceOption(IdentityEventPublisher)
    const create = Effect.fn("UserAccountService.create")(function* (input: unknown) {
      const decoded = yield* Schema.decodeUnknownEffect(CreateUserAccountInput)(input)
      return yield* accountStore.create(normalizeEmail(decoded.email))
    })
    const decodeUserAccountId = (id: string) => Schema.decodeUnknownEffect(UserAccountId)(id)
    const decodeUserAccountIds = (ids: readonly string[]) =>
      Effect.forEach(ids, decodeUserAccountId)
    const createForTenant = Effect.fn("UserAccountService.createForTenant")(
      function* (input: unknown) {
        const decoded = yield* Schema.decodeUnknownEffect(CreateUserAccountForTenantInput)(input)
        if (Option.isNone(authorizerOption) || Option.isNone(publisherOption)) {
          return yield* Effect.fail(
            new DatabaseFailure({
              operation: "identity.user_account.create_for_tenant.dependencies",
              cause: "authorization and event publisher layers are required",
            }),
          )
        }
        yield* authorizerOption.value.authorize({
          principal: decoded.principal,
          tenantId: decoded.tenantId,
        })
        const createAndPublish = Effect.gen(function* () {
          const account = yield* accountStore.create(normalizeEmail(decoded.email))
          const payload = yield* Schema.decodeUnknownEffect(UserAccountCreatedEventPayload)({
            userAccountId: account.id,
            email: account.email,
          })
          yield* publisherOption.value.append({
            eventId: uuidv7(),
            eventType: UserAccountCreatedEvent.id,
            eventVersion: UserAccountCreatedEvent.version,
            tenantId: decoded.tenantId,
            aggregateType: UserAccountCreatedEvent.aggregateType,
            aggregateId: account.id,
            commandId: `identity.user_account.create:${account.id}`,
            correlationId: `identity.user_account:${account.id}`,
            causationId: null,
            idempotencyKey: `identity.user_account.created:${account.id}`,
            actorPrincipalId: decoded.principal.userAccountId,
            occurredAt: new Date().toISOString(),
            payload,
          })
          return account
        })
        return Option.isSome(databaseOption)
          ? yield* databaseOption.value.withTransaction(
            createAndPublish,
            "identity.user_account.create_for_tenant.atomic",
          )
          : yield* createAndPublish
      },
    )
    const resolveExternalSubject = Effect.fn("UserAccountService.resolveExternalSubject")(
      function* (input: unknown) {
        const decoded = yield* Schema.decodeUnknownEffect(ExternalSubject)(input)
        return yield* accountStore.resolveExternalSubject(decoded.issuer, decoded.subject)
      },
    )
    const bindExternalSubject = Effect.fn("UserAccountService.bindExternalSubject")(
      function* (input: unknown) {
        const decoded = yield* Schema.decodeUnknownEffect(BindExternalSubjectInput)(input)
        return yield* accountStore.bindExternalSubject(
          decoded.issuer,
          decoded.subject,
          decoded.userAccountId,
        )
      },
    )
    const getById = Effect.fn("UserAccountService.getById")(function* (id: string) {
      return yield* accountStore.getById(yield* decodeUserAccountId(id))
    })
    const getByIds = Effect.fn("UserAccountService.getByIds")(function* (ids: readonly string[]) {
      return yield* accountStore.getByIds(yield* decodeUserAccountIds(ids))
    })
    const getAuthenticationState = Effect.fn("UserAccountService.getAuthenticationState")(
      function* (id: string) {
        return yield* accountStore.getAuthenticationState(yield* decodeUserAccountId(id))
      },
    )
    const list = Effect.fn("UserAccountService.list")(() => accountStore.list())
    const update = Effect.fn("UserAccountService.update")(function* (input: unknown) {
      const decoded = yield* Schema.decodeUnknownEffect(UpdateUserAccountInput)(input)
      return yield* accountStore.update(decoded.id, normalizeEmail(decoded.email))
    })
    const disable = Effect.fn("UserAccountService.disable")(function* (id: string) {
      return yield* accountStore.disable(yield* decodeUserAccountId(id))
    })
    const enable = Effect.fn("UserAccountService.enable")(function* (id: string) {
      return yield* accountStore.enable(yield* decodeUserAccountId(id))
    })
    const remove = Effect.fn("UserAccountService.remove")(function* (id: string) {
      return yield* accountStore.remove(yield* decodeUserAccountId(id))
    })
    return {
      create,
      createForTenant,
      resolveExternalSubject,
      bindExternalSubject,
      getById,
      getByIds,
      getAuthenticationState,
      list,
      update,
      disable,
      enable,
      remove,
    } satisfies UserAccountService
  })

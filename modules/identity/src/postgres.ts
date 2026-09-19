import { and, eq, inArray } from "drizzle-orm"
import * as Clock from "effect/Clock"
import * as Effect from "effect/Effect"

import { externalSubjectMappings, userAccounts } from "../../../db/schema/identity.ts"
import { Database, DatabaseFailure, isDatabaseConstraint } from "../../../foundation/mod.ts"
import type { UserAccount, UserAccountAuthenticationState, UserAccountStatus } from "./contract.ts"
import {
  ExternalSubjectAlreadyBound,
  ExternalSubjectNotFound,
  UserAccountAlreadyExists,
  UserAccountNotFound,
} from "./errors.ts"
import type { UserAccountStore } from "./store.ts"

const selectUserAccount = {
  id: userAccounts.id,
  email: userAccounts.email,
  status: userAccounts.status,
}

const selectAuthenticationState = {
  id: userAccounts.id,
  status: userAccounts.status,
  sessionInvalidatedAt: userAccounts.sessionInvalidatedAt,
}

const toUserAccount = (
  row: { readonly id: string; readonly email: string; readonly status: string },
): UserAccount => ({
  id: row.id,
  email: row.email,
  status: row.status as UserAccountStatus,
})

const toAuthenticationState = (row: {
  readonly id: string
  readonly status: string
  readonly sessionInvalidatedAt: Date | null
}): UserAccountAuthenticationState => ({
  id: row.id,
  status: row.status as UserAccountStatus,
  sessionInvalidatedAt: row.sessionInvalidatedAt === null
    ? null
    : row.sessionInvalidatedAt.toISOString(),
})

const isDuplicateEmail = (error: unknown) => isDatabaseConstraint(error, "user_accounts_email_key")
const isDuplicateExternalSubject = (error: unknown) =>
  isDatabaseConstraint(error, "external_subject_mappings_issuer_subject_key")
const isMissingExternalSubjectUser = (error: unknown) =>
  isDatabaseConstraint(error, "external_subject_mappings_user_account_id_fkey", "23503")

export const makeUserAccountPostgresStore = Effect.gen(function* () {
  const database = yield* Database
  const clock = yield* Clock.Clock
  const now = () => new Date(clock.currentTimeMillisUnsafe())

  const create = Effect.fn("UserAccountStore.create")(function* (email: string) {
    const rows = yield* database.query(
      (db) => db.insert(userAccounts).values({ email }).returning(selectUserAccount),
      "user-account.create",
    ).pipe(
      Effect.mapError((error) =>
        isDuplicateEmail(error) ? new UserAccountAlreadyExists({ email }) : error
      ),
    )
    return toUserAccount(rows[0]!)
  })

  const getById = Effect.fn("UserAccountStore.getById")(function* (id: string) {
    const rows = yield* database.query(
      (db) => db.select(selectUserAccount).from(userAccounts).where(eq(userAccounts.id, id)),
      "user-account.get",
    )
    const row = rows[0]
    return row === undefined
      ? yield* Effect.fail(new UserAccountNotFound({ id }))
      : toUserAccount(row)
  })

  const resolveExternalSubject = Effect.fn("UserAccountStore.resolveExternalSubject")(
    function* (issuer: string, subject: string) {
      const rows = yield* database.query(
        (db) =>
          db.select(selectUserAccount)
            .from(externalSubjectMappings)
            .innerJoin(userAccounts, eq(externalSubjectMappings.userAccountId, userAccounts.id))
            .where(and(
              eq(externalSubjectMappings.issuer, issuer),
              eq(externalSubjectMappings.subject, subject),
            )),
        "user-account.external-subject.resolve",
      )
      const row = rows[0]
      return row === undefined
        ? yield* Effect.fail(new ExternalSubjectNotFound({ issuer, subject }))
        : toUserAccount(row)
    },
  )

  const bindExternalSubject = Effect.fn("UserAccountStore.bindExternalSubject")(
    function* (issuer: string, subject: string, userAccountId: string) {
      const account = yield* getById(userAccountId)
      const existing = yield* database.query(
        (db) =>
          db.select({ userAccountId: externalSubjectMappings.userAccountId })
            .from(externalSubjectMappings)
            .where(and(
              eq(externalSubjectMappings.issuer, issuer),
              eq(externalSubjectMappings.subject, subject),
            )),
        "user-account.external-subject.lookup",
      )
      const existingMapping = existing[0]
      if (existingMapping !== undefined && existingMapping.userAccountId !== userAccountId) {
        return yield* Effect.fail(
          new ExternalSubjectAlreadyBound({ issuer, subject, userAccountId }),
        )
      }
      if (existingMapping !== undefined) return account
      yield* database.query(
        (db) => db.insert(externalSubjectMappings).values({ issuer, subject, userAccountId }),
        "user-account.external-subject.bind",
      ).pipe(
        Effect.catchEager((error): Effect.Effect<
          undefined,
          DatabaseFailure | ExternalSubjectAlreadyBound | UserAccountNotFound
        > => {
          if (!isDuplicateExternalSubject(error)) {
            return Effect.fail(
              isMissingExternalSubjectUser(error)
                ? new UserAccountNotFound({ id: userAccountId })
                : error,
            )
          }
          return database.query(
            (db) =>
              db.select({ userAccountId: externalSubjectMappings.userAccountId })
                .from(externalSubjectMappings)
                .where(and(
                  eq(externalSubjectMappings.issuer, issuer),
                  eq(externalSubjectMappings.subject, subject),
                )),
            "user-account.external-subject.recheck",
          ).pipe(
            Effect.flatMap((rows) =>
              rows[0]?.userAccountId === userAccountId
                ? Effect.succeed(undefined)
                : Effect.fail(new ExternalSubjectAlreadyBound({ issuer, subject, userAccountId }))
            ),
          )
        }),
      )
      return account
    },
  )

  const getByIds = Effect.fn("UserAccountStore.getByIds")(function* (ids: readonly string[]) {
    if (ids.length === 0) return []
    const rows = yield* database.query(
      (db) =>
        db.select(selectUserAccount).from(userAccounts).where(inArray(userAccounts.id, ids))
          .orderBy(userAccounts.createdAt, userAccounts.id),
      "user-account.get-many",
    )
    return rows.map(toUserAccount)
  })

  const getAuthenticationState = Effect.fn("UserAccountStore.getAuthenticationState")(
    function* (id: string) {
      const rows = yield* database.query(
        (db) =>
          db.select(selectAuthenticationState).from(userAccounts).where(eq(userAccounts.id, id)),
        "user-account.authentication-state",
      )
      const row = rows[0]
      return row === undefined
        ? yield* Effect.fail(new UserAccountNotFound({ id }))
        : toAuthenticationState(row)
    },
  )

  const list = Effect.fn("UserAccountStore.list")(function* () {
    const rows = yield* database.query(
      (db) =>
        db.select(selectUserAccount).from(userAccounts).orderBy(
          userAccounts.createdAt,
          userAccounts.id,
        ),
      "user-account.list",
    )
    return rows.map(toUserAccount)
  })

  const update = Effect.fn("UserAccountStore.update")(function* (id: string, email: string) {
    const rows = yield* database.query(
      (db) =>
        db.update(userAccounts).set({ email, updatedAt: now() }).where(eq(userAccounts.id, id))
          .returning(selectUserAccount),
      "user-account.update",
    ).pipe(
      Effect.mapError((error) =>
        isDuplicateEmail(error) ? new UserAccountAlreadyExists({ email }) : error
      ),
    )
    const row = rows[0]
    return row === undefined
      ? yield* Effect.fail(new UserAccountNotFound({ id }))
      : toUserAccount(row)
  })

  const disable = Effect.fn("UserAccountStore.disable")(function* (id: string) {
    const timestamp = now()
    const rows = yield* database.query(
      (db) =>
        db.update(userAccounts).set({
          status: "disabled",
          disabledAt: timestamp,
          sessionInvalidatedAt: timestamp,
          updatedAt: timestamp,
        }).where(eq(userAccounts.id, id)).returning(selectUserAccount),
      "user-account.disable",
    )
    const row = rows[0]
    return row === undefined
      ? yield* Effect.fail(new UserAccountNotFound({ id }))
      : toUserAccount(row)
  })

  const enable = Effect.fn("UserAccountStore.enable")(function* (id: string) {
    const rows = yield* database.query(
      (db) =>
        db.update(userAccounts).set({ status: "active", disabledAt: null, updatedAt: now() }).where(
          eq(userAccounts.id, id),
        ).returning(selectUserAccount),
      "user-account.enable",
    )
    const row = rows[0]
    return row === undefined
      ? yield* Effect.fail(new UserAccountNotFound({ id }))
      : toUserAccount(row)
  })

  const remove = Effect.fn("UserAccountStore.remove")(function* (id: string) {
    const rows = yield* database.query(
      (db) =>
        db.delete(userAccounts).where(eq(userAccounts.id, id)).returning({ id: userAccounts.id }),
      "user-account.remove",
    )
    if (rows[0] === undefined) return yield* Effect.fail(new UserAccountNotFound({ id }))
  })

  return {
    create,
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
  } satisfies UserAccountStore
})

import { and, eq, gt, isNull } from "drizzle-orm"
import * as Effect from "effect/Effect"

import { sessions, tenants } from "../../../db/schema/auth.ts"
import { Database, isDatabaseConstraint } from "../../../foundation/mod.ts"
import { SessionUserAccountNotFound, TenantAlreadyExists } from "./errors.ts"
import type { AuthStore, StoredSession } from "./store.ts"

const selectSession = {
  id: sessions.id,
  userAccountId: sessions.userAccountId,
  tokenHash: sessions.tokenHash,
  createdAt: sessions.createdAt,
  expiresAt: sessions.expiresAt,
}

const toStoredSession = (row: {
  readonly id: string
  readonly userAccountId: string
  readonly tokenHash: string
  readonly createdAt: Date
  readonly expiresAt: Date
}): StoredSession => ({
  id: row.id,
  userAccountId: row.userAccountId,
  tokenHash: row.tokenHash,
  createdAt: row.createdAt,
  expiresAt: row.expiresAt,
})

const isMissingUserAccount = (error: unknown) =>
  isDatabaseConstraint(error, "sessions_user_account_id_fkey", "23503")

export const makePostgresAuthStore = Effect.gen(function* () {
  const database = yield* Database
  const findTenantBySlug: AuthStore["findTenantBySlug"] = (slug) =>
    database.query(
      (db) =>
        db.select({ id: tenants.id, slug: tenants.slug, timezone: tenants.timezone })
          .from(tenants)
          .where(eq(tenants.slug, slug)),
      "tenant.find-by-slug",
    ).pipe(Effect.map((rows) => rows[0] === undefined ? undefined : rows[0]))

  const createTenant: AuthStore["createTenant"] = (slug, timezone) =>
    database.query(
      (db) =>
        db.insert(tenants).values({ slug, timezone }).returning({
          id: tenants.id,
          slug: tenants.slug,
          timezone: tenants.timezone,
        }),
      "tenant.create",
    ).pipe(
      Effect.mapError((error) =>
        isDatabaseConstraint(error, "tenants_slug_key") ? new TenantAlreadyExists({ slug }) : error
      ),
      Effect.map((rows) => rows[0]!),
    )

  const createSession: AuthStore["createSession"] = (userAccountId, tokenHash, expiresAt) =>
    database.query(
      (db) =>
        db.insert(sessions).values({ userAccountId, tokenHash, expiresAt }).returning(
          selectSession,
        ),
      "session.issue",
    ).pipe(
      Effect.mapError((error) =>
        isMissingUserAccount(error) ? new SessionUserAccountNotFound({ userAccountId }) : error
      ),
      Effect.map((rows) => toStoredSession(rows[0]!)),
    )

  const findActiveSession: AuthStore["findActiveSession"] = (tokenHash, now) =>
    database.query(
      (db) =>
        db.select(selectSession).from(sessions).where(
          and(
            eq(sessions.tokenHash, tokenHash),
            isNull(sessions.revokedAt),
            gt(sessions.expiresAt, now),
          ),
        ),
      "session.authenticate",
    ).pipe(Effect.map((rows) => rows[0] === undefined ? undefined : toStoredSession(rows[0])))

  const revokeSession: AuthStore["revokeSession"] = (sessionId, now) =>
    database.query(
      (db) =>
        db.update(sessions)
          .set({ revokedAt: now, updatedAt: now })
          .where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt)))
          .returning({ id: sessions.id }),
      "session.revoke",
    ).pipe(Effect.map((rows) => rows[0] !== undefined))

  return {
    findTenantBySlug,
    createTenant,
    createSession,
    findActiveSession,
    revokeSession,
  } satisfies AuthStore
})

import * as Effect from "effect/Effect"

import type { DatabaseFailure } from "../../../foundation/mod.ts"
import type { SessionUserAccountNotFound, TenantAlreadyExists } from "./errors.ts"

export interface StoredSession {
  readonly id: string
  readonly userAccountId: string
  readonly tokenHash: string
  readonly createdAt: Date
  readonly expiresAt: Date
}

export interface AuthStore {
  readonly findTenantBySlug: (
    slug: string,
  ) => Effect.Effect<
    { readonly id: string; readonly slug: string; readonly timezone: string } | undefined,
    DatabaseFailure
  >
  readonly createTenant: (
    slug: string,
    timezone: string,
  ) => Effect.Effect<
    { readonly id: string; readonly slug: string; readonly timezone: string },
    TenantAlreadyExists | DatabaseFailure
  >
  readonly createSession: (
    userAccountId: string,
    tokenHash: string,
    expiresAt: Date,
  ) => Effect.Effect<StoredSession, SessionUserAccountNotFound | DatabaseFailure>
  readonly findActiveSession: (
    tokenHash: string,
    now: Date,
  ) => Effect.Effect<StoredSession | undefined, DatabaseFailure>
  readonly revokeSession: (sessionId: string, now: Date) => Effect.Effect<boolean, DatabaseFailure>
}

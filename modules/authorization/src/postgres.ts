import { and, asc, eq, ilike, sql } from "drizzle-orm"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"

import { memberships, tenantMemberships } from "../../../db/schema/authorization.ts"
import {
  AddTenantMembershipInput,
  AuthorizationDecision,
  AuthorizationInput,
  AuthorizationService,
  type DirectCapabilityGrant,
  GrantCapabilityInput,
  ListAccessibleTenantsInput,
  ListTenantMembershipsInput,
  TenantMembership,
  TenantMembershipInput,
} from "./contract.ts"
import {
  AuthorizationDenied,
  CapabilityAlreadyGranted,
  TenantMembershipAlreadyExists,
  TenantMembershipNotActive,
  TenantMembershipNotFound,
  TenantMembershipUserAccountNotFound,
} from "./errors.ts"
import { toTenantMembership } from "./store.ts"
import {
  DatabaseFailure,
  type DatabaseService,
  isDatabaseConstraint,
} from "../../../foundation/mod.ts"

const escapeLikePattern = (value: string): string => value.replace(/[\\%_]/g, "\\$&")

const readMember = (database: DatabaseService, input: unknown) =>
  Effect.gen(function* () {
    const decoded = yield* Schema.decodeUnknownEffect(TenantMembershipInput)(input)
    const rows = yield* database.query(
      (db) =>
        db.select({
          userAccountId: tenantMemberships.userAccountId,
          tenantId: tenantMemberships.tenantId,
          status: tenantMemberships.status,
        })
          .from(tenantMemberships)
          .where(
            and(
              eq(tenantMemberships.userAccountId, decoded.userAccountId),
              eq(tenantMemberships.tenantId, decoded.tenantId),
            ),
          ),
      "authorization.member.get",
    )
    const member = rows[0]
    if (member === undefined) return yield* Effect.fail(new TenantMembershipNotFound(decoded))
    return toTenantMembership(member)
  })

export const makePostgresAuthorizationService = (
  database: DatabaseService,
): AuthorizationService => ({
  authorize: Effect.fn("AuthorizationService.authorize")((input: unknown) =>
    Effect.gen(function* () {
      const decoded = yield* Schema.decodeUnknownEffect(AuthorizationInput)(input)
      const rows = yield* database.query(
        (db) =>
          db.select({ userAccountId: memberships.userAccountId })
            .from(memberships)
            .innerJoin(
              tenantMemberships,
              and(
                eq(tenantMemberships.userAccountId, memberships.userAccountId),
                eq(tenantMemberships.tenantId, memberships.tenantId),
                eq(tenantMemberships.status, "active"),
              ),
            )
            .where(
              and(
                eq(memberships.userAccountId, decoded.principal.userAccountId),
                eq(memberships.tenantId, decoded.tenantId),
                eq(memberships.capability, decoded.capability),
              ),
            ),
        "authorization.check",
      )
      if (rows[0] === undefined) {
        return yield* Effect.fail(
          new AuthorizationDenied({ tenantId: decoded.tenantId, capability: decoded.capability }),
        )
      }
      return {
        allowed: true as const,
        tenantId: decoded.tenantId,
        capability: decoded.capability,
        grant: "membership" as const,
      } satisfies Schema.Schema.Type<typeof AuthorizationDecision>
    })
  ),
  addMember: Effect.fn("AuthorizationService.addMember")((input: unknown) =>
    Effect.gen(function* () {
      const decoded = yield* Schema.decodeUnknownEffect(AddTenantMembershipInput)(input)
      const rows = yield* database.query(
        (db) =>
          db.insert(tenantMemberships).values(decoded).returning({
            userAccountId: tenantMemberships.userAccountId,
            tenantId: tenantMemberships.tenantId,
            status: tenantMemberships.status,
          }),
        "authorization.member.add",
      ).pipe(
        Effect.mapError((error) => {
          if (isDatabaseConstraint(error, "tenant_memberships_user_account_id_fkey", "23503")) {
            return new TenantMembershipUserAccountNotFound({ userAccountId: decoded.userAccountId })
          }
          if (isDatabaseConstraint(error, "tenant_memberships_pkey")) {
            return new TenantMembershipAlreadyExists(decoded)
          }
          return error
        }),
      )
      return toTenantMembership(rows[0]!)
    })
  ),
  getMember: Effect.fn("AuthorizationService.getMember")((input: unknown) =>
    readMember(database, input)
  ),
  listMembers: Effect.fn("AuthorizationService.listMembers")((input: unknown) =>
    Effect.gen(function* () {
      const decoded = yield* Schema.decodeUnknownEffect(ListTenantMembershipsInput)(input)
      const rows = yield* database.query(
        (db) =>
          db.select({
            userAccountId: tenantMemberships.userAccountId,
            tenantId: tenantMemberships.tenantId,
            status: tenantMemberships.status,
          })
            .from(tenantMemberships)
            .where(and(
              eq(tenantMemberships.tenantId, decoded.tenantId),
              decoded.search === undefined ? undefined : ilike(
                sql`${tenantMemberships.userAccountId}::text`,
                `%${escapeLikePattern(decoded.search)}%`,
              ),
              decoded.status === undefined
                ? undefined
                : eq(tenantMemberships.status, decoded.status),
            ))
            .orderBy(asc(tenantMemberships.userAccountId))
            .limit(decoded.limit ?? 200),
        "authorization.member.list",
      )
      return rows.map(toTenantMembership)
    })
  ),
  listAccessibleTenants: Effect.fn("AuthorizationService.listAccessibleTenants")((input: unknown) =>
    Effect.gen(function* () {
      const decoded = yield* Schema.decodeUnknownEffect(ListAccessibleTenantsInput)(input)
      const rows = yield* database.query(
        (db) =>
          db.select({
            userAccountId: tenantMemberships.userAccountId,
            tenantId: tenantMemberships.tenantId,
            status: tenantMemberships.status,
          })
            .from(tenantMemberships)
            .where(and(
              eq(tenantMemberships.userAccountId, decoded.userAccountId),
              eq(tenantMemberships.status, "active"),
            ))
            .orderBy(asc(tenantMemberships.tenantId)),
        "authorization.member.listAccessibleTenants",
      )
      return rows.map(toTenantMembership)
    })
  ),
  listDirectGrants: Effect.fn("AuthorizationService.listDirectGrants")((input: unknown) =>
    Effect.gen(function* () {
      const decoded = yield* Schema.decodeUnknownEffect(TenantMembershipInput)(input)
      yield* readMember(database, decoded)
      const rows = yield* database.query(
        (db) =>
          db.select({ capability: memberships.capability })
            .from(memberships)
            .where(and(
              eq(memberships.userAccountId, decoded.userAccountId),
              eq(memberships.tenantId, decoded.tenantId),
            ))
            .orderBy(asc(memberships.capability)),
        "authorization.grant.list",
      )
      return rows.map(({ capability }): DirectCapabilityGrant => ({
        ...decoded,
        capability: capability as DirectCapabilityGrant["capability"],
        scope: "tenant",
      }))
    })
  ),
  suspendMember: Effect.fn("AuthorizationService.suspendMember")((input: unknown) =>
    updateStatus(database, input, "suspended", "authorization.member.suspend")
  ),
  activateMember: Effect.fn("AuthorizationService.activateMember")((input: unknown) =>
    updateStatus(database, input, "active", "authorization.member.activate")
  ),
  removeMember: Effect.fn("AuthorizationService.removeMember")((input: unknown) =>
    Effect.gen(function* () {
      const decoded = yield* Schema.decodeUnknownEffect(TenantMembershipInput)(input)
      const rows = yield* database.query(
        (db) =>
          db.delete(tenantMemberships)
            .where(
              and(
                eq(tenantMemberships.userAccountId, decoded.userAccountId),
                eq(tenantMemberships.tenantId, decoded.tenantId),
              ),
            )
            .returning({ userAccountId: tenantMemberships.userAccountId }),
        "authorization.member.remove",
      )
      if (rows[0] === undefined) return yield* Effect.fail(new TenantMembershipNotFound(decoded))
    })
  ),
  grant: Effect.fn("AuthorizationService.grant")((input: unknown) =>
    Effect.gen(function* () {
      const decoded = yield* Schema.decodeUnknownEffect(GrantCapabilityInput)(input)
      const member = yield* readMember(database, decoded)
      if (member.status !== "active") {
        return yield* Effect.fail(
          new TenantMembershipNotActive({
            userAccountId: decoded.userAccountId,
            tenantId: decoded.tenantId,
          }),
        )
      }
      yield* database.query(
        (db) => db.insert(memberships).values(decoded),
        "authorization.grant",
      ).pipe(
        Effect.mapError((error) =>
          isDatabaseConstraint(error, "memberships_pkey")
            ? new CapabilityAlreadyGranted(decoded)
            : isDatabaseConstraint(error, "memberships_tenant_membership_fkey", "23503")
            ? new TenantMembershipNotFound({
              userAccountId: decoded.userAccountId,
              tenantId: decoded.tenantId,
            })
            : error
        ),
      )
    })
  ),
})

const updateStatus = (
  database: DatabaseService,
  input: unknown,
  status: "active" | "suspended",
  operation: string,
) =>
  Effect.gen(function* () {
    const decoded = yield* Schema.decodeUnknownEffect(TenantMembershipInput)(input)
    const rows = yield* database.query(
      (db) =>
        db.update(tenantMemberships)
          .set({ status })
          .where(
            and(
              eq(tenantMemberships.userAccountId, decoded.userAccountId),
              eq(tenantMemberships.tenantId, decoded.tenantId),
            ),
          )
          .returning({
            userAccountId: tenantMemberships.userAccountId,
            tenantId: tenantMemberships.tenantId,
            status: tenantMemberships.status,
          }),
      operation,
    )
    const member = rows[0]
    if (member === undefined) return yield* Effect.fail(new TenantMembershipNotFound(decoded))
    return toTenantMembership(member)
  })

export type PostgresAuthorizationService = ReturnType<typeof makePostgresAuthorizationService>
export type PostgresAuthorizationFailure =
  | AuthorizationDenied
  | CapabilityAlreadyGranted
  | TenantMembershipAlreadyExists
  | TenantMembershipNotActive
  | TenantMembershipNotFound
  | TenantMembershipUserAccountNotFound
  | DatabaseFailure
  | Schema.SchemaError
export type { TenantMembership }

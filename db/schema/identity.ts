import { sql } from "drizzle-orm"
import { check, foreignKey, pgSchema, text, timestamp, unique, uuid } from "drizzle-orm/pg-core"

import { createdAt, id, updatedAt } from "./common.ts"

export const identitySchema = pgSchema("identity")

export const userAccounts = identitySchema.table(
  "user_accounts",
  {
    id: id(),
    email: text("email").notNull(),
    status: text("status").notNull().default("active"),
    disabledAt: timestamp("disabled_at", { withTimezone: true }),
    sessionInvalidatedAt: timestamp("session_invalidated_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("user_accounts_email_key").on(table.email),
    check(
      "user_accounts_email_normalization_check",
      sql`${table.email} = lower(btrim(${table.email})) and ${table.email} ~ '[^[:space:]]'`,
    ),
    check("user_accounts_status_check", sql`${table.status} in ('active', 'disabled')`),
    check(
      "user_accounts_status_disabled_at_check",
      sql`(${table.status} = 'active' and ${table.disabledAt} is null) or
        (${table.status} = 'disabled' and ${table.disabledAt} is not null)`,
    ),
  ],
)

export const externalSubjectMappings = identitySchema.table(
  "external_subject_mappings",
  {
    id: id(),
    issuer: text("issuer").notNull(),
    subject: text("subject").notNull(),
    userAccountId: uuid("user_account_id").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("external_subject_mappings_issuer_subject_key").on(table.issuer, table.subject),
    check(
      "external_subject_mappings_issuer_check",
      sql`${table.issuer} = btrim(${table.issuer}) and ${table.issuer} ~ '[^[:space:]]'`,
    ),
    check(
      "external_subject_mappings_subject_check",
      sql`${table.subject} = btrim(${table.subject}) and ${table.subject} ~ '[^[:space:]]'`,
    ),
    foreignKey({
      columns: [table.userAccountId],
      foreignColumns: [userAccounts.id],
      name: "external_subject_mappings_user_account_id_fkey",
    }).onDelete("cascade"),
  ],
)

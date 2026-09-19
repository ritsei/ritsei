import "../../tooling/load-env.ts"
import * as DenoRuntime from "@effect/platform-deno/DenoRuntime"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import postgres from "postgres"

import { type PostgresClient } from "../../foundation/mod.ts"
import { AuthService, type Principal, TenantAlreadyExists } from "../../modules/auth/mod.ts"
import {
  AuthorizationService,
  CapabilityAlreadyGranted,
  TenantMembershipNotFound,
} from "../../modules/authorization/mod.ts"
import { UserAccountAlreadyExists, UserAccountService } from "../../modules/identity/mod.ts"
import { validatePostgresVersion } from "../../platform/mod.ts"
import { readRuntimeConfiguration } from "../config.ts"
import { serviceLayers } from "../layers.ts"
import { bootstrapCapabilities, bootstrapTenant } from "../api/bootstrap.ts"

const NonBlank = Schema.String.check(Schema.isPattern(/\S/))
const BootstrapEnvironment = Schema.Struct({
  email: NonBlank,
  tenantSlug: NonBlank,
  timezone: Schema.optionalKey(NonBlank),
  organizationName: NonBlank,
  branchName: NonBlank,
  branchTimezone: Schema.optionalKey(NonBlank),
  localTaxRegistration: Schema.optionalKey(NonBlank),
  dedicatedJournalCode: Schema.optionalKey(NonBlank),
  warehouseName: NonBlank,
  baseCurrency: NonBlank,
  fiscalYearStartMonth: Schema.Int,
  postingEnabled: Schema.Boolean,
  externalIssuer: Schema.optionalKey(NonBlank),
  externalSubject: Schema.optionalKey(NonBlank),
})

type BootstrapEnvironment = Schema.Schema.Type<typeof BootstrapEnvironment>

const env = (name: string, fallback?: string) => Deno.env.get(name) ?? fallback

const readEnvironment = () =>
  Schema.decodeUnknownEffect(BootstrapEnvironment)({
    email: env("RITSEI_BOOTSTRAP_EMAIL", "admin@example.test"),
    tenantSlug: env("RITSEI_BOOTSTRAP_TENANT_SLUG", "local"),
    timezone: env("RITSEI_BOOTSTRAP_TIMEZONE", "UTC"),
    organizationName: env("RITSEI_BOOTSTRAP_ORGANIZATION_NAME", "Local Organization"),
    branchName: env("RITSEI_BOOTSTRAP_BRANCH_NAME", "Main Branch"),
    branchTimezone: env("RITSEI_BOOTSTRAP_BRANCH_TIMEZONE", "UTC"),
    localTaxRegistration: env("RITSEI_BOOTSTRAP_LOCAL_TAX_REGISTRATION"),
    dedicatedJournalCode: env("RITSEI_BOOTSTRAP_DEDICATED_JOURNAL_CODE"),
    warehouseName: env("RITSEI_BOOTSTRAP_WAREHOUSE_NAME", "Main Warehouse"),
    baseCurrency: env("RITSEI_BOOTSTRAP_BASE_CURRENCY", "USD"),
    fiscalYearStartMonth: Number.parseInt(
      env("RITSEI_BOOTSTRAP_FISCAL_YEAR_START_MONTH", "1")!,
      10,
    ),
    postingEnabled: env("RITSEI_BOOTSTRAP_POSTING_ENABLED", "false") === "true",
    externalIssuer: env("RITSEI_BOOTSTRAP_EXTERNAL_ISSUER"),
    externalSubject: env("RITSEI_BOOTSTRAP_EXTERNAL_SUBJECT"),
  })

const findOrCreateUser = (input: BootstrapEnvironment) =>
  Effect.gen(function* () {
    const users = yield* UserAccountService
    const email = input.email.trim().toLowerCase()
    const existing = (yield* users.list()).find((user) => user.email === email)
    if (existing !== undefined) return existing
    return yield* users.create({ email }).pipe(
      Effect.catch((error) =>
        error instanceof UserAccountAlreadyExists
          ? Effect.map(users.list(), (accounts) =>
            accounts.find((account) => account.email === email))
          : Effect.fail(error)
      ),
      Effect.flatMap((account) =>
        account === undefined
          ? Effect.fail(new Error("bootstrap account disappeared"))
          : Effect.succeed(account)
      ),
    )
  })

const bindExternalSubject = (input: BootstrapEnvironment, userAccountId: string) =>
  Effect.gen(function* () {
    if (input.externalSubject === undefined) return
    const configuration = yield* readRuntimeConfiguration()
    const issuer = input.externalIssuer ??
      (configuration.authentication?.profile === "oidc"
        ? configuration.authentication.issuerUrl
        : undefined)
    if (issuer === undefined) {
      return yield* Effect.fail(new Error("RITSEI_BOOTSTRAP_EXTERNAL_ISSUER is required"))
    }
    const users = yield* UserAccountService
    yield* users.bindExternalSubject({ issuer, subject: input.externalSubject, userAccountId })
  })

const ensureMembershipAndCapabilities = (principal: Principal, tenantId: string) =>
  Effect.gen(function* () {
    const authorization = yield* AuthorizationService
    const member = yield* authorization.getMember({
      userAccountId: principal.userAccountId,
      tenantId,
    }).pipe(
      Effect.catch((error) =>
        error instanceof TenantMembershipNotFound ? Effect.succeed(undefined) : Effect.fail(error)
      ),
    )
    if (member === undefined) {
      yield* authorization.addMember({
        userAccountId: principal.userAccountId,
        tenantId,
      })
    } else if (member.status === "suspended") {
      yield* authorization.activateMember({ userAccountId: principal.userAccountId, tenantId })
    }
    const grants = yield* authorization.listDirectGrants({
      userAccountId: principal.userAccountId,
      tenantId,
    })
    for (const capability of bootstrapCapabilities) {
      if (grants.some((grant) => grant.capability === capability)) continue
      yield* authorization.grant({
        userAccountId: principal.userAccountId,
        tenantId,
        capability,
      }).pipe(
        Effect.catch((error) =>
          error instanceof CapabilityAlreadyGranted ? Effect.succeed(undefined) : Effect.fail(error)
        ),
      )
    }
  })

const provision = (input: BootstrapEnvironment) =>
  Effect.gen(function* () {
    const auth = yield* AuthService
    const user = yield* findOrCreateUser(input)
    yield* bindExternalSubject(input, user.id)
    const principal = {
      userAccountId: user.id,
      sessionId: `bootstrap:${input.tenantSlug}`,
    } satisfies Principal
    const existing = yield* auth.findTenantBySlug(input.tenantSlug)
    if (existing !== undefined) {
      yield* ensureMembershipAndCapabilities(principal, existing.id)
      console.log(`RITSEI bootstrap already exists for tenant '${existing.slug}'.`)
      return
    }
    const result = yield* bootstrapTenant({
      principal,
      slug: input.tenantSlug,
      timezone: input.timezone,
      organizationName: input.organizationName,
      branchName: input.branchName,
      branchTimezone: input.branchTimezone,
      localTaxRegistration: input.localTaxRegistration,
      dedicatedJournalCode: input.dedicatedJournalCode,
      warehouseName: input.warehouseName,
      baseCurrency: input.baseCurrency,
      precision: 2,
      fiscalYearStartMonth: input.fiscalYearStartMonth,
      postingEnabled: input.postingEnabled,
    }).pipe(
      Effect.catch((error) =>
        error instanceof TenantAlreadyExists ? Effect.succeed(undefined) : Effect.fail(error)
      ),
    )
    if (result === undefined) {
      const tenant = yield* auth.findTenantBySlug(input.tenantSlug)
      if (tenant !== undefined) yield* ensureMembershipAndCapabilities(principal, tenant.id)
      console.log(`RITSEI bootstrap already exists for tenant '${input.tenantSlug}'.`)
    } else {
      console.log(`RITSEI bootstrap provisioned tenant '${result.tenant.slug}' for ${user.email}.`)
    }
  })

const run = Effect.scoped(
  Effect.gen(function* () {
    const input = yield* readEnvironment()
    const configuration = yield* readRuntimeConfiguration()
    const url = Deno.env.get("DATABASE_URL")
    if (url === undefined || url.trim() === "") {
      return yield* Effect.fail(new Error("DATABASE_URL is required"))
    }
    const client = postgres(url)
    yield* Effect.addFinalizer(() => Effect.promise(() => client.end()))
    yield* validatePostgresVersion(client as unknown as PostgresClient)
    yield* Effect.provide(provision(input), serviceLayers(client, configuration))
  }),
)

if (import.meta.main) {
  run.pipe(DenoRuntime.runMain)
}

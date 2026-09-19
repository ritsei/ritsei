import { assert, describe, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

import { AuthorizationDenied, makeAuthorizationTestLayer } from "../../authorization/mod.ts"
import { AccountingCapabilities, AccountingService, makeAccountingTestLayer } from "../mod.ts"
import { makeMessagingTestLayer } from "../../messaging/mod.ts"
import { SalesService } from "../../sales/mod.ts"

const principal = { userAccountId: "accounting-reader", sessionId: "accounting-session" }
const tenantId = "01900000-0000-7000-8000-000000000001"
const otherTenantId = "01900000-0000-7000-8000-000000000002"
const legalEntityId = "01900000-0000-7000-8000-000000000010"
const otherLegalEntityId = "01900000-0000-7000-8000-000000000011"
const capabilities = Object.values(AccountingCapabilities)
const salesFacts = {
  getConfirmedOrderTotal: () => Effect.succeed("125.00"),
} as unknown as SalesService

const withAccounting = <A, E>(
  program: Effect.Effect<A, E, AccountingService>,
  granted = capabilities,
) =>
  Effect.provide(
    program,
    makeAccountingTestLayer().pipe(
      Layer.provide(Layer.mergeAll(
        makeAuthorizationTestLayer(
          [tenantId, otherTenantId].flatMap((scopeTenantId) =>
            granted.map((capability) => ({
              userAccountId: principal.userAccountId,
              tenantId: scopeTenantId,
              capability,
            }))
          ),
        ),
        makeMessagingTestLayer(),
        Layer.succeed(SalesService, salesFacts),
      )),
    ),
  )

const configure = (tenant: string, entity: string) => ({
  principal,
  tenantId: tenant,
  legalEntityId: entity,
  baseCurrency: "USD",
  precision: 2 as const,
  fiscalYearStartMonth: 1,
  postingEnabled: true,
})

describe("Accounting read projections", () => {
  it.effect("lists tenant-scoped configurations, accounts, periods, profiles, and journals", () =>
    withAccounting(Effect.gen(function* () {
      const accounting = yield* AccountingService
      const configuration = yield* accounting.configureLegalEntity(
        configure(tenantId, legalEntityId),
      )
      yield* accounting.configureLegalEntity(configure(otherTenantId, otherLegalEntityId))
      const cash = yield* accounting.createAccount({
        principal,
        tenantId,
        code: "1000",
        name: "Cash",
        type: "asset",
      })
      const revenue = yield* accounting.createAccount({
        principal,
        tenantId,
        code: "4000",
        name: "Revenue",
        type: "revenue",
      })
      const period = yield* accounting.openPeriod({
        principal,
        tenantId,
        legalEntityId,
        startsOn: "2026-01-01",
        endsOn: "2026-12-31",
      })
      const profile = yield* accounting.configureRevenuePosting({
        principal,
        tenantId,
        legalEntityId,
        receivableAccountId: cash.id,
        revenueAccountId: revenue.id,
      })
      const journal = yield* accounting.postJournal({
        principal,
        tenantId,
        reference: "opening-entry",
        lines: [
          { accountId: cash.id, debit: "125.00", credit: "0.00" },
          { accountId: revenue.id, debit: "0.00", credit: "125.00" },
        ],
      })

      assert.deepStrictEqual(
        yield* accounting.listAccountingConfigurations({ principal, tenantId, limit: 200 }),
        [configuration],
      )
      assert.deepStrictEqual(
        yield* accounting.listAccounts({ principal, tenantId, type: "asset", limit: 200 }),
        [cash],
      )
      assert.deepStrictEqual(
        yield* accounting.listAccountingPeriods({
          principal,
          tenantId,
          status: "open",
          limit: 200,
        }),
        [period],
      )
      assert.deepStrictEqual(
        yield* accounting.listRevenuePostingProfiles({ principal, tenantId, limit: 200 }),
        [profile],
      )
      assert.deepStrictEqual(
        yield* accounting.listJournalEntries({ principal, tenantId, status: "posted", limit: 200 }),
        [journal],
      )
      assert.deepStrictEqual(
        yield* accounting.listAccountingConfigurations({
          principal,
          tenantId: otherTenantId,
          limit: 200,
        }),
        [{
          ...configuration,
          tenantId: otherTenantId,
          legalEntityId: otherLegalEntityId,
        }],
      )
    })))

  it.effect("denies Accounting reads without the owning capability", () =>
    withAccounting(
      Effect.gen(function* () {
        const accounting = yield* AccountingService
        const error = yield* Effect.flip(
          accounting.listAccounts({ principal, tenantId, limit: 200 }),
        )
        assert.instanceOf(error, AuthorizationDenied)
      }),
      [],
    ))

  it.effect("does not treat an Accounting write grant as an implicit read grant", () =>
    withAccounting(
      Effect.gen(function* () {
        const accounting = yield* AccountingService
        const error = yield* Effect.flip(
          accounting.listAccounts({ principal, tenantId, limit: 200 }),
        )
        assert.instanceOf(error, AuthorizationDenied)
      }),
      [AccountingCapabilities.accountCreate],
    ))
})

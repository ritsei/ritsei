import { AxeBuilder } from "@axe-core/playwright"
import { assert, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import type { Page, Route } from "playwright"
import type {
  Account,
  AccountingConfiguration,
  AccountingPeriod,
  JournalEntry,
  RevenuePostingProfile,
} from "../../apps/web/src/shared/contracts/generated/accounting.ts"
import { builtApp, connectToTenant } from "./browser.ts"

const tenantId = "01930000-0000-7000-8000-000000000001"
const legalEntityId = "01930000-0000-7000-8000-000000000002"
const cashId = "01930000-0000-7000-8000-000000000003"
const revenueId = "01930000-0000-7000-8000-000000000004"
const journalId = "01930000-0000-7000-8000-000000000005"
const periodId = "01930000-0000-7000-8000-000000000006"

const fulfillJson = (route: Route, status: number, body: unknown) =>
  route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) })

const connectAndOpenAccounting = async (page: Page, url: string) => {
  await connectToTenant(page, url, "accounting-session", tenantId, "User accounts")
  await page.getByRole("link", { name: "Finance", exact: true }).click()
  await page.getByRole("heading", { name: "Accounting", exact: true }).waitFor({ timeout: 5_000 })
}

it.effect(
  "connects Accounting configuration, account, and journal workflows through the backend surface",
  () =>
    Effect.gen(function* () {
      const { page, url, errors } = yield* builtApp
      let configurations: AccountingConfiguration[] = []
      let accounts: Account[] = []
      let periods: AccountingPeriod[] = []
      let profiles: RevenuePostingProfile[] = []
      let journals: JournalEntry[] = []
      const requests: Array<{
        path: string
        method: string
        headers: Record<string, string>
        body: unknown
      }> = []

      yield* Effect.promise(async () => {
        // Fallow: this browser workflow intentionally uses one deterministic Accounting route matrix.
        // fallow-ignore-next-line complexity
        await page.route("**/api/**", (route) => {
          const request = route.request()
          const requestUrl = new URL(request.url())
          const path = requestUrl.pathname.replace(/^\/api/, "")
          const method = request.method()
          const body = method === "POST" ? request.postDataJSON() : undefined
          requests.push({ path, method, headers: request.headers(), body })

          if (path === "/user-accounts" && method === "GET") return fulfillJson(route, 200, [])
          if (path === "/accounting/configurations" && method === "GET") {
            return fulfillJson(route, 200, configurations)
          }
          if (path === "/accounting/accounts" && method === "GET") {
            return fulfillJson(route, 200, accounts)
          }
          if (path === "/accounting/periods" && method === "GET") {
            return fulfillJson(route, 200, periods)
          }
          if (path === "/accounting/revenue-posting-profiles" && method === "GET") {
            return fulfillJson(route, 200, profiles)
          }
          if (path === "/accounting/journals" && method === "GET") {
            return fulfillJson(route, 200, journals)
          }
          if (
            path === `/accounting/legal-entities/${legalEntityId}/configuration` &&
            method === "POST"
          ) {
            configurations = [{
              tenantId,
              legalEntityId,
              baseCurrency: body.baseCurrency,
              precision: 2,
              fiscalYearStartMonth: body.fiscalYearStartMonth,
              postingEnabled: body.postingEnabled,
              financialEngine: "postgresql",
            }]
            return fulfillJson(route, 201, configurations[0])
          }
          if (path === "/accounting/accounts" && method === "POST") {
            const account: Account = {
              id: body.code === "1000" ? cashId : revenueId,
              tenantId,
              code: body.code.trim().toUpperCase(),
              name: body.name.trim(),
              type: body.type,
            }
            accounts = [...accounts, account]
            return fulfillJson(route, 201, account)
          }
          if (path === "/accounting/revenue-posting-profiles" && method === "POST") {
            const profile: RevenuePostingProfile = {
              tenantId,
              legalEntityId: body.legalEntityId,
              receivableAccountId: body.receivableAccountId,
              revenueAccountId: body.revenueAccountId,
            }
            profiles = [profile]
            return fulfillJson(route, 201, profile)
          }
          if (path === "/accounting/periods" && method === "POST") {
            const period: AccountingPeriod = {
              id: periodId,
              tenantId,
              legalEntityId: body.legalEntityId,
              startsOn: body.startsOn,
              endsOn: body.endsOn,
              status: "open",
            }
            periods = [period, ...periods]
            return fulfillJson(route, 201, period)
          }
          if (path === `/accounting/periods/${periodId}/close` && method === "POST") {
            const period = periods.find((candidate) => candidate.id === periodId)
            if (period === undefined) {
              return fulfillJson(route, 404, { _tag: "ApiNotFound", code: "not_found" })
            }
            const closed: AccountingPeriod = { ...period, status: "closed" }
            periods = periods.map((candidate) => candidate.id === periodId ? closed : candidate)
            return fulfillJson(route, 200, closed)
          }
          if (path === "/accounting/journals" && method === "POST") {
            const journal: JournalEntry = {
              id: journalId,
              tenantId,
              reference: body.reference.trim(),
              status: "posted",
              postedAt: "2026-09-13T12:00:00.000Z",
              lines: body.lines,
            }
            journals = [journal, ...journals]
            return fulfillJson(route, 201, journal)
          }
          return fulfillJson(route, 404, { _tag: "ApiNotFound", code: "not_found" })
        })

        await connectAndOpenAccounting(page, url)
        const accountingRequest = requests.find((request) => request.path.startsWith("/accounting"))
        assert.equal(accountingRequest?.headers.authorization, "Bearer accounting-session")
        assert.equal(accountingRequest?.headers["x-tenant-id"], tenantId)
        assert.deepEqual(
          await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze().then((result) =>
            result.violations
          ),
          [],
        )

        await page.getByRole("button", { name: "Configure legal entity", exact: true }).click()
        const configurationDialog = page.getByRole("dialog", { name: "Configure legal entity" })
        await configurationDialog.getByRole("textbox", { name: "Legal entity ID", exact: true })
          .fill(
            legalEntityId,
          )
        await configurationDialog.getByRole("button", { name: "Save configuration", exact: true })
          .click()
        await configurationDialog.waitFor({ state: "hidden" })
        await page.getByText(legalEntityId, { exact: true }).first().waitFor()

        await page.getByRole("button", { name: "Create account", exact: true }).click()
        const cashDialog = page.getByRole("dialog", { name: "Create account" })
        await cashDialog.getByRole("textbox", { name: "Account code", exact: true }).fill("1000")
        await cashDialog.getByRole("textbox", { name: "Account name", exact: true }).fill("Cash")
        await cashDialog.getByRole("combobox", { name: "Account type", exact: true }).selectOption(
          "asset",
        )
        await cashDialog.getByRole("button", { name: "Create account", exact: true }).click()
        await cashDialog.waitFor({ state: "hidden" })

        await page.getByRole("button", { name: "Create account", exact: true }).click()
        const revenueDialog = page.getByRole("dialog", { name: "Create account" })
        await revenueDialog.getByRole("textbox", { name: "Account code", exact: true }).fill("4000")
        await revenueDialog.getByRole("textbox", { name: "Account name", exact: true }).fill(
          "Revenue",
        )
        await revenueDialog.getByRole("combobox", { name: "Account type", exact: true })
          .selectOption("revenue")
        await revenueDialog.getByRole("button", { name: "Create account", exact: true }).click()
        await revenueDialog.waitFor({ state: "hidden" })
        await page.getByText("Revenue", { exact: true }).first().waitFor()

        await page.getByRole("button", { name: "Configure revenue profile", exact: true }).click()
        const profileDialog = page.getByRole("dialog", {
          name: "Configure revenue posting profile",
        })
        await profileDialog.getByRole("textbox", { name: "Legal entity ID", exact: true }).fill(
          legalEntityId,
        )
        await profileDialog.getByRole("combobox", { name: "Receivable account", exact: true })
          .selectOption(cashId)
        await profileDialog.getByRole("combobox", { name: "Revenue account", exact: true })
          .selectOption(revenueId)
        await profileDialog.getByRole("button", { name: "Save revenue profile", exact: true })
          .click()
        await profileDialog.waitFor({ state: "hidden" })

        await page.getByRole("button", { name: "Open period", exact: true }).click()
        const periodDialog = page.getByRole("dialog", { name: "Open accounting period" })
        await periodDialog.getByRole("textbox", { name: "Legal entity ID", exact: true }).fill(
          legalEntityId,
        )
        await periodDialog.locator('input[name="startsOn"]').fill("2026-01-01")
        await periodDialog.locator('input[name="endsOn"]').fill("2026-12-31")
        await periodDialog.getByRole("button", { name: "Open period", exact: true }).click()
        await periodDialog.waitFor({ state: "hidden" })
        await page.getByText("2026-01-01", { exact: true }).waitFor()

        await page.getByRole("button", { name: "Post journal", exact: true }).click()
        const journalDialog = page.getByRole("dialog", { name: "Post journal" })
        await journalDialog.getByRole("textbox", { name: "Reference", exact: true }).fill(
          "opening-entry",
        )
        const accountFields = journalDialog.getByRole("combobox", { name: "Account", exact: true })
        await accountFields.nth(0).selectOption(cashId)
        await accountFields.nth(1).selectOption(revenueId)
        const debitFields = journalDialog.getByRole("textbox", { name: "Debit", exact: true })
        const creditFields = journalDialog.getByRole("textbox", { name: "Credit", exact: true })
        await debitFields.nth(0).fill("125.00")
        await creditFields.nth(0).fill("0.00")
        await debitFields.nth(1).fill("0.00")
        await creditFields.nth(1).fill("125.00")
        await journalDialog.getByRole("button", { name: "Post journal", exact: true }).click()
        await journalDialog.waitFor({ state: "hidden" })
        await page.getByText("opening-entry", { exact: true }).first().waitFor()

        await page.getByRole("link", { name: "Open journal opening-entry", exact: true }).click()
        await page.getByRole("heading", { name: "Journal detail", exact: true }).waitFor()
        await page.getByText("125.00", { exact: true }).first().waitFor()

        await page.getByRole("button", { name: "Close", exact: true }).click()
        const closePeriodDialog = page.getByRole("dialog", { name: "Close accounting period" })
        await closePeriodDialog.getByRole("button", { name: "Confirm close", exact: true }).click()
        await closePeriodDialog.waitFor({ state: "hidden" })
        await page.getByText("closed", { exact: true }).waitFor()

        assert.deepEqual(
          requests.find((request) =>
            request.path === `/accounting/legal-entities/${legalEntityId}/configuration` &&
            request.method === "POST"
          )?.body,
          {
            baseCurrency: "USD",
            precision: 2,
            fiscalYearStartMonth: 1,
            postingEnabled: true,
          },
        )
        assert.deepEqual(
          requests.filter((request) =>
            request.path === "/accounting/accounts" && request.method === "POST"
          )
            .map((request) => request.body),
          [
            { code: "1000", name: "Cash", type: "asset" },
            { code: "4000", name: "Revenue", type: "revenue" },
          ],
        )
        assert.deepEqual(
          requests.find((request) =>
            request.path === "/accounting/revenue-posting-profiles" && request.method === "POST"
          )?.body,
          {
            legalEntityId,
            receivableAccountId: cashId,
            revenueAccountId: revenueId,
          },
        )
        assert.deepEqual(
          requests.find((request) =>
            request.path === "/accounting/periods" && request.method === "POST"
          )?.body,
          { legalEntityId, startsOn: "2026-01-01", endsOn: "2026-12-31" },
        )
        assert.deepEqual(
          requests.find((request) =>
            request.path === `/accounting/periods/${periodId}/close` && request.method === "POST"
          )?.body,
          { legalEntityId },
        )
        assert.deepEqual(
          requests.find((request) =>
            request.path === "/accounting/journals" && request.method === "POST"
          )
            ?.body,
          {
            reference: "opening-entry",
            lines: [
              { accountId: cashId, debit: "125.00", credit: "0.00" },
              { accountId: revenueId, debit: "0.00", credit: "125.00" },
            ],
          },
        )
        assert.isTrue(requests.some((request) => request.path === "/accounting/configurations"))
        assert.isTrue(
          requests.some((request) =>
            request.path === "/accounting/accounts" && request.method === "GET"
          ),
        )
        assert.isTrue(requests.some((request) => request.path === "/accounting/periods"))
        assert.isTrue(
          requests.some((request) => request.path === "/accounting/revenue-posting-profiles"),
        )
        assert.isTrue(
          requests.some((request) =>
            request.path === "/accounting/journals" && request.method === "GET"
          ),
        )
        assert.deepEqual(errors, [])
        assert.deepEqual(
          await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze().then((result) =>
            result.violations
          ),
          [],
        )
      })
    }),
  { timeout: 120_000 },
)

it.effect(
  "keeps Accounting authorization, malformed responses, conflicts, and unknown outcomes explicit",
  () =>
    Effect.gen(function* () {
      const { page, url, errors } = yield* builtApp
      const accounts: Account[] = [
        {
          id: cashId,
          tenantId,
          code: "1000",
          name: "Cash",
          type: "asset",
        },
        {
          id: revenueId,
          tenantId,
          code: "4000",
          name: "Revenue",
          type: "revenue",
        },
      ]
      let mode:
        | "forbidden-list"
        | "malformed-list"
        | "malformed-journal"
        | "loaded"
        | "profile-conflict"
        | "period-unknown" = "forbidden-list"

      yield* Effect.promise(async () => {
        // Fallow: this browser workflow intentionally exercises multiple recoverable Accounting outcomes.
        // fallow-ignore-next-line complexity
        await page.route("**/api/**", (route) => {
          const request = route.request()
          const requestUrl = new URL(request.url())
          const path = requestUrl.pathname.replace(/^\/api/, "")
          const method = request.method()
          if (path === "/user-accounts" && method === "GET") return fulfillJson(route, 200, [])
          if (path === "/accounting/accounts" && method === "GET") {
            if (mode === "forbidden-list") {
              return fulfillJson(route, 403, { _tag: "ApiForbidden", code: "forbidden" })
            }
            if (mode === "malformed-list") {
              return fulfillJson(route, 200, { accounts: "not-an-array" })
            }
            return fulfillJson(route, 200, accounts)
          }
          if (path.startsWith("/accounting/")) {
            if (path === "/accounting/revenue-posting-profiles" && method === "POST") {
              if (mode === "profile-conflict") {
                return fulfillJson(route, 409, { _tag: "ApiConflict", code: "conflict" })
              }
              return fulfillJson(route, 201, {
                tenantId,
                legalEntityId,
                receivableAccountId: cashId,
                revenueAccountId: revenueId,
              })
            }
            if (path === "/accounting/periods" && method === "POST") {
              if (mode === "period-unknown") return route.abort("connectionreset")
              return fulfillJson(route, 201, {
                id: periodId,
                tenantId,
                legalEntityId,
                startsOn: "2026-01-01",
                endsOn: "2026-12-31",
                status: "open",
              })
            }
            if (method === "GET") {
              if (path === "/accounting/configurations") return fulfillJson(route, 200, [])
              if (path === "/accounting/periods") return fulfillJson(route, 200, [])
              if (path === "/accounting/revenue-posting-profiles") {
                return fulfillJson(route, 200, [])
              }
              if (path === "/accounting/journals") {
                if (mode === "malformed-journal") {
                  return fulfillJson(route, 200, [{
                    id: journalId,
                    tenantId,
                    reference: "invalid-balance",
                    status: "posted",
                    postedAt: "2026-09-13T12:00:00.000Z",
                    lines: [
                      { accountId: cashId, debit: "125.00", credit: "0.00" },
                      { accountId: revenueId, debit: "0.00", credit: "124.00" },
                    ],
                  }])
                }
                return fulfillJson(route, 200, [])
              }
            }
          }
          return fulfillJson(route, 404, { _tag: "ApiNotFound", code: "not_found" })
        })

        await connectAndOpenAccounting(page, url)
        await page.getByRole("alert").filter({ hasText: "permission" }).waitFor()

        mode = "malformed-list"
        await page.getByRole("button", { name: "Try loading accounts again", exact: true }).click()
        await page.getByRole("alert").filter({ hasText: "invalid or oversized response" }).waitFor()

        mode = "loaded"
        await page.getByRole("button", { name: "Try loading accounts again", exact: true }).click()
        await page.getByText("Cash", { exact: true }).waitFor()

        mode = "malformed-journal"
        await page.getByRole("button", { name: "Reload Finance", exact: true }).click()
        await page.getByRole("alert").filter({ hasText: "invalid or oversized response" }).waitFor()
        mode = "loaded"
        await page.getByRole("button", {
          name: "Try loading journal history again",
          exact: true,
        }).click()
        await page.getByText("No posted or reversed journals match the current filter.", {
          exact: true,
        }).waitFor()

        mode = "profile-conflict"
        await page.getByRole("button", { name: "Configure revenue profile", exact: true }).click()
        const profileDialog = page.getByRole("dialog", {
          name: "Configure revenue posting profile",
        })
        await profileDialog.getByRole("textbox", { name: "Legal entity ID", exact: true }).fill(
          legalEntityId,
        )
        await profileDialog.getByRole("combobox", { name: "Receivable account", exact: true })
          .selectOption(cashId)
        await profileDialog.getByRole("combobox", { name: "Revenue account", exact: true })
          .selectOption(revenueId)
        await profileDialog.getByRole("button", { name: "Save revenue profile", exact: true })
          .click()
        await profileDialog.getByRole("alert").filter({ hasText: "conflicts" }).waitFor()
        assert.isTrue(
          await profileDialog.getByRole("button", { name: "Save revenue profile", exact: true })
            .isEnabled(),
        )
        await profileDialog.getByRole("button", { name: "Close", exact: true }).click()

        mode = "period-unknown"
        await page.getByRole("button", { name: "Open period", exact: true }).click()
        const periodDialog = page.getByRole("dialog", { name: "Open accounting period" })
        await periodDialog.getByRole("textbox", { name: "Legal entity ID", exact: true }).fill(
          legalEntityId,
        )
        await periodDialog.locator('input[name="startsOn"]').fill("2026-01-01")
        await periodDialog.locator('input[name="endsOn"]').fill("2026-12-31")
        await periodDialog.getByRole("button", { name: "Open period", exact: true }).click()
        await periodDialog.getByRole("alert").filter({ hasText: "may have saved" }).waitFor()
        assert.isFalse(
          await periodDialog.getByRole("button", { name: "Open period", exact: true }).isEnabled(),
        )
        const reloadBeforeRetry = periodDialog.getByRole("button", {
          name: "Reload Finance before retrying",
          exact: true,
        })
        await reloadBeforeRetry.click()
        await reloadBeforeRetry.waitFor({ state: "hidden" })
        assert.isTrue(
          await periodDialog.getByRole("button", { name: "Open period", exact: true }).isEnabled(),
        )
        assert.deepEqual(errors, [])
      })
    }),
  { timeout: 120_000 },
)

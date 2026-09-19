import { assert, it } from "@effect/vitest"
import { AxeBuilder } from "@axe-core/playwright"
import * as Effect from "effect/Effect"
import type { Page, Route } from "playwright"
import { builtApp, connectToTenant } from "./browser.ts"

const tenantId = "01900000-0000-7000-8000-000000000010"
const accountId = "01900000-0000-7000-8000-000000000001"
const createdAccountId = "01900000-0000-7000-8000-000000000002"
const originalEmail = "operator@example.com"
const createdEmail = "new.operator@example.com"
const updatedEmail = "operator.renamed@example.com"

const account = (
  email: string,
  status: "active" | "disabled" = "active",
  id = accountId,
) => ({ id, email, status })

const fulfillJson = (route: Route, status: number, body: unknown) =>
  route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  })

const connect = (page: Page, url: string) =>
  connectToTenant(page, url, "test-session", tenantId, "User accounts")

it.effect(
  "creates, reads, and updates tenant-linked accounts",
  () =>
    Effect.gen(function* () {
      const { page, url, errors } = yield* builtApp
      let currentEmail = originalEmail
      const currentStatus: "active" | "disabled" = "active"
      let createBody: unknown
      let patchBody: unknown
      let requestHeaders: Record<string, string> | undefined
      let listCount = 0
      const records = () => [
        account(currentEmail, currentStatus),
        account(createdEmail, "active", createdAccountId),
      ]
      let created = false

      yield* Effect.promise(async () => {
        await page.route("**/api/user-accounts**", (route) => {
          const request = route.request()
          const path = new URL(request.url()).pathname.replace(/^\/api/, "")
          const method = request.method()
          requestHeaders = request.headers()

          if (path === "/user-accounts") {
            if (method === "POST") {
              createBody = request.postDataJSON()
              created = true
              return fulfillJson(
                route,
                201,
                account(createdEmail, "active", createdAccountId),
              )
            }
            listCount += 1
            return fulfillJson(
              route,
              200,
              created ? records() : [account(currentEmail, currentStatus)],
            )
          }
          if (method === "PATCH") {
            patchBody = request.postDataJSON()
            currentEmail = updatedEmail
            return fulfillJson(route, 200, account(currentEmail, currentStatus))
          }
          return fulfillJson(route, 200, account(currentEmail, currentStatus))
        })

        await connect(page, url)
        await page.getByRole("cell", { name: originalEmail, exact: true })
          .waitFor()
        assert.equal(requestHeaders?.authorization, "Bearer test-session")
        assert.equal(requestHeaders?.["x-tenant-id"], tenantId)
        assert.equal(listCount, 1)

        const createTrigger = page.getByRole("button", {
          name: "Create account",
          exact: true,
        })
        await createTrigger.click()
        const createDialog = page.getByRole("dialog")
        await createDialog.getByRole("heading", { name: "Create user account" })
          .waitFor()
        const dialogAccessibility = await new AxeBuilder({ page }).withTags([
          "wcag2a",
          "wcag2aa",
        ]).analyze()
        assert.deepEqual(dialogAccessibility.violations, [])
        await page.keyboard.press("Escape")
        await createDialog.waitFor({ state: "hidden" })
        assert.isTrue(
          await createTrigger.evaluate((node) => document.activeElement === node),
        )
        await createTrigger.click()
        await createDialog.getByRole("textbox", { name: "Email", exact: true })
          .fill(createdEmail)
        await createDialog.getByRole("button", { name: "Create account", exact: true })
          .click()
        await page.getByRole("cell", { name: createdEmail, exact: true }).waitFor()
        assert.deepEqual(createBody, { email: createdEmail })

        await page.getByRole("link", {
          name: `Open account for ${originalEmail}`,
          exact: true,
        }).click()
        await page.getByRole("heading", { name: "Account detail", exact: true })
          .waitFor()
        assert.equal(new URL(page.url()).pathname, `/user-accounts/${accountId}`)
        assert.isNotNull(
          await page.getByRole("link", { name: "User accounts", exact: true })
            .getAttribute("data-active"),
        )
        assert.isNotNull(
          await page.getByRole("link", { name: "Accounts", exact: true })
            .getAttribute("data-active"),
        )

        const edit = page.getByRole("button", { name: "Edit email", exact: true })
        await edit.click()
        await page.getByRole("button", { name: "Close editor", exact: true })
          .click()
        assert.isTrue(
          await edit.evaluate((node) => document.activeElement === node),
        )

        await edit.click()
        await page.getByRole("textbox", { name: "Email", exact: true }).fill(
          updatedEmail,
        )
        await page.getByRole("button", { name: "Save email", exact: true })
          .click()
        await page.getByRole("cell", { name: updatedEmail, exact: true })
          .waitFor()
        assert.deepEqual(patchBody, { email: updatedEmail })

        assert.equal(
          await page.getByRole("button", { name: /^(Disable|Enable) account$/ }).count(),
          0,
        )
        assert.isTrue(listCount >= 3)
        const accessibility = await new AxeBuilder({ page }).withTags([
          "wcag2a",
          "wcag2aa",
        ]).analyze()
        assert.deepEqual(accessibility.violations, [])
        assert.deepEqual(errors, [])
      })
    }),
  { timeout: 120_000 },
)

it.effect(
  "does not convert authorization, malformed responses, or unknown outcomes into success",
  () =>
    Effect.gen(function* () {
      const { page, url, errors } = yield* builtApp
      let mode:
        | "forbidden-list"
        | "malformed-list"
        | "loaded"
        | "update-unknown" = "forbidden-list"

      yield* Effect.promise(async () => {
        await page.route("**/api/user-accounts**", (route) => {
          const request = route.request()
          const path = new URL(request.url()).pathname.replace(/^\/api/, "")
          if (path === "/user-accounts") {
            if (mode === "forbidden-list") {
              return fulfillJson(route, 403, {
                _tag: "ApiForbidden",
                code: "forbidden",
              })
            }
            if (mode === "malformed-list") {
              return fulfillJson(route, 200, { account: "not-an-array" })
            }
            return fulfillJson(route, 200, [account(originalEmail)])
          }
          if (request.method() === "PATCH" && mode === "update-unknown") {
            return route.abort("connectionreset")
          }
          return fulfillJson(route, 200, account(originalEmail))
        })

        await connect(page, url)
        await page.getByRole("alert").filter({ hasText: "permission" })
          .waitFor()
        assert.equal(
          await page.getByRole("button", { name: "Create account", exact: true })
            .count(),
          1,
        )

        mode = "malformed-list"
        await page.getByRole("button", {
          name: "Try loading again",
          exact: true,
        }).click()
        await page.getByRole("alert").filter({
          hasText: "invalid or oversized response",
        }).waitFor()

        mode = "loaded"
        await page.getByRole("button", {
          name: "Try loading again",
          exact: true,
        }).click()
        await page.getByRole("cell", { name: originalEmail, exact: true })
          .waitFor()
        await page.getByRole("link", {
          name: `Open account for ${originalEmail}`,
          exact: true,
        }).click()
        await page.getByRole("heading", { name: "Account detail", exact: true })
          .waitFor()

        mode = "update-unknown"
        await page.getByRole("button", { name: "Edit email", exact: true })
          .click()
        await page.getByRole("textbox", { name: "Email", exact: true }).fill(
          updatedEmail,
        )
        await page.getByRole("button", { name: "Save email", exact: true })
          .click()
        await page.getByRole("alert").filter({ hasText: "may have saved" })
          .waitFor()
        assert.isFalse(
          await page.getByRole("button", { name: "Save email", exact: true })
            .isEnabled(),
        )
        await page.getByRole("button", {
          name: "Reload before retrying",
          exact: true,
        }).click()
        assert.deepEqual(errors, [])
      })
    }),
  { timeout: 120_000 },
)

import { assert, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import { builtApp, connectToTenant, mockLocalAuth } from "./browser.ts"

it.effect(
  "builds the SPA, signs in, navigates, and changes theme",
  () =>
    Effect.gen(function* () {
      const { page, url, errors } = yield* builtApp
      yield* Effect.promise(async () => {
        await connectToTenant(
          page,
          url,
          "test-session",
          "01900000-0000-7000-8000-000000000010",
          "My work",
        )
        assert.equal(new URL(page.url()).pathname, "/")
        const before = await page.locator("main").evaluate((node) => getComputedStyle(node).color)
        await page.getByRole("button", { name: "Dark theme" }).click()
        assert.equal(
          await page.getByRole("button", { name: "Dark theme" }).getAttribute(
            "aria-pressed",
          ),
          "true",
        )
        assert.notEqual(
          await page.locator("main").evaluate((node) => getComputedStyle(node).color),
          before,
        )
        await page.getByRole("link", { name: "User accounts", exact: true })
          .click()
        await page.getByRole("heading", { name: "User accounts", exact: true })
          .waitFor()
        await page.goBack()
        await page.getByRole("heading", { name: "My work" }).waitFor()

        assert.isTrue(await page.getByRole("main").isVisible())
        assert.isTrue(await page.getByRole("link", { name: "RITSEI home" }).isVisible())
        assert.isTrue(await page.getByRole("navigation", { name: "Primary" }).isVisible())
        assert.isTrue(await page.getByRole("navigation", { name: "Work sections" }).isVisible())
        assert.isTrue(await page.getByRole("link", { name: "Access", exact: true }).isVisible())
        assert.equal(await page.title(), "RITSEI · Operational workspace")

        const navigationToggle = page.locator('button[aria-controls="global-navigation"]')
        const sidebar = page.locator("#global-navigation")
        const expandedSidebar = await sidebar.boundingBox()
        assert.exists(expandedSidebar)
        assert.equal(await navigationToggle.getAttribute("aria-expanded"), "true")

        await navigationToggle.click()
        await page.waitForTimeout(220)
        const collapsedSidebar = await sidebar.boundingBox()
        assert.exists(collapsedSidebar)
        assert.equal(await navigationToggle.getAttribute("aria-expanded"), "false")
        assert.isTrue(collapsedSidebar!.width < expandedSidebar!.width)
        assert.isTrue(await page.getByRole("link", { name: "My work" }).isVisible())

        await navigationToggle.click()
        await page.setViewportSize({ width: 390, height: 844 })
        await page.waitForTimeout(50)
        assert.equal(await navigationToggle.getAttribute("aria-expanded"), "false")
        assert.equal(await sidebar.getAttribute("aria-hidden"), "true")

        await navigationToggle.click()
        await page.waitForTimeout(220)
        assert.equal(await navigationToggle.getAttribute("aria-expanded"), "true")
        assert.isNull(await sidebar.getAttribute("aria-hidden"))
        assert.isTrue(
          await page.getByRole("link", { name: "My work" }).evaluate((element) =>
            document.activeElement === element
          ),
        )

        await page.keyboard.press("Escape")
        assert.equal(await navigationToggle.getAttribute("aria-expanded"), "false")
        assert.equal(await sidebar.getAttribute("aria-hidden"), "true")
        assert.isTrue(
          await navigationToggle.evaluate((element) => document.activeElement === element),
        )

        await page.setViewportSize({ width: 1280, height: 720 })
        await page.goto(`${url}/not-a-route`)
        await page.getByRole("heading", { name: "Page not found" }).waitFor()
        assert.deepEqual(errors, [])
        const stored = await page.evaluate(() =>
          JSON.stringify([
            Object.entries(localStorage),
            Object.entries(sessionStorage),
          ])
        )
        assert.notInclude(stored, "test-session")
        assert.notInclude(stored, "not-a-uuid")
      })
    }),
  { timeout: 120_000 },
)

it.effect(
  "switches tenants, logs out, and recovers from an expired session",
  () =>
    Effect.gen(function* () {
      const { page, url, errors } = yield* builtApp
      const firstTenant = "01900000-0000-7000-8000-000000000010"
      const secondTenant = "01900000-0000-7000-8000-000000000011"
      const sessionTenantHeaders: string[] = []
      yield* Effect.promise(async () => {
        await mockLocalAuth(page, "switch-session", firstTenant, {
          memberships: [
            {
              userAccountId: "01900000-0000-7000-8000-000000000001",
              tenantId: firstTenant,
              status: "active",
            },
            {
              userAccountId: "01900000-0000-7000-8000-000000000001",
              tenantId: secondTenant,
              status: "active",
            },
          ],
        })
        page.on("request", (request) => {
          if (new URL(request.url()).pathname === "/api/auth/session") {
            sessionTenantHeaders.push(request.headers()["x-tenant-id"] ?? "")
          }
        })
        let logoutAuthorization: string | undefined
        await page.route("**/api/auth/logout", (route) => {
          logoutAuthorization = route.request().headers().authorization
          return route.fulfill({ status: 204 })
        })

        await page.goto(url)
        await page.getByRole("button", { name: "Sign in locally", exact: true }).click()
        await page.getByRole("heading", { name: "My work", exact: true }).waitFor()
        const tenantSelect = page.getByRole("combobox", { name: "Active tenant", exact: true })
        await tenantSelect.selectOption(secondTenant)
        await page.getByText(secondTenant, { exact: true }).waitFor()
        assert.equal(sessionTenantHeaders.at(-1), secondTenant)

        const logoutResponse = page.waitForResponse((response) =>
          new URL(response.url()).pathname === "/api/auth/logout" && response.status() === 204
        )
        await page.getByRole("button", { name: "Sign out", exact: true }).click()
        const dialog = page.getByRole("dialog", { name: "Sign out of RITSEI?" })
        await dialog.getByRole("button", { name: "Sign out", exact: true }).click()
        await logoutResponse
        assert.equal(logoutAuthorization, "Bearer switch-session")
        await page.getByRole("button", { name: "Sign in locally", exact: true }).waitFor()

        await page.getByRole("button", { name: "Sign in locally", exact: true }).click()
        await page.getByRole("heading", { name: "My work", exact: true }).waitFor()
        await page.route("**/api/user-accounts", (route) =>
          route.fulfill({
            status: 401,
            contentType: "application/json",
            body: JSON.stringify({ _tag: "ApiUnauthorized", code: "unauthorized" }),
          }))
        await page.getByRole("link", { name: "User accounts", exact: true }).click()
        await page.getByRole("button", { name: "Sign in locally", exact: true }).waitFor()
        assert.deepEqual(errors, [])
      })
    }),
  { timeout: 120_000 },
)

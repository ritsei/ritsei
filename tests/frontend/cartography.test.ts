import { assert, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import { AxeBuilder } from "@axe-core/playwright"
import { builtApp, connectToTenant } from "./browser.ts"

const tenantId = "018f3f77-0c5a-7cc0-8b62-6a163d214124"
const accounts = [
  {
    id: "018f3f77-0c5a-7cc0-8b62-6a163d214125",
    email: "active@example.com",
    status: "active",
  },
  {
    id: "018f3f77-0c5a-7cc0-8b62-6a163d214126",
    email: "disabled@example.com",
    status: "disabled",
  },
]

it.effect(
  "keeps the cartographic fallback semantic and keyboard accessible",
  () =>
    Effect.gen(function* () {
      const { page, url, errors } = yield* builtApp
      yield* Effect.promise(async () => {
        await page.route("**/api/user-accounts", (route) =>
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(accounts),
          }))
        await connectToTenant(page, url, "token", tenantId, "User accounts")
        await page.getByRole("link", { name: "User accounts", exact: true }).click()
        await page.waitForURL("**/user-accounts")

        const field = page.getByRole("group", { name: "Tenant account relationships" })
        await field.waitFor()
        assert.isTrue(await field.isVisible())
        assert.isTrue(await page.getByText("The table below remains authoritative.").isVisible())

        const activeMarker = page.getByRole("button", { name: "Active accounts: 1" })
        await activeMarker.focus()
        await page.keyboard.press("Enter")
        assert.equal(await activeMarker.getAttribute("aria-pressed"), "true")
        assert.isTrue(
          await page.getByText("Selected visual segment: active", { exact: true }).isVisible(),
        )

        await page.emulateMedia({ reducedMotion: "reduce", forcedColors: "active" })
        const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()
        assert.deepEqual(results.violations, [])
        await page.evaluate(() => {
          document.documentElement.style.zoom = "2"
        })
        assert.isTrue(await field.isVisible())
        assert.deepEqual(errors, [])
      })
    }),
  { timeout: 120_000 },
)

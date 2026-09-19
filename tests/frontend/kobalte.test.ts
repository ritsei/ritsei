import { assert, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import { AxeBuilder } from "@axe-core/playwright"
import { chromium } from "playwright"
import { build, preview } from "vite"
import { builtApp, connectToTenant } from "./browser.ts"

const fixture = Effect.acquireRelease(
  Effect.promise(async () => {
    const root = await Deno.makeTempDir({ dir: "apps/web", prefix: ".kobalte-probe-" })
    const outDir = await Deno.makeTempDir({ prefix: "ritsei-kobalte-build-" })
    await Deno.writeTextFile(
      `${root}/index.html`,
      '<!doctype html><html lang="en"><head><title>Kobalte dialog probe</title></head><body><main id="root"></main><script type="module" src="/main.tsx"></script></body></html>',
    )
    await Deno.writeTextFile(
      `${root}/main.tsx`,
      `import { render } from "@solidjs/web"
import { KobalteDialogProbe } from "../src/ui/compatibility/kobalte.tsx"

render(() => <KobalteDialogProbe />, document.getElementById("root")!)
`,
    )
    await build({
      configFile: "apps/web/vite.config.ts",
      root,
      build: { outDir, emptyOutDir: true },
    })
    return { root, outDir }
  }),
  ({ root, outDir }) =>
    Effect.promise(async () => {
      await Deno.remove(root, { recursive: true })
      await Deno.remove(outDir, { recursive: true })
    }),
)

it.effect(
  "validates the Kobalte dialog interaction and accessibility contract",
  () =>
    Effect.gen(function* () {
      const { root, outDir } = yield* fixture
      const server = yield* Effect.acquireRelease(
        Effect.promise(() =>
          preview({
            configFile: false,
            root,
            build: { outDir },
            preview: { host: "127.0.0.1", port: 0, strictPort: true },
          })
        ),
        (server) =>
          Effect.promise(() =>
            new Promise<void>((resolve, reject) => {
              server.httpServer.close((error) => error ? reject(error) : resolve())
            })
          ),
      )
      const address = server.httpServer.address()
      assert.isNotNull(address)
      assert.isNotString(address)
      if (!address || typeof address === "string") return yield* Effect.die("No preview address")
      const browser = yield* Effect.acquireRelease(
        Effect.promise(() => chromium.launch({ headless: true })),
        (browser) => Effect.promise(() => browser.close()),
      )
      const context = yield* Effect.acquireRelease(
        Effect.promise(() => browser.newContext({ viewport: { width: 800, height: 600 } })),
        (context) => Effect.promise(() => context.close()),
      )
      const page = yield* Effect.promise(() => context.newPage())
      yield* Effect.promise(async () => {
        await page.goto(`http://127.0.0.1:${address.port}`)
        const trigger = page.getByRole("button", { name: "Open compatibility dialog" })
        await trigger.focus()
        await page.keyboard.press("Enter")

        const dialog = page.getByRole("dialog")
        await dialog.waitFor()
        const titleId = await dialog.getAttribute("aria-labelledby")
        const descriptionId = await dialog.getAttribute("aria-describedby")
        assert.isNotNull(titleId)
        assert.isNotNull(descriptionId)
        assert.equal(await page.locator(`#${titleId}`).textContent(), "Compatibility check")
        assert.equal(
          await page.locator(`#${descriptionId}`).textContent(),
          "Verify keyboard focus and dismissal.",
        )
        assert.isTrue(
          await page.evaluate(() => document.activeElement?.closest('[role="dialog"]') !== null),
        )

        await page.keyboard.press("Tab")
        assert.isTrue(
          await page.evaluate(() => document.activeElement?.closest('[role="dialog"]') !== null),
        )
        await page.keyboard.press("Shift+Tab")
        assert.isTrue(
          await page.evaluate(() => document.activeElement?.closest('[role="dialog"]') !== null),
        )

        await dialog.press("Escape")
        await dialog.waitFor({ state: "hidden" })
        assert.equal(
          await page.evaluate(() => document.activeElement?.textContent),
          "Open compatibility dialog",
        )

        await page.emulateMedia({ reducedMotion: "reduce", forcedColors: "active" })
        await trigger.click()
        await dialog.waitFor()
        assert.isTrue(await dialog.isVisible())
        const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()
        assert.deepEqual(axe.violations, [])
        await dialog.press("Escape")
        await dialog.waitFor({ state: "hidden" })
      })
    }),
  { timeout: 120_000 },
)

it.effect(
  "validates the RITSEI Kobalte dialog wrapper in the application",
  () =>
    Effect.gen(function* () {
      const { page, url, errors } = yield* builtApp
      yield* Effect.promise(async () => {
        await connectToTenant(
          page,
          url,
          "token",
          "018f0f2a-7b1d-7b1d-8b1d-7b1d7b1d7b1d",
          "User accounts",
        )

        const trigger = page.getByRole("button", { name: "Sign out", exact: true })
        await trigger.click()
        const dialog = page.getByRole("dialog", { name: "Sign out of RITSEI?" })
        await dialog.waitFor()
        assert.isTrue(await dialog.isVisible())
        assert.isNotNull(await dialog.getAttribute("aria-labelledby"))
        assert.isNotNull(await dialog.getAttribute("aria-describedby"))
        assert.deepEqual(
          (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()).violations,
          [],
        )

        await page.keyboard.press("Escape")
        await dialog.waitFor({ state: "hidden" })
        await page.waitForFunction(
          () => document.activeElement?.textContent === "Sign out",
        )
        assert.equal(
          await page.evaluate(() => document.activeElement?.textContent),
          "Sign out",
        )

        await trigger.click()
        await dialog.getByRole("button", { name: "Sign out", exact: true }).click()
        assert.isFalse(
          await page.getByRole("button", { name: "Sign out", exact: true }).isVisible(),
        )
        assert.isTrue(await page.getByRole("heading", { name: "Sign in to RITSEI" }).isVisible())
        assert.deepEqual(errors, [])
      })
    }),
  { timeout: 120_000 },
)

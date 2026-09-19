import { assert, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import { AxeBuilder } from "@axe-core/playwright"
import { chromium } from "playwright"
import { preview } from "vite"

const experimentRoot = "apps/web/src/experiments/solid-effect"

const builtSolidEffect = Effect.gen(function* () {
  const output = yield* Effect.promise(() =>
    new Deno.Command("pnpm", {
      args: ["--dir", experimentRoot, "build"],
      stdout: "piped",
      stderr: "piped",
    }).output()
  )
  assert.isTrue(
    output.success,
    new TextDecoder().decode(output.stdout) +
      new TextDecoder().decode(output.stderr),
  )

  const server = yield* Effect.acquireRelease(
    Effect.promise(() =>
      preview({
        configFile: false,
        root: experimentRoot,
        build: { outDir: "dist" },
        preview: { host: "127.0.0.1", port: 0, strictPort: true },
      })
    ),
    (server) =>
      Effect.promise(
        () =>
          new Promise<void>((resolve, reject) => {
            server.httpServer.close((
              error,
            ) => (error ? reject(error) : resolve()))
          }),
      ),
  )
  const address = server.httpServer.address()
  assert.isNotNull(address)
  assert.isNotString(address)
  if (!address || typeof address === "string") {
    return yield* Effect.die("No preview TCP address")
  }

  const browser = yield* Effect.acquireRelease(
    Effect.promise(() => chromium.launch({ headless: true })),
    (browser) => Effect.promise(() => browser.close()),
  )
  const context = yield* Effect.acquireRelease(
    Effect.promise(() => browser.newContext({ viewport: { width: 1280, height: 900 } })),
    (context) => Effect.promise(() => context.close()),
  )
  const page = yield* Effect.promise(() => context.newPage())
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))

  return { page, errors, url: `http://127.0.0.1:${address.port}` }
})

it.effect(
  "proves effectAction cancellation, compensation, focus restoration, and accessibility",
  () =>
    Effect.gen(function* () {
      const { page, errors, url } = yield* builtSolidEffect
      yield* Effect.promise(async () => {
        await page.goto(url)
        await page.getByRole("button", { name: /Checkout/ }).click()
        await page.getByRole("heading", { name: "Checkout saga" }).waitFor()

        const placeOrder = page.getByRole("button", { name: /Place order/ })
        await placeOrder.focus()
        await placeOrder.click()
        await page.locator('li[aria-current="step"]', { hasText: "Charge card" })
          .waitFor()

        const cancel = page.getByRole("button", { name: "Cancel checkout" })
        await cancel.focus()
        await cancel.click()
        await page.getByText(
          "Checkout cancelled — compensations ran, cart untouched",
          {
            exact: true,
          },
        ).waitFor()
        assert.isTrue(
          await page.getByRole("button", { name: /Place order/ }).evaluate(
            (element) => element === document.activeElement,
          ),
        )
        assert.isTrue(
          await page.getByText(
            "chargeCard interrupted — voiding card authorization",
            {
              exact: true,
            },
          ).isVisible(),
        )
        assert.isTrue(
          await page.getByText(
            /releaseReservation → .* released \(saga compensation\)/,
          ).isVisible(),
        )

        await page.getByLabel("Simulate card decline").check()
        await page.getByRole("button", { name: /Place order/ }).click()
        await page.getByRole("alert").waitFor()
        assert.isTrue(await page.getByText(/Card declined for/).isVisible())
        assert.isTrue(
          await page.getByRole("button", { name: /Place order/ }).evaluate(
            (element) => element === document.activeElement,
          ),
        )

        await page.emulateMedia({
          reducedMotion: "reduce",
          forcedColors: "active",
        })
        const results = await new AxeBuilder({ page }).withTags([
          "wcag2a",
          "wcag2aa",
        ]).analyze()
        assert.deepEqual(results.violations, [])
        assert.deepEqual(errors, [])
      })
    }),
  { timeout: 120_000 },
)

import { assert } from "@effect/vitest"
import * as Effect from "effect/Effect"
import { chromium } from "playwright"
import { preview } from "vite"
import type { Page } from "playwright"

type MockLocalAuthOptions = Readonly<{
  memberships?: readonly {
    userAccountId: string
    tenantId: string
    status: "active" | "suspended"
  }[]
}>

export const mockLocalAuth = async (
  page: Page,
  token = "test-token",
  tenantId = "01900000-0000-7000-8000-000000000010",
  options: MockLocalAuthOptions = {},
) => {
  const userAccountId = "01900000-0000-7000-8000-000000000001"
  const membership = { userAccountId, tenantId, status: "active" as const }
  const memberships = options.memberships ?? [membership]
  await page.route("**/api/auth/config", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ profile: "transitional-local", scopes: [] }),
    }))
  await page.route("**/api/auth/dev/login", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ token, expiresAt: "2026-09-14T00:00:00.000Z" }),
    }))
  await page.route("**/api/auth/session", (route) => {
    const requestedTenantId = route.request().headers()["x-tenant-id"]
    const activeTenant = requestedTenantId === undefined
      ? memberships[0]
      : memberships.find((candidate) => candidate.tenantId === requestedTenantId)
    if (requestedTenantId !== undefined && activeTenant === undefined) {
      return route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({ _tag: "ApiForbidden", code: "forbidden" }),
      })
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        user: { id: userAccountId, email: "tester@example.com", status: "active" },
        memberships,
        activeTenant: activeTenant ?? null,
        capabilities: [],
      }),
    })
  })
}

export const connectToTenant = async (
  page: Page,
  url: string,
  token: string,
  tenantId: string,
  heading: string,
) => {
  await mockLocalAuth(page, token, tenantId)
  await page.goto(url)
  await page.getByRole("button", { name: "Sign in locally", exact: true }).click()
  if (heading === "User accounts") {
    await page.getByRole("link", { name: "User accounts", exact: true }).click()
  }
  await page.getByRole("heading", { name: heading, exact: true }).waitFor()
}

export const builtApp = Effect.gen(function* () {
  const outDir = yield* Effect.acquireRelease(
    Effect.promise(() => Deno.makeTempDir({ prefix: "ritsei-web-" })),
    (path) => Effect.promise(() => Deno.remove(path, { recursive: true })),
  )
  const child = yield* Effect.acquireRelease(
    Effect.sync(() =>
      new Deno.Command("deno", {
        args: ["task", "--cwd", "apps/web", "build", "--outDir", outDir],
        stdout: "piped",
        stderr: "piped",
      }).spawn()
    ),
    (child) =>
      Effect.promise(async () => {
        try {
          child.kill("SIGTERM")
        } catch (cause) {
          if (
            !(cause instanceof Deno.errors.NotFound) &&
            !(cause instanceof TypeError)
          ) throw cause
        }
        await child.status
      }),
  )
  const output = yield* Effect.promise(() => child.output())
  assert.isTrue(
    output.success,
    new TextDecoder().decode(output.stdout) +
      new TextDecoder().decode(output.stderr),
  )
  const server = yield* Effect.acquireRelease(
    Effect.promise(() =>
      preview({
        configFile: false,
        root: "apps/web",
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
  return {
    page,
    context,
    browser,
    errors,
    outDir,
    url: `http://127.0.0.1:${address.port}`,
  }
})

import { AxeBuilder } from "@axe-core/playwright"
import { assert, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import type { Page, Route } from "playwright"
import { builtApp, connectToTenant } from "./browser.ts"

const tenantId = "01900000-0000-7000-8000-000000000010"
const activeMemberId = "01900000-0000-7000-8000-000000000020"
const suspendedMemberId = "01900000-0000-7000-8000-000000000021"
const addedMemberId = "01900000-0000-7000-8000-000000000022"

const definitions = [
  {
    id: "authorization.tenant_membership.read",
    owner: "authorization",
    resource: "tenant_membership",
    verb: "read",
    version: 1,
    stability: "PUBLIC",
    scope: ["tenant"],
  },
  {
    id: "authorization.capability.grant",
    owner: "authorization",
    resource: "capability",
    verb: "grant",
    version: 1,
    stability: "PUBLIC",
    scope: ["tenant"],
  },
  {
    id: "identity.user_account.read",
    owner: "identity",
    resource: "user_account",
    verb: "read",
    version: 1,
    stability: "PUBLIC",
    scope: ["tenant"],
  },
  {
    id: "party.read",
    owner: "party",
    resource: "party",
    verb: "read",
    version: 1,
    stability: "PUBLIC",
    scope: ["tenant"],
  },
] as const

type Membership = {
  userAccountId: string
  tenantId: string
  status: "active" | "suspended"
}

const fulfillJson = (route: Route, status: number, body: unknown) =>
  route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  })

const connectAndOpenAccess = async (page: Page, url: string) => {
  await connectToTenant(page, url, "access-session", tenantId, "User accounts")
  await page.getByRole("link", { name: "Access", exact: true }).click()
  await page.getByRole("heading", { name: "Access", exact: true }).waitFor()
}

it.effect(
  "administers tenant memberships and direct capability grants with explicit impact confirmation",
  () =>
    Effect.gen(function* () {
      const { page, url, errors } = yield* builtApp
      const memberships: Membership[] = [
        { userAccountId: activeMemberId, tenantId, status: "active" },
        { userAccountId: suspendedMemberId, tenantId, status: "suspended" },
      ]
      const grants = new Map<string, string[]>([
        [activeMemberId, ["identity.user_account.read"]],
        [suspendedMemberId, ["authorization.tenant_membership.read"]],
      ])
      let addBody: unknown
      let grantBody: unknown
      let accessHeaders: Record<string, string> | undefined

      yield* Effect.promise(async () => {
        // Fallow: this browser workflow intentionally uses one deterministic authorization route matrix.
        // fallow-ignore-next-line complexity
        await page.route("**/api/**", (route) => {
          const request = route.request()
          const url = new URL(request.url())
          const path = url.pathname.replace(/^\/api/, "")
          const method = request.method()

          if (path === "/user-accounts") return fulfillJson(route, 200, [])
          accessHeaders = request.headers()

          if (path === "/tenant-memberships" && method === "GET") {
            const search = url.searchParams.get("search")?.toLocaleLowerCase()
            const status = url.searchParams.get("status")
            return fulfillJson(
              route,
              200,
              memberships.filter((membership) =>
                (search === undefined || search === null ||
                  membership.userAccountId.toLocaleLowerCase().includes(search)) &&
                (status === null || membership.status === status)
              ),
            )
          }
          if (path === "/tenant-memberships" && method === "POST") {
            addBody = request.postDataJSON()
            const membership = { userAccountId: addedMemberId, tenantId, status: "active" as const }
            memberships.push(membership)
            grants.set(addedMemberId, [])
            return fulfillJson(route, 201, membership)
          }
          if (path === "/capability-definitions" && method === "GET") {
            return fulfillJson(route, 200, definitions)
          }
          if (path === "/capabilities" && method === "POST") {
            grantBody = request.postDataJSON()
            const body = grantBody as { userAccountId: string; capability: string }
            grants.get(body.userAccountId)?.push(body.capability)
            return route.fulfill({ status: 204 })
          }

          const detail = path.match(/^\/tenant-memberships\/([^/]+)$/)
          if (detail) {
            const userAccountId = decodeURIComponent(detail[1]!)
            const membership = memberships.find((item) => item.userAccountId === userAccountId)
            if (method === "DELETE") {
              if (!membership) {
                return fulfillJson(route, 404, { _tag: "ApiNotFound", code: "not_found" })
              }
              memberships.splice(memberships.indexOf(membership), 1)
              grants.delete(userAccountId)
              return route.fulfill({ status: 204 })
            }
            return membership
              ? fulfillJson(route, 200, membership)
              : fulfillJson(route, 404, { _tag: "ApiNotFound", code: "not_found" })
          }

          const directGrants = path.match(/^\/tenant-memberships\/([^/]+)\/capabilities$/)
          if (directGrants && method === "GET") {
            const userAccountId = decodeURIComponent(directGrants[1]!)
            return fulfillJson(
              route,
              200,
              (grants.get(userAccountId) ?? []).map((capability) => ({
                userAccountId,
                tenantId,
                capability,
                scope: "tenant",
              })),
            )
          }

          const transition = path.match(
            /^\/tenant-memberships\/([^/]+)\/(suspend|activate)$/,
          )
          if (transition && method === "POST") {
            const userAccountId = decodeURIComponent(transition[1]!)
            const membership = memberships.find((item) => item.userAccountId === userAccountId)
            if (!membership) {
              return fulfillJson(route, 404, { _tag: "ApiNotFound", code: "not_found" })
            }
            membership.status = transition[2] === "suspend" ? "suspended" : "active"
            return fulfillJson(route, 200, membership)
          }

          return fulfillJson(route, 404, { _tag: "ApiNotFound", code: "not_found" })
        })

        await connectAndOpenAccess(page, url)
        await page.getByRole("cell", { name: activeMemberId, exact: true }).waitFor()
        assert.equal(accessHeaders?.authorization, "Bearer access-session")
        assert.equal(accessHeaders?.["x-tenant-id"], tenantId)
        assert.isNotNull(
          await page.getByRole("link", { name: "Access", exact: true }).first()
            .getAttribute("data-active"),
        )
        assert.deepEqual(
          (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()).violations,
          [],
        )

        const addTrigger = page.getByRole("button", { name: "Add membership", exact: true })
        await addTrigger.click()
        const addDialog = page.getByRole("dialog", { name: "Add tenant membership" })
        await addDialog.waitFor()
        await page.keyboard.press("Escape")
        await addDialog.waitFor({ state: "hidden" })
        assert.isTrue(await addTrigger.evaluate((node) => document.activeElement === node))
        await addTrigger.click()
        await addDialog.getByRole("textbox", { name: "User account ID", exact: true }).fill(
          addedMemberId,
        )
        await addDialog.getByRole("button", { name: "Add membership", exact: true }).click()
        await page.getByRole("heading", { name: "Access detail", exact: true }).waitFor()
        assert.equal(new URL(page.url()).pathname, `/access/${addedMemberId}`)
        assert.deepEqual(addBody, { userAccountId: addedMemberId })

        await page.getByRole("button", { name: "Grant capability", exact: true }).click()
        const grantDialog = page.getByRole("dialog", { name: "Grant tenant capability" })
        await grantDialog.getByRole("combobox", { name: "Capability", exact: true }).selectOption(
          "party.read",
        )
        const grantButton = grantDialog.getByRole("button", {
          name: "Grant capability",
          exact: true,
        })
        assert.isFalse(await grantButton.isEnabled())
        await grantDialog.getByRole("checkbox").check()
        assert.isTrue(await grantButton.isEnabled())
        await grantButton.click()
        await page.getByRole("cell", { name: "party.read", exact: true }).waitFor()
        assert.deepEqual(grantBody, { userAccountId: addedMemberId, capability: "party.read" })
        await page.locator('section[aria-labelledby="permission-summary-heading"]')
          .getByText("Direct tenant grants", { exact: true })
          .waitFor()
        await page.getByText(/individual grant revocation/).waitFor()

        await page.getByRole("button", { name: "Suspend membership", exact: true }).click()
        const suspendDialog = page.getByRole("dialog", { name: "Suspend tenant membership" })
        assert.deepEqual(
          (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()).violations,
          [],
        )
        const suspendButton = suspendDialog.getByRole("button", {
          name: "Suspend membership",
          exact: true,
        })
        assert.isFalse(await suspendButton.isEnabled())
        await suspendDialog.getByRole("checkbox").check()
        await suspendButton.click()
        await page.locator("aside").getByText("Suspended", { exact: true }).waitFor()
        await page.getByText("Activate this membership before granting another capability.", {
          exact: true,
        }).waitFor()

        await page.getByRole("button", { name: "Activate membership", exact: true }).click()
        const activateDialog = page.getByRole("dialog", { name: "Activate tenant membership" })
        await activateDialog.getByRole("checkbox").check()
        await activateDialog.getByRole("button", {
          name: "Activate membership",
          exact: true,
        }).click()
        await page.locator("aside").getByText("Active", { exact: true }).waitFor()

        await page.getByRole("button", { name: "Remove membership", exact: true }).click()
        const removeDialog = page.getByRole("dialog", { name: "Remove tenant membership" })
        await removeDialog.getByText(/global account and memberships in other tenants/).waitFor()
        await removeDialog.getByRole("checkbox").check()
        await removeDialog.getByRole("button", { name: "Remove membership", exact: true }).click()
        await page.waitForURL(/\/access$/)
        await page.getByRole("cell", { name: activeMemberId, exact: true }).waitFor()
        assert.equal(await page.getByText(addedMemberId, { exact: true }).count(), 0)

        await page.getByRole("combobox", { name: "Status", exact: true }).selectOption("suspended")
        await page.getByRole("button", { name: "Apply filters", exact: true }).click()
        await page.waitForURL(/\/access\?status=suspended$/)
        await page.getByRole("cell", { name: suspendedMemberId, exact: true }).waitFor()
        assert.equal(await page.getByText(activeMemberId, { exact: true }).count(), 0)

        await page.getByRole("link", { name: "Clear filters", exact: true }).click()
        await page.getByLabel("Search", { exact: true }).fill("000000000020")
        await page.getByRole("button", { name: "Apply filters", exact: true }).click()
        await page.waitForURL(/\/access\?search=000000000020$/)
        await page.getByRole("cell", { name: activeMemberId, exact: true }).waitFor()
        assert.equal(await page.getByText(suspendedMemberId, { exact: true }).count(), 0)

        assert.deepEqual(errors, [])
      })
    }),
  { timeout: 120_000 },
)

it.effect(
  "keeps denied, malformed, and unknown authorization outcomes recoverable",
  () =>
    Effect.gen(function* () {
      const { page, url, errors } = yield* builtApp
      const membership = { userAccountId: activeMemberId, tenantId, status: "active" as const }
      let mode: "forbidden" | "malformed" | "loaded" | "unknown-grant" = "forbidden"

      yield* Effect.promise(async () => {
        // Fallow: this browser workflow intentionally exercises multiple recoverable authorization outcomes.
        // fallow-ignore-next-line complexity
        await page.route("**/api/**", (route) => {
          const request = route.request()
          const path = new URL(request.url()).pathname.replace(/^\/api/, "")
          if (path === "/user-accounts") return fulfillJson(route, 200, [])
          if (path === "/tenant-memberships" && request.method() === "GET") {
            if (mode === "forbidden") {
              return fulfillJson(route, 403, { _tag: "ApiForbidden", code: "forbidden" })
            }
            if (mode === "malformed") return fulfillJson(route, 200, { memberships: [] })
            return fulfillJson(route, 200, [membership])
          }
          if (path === `/tenant-memberships/${activeMemberId}`) {
            return fulfillJson(route, 200, membership)
          }
          if (path === `/tenant-memberships/${activeMemberId}/capabilities`) {
            return fulfillJson(route, 200, [])
          }
          if (path === "/capability-definitions") return fulfillJson(route, 200, definitions)
          if (path === "/capabilities" && mode === "unknown-grant") {
            return route.abort("connectionreset")
          }
          return fulfillJson(route, 404, { _tag: "ApiNotFound", code: "not_found" })
        })

        await connectAndOpenAccess(page, url)
        await page.getByRole("alert").filter({ hasText: "permission" }).waitFor()

        mode = "malformed"
        await page.getByRole("button", { name: "Try loading memberships again", exact: true })
          .click()
        await page.getByRole("alert").filter({ hasText: "invalid or oversized response" })
          .waitFor()

        mode = "loaded"
        await page.getByRole("button", { name: "Try loading memberships again", exact: true })
          .click()
        await page.getByRole("cell", { name: activeMemberId, exact: true }).waitFor()
        await page.getByRole("link", { name: `Open access for account ${activeMemberId}` }).click()
        await page.getByRole("heading", { name: "Permission summary", exact: true }).waitFor()

        mode = "unknown-grant"
        await page.getByRole("button", { name: "Grant capability", exact: true }).click()
        const dialog = page.getByRole("dialog", { name: "Grant tenant capability" })
        await dialog.getByRole("combobox", { name: "Capability", exact: true }).selectOption(
          "party.read",
        )
        await dialog.getByRole("checkbox").check()
        await dialog.getByRole("button", { name: "Grant capability", exact: true }).click()
        await dialog.getByRole("alert").filter({ hasText: "may have saved" }).waitFor()
        assert.isFalse(
          await dialog.getByRole("button", { name: "Grant capability", exact: true }).isEnabled(),
        )
        mode = "loaded"
        await dialog.getByRole("button", {
          name: "Reload permissions before retrying",
          exact: true,
        }).click()
        await dialog.waitFor({ state: "hidden" })
        assert.deepEqual(errors, [])
      })
    }),
  { timeout: 120_000 },
)

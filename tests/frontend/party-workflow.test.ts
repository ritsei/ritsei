import { AxeBuilder } from "@axe-core/playwright"
import { assert, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import type { Page, Route } from "playwright"
import { builtApp, connectToTenant } from "./browser.ts"

const tenantId = "01900000-0000-7000-8000-000000000010"
const northwindId = "01900000-0000-7000-8000-000000000020"
const northwindLegalEntityId = "01900000-0000-7000-8000-000000000021"
const createdPartyId = "01900000-0000-7000-8000-000000000030"
const createdLegalEntityId = "01900000-0000-7000-8000-000000000031"
const branchId = "01900000-0000-7000-8000-000000000032"
const identifierId = "01900000-0000-7000-8000-000000000033"
const relationshipId = "01900000-0000-7000-8000-000000000034"
const representationId = "01900000-0000-7000-8000-000000000035"
const userAccountId = "01900000-0000-7000-8000-000000000040"

const northwind = {
  id: northwindId,
  tenantId,
  kind: "organization" as const,
  name: "Northwind Holdings",
}
const createdParty = {
  id: createdPartyId,
  tenantId,
  kind: "organization" as const,
  name: "Contoso Trading",
}

const fulfillJson = (route: Route, status: number, body: unknown) =>
  route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  })

const connectAndOpenParties = async (page: Page, url: string) => {
  await connectToTenant(page, url, "party-session", tenantId, "User accounts")
  await page.getByRole("link", { name: "Parties", exact: true }).click()
  await page.getByRole("heading", { name: "Parties", exact: true }).waitFor()
}

it.effect(
  "creates and administers Party master, legal, relationship, and representation facts",
  () =>
    Effect.gen(function* () {
      const { page, url, errors } = yield* builtApp
      const entries: Array<{
        party: typeof northwind
        legalEntityId: string | null
      }> = [{ party: northwind, legalEntityId: northwindLegalEntityId }]
      const detail = {
        party: createdParty,
        roles: [] as string[],
        identifiers: [] as unknown[],
        legalEntity: null as null | { id: string; tenantId: string; organizationId: string },
        branches: [] as unknown[],
        relationships: [] as unknown[],
        representations: [] as Array<{
          id: string
          tenantId: string
          userAccountId: string
          partyId: string
          kind: string
          active: boolean
        }>,
      }
      let createBody: unknown
      let roleBody: unknown
      let identifierBody: unknown
      let relationshipBody: unknown
      let branchBody: unknown
      let representationBody: unknown
      let representationPatchBody: unknown
      let partyHeaders: Record<string, string> | undefined

      yield* Effect.promise(async () => {
        // Fallow: this browser workflow intentionally uses one deterministic Party route matrix.
        // fallow-ignore-next-line complexity
        await page.route("**/api/**", (route) => {
          const request = route.request()
          const url = new URL(request.url())
          const path = url.pathname.replace(/^\/api/, "")
          const method = request.method()

          if (path === "/user-accounts") return fulfillJson(route, 200, [])
          if (path.startsWith("/parties") || path.startsWith("/legal-entities")) {
            partyHeaders = request.headers()
          }
          if (path === "/parties" && method === "GET") {
            const search = url.searchParams.get("search")?.toLocaleLowerCase()
            const kind = url.searchParams.get("kind")
            return fulfillJson(
              route,
              200,
              entries.filter((entry) =>
                (search === undefined || entry.party.name.toLocaleLowerCase().includes(search)) &&
                (kind === null || entry.party.kind === kind)
              ),
            )
          }
          if (path === "/parties" && method === "POST") {
            createBody = request.postDataJSON()
            entries.push({ party: createdParty, legalEntityId: null })
            return fulfillJson(route, 201, createdParty)
          }
          if (path === `/parties/${createdPartyId}` && method === "GET") {
            return fulfillJson(route, 200, detail)
          }
          if (path === `/parties/${createdPartyId}/legal-entity` && method === "POST") {
            detail.legalEntity = {
              id: createdLegalEntityId,
              tenantId,
              organizationId: createdPartyId,
            }
            entries[1] = { party: createdParty, legalEntityId: createdLegalEntityId }
            return fulfillJson(route, 201, detail.legalEntity)
          }
          if (path === `/legal-entities/${createdLegalEntityId}/branches` && method === "POST") {
            branchBody = request.postDataJSON()
            const branch = {
              id: branchId,
              tenantId,
              legalEntityId: createdLegalEntityId,
              name: "Jakarta",
              timezone: "Asia/Jakarta",
              localTaxRegistration: "ID-JKT-001",
              dedicatedJournalCode: "JKT",
            }
            detail.branches = [branch]
            return fulfillJson(route, 201, branch)
          }
          if (path === `/parties/${createdPartyId}/roles` && method === "POST") {
            roleBody = request.postDataJSON()
            detail.roles = ["supplier"]
            return route.fulfill({ status: 204 })
          }
          if (path === `/parties/${createdPartyId}/identifiers` && method === "POST") {
            identifierBody = request.postDataJSON()
            const identifier = {
              id: identifierId,
              tenantId,
              partyId: createdPartyId,
              provider: "ERP",
              scheme: "SUPPLIER-ID",
              scope: "tenant",
              legalEntityId: null,
              value: "S-001",
            }
            detail.identifiers = [identifier]
            return fulfillJson(route, 201, identifier)
          }
          if (path === `/parties/${createdPartyId}/relationships` && method === "POST") {
            relationshipBody = request.postDataJSON()
            const relationship = {
              id: relationshipId,
              tenantId,
              partyId: createdPartyId,
              legalEntityId: northwindLegalEntityId,
              kind: "supplier",
              active: true,
            }
            detail.relationships = [relationship]
            return fulfillJson(route, 201, relationship)
          }
          if (path === `/parties/${createdPartyId}/representations` && method === "POST") {
            representationBody = request.postDataJSON()
            const representation = {
              id: representationId,
              tenantId,
              userAccountId,
              partyId: createdPartyId,
              kind: "self",
              active: true,
            }
            detail.representations = [representation]
            return fulfillJson(route, 201, representation)
          }
          if (path === `/party-representations/${representationId}` && method === "PATCH") {
            representationPatchBody = request.postDataJSON()
            detail.representations[0]!.active = false
            return fulfillJson(route, 200, detail.representations[0])
          }
          if (path === `/parties/${createdPartyId}/related-paths` && method === "GET") {
            return fulfillJson(
              route,
              200,
              detail.relationships.length === 0 ? [] : [{
                tenantId,
                sourcePartyId: createdPartyId,
                targetPartyId: northwindId,
                legalEntityId: northwindLegalEntityId,
                relationshipId,
                relationshipKind: "supplier",
                depth: 2,
              }],
            )
          }
          return fulfillJson(route, 404, { _tag: "ApiNotFound", code: "not_found" })
        })

        await connectAndOpenParties(page, url)
        await page.getByRole("cell", { name: "Northwind Holdings", exact: true }).waitFor()
        assert.equal(partyHeaders?.authorization, "Bearer party-session")
        assert.equal(partyHeaders?.["x-tenant-id"], tenantId)

        const createTrigger = page.getByRole("button", { name: "Create Party", exact: true })
        await createTrigger.click()
        const dialog = page.getByRole("dialog", { name: "Create Party" })
        await dialog.waitFor()
        assert.deepEqual(
          (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()).violations,
          [],
        )
        await page.keyboard.press("Escape")
        await dialog.waitFor({ state: "hidden" })
        assert.isTrue(await createTrigger.evaluate((node) => document.activeElement === node))
        await createTrigger.click()
        await dialog.getByRole("combobox", { name: "Kind", exact: true }).selectOption(
          "organization",
        )
        await dialog.getByRole("textbox", { name: "Name", exact: true }).fill(createdParty.name)
        await dialog.getByRole("button", { name: "Create Party", exact: true }).click()
        await page.getByRole("heading", { name: "Party detail", exact: true }).waitFor()
        assert.equal(new URL(page.url()).pathname, `/parties/${createdPartyId}`)
        assert.deepEqual(createBody, { kind: "organization", name: createdParty.name })
        assert.isNotNull(
          await page.getByRole("link", { name: "Parties", exact: true }).first()
            .getAttribute("data-active"),
        )

        await page.getByRole("button", { name: "Register legal entity", exact: true }).click()
        await page.getByText(createdLegalEntityId, { exact: true }).waitFor()

        await page.locator("summary").filter({ hasText: "Create branch" }).click()
        await page.getByRole("textbox", { name: "Branch name", exact: true }).fill("Jakarta")
        await page.getByLabel("Timezone", { exact: true }).fill("Asia/Jakarta")
        await page.getByLabel("Local tax registration", { exact: true }).fill("ID-JKT-001")
        await page.getByLabel("Dedicated journal code", { exact: true }).fill("JKT")
        await page.getByRole("button", { name: "Create branch", exact: true }).click()
        await page.getByText(/Jakarta · Asia\/Jakarta/).waitFor()
        assert.deepEqual(branchBody, {
          name: "Jakarta",
          timezone: "Asia/Jakarta",
          localTaxRegistration: "ID-JKT-001",
          dedicatedJournalCode: "JKT",
        })

        await page.getByText("Assign business role", { exact: true }).click()
        await page.getByRole("combobox", { name: "Role", exact: true }).selectOption("supplier")
        await page.getByRole("button", { name: "Assign role", exact: true }).click()
        await page.getByRole("heading", { name: "Business roles", exact: true })
          .locator("xpath=..")
          .getByText("Supplier", { exact: true })
          .waitFor()
        assert.deepEqual(roleBody, { role: "supplier" })

        await page.getByText("Attach external identifier", { exact: true }).click()
        await page.getByRole("textbox", { name: "Provider", exact: true }).fill("erp")
        await page.getByRole("textbox", { name: "Scheme", exact: true }).fill("supplier-id")
        await page.getByRole("textbox", { name: "Scope", exact: true }).fill("tenant")
        await page.getByRole("textbox", { name: "Identifier value", exact: true }).fill("S-001")
        await page.getByRole("button", { name: "Attach identifier", exact: true }).click()
        await page.getByRole("cell", { name: "ERP", exact: true }).waitFor()
        assert.deepEqual(identifierBody, {
          provider: "erp",
          scheme: "supplier-id",
          scope: "tenant",
          value: "S-001",
        })

        const relationshipCommand = page.locator("summary").filter({
          hasText: "Create legal-entity relationship",
        })
        await relationshipCommand.click()
        await page.getByRole("combobox", { name: "Relationship kind", exact: true }).selectOption(
          "supplier",
        )
        await page.getByRole("textbox", { name: "Legal entity ID", exact: true }).fill(
          northwindLegalEntityId,
        )
        await page.getByRole("button", { name: "Create relationship", exact: true }).click()
        await page.getByRole("cell", { name: "Northwind Holdings", exact: true }).last().waitFor()
        await page.getByText("Supplier relationship to Northwind Holdings", { exact: true })
          .waitFor()
        assert.deepEqual(relationshipBody, {
          kind: "supplier",
          legalEntityId: northwindLegalEntityId,
        })

        await page.getByText("Link user account representation", { exact: true }).click()
        await page.getByRole("textbox", { name: "User account ID", exact: true }).fill(
          userAccountId,
        )
        await page.getByRole("button", { name: "Link representation", exact: true }).click()
        await page.getByRole("cell", { name: userAccountId, exact: true }).waitFor()
        assert.deepEqual(representationBody, { userAccountId, kind: "self" })
        await page.getByRole("button", {
          name: `Deactivate representation for ${userAccountId}`,
          exact: true,
        }).click()
        await page.getByText("Inactive", { exact: true }).waitFor()
        assert.deepEqual(representationPatchBody, { active: false })

        await page.getByLabel("Search", { exact: true }).fill("Contoso")
        await page.getByLabel("Kind", { exact: true }).selectOption("organization")
        await page.getByRole("button", { name: "Apply filters", exact: true }).click()
        await page.waitForURL(/\/parties\?search=Contoso&kind=organization$/)
        await page.getByRole("cell", { name: "Contoso Trading", exact: true }).waitFor()
        assert.equal(
          await page.getByRole("cell", { name: "Northwind Holdings", exact: true }).count(),
          0,
        )

        assert.deepEqual(
          (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()).violations,
          [],
        )
        assert.deepEqual(errors, [])
      })
    }),
  { timeout: 120_000 },
)

it.effect(
  "keeps Party authorization, malformed data, and unknown command outcomes visible",
  () =>
    Effect.gen(function* () {
      const { page, url, errors } = yield* builtApp
      let mode: "forbidden" | "malformed" | "loaded" | "unknown-create" = "forbidden"

      yield* Effect.promise(async () => {
        await page.route("**/api/**", (route) => {
          const request = route.request()
          const path = new URL(request.url()).pathname.replace(/^\/api/, "")
          if (path === "/user-accounts") return fulfillJson(route, 200, [])
          if (path === "/parties" && request.method() === "GET") {
            if (mode === "forbidden") {
              return fulfillJson(route, 403, { _tag: "ApiForbidden", code: "forbidden" })
            }
            if (mode === "malformed") return fulfillJson(route, 200, { parties: [] })
            return fulfillJson(route, 200, [{ party: northwind, legalEntityId: null }])
          }
          if (path === "/parties" && request.method() === "POST" && mode === "unknown-create") {
            return route.abort("connectionreset")
          }
          return fulfillJson(route, 404, { _tag: "ApiNotFound", code: "not_found" })
        })

        await connectAndOpenParties(page, url)
        await page.getByRole("alert").filter({ hasText: "permission" }).waitFor()

        mode = "malformed"
        await page.getByRole("button", { name: "Try loading Parties again", exact: true }).click()
        await page.getByRole("alert").filter({ hasText: "invalid or oversized response" })
          .waitFor()

        mode = "loaded"
        await page.getByRole("button", { name: "Try loading Parties again", exact: true }).click()
        await page.getByRole("cell", { name: "Northwind Holdings", exact: true }).waitFor()

        mode = "unknown-create"
        await page.getByRole("button", { name: "Create Party", exact: true }).click()
        const dialog = page.getByRole("dialog", { name: "Create Party" })
        await dialog.getByRole("combobox", { name: "Kind", exact: true }).selectOption("person")
        await dialog.getByRole("textbox", { name: "Name", exact: true }).fill("Unknown Person")
        await dialog.getByRole("button", { name: "Create Party", exact: true }).click()
        await dialog.getByRole("alert").filter({ hasText: "may have saved" }).waitFor()
        assert.isFalse(
          await dialog.getByRole("button", { name: "Create Party", exact: true }).isEnabled(),
        )
        await dialog.getByRole("button", { name: "Reload Party before retrying", exact: true })
          .click()
        assert.deepEqual(errors, [])
      })
    }),
  { timeout: 120_000 },
)

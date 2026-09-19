import { AxeBuilder } from "@axe-core/playwright"
import { assert, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import type { Page, Route } from "playwright"
import type { SalesOrder } from "../../apps/web/src/shared/contracts/generated/sales.ts"
import { builtApp, connectToTenant } from "./browser.ts"

const tenantId = "01910000-0000-7000-8000-000000000010"
const customerId = "01910000-0000-7000-8000-000000000011"
const quotationId = "01910000-0000-7000-8000-000000000012"
const orderId = "01910000-0000-7000-8000-000000000013"
const itemId = "01910000-0000-7000-8000-000000000014"

const customer = {
  id: customerId,
  tenantId,
  name: "Northwind Customer",
  email: "northwind@example.test",
}
const quotation = {
  id: quotationId,
  tenantId,
  customerId,
  status: "draft" as const,
  total: "25.00",
}
const draftOrder: SalesOrder = {
  id: orderId,
  tenantId,
  customerId,
  quotationId,
  status: "draft",
  confirmedAt: null,
  total: "25.00",
  lines: [{ itemId, quantity: "2", unitPrice: "12.50" }],
}

const fulfillJson = (route: Route, status: number, body: unknown) =>
  route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) })

const connectAndOpenSales = async (page: Page, url: string) => {
  await connectToTenant(page, url, "sales-session", tenantId, "User accounts")
  await page.getByRole("link", { name: "Revenue", exact: true }).click()
  await page.getByRole("heading", { name: "Sales", exact: true }).waitFor({ timeout: 5_000 })
}

it.effect(
  "connects Sales customer, quotation, and order workflows through the backend surface",
  () =>
    Effect.gen(function* () {
      const { page, url, errors } = yield* builtApp
      let customers = [] as typeof customer[]
      let quotations = [] as typeof quotation[]
      let currentOrder: SalesOrder | undefined
      const requests: Array<{
        path: string
        method: string
        headers: Record<string, string>
        body: unknown
      }> = []

      yield* Effect.promise(async () => {
        // Fallow: this browser workflow intentionally uses one deterministic Sales route matrix.
        // fallow-ignore-next-line complexity
        await page.route("**/api/**", (route) => {
          const request = route.request()
          const requestUrl = new URL(request.url())
          const path = requestUrl.pathname.replace(/^\/api/, "")
          const method = request.method()
          const body = method === "POST" ? request.postDataJSON() : undefined
          requests.push({ path, method, headers: request.headers(), body })

          if (path === "/user-accounts" && method === "GET") return fulfillJson(route, 200, [])
          if (path === "/sales/customers" && method === "GET") {
            const search = requestUrl.searchParams.get("search")?.toLowerCase()
            return fulfillJson(
              route,
              200,
              customers.filter((candidate) =>
                search === undefined || candidate.name.toLowerCase().includes(search) ||
                candidate.email.includes(search)
              ),
            )
          }
          if (path === "/sales/customers" && method === "POST") {
            customers = [{
              ...customer,
              name: body.name.trim(),
              email: body.email.trim().toLowerCase(),
            }]
            return fulfillJson(route, 201, customers[0])
          }
          if (path === `/sales/customers/${customerId}` && method === "GET") {
            return fulfillJson(route, 200, customer)
          }
          if (path === "/sales/quotations" && method === "GET") {
            return fulfillJson(route, 200, quotations)
          }
          if (path === "/sales/quotations" && method === "POST") {
            quotations = [{ ...quotation, customerId: body.customerId, total: body.total }]
            return fulfillJson(route, 201, quotations[0])
          }
          if (path === `/sales/quotations/${quotationId}` && method === "GET") {
            return fulfillJson(route, 200, quotation)
          }
          if (path === "/sales/orders" && method === "GET") {
            return fulfillJson(route, 200, currentOrder === undefined ? [] : [currentOrder])
          }
          if (path === "/sales/orders" && method === "POST") {
            currentOrder = {
              ...draftOrder,
              customerId: body.customerId,
              quotationId: body.quotationId ?? null,
              lines: body.lines,
              total: "25.00",
            }
            return fulfillJson(route, 201, currentOrder)
          }
          if (path === `/sales/orders/${orderId}` && method === "GET") {
            return fulfillJson(route, 200, currentOrder ?? draftOrder)
          }
          if (path === `/sales/orders/${orderId}/confirm` && method === "POST") {
            currentOrder = {
              ...(currentOrder ?? draftOrder),
              status: "confirmed",
              confirmedAt: "2026-09-13T12:00:00.000Z",
            }
            return fulfillJson(route, 200, currentOrder)
          }
          if (path === `/sales/orders/${orderId}/cancel` && method === "POST") {
            currentOrder = { ...(currentOrder ?? draftOrder), status: "cancelled" }
            return fulfillJson(route, 200, currentOrder)
          }
          return fulfillJson(route, 404, { _tag: "ApiNotFound", code: "not_found" })
        })

        await connectAndOpenSales(page, url)
        const salesRequest = requests.find((request) => request.path.startsWith("/sales"))
        assert.equal(salesRequest?.headers.authorization, "Bearer sales-session")
        assert.equal(salesRequest?.headers["x-tenant-id"], tenantId)
        const initialA11y = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()
        assert.deepEqual(initialA11y.violations, [])

        await page.getByRole("button", { name: "Create customer", exact: true }).click()
        const customerDialog = page.getByRole("dialog", { name: "Create customer" })
        await customerDialog.getByRole("textbox", { name: "Customer name", exact: true }).fill(
          "Northwind Customer",
        )
        await customerDialog.getByRole("textbox", { name: "Email", exact: true }).fill(
          "NORTHWIND@EXAMPLE.TEST",
        )
        await customerDialog.getByRole("button", { name: "Create customer", exact: true }).click()
        await customerDialog.waitFor({ state: "hidden" })
        await page.getByRole("link", { name: customer.name, exact: true }).click()
        await page.getByRole("heading", { name: "Customer detail", exact: true }).waitFor()
        await page.getByRole("link", { name: "Revenue", exact: true }).click()
        await page.getByRole("heading", { name: "Sales", exact: true }).waitFor()

        await page.getByRole("button", { name: "Create quotation", exact: true }).click()
        const quotationDialog = page.getByRole("dialog", { name: "Create quotation" })
        await quotationDialog.getByRole("combobox", { name: "Customer", exact: true }).selectOption(
          customerId,
        )
        await quotationDialog.getByRole("textbox", { name: "Quoted total", exact: true }).fill(
          "25.00",
        )
        await quotationDialog.getByRole("button", { name: "Create quotation", exact: true }).click()
        await quotationDialog.waitFor({ state: "hidden" })
        await page.getByRole("heading", { name: "Quotation detail", exact: true }).waitFor()
        await page.getByRole("link", { name: "Revenue", exact: true }).click()
        await page.getByRole("heading", { name: "Sales", exact: true }).waitFor()

        await page.getByRole("button", { name: "Create sales order", exact: true }).click()
        const orderDialog = page.getByRole("dialog", { name: "Create sales order" })
        await orderDialog.getByRole("combobox", { name: "Customer", exact: true }).selectOption(
          customerId,
        )
        await orderDialog.getByRole("textbox", { name: "Quotation ID", exact: true }).fill(
          quotationId,
        )
        await orderDialog.getByRole("textbox", { name: "Item ID", exact: true }).fill(itemId)
        await orderDialog.getByRole("textbox", { name: "Quantity", exact: true }).fill("2")
        await orderDialog.getByRole("textbox", { name: "Unit price", exact: true }).fill("12.50")
        await orderDialog.getByRole("button", { name: "Create sales order", exact: true }).click()
        await orderDialog.waitFor({ state: "hidden" })
        await page.getByRole("heading", { name: "Sales order detail", exact: true }).waitFor()

        await page.getByRole("button", { name: "Confirm order", exact: true }).first().click()
        const confirmDialog = page.getByRole("dialog", { name: "Confirm sales order" })
        await confirmDialog.getByRole("button", { name: "Confirm order", exact: true }).click()
        await confirmDialog.waitFor({ state: "hidden" })
        await page.getByText("confirmed", { exact: true }).first().waitFor()

        await page.getByRole("button", { name: "Cancel order", exact: true }).first().click()
        const cancelDialog = page.getByRole("dialog", { name: "Cancel confirmed sales order" })
        await cancelDialog.getByRole("button", { name: "Cancel order", exact: true }).click()
        await cancelDialog.waitFor({ state: "hidden" })
        await page.getByText("cancelled", { exact: true }).first().waitFor()

        assert.isTrue(requests.some((request) =>
          request.path === "/sales/customers" && request.method === "POST"
        ))
        assert.isTrue(requests.some((request) =>
          request.path === "/sales/quotations" && request.method === "POST"
        ))
        assert.isTrue(requests.some((request) =>
          request.path === "/sales/orders" && request.method === "POST"
        ))
        assert.deepStrictEqual(
          requests.find((request) =>
            request.path === "/sales/orders" && request.method === "POST"
          )?.body,
          { customerId, quotationId, lines: [{ itemId, quantity: "2", unitPrice: "12.50" }] },
        )
        assert.isTrue(requests.some((request) =>
          request.path === `/sales/orders/${orderId}/confirm`
        ))
        assert.isTrue(
          requests.some((request) => request.path === `/sales/orders/${orderId}/cancel`),
        )
        assert.deepEqual(errors, [])
        const finalA11y = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()
        assert.deepEqual(finalA11y.violations, [])
      })
    }),
  { timeout: 120_000 },
)

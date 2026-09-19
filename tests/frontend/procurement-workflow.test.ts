import { AxeBuilder } from "@axe-core/playwright"
import { assert, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import type { Page, Route } from "playwright"
import type { PurchaseOrder } from "../../apps/web/src/shared/contracts/generated/procurement.ts"
import { builtApp, connectToTenant } from "./browser.ts"

const tenantId = "01900000-0000-7000-8000-000000000010"
const relationshipId = "01900000-0000-7000-8000-000000000020"
const supplierAccountId = "01900000-0000-7000-8000-000000000021"
const partyId = "01900000-0000-7000-8000-000000000022"
const legalEntityId = "01900000-0000-7000-8000-000000000023"
const itemId = "01900000-0000-7000-8000-000000000030"
const orderId = "01900000-0000-7000-8000-000000000031"
const orderLineId = "01900000-0000-7000-8000-000000000032"
const receiptId = "01900000-0000-7000-8000-000000000033"
const receiptLineId = "01900000-0000-7000-8000-000000000034"
const warehouseId = "01900000-0000-7000-8000-000000000035"

const supplierAccount = {
  id: supplierAccountId,
  tenantId,
  supplierRelationshipId: relationshipId,
  partyId,
  legalEntityId,
}

const draftOrder = {
  id: orderId,
  tenantId,
  supplierAccountId,
  status: "draft" as const,
  confirmedAt: null,
  total: "25.00",
  lines: [{ id: orderLineId, itemId, quantity: "2", unitPrice: "12.50" }],
}

const fulfillJson = (route: Route, status: number, body: unknown) =>
  route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) })

const connectAndOpenProcurement = async (page: Page, url: string) => {
  await connectToTenant(page, url, "procurement-session", tenantId, "User accounts")
  await page.getByRole("link", { name: "Supply", exact: true }).click()
  await page.getByRole("heading", { name: "Procurement", exact: true }).waitFor({ timeout: 5_000 })
}

it.effect(
  "administers supplier accounts and runs the purchase-order lifecycle",
  () =>
    Effect.gen(function* () {
      const { page, url, errors } = yield* builtApp
      const accounts = [supplierAccount]
      let order: PurchaseOrder = draftOrder
      let receipts: unknown[] = []
      const requests: Array<{ path: string; method: string; headers: Record<string, string> }> = []
      let supplierAccountBody: unknown
      let purchaseOrderBody: unknown
      let confirmBody: unknown
      let receiveBody: unknown

      yield* Effect.promise(async () => {
        // Fallow: this browser workflow intentionally uses one deterministic Procurement route matrix.
        // fallow-ignore-next-line complexity
        await page.route("**/api/**", (route) => {
          const request = route.request()
          const requestUrl = new URL(request.url())
          const path = requestUrl.pathname.replace(/^\/api/, "")
          const method = request.method()
          requests.push({ path, method, headers: request.headers() })

          if (path === "/user-accounts") return fulfillJson(route, 200, [])
          if (path === "/procurement/supplier-accounts" && method === "GET") {
            return fulfillJson(route, 200, accounts)
          }
          if (path === "/procurement/supplier-accounts" && method === "POST") {
            supplierAccountBody = request.postDataJSON()
            return fulfillJson(route, 201, supplierAccount)
          }
          if (path === "/procurement/purchase-orders" && method === "GET") {
            const status = requestUrl.searchParams.get("status")
            const supplier = requestUrl.searchParams.get("supplierAccountId")
            const matches = [order].filter((candidate) =>
              (status === null || candidate.status === status) &&
              (supplier === null || candidate.supplierAccountId === supplier)
            )
            return fulfillJson(route, 200, matches)
          }
          if (path === "/procurement/purchase-orders" && method === "POST") {
            purchaseOrderBody = request.postDataJSON()
            order = draftOrder
            return fulfillJson(route, 201, order)
          }
          if (path === `/procurement/purchase-orders/${orderId}` && method === "GET") {
            return fulfillJson(route, 200, order)
          }
          if (path === `/procurement/purchase-orders/${orderId}/confirm` && method === "POST") {
            confirmBody = request.postDataJSON()
            order = { ...order, status: "confirmed", confirmedAt: "2026-09-13T12:00:00.000Z" }
            return fulfillJson(route, 200, order)
          }
          if (path === `/procurement/purchase-orders/${orderId}/receipts` && method === "GET") {
            return fulfillJson(route, 200, receipts)
          }
          if (path === `/procurement/purchase-orders/${orderId}/receipts` && method === "POST") {
            receiveBody = request.postDataJSON()
            const receipt = {
              id: receiptId,
              tenantId,
              purchaseOrderId: orderId,
              warehouseId,
              idempotencyKey: "receipt:one",
              receivedAt: "2026-09-13T12:01:00.000Z",
              lines: [{
                id: receiptLineId,
                purchaseOrderLineId: orderLineId,
                itemId,
                quantity: "2",
                unitOfMeasure: "EA",
              }],
            }
            receipts = [receipt]
            return fulfillJson(route, 201, receipt)
          }
          return fulfillJson(route, 404, { _tag: "ApiNotFound", code: "not_found" })
        })

        await connectAndOpenProcurement(page, url)
        await page.getByRole("cell", { name: supplierAccountId, exact: true }).first().waitFor({
          timeout: 5_000,
        })
        assert.isTrue(
          requests.some((request) =>
            request.path === "/procurement/purchase-orders" && request.method === "GET"
          ),
        )
        const procurementRequest = requests.find((request) =>
          request.path.startsWith("/procurement")
        )
        assert.equal(procurementRequest?.headers.authorization, "Bearer procurement-session")
        assert.equal(procurementRequest?.headers["x-tenant-id"], tenantId)

        const createAccount = page.getByRole("button", {
          name: "Create supplier account",
          exact: true,
        })
        await createAccount.click()
        const accountDialog = page.getByRole("dialog", { name: "Create supplier account" })
        await accountDialog.waitFor()
        assert.deepEqual(
          (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()).violations,
          [],
        )
        await accountDialog.getByRole("textbox", { name: "Supplier relationship ID", exact: true })
          .fill(relationshipId)
        await accountDialog.getByRole("button", { name: "Create supplier account", exact: true })
          .click()
        await accountDialog.waitFor({ state: "hidden" })
        assert.deepEqual(supplierAccountBody, { supplierRelationshipId: relationshipId })

        await page.getByRole("button", { name: "Create purchase order", exact: true }).click()
        const orderDialog = page.getByRole("dialog", { name: "Create purchase order" })
        await orderDialog.getByRole("combobox", { name: "Supplier account", exact: true })
          .selectOption(supplierAccountId)
        await orderDialog.getByRole("textbox", { name: "Item ID", exact: true }).fill(itemId)
        await orderDialog.getByRole("textbox", { name: "Quantity", exact: true }).fill("2")
        await orderDialog.getByRole("textbox", { name: "Unit price", exact: true }).fill("12.50")
        await orderDialog.getByRole("button", { name: "Create purchase order", exact: true })
          .click()
        await page.getByRole("heading", { name: "Purchase order detail", exact: true }).waitFor()
        assert.equal(new URL(page.url()).pathname, `/procurement/${orderId}`)
        assert.deepEqual(purchaseOrderBody, {
          supplierAccountId,
          lines: [{ itemId, quantity: "2", unitPrice: "12.50" }],
        })

        await page.getByRole("button", { name: "Confirm purchase order", exact: true }).click()
        const confirmDialog = page.getByRole("dialog", { name: "Confirm purchase order" })
        await confirmDialog.getByRole("button", { name: "Confirm purchase order", exact: true })
          .click()
        await page.getByText("confirmed", { exact: true }).first().waitFor()
        assert.deepEqual(confirmBody, { idempotencyKey: `confirm:${orderId}` })

        await page.getByRole("button", { name: "Receive goods", exact: true }).click()
        const receiveDialog = page.getByRole("dialog", { name: "Receive goods" })
        await receiveDialog.getByRole("textbox", { name: "Warehouse ID", exact: true }).fill(
          warehouseId,
        )
        await receiveDialog.getByRole("textbox", {
          name: `Item ${itemId} · ordered 2`,
          exact: true,
        })
          .fill("2")
        await receiveDialog.getByRole("button", { name: "Receive goods", exact: true }).click()
        await page.getByText(receiptId, { exact: true }).waitFor()
        assert.deepEqual(receiveBody, {
          warehouseId,
          idempotencyKey: `receipt:${orderId}`,
          lines: [{ purchaseOrderLineId: orderLineId, quantity: "2" }],
        })
        assert.deepEqual(errors, [])
      })
    }),
  { timeout: 120_000 },
)

import { AxeBuilder } from "@axe-core/playwright"
import { assert, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import type { Page, Route } from "playwright"
import type {
  StockBalance,
  StockMovement,
  StockReservation,
  StockTransfer,
} from "../../apps/web/src/shared/contracts/generated/inventory.ts"
import { builtApp, connectToTenant } from "./browser.ts"

const tenantId = "01900000-0000-7000-8000-000000000010"
const legalEntityId = "01900000-0000-7000-8000-000000000011"
const warehouseId = "01900000-0000-7000-8000-000000000012"
const destinationWarehouseId = "01900000-0000-7000-8000-000000000013"
const itemId = "01900000-0000-7000-8000-000000000014"
const secondItemId = "01900000-0000-7000-8000-000000000015"
const reservationId = "01900000-0000-7000-8000-000000000016"
const secondReservationId = "01900000-0000-7000-8000-000000000017"
const transferId = "01900000-0000-7000-8000-000000000018"
const correctionId = "01900000-0000-7000-8000-000000000019"
const movementId = "01900000-0000-7000-8000-000000000020"

const warehouse = {
  id: warehouseId,
  tenantId,
  legalEntityId,
  primaryBranchId: null,
  name: "Main warehouse",
}
const destinationWarehouse = {
  ...warehouse,
  id: destinationWarehouseId,
  name: "Overflow warehouse",
}
const item = { id: itemId, tenantId, sku: "WIDGET-1", name: "Widget", unitOfMeasure: "EA" }
const secondItem = {
  id: secondItemId,
  tenantId,
  sku: "WIDGET-2",
  name: "Second widget",
  unitOfMeasure: "EA",
}
const draftTransfer: StockTransfer = {
  id: transferId,
  tenantId,
  legalEntityId,
  sourceWarehouseId: warehouseId,
  destinationWarehouseId,
  status: "draft",
  confirmedAt: null,
  completedAt: null,
  lines: [{ itemId, quantity: "2" }],
}
const fulfillJson = (route: Route, status: number, body: unknown) =>
  route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) })

const connectAndOpenInventory = async (page: Page, url: string) => {
  await connectToTenant(page, url, "inventory-session", tenantId, "User accounts")
  await page.getByRole("link", { name: "Inventory", exact: true }).click()
  await page.getByRole("heading", { name: "Inventory", exact: true }).waitFor({ timeout: 5_000 })
}

it.effect(
  "connects Inventory reads and runs stock commands through the backend surface",
  () =>
    Effect.gen(function* () {
      const { page, url, errors } = yield* builtApp
      let balances: StockBalance[] = [{
        tenantId,
        warehouseId,
        itemId,
        onHand: "10",
        reserved: "2",
        unitOfMeasure: "EA",
      }]
      let reservations: StockReservation[] = [
        {
          id: reservationId,
          tenantId,
          warehouseId,
          itemId,
          quantity: "2",
          idempotencyKey: "reserve:one",
          status: "active",
        },
        {
          id: secondReservationId,
          tenantId,
          warehouseId,
          itemId: secondItemId,
          quantity: "1",
          idempotencyKey: "reserve:two",
          status: "active",
        },
      ]
      let transfers: StockTransfer[] = [draftTransfer]
      let movements: StockMovement[] = []
      const requests: Array<{ path: string; method: string; body: unknown }> = []
      let adjustmentBody: unknown
      let receiveBody: unknown
      let reserveBody: unknown
      let transferBody: unknown

      yield* Effect.promise(async () => {
        // Fallow: this browser workflow intentionally uses one deterministic Inventory route matrix.
        // fallow-ignore-next-line complexity
        await page.route("**/api/**", (route) => {
          const request = route.request()
          const requestUrl = new URL(request.url())
          const path = requestUrl.pathname.replace(/^\/api/, "")
          const method = request.method()
          const body = method === "POST" ? request.postDataJSON() : undefined
          requests.push({ path, method, body })

          if (path === "/user-accounts" && method === "GET") {
            return fulfillJson(route, 200, [])
          }
          if (path === "/inventory/warehouses" && method === "GET") {
            return fulfillJson(route, 200, [warehouse, destinationWarehouse])
          }
          if (path === "/inventory/warehouses" && method === "POST") {
            return fulfillJson(route, 201, {
              ...warehouse,
              name: body.name.trim(),
              legalEntityId: body.legalEntityId,
              primaryBranchId: body.primaryBranchId ?? null,
            })
          }
          if (path === "/inventory/items" && method === "GET") {
            const search = requestUrl.searchParams.get("search")?.toLocaleLowerCase() ?? null
            return fulfillJson(
              route,
              200,
              [item, secondItem].filter((candidate) =>
                search === null || candidate.sku.toLocaleLowerCase().includes(search) ||
                candidate.name.toLocaleLowerCase().includes(search)
              ),
            )
          }
          if (path === "/inventory/items" && method === "POST") {
            return fulfillJson(route, 201, {
              ...item,
              sku: body.sku.trim().toUpperCase(),
              name: body.name.trim(),
              unitOfMeasure: (body.unitOfMeasure ?? "EA").trim().toUpperCase(),
            })
          }
          if (path === "/inventory/stock-balances" && method === "GET") {
            return fulfillJson(route, 200, balances)
          }
          if (path === "/inventory/reservations" && method === "GET") {
            const status = requestUrl.searchParams.get("status")
            return fulfillJson(
              route,
              200,
              status === null ? reservations : reservations.filter((row) => row.status === status),
            )
          }
          if (path === "/inventory/reservations" && method === "POST") {
            reserveBody = body
            const created: StockReservation = {
              id: reservationId,
              tenantId,
              warehouseId: body.warehouseId,
              itemId: body.itemId,
              quantity: body.quantity,
              idempotencyKey: body.idempotencyKey ?? null,
              status: "active",
            }
            reservations = [created, ...reservations.filter((row) => row.id !== created.id)]
            balances = balances.map((row) => ({ ...row, reserved: "3" }))
            return fulfillJson(route, 201, created)
          }
          if (path === `/inventory/reservations/${reservationId}/release` && method === "POST") {
            reservations = reservations.map((row) =>
              row.id === reservationId ? { ...row, status: "released" } : row
            )
            return fulfillJson(route, 200, reservations.find((row) => row.id === reservationId))
          }
          if (
            path === `/inventory/reservations/${secondReservationId}/fulfill` && method === "POST"
          ) {
            reservations = reservations.map((row) =>
              row.id === secondReservationId ? { ...row, status: "fulfilled" } : row
            )
            return fulfillJson(
              route,
              200,
              reservations.find((row) => row.id === secondReservationId),
            )
          }
          if (path === "/inventory/transfers" && method === "GET") {
            return fulfillJson(route, 200, transfers)
          }
          if (path === "/inventory/transfers" && method === "POST") {
            transferBody = body
            transfers = [draftTransfer]
            return fulfillJson(route, 201, draftTransfer)
          }
          if (path === `/inventory/transfers/${transferId}/confirm` && method === "POST") {
            const confirmed: StockTransfer = {
              ...draftTransfer,
              status: "confirmed",
              confirmedAt: "2026-09-13T12:00:00.000Z",
            }
            transfers = [confirmed]
            return fulfillJson(route, 200, confirmed)
          }
          if (path === `/inventory/transfers/${transferId}/complete` && method === "POST") {
            const completed: StockTransfer = {
              ...draftTransfer,
              status: "completed",
              confirmedAt: "2026-09-13T12:00:00.000Z",
              completedAt: "2026-09-13T12:01:00.000Z",
            }
            transfers = [completed]
            return fulfillJson(route, 200, completed)
          }
          if (path === "/inventory/movements" && method === "GET") {
            return fulfillJson(route, 200, movements)
          }
          if (path === "/inventory/receipts" && method === "POST") {
            receiveBody = body
            balances = balances.map((row) => ({ ...row, onHand: "11" }))
            const receiptBalance = balances[0]!
            movements = [{
              id: movementId,
              tenantId,
              warehouseId,
              itemId,
              quantity: "1",
              kind: "receipt",
              referenceId: null,
              unitOfMeasure: "EA",
              reason: null,
              idempotencyKey: null,
            }]
            return fulfillJson(route, 200, receiptBalance)
          }
          if (path === "/inventory/adjustments" && method === "POST") {
            adjustmentBody = body
            movements = [{
              id: correctionId,
              tenantId,
              warehouseId,
              itemId,
              quantity: body.adjustment,
              kind: "issue",
              referenceId: null,
              unitOfMeasure: body.unitOfMeasure,
              reason: body.reason,
              idempotencyKey: body.idempotencyKey,
            }]
            return fulfillJson(route, 200, {
              id: correctionId,
              tenantId,
              warehouseId,
              itemId,
              adjustment: body.adjustment,
              unitOfMeasure: body.unitOfMeasure,
              reason: body.reason,
              idempotencyKey: body.idempotencyKey,
            })
          }
          return fulfillJson(route, 404, { _tag: "ApiNotFound", code: "not_found" })
        })

        await connectAndOpenInventory(page, url)
        await page.getByRole("cell", { name: warehouseId, exact: true }).first().waitFor({
          timeout: 5_000,
        })
        assert.isTrue(requests.some((request) =>
          request.path === "/inventory/stock-balances" && request.method === "GET"
        ))
        assert.equal(
          requests.find((request) =>
            request.path.startsWith("/inventory")
          )?.body,
          undefined,
        )

        const initialA11y = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()
        assert.deepEqual(initialA11y.violations, [])

        await page.getByRole("button", { name: "Create warehouse", exact: true }).click()
        const warehouseDialog = page.getByRole("dialog", { name: "Create warehouse" })
        await warehouseDialog.getByRole("textbox", { name: "Legal entity ID", exact: true }).fill(
          legalEntityId,
        )
        await warehouseDialog.getByRole("textbox", { name: "Warehouse name", exact: true }).fill(
          "New warehouse",
        )
        await warehouseDialog.getByRole("button", { name: "Create warehouse", exact: true }).click()
        await warehouseDialog.waitFor({ state: "hidden" })

        await page.getByRole("button", { name: "Create item", exact: true }).click()
        const itemDialog = page.getByRole("dialog", { name: "Create item" })
        await itemDialog.getByRole("textbox", { name: "SKU", exact: true }).fill("widget-3")
        await itemDialog.getByRole("textbox", { name: "Item name", exact: true }).fill(
          "Third widget",
        )
        await itemDialog.getByRole("button", { name: "Create item", exact: true }).click()
        await itemDialog.waitFor({ state: "hidden" })

        await page.getByRole("button", { name: "Receive stock", exact: true }).click()
        const receiveDialog = page.getByRole("dialog", { name: "Receive stock" })
        await receiveDialog.getByRole("combobox", { name: "Warehouse", exact: true }).selectOption(
          warehouseId,
        )
        await receiveDialog.getByRole("combobox", { name: "Item", exact: true }).selectOption(
          itemId,
        )
        await receiveDialog.getByRole("textbox", { name: "Quantity", exact: true }).fill("1")
        await receiveDialog.getByRole("button", { name: "Receive stock", exact: true }).click()
        await receiveDialog.waitFor({ state: "hidden" })

        await page.getByRole("button", { name: "Adjust stock", exact: true }).click()
        const adjustDialog = page.getByRole("dialog", { name: "Adjust stock" })
        await adjustDialog.getByRole("combobox", { name: "Warehouse", exact: true }).selectOption(
          warehouseId,
        )
        await adjustDialog.getByRole("combobox", { name: "Item", exact: true }).selectOption(itemId)
        await adjustDialog.getByRole("textbox", { name: "Signed adjustment", exact: true }).fill(
          "-1",
        )
        await adjustDialog.getByRole("textbox", { name: "Reason", exact: true }).fill(
          "Cycle count correction",
        )
        await adjustDialog.getByRole("button", { name: "Post correction", exact: true }).click()
        await adjustDialog.waitFor({ state: "hidden" })

        await page.getByRole("button", { name: "Reserve stock", exact: true }).click()
        const reserveDialog = page.getByRole("dialog", { name: "Reserve stock" })
        await reserveDialog.getByRole("combobox", { name: "Warehouse", exact: true }).selectOption(
          warehouseId,
        )
        await reserveDialog.getByRole("combobox", { name: "Item", exact: true }).selectOption(
          itemId,
        )
        await reserveDialog.getByRole("textbox", { name: "Quantity", exact: true }).fill("1")
        await reserveDialog.getByRole("button", { name: "Reserve stock", exact: true }).click()
        await reserveDialog.waitFor({ state: "hidden" })

        await page.getByRole("button", { name: "Create transfer", exact: true }).click()
        const transferDialog = page.getByRole("dialog", { name: "Create stock transfer" })
        await transferDialog.getByRole("combobox", { name: "Source warehouse", exact: true })
          .selectOption(warehouseId)
        await transferDialog.getByRole("combobox", { name: "Destination warehouse", exact: true })
          .selectOption(destinationWarehouseId)
        await transferDialog.getByRole("combobox", { name: "Item", exact: true }).selectOption(
          itemId,
        )
        await transferDialog.getByRole("textbox", { name: "Quantity", exact: true }).fill("2")
        await transferDialog.getByRole("button", { name: "Create transfer", exact: true }).click()
        await transferDialog.waitFor({ state: "hidden" })

        await page.getByRole("button", { name: "Confirm transfer", exact: true }).first().click()
        const confirmDialog = page.getByRole("dialog", { name: "Confirm transfer" })
        await confirmDialog.getByRole("button", { name: "Confirm transfer", exact: true }).click()
        await confirmDialog.waitFor({ state: "hidden" })
        await page.getByText("confirmed", { exact: true }).first().waitFor()

        await page.getByRole("button", { name: "Complete transfer", exact: true }).first().click()
        const completeDialog = page.getByRole("dialog", { name: "Complete transfer" })
        await completeDialog.getByRole("button", { name: "Complete transfer", exact: true }).click()
        await completeDialog.waitFor({ state: "hidden" })
        await page.getByText("completed", { exact: true }).first().waitFor()

        await page.getByRole("button", { name: "Release reservation", exact: true }).first().click()
        const releaseDialog = page.getByRole("dialog", { name: "Release reservation" })
        await releaseDialog.getByRole("button", { name: "Release reservation", exact: true })
          .click()
        await releaseDialog.waitFor({ state: "hidden" })

        await page.getByRole("button", { name: "Fulfill reservation", exact: true }).first().click()
        const fulfillDialog = page.getByRole("dialog", { name: "Fulfill reservation" })
        await fulfillDialog.getByRole("button", { name: "Fulfill reservation", exact: true })
          .click()
        await fulfillDialog.waitFor({ state: "hidden" })

        assert.deepEqual(receiveBody, { warehouseId, itemId, quantity: "1" })
        assert.equal((adjustmentBody as Record<string, string>).adjustment, "-1")
        assert.equal((adjustmentBody as Record<string, string>).reason, "Cycle count correction")
        assert.equal((reserveBody as Record<string, string>).quantity, "1")
        assert.deepEqual(transferBody, {
          sourceWarehouseId: warehouseId,
          destinationWarehouseId: destinationWarehouseId,
          lines: [{ itemId, quantity: "2" }],
        })
        assert.isTrue(
          requests.some((request) => request.path === `/inventory/transfers/${transferId}/confirm`),
        )
        assert.isTrue(
          requests.some((request) =>
            request.path === `/inventory/transfers/${transferId}/complete`
          ),
        )
        assert.deepEqual(errors, [])
        const finalA11y = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()
        assert.deepEqual(finalA11y.violations, [])
      })
    }),
  { timeout: 120_000 },
)

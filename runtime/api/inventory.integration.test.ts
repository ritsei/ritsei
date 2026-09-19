import { assert, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest"
import * as Path from "effect/Path"
import { Etag, HttpPlatform } from "effect/unstable/http"
import * as HttpApiMiddleware from "effect/unstable/httpapi/HttpApiMiddleware"
import * as HttpApiTest from "effect/unstable/httpapi/HttpApiTest"

import { BearerAuth, CurrentPrincipal, RitseiApi } from "./api.ts"
import { InventoryHandlers } from "./handlers.ts"
import type { InventoryService as InventoryServiceContract } from "../../modules/inventory/mod.ts"
import { InventoryService } from "../../modules/inventory/mod.ts"

const tenantId = "018f1000-0000-7000-8000-000000000001"
const warehouseId = "018f1000-0000-7000-8000-000000000002"
const itemId = "018f1000-0000-7000-8000-000000000003"
const reservationId = "018f1000-0000-7000-8000-000000000004"
const transferId = "018f1000-0000-7000-8000-000000000005"
const movementId = "018f1000-0000-7000-8000-000000000006"
const destinationWarehouseId = "018f1000-0000-7000-8000-000000000007"
const legalEntityId = "018f1000-0000-7000-8000-000000000008"
const principal = { userAccountId: "inventory-api-user", sessionId: "inventory-api-session" }

const warehouse = {
  id: warehouseId,
  tenantId,
  legalEntityId,
  primaryBranchId: null,
  name: "Main",
}
const item = { id: itemId, tenantId, sku: "SKU-1", name: "Widget", unitOfMeasure: "EA" }
const balance = {
  tenantId,
  warehouseId,
  itemId,
  onHand: "10",
  reserved: "2",
  unitOfMeasure: "EA",
}
const reservation = {
  id: reservationId,
  tenantId,
  warehouseId,
  itemId,
  quantity: "2",
  idempotencyKey: "reserve-1",
  status: "active" as const,
}
const transfer = {
  id: transferId,
  tenantId,
  legalEntityId,
  sourceWarehouseId: warehouseId,
  destinationWarehouseId,
  status: "draft" as const,
  confirmedAt: null,
  completedAt: null,
  lines: [{ itemId, quantity: "1" }],
}
const movement = {
  id: movementId,
  tenantId,
  warehouseId,
  itemId,
  quantity: "10",
  kind: "receipt" as const,
  referenceId: null,
  unitOfMeasure: "EA",
  reason: null,
  idempotencyKey: null,
}

const unused = () => Effect.die(new Error("unused inventory endpoint in API integration test"))

const inventoryService: InventoryServiceContract = {
  listWarehouses: () => Effect.succeed([warehouse]),
  listItems: () => Effect.succeed([item]),
  listStockBalances: () => Effect.succeed([balance]),
  listStockReservations: () => Effect.succeed([reservation]),
  listStockTransfers: () => Effect.succeed([transfer]),
  listStockMovements: () => Effect.succeed([movement]),
  createWarehouse: unused,
  createItem: unused,
  receiveStock: unused,
  adjustStock: unused,
  reserveStock: unused,
  releaseReservation: unused,
  fulfillReservation: unused,
  createTransfer: unused,
  confirmTransfer: unused,
  completeTransfer: unused,
}

const TestHttpServices = Layer.mergeAll(
  Path.layer,
  Etag.layerWeak,
  HttpPlatform.layer,
).pipe(Layer.provideMerge(FileSystem.layerNoop({})))

it.layer(TestHttpServices)("inventory API read projections", (it) => {
  it.effect("forwards tenant and bearer context to every inventory read", () =>
    Effect.gen(function* () {
      const bearer = Layer.succeed(BearerAuth, {
        bearer: (effect) => Effect.provideService(effect, CurrentPrincipal, principal),
      })
      const bearerClient = HttpApiMiddleware.layerClient(
        BearerAuth,
        ({ request, next }) => next(HttpClientRequest.bearerToken(request, "inventory-token")),
      )
      const handlers = InventoryHandlers.pipe(
        Layer.provide(bearer),
        Layer.provide(Layer.succeed(InventoryService, inventoryService)),
      )
      const client = yield* HttpApiTest.groups(RitseiApi, ["Inventory"]).pipe(
        Effect.provide(Layer.mergeAll(handlers, bearerClient, bearer)),
      )

      assert.deepStrictEqual(
        yield* client.Inventory.listWarehouses({
          headers: { "x-tenant-id": tenantId },
          query: { legalEntityId, limit: 10 },
        }),
        [warehouse],
      )
      assert.deepStrictEqual(
        yield* client.Inventory.listItems({
          headers: { "x-tenant-id": tenantId },
          query: { search: "SKU", limit: 10 },
        }),
        [item],
      )
      assert.deepStrictEqual(
        yield* client.Inventory.listStockBalances({
          headers: { "x-tenant-id": tenantId },
          query: { warehouseId, itemId, limit: 10 },
        }),
        [balance],
      )
      assert.deepStrictEqual(
        yield* client.Inventory.listStockReservations({
          headers: { "x-tenant-id": tenantId },
          query: { status: "active", limit: 10 },
        }),
        [reservation],
      )
      assert.deepStrictEqual(
        yield* client.Inventory.listStockTransfers({
          headers: { "x-tenant-id": tenantId },
          query: { warehouseId, status: "draft", limit: 10 },
        }),
        [transfer],
      )
      assert.deepStrictEqual(
        yield* client.Inventory.listStockMovements({
          headers: { "x-tenant-id": tenantId },
          query: { warehouseId, itemId, kind: "receipt", limit: 10 },
        }),
        [movement],
      )
    }))
})

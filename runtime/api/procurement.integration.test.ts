import { assert, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest"
import * as Path from "effect/Path"
import { Etag, HttpPlatform, HttpRouter } from "effect/unstable/http"
import * as HttpApiMiddleware from "effect/unstable/httpapi/HttpApiMiddleware"
import * as HttpApiTest from "effect/unstable/httpapi/HttpApiTest"

import { BearerAuth, CurrentPrincipal, RitseiApi } from "./api.ts"
import { ProcurementHandlers } from "./handlers.ts"
import {
  CurrentConsistencyToken,
  PostgresReadYourWrites,
  type PostgresReadYourWritesService,
} from "../../foundation/mod.ts"
import {
  InventoryService,
  type InventoryService as InventoryServiceContract,
} from "../../modules/inventory/mod.ts"
import {
  ProcurementService,
  type ProcurementService as ProcurementServiceContract,
} from "../../modules/procurement/mod.ts"

const tenantId = "018f0000-0000-7000-8000-000000000001"
const supplierAccountId = "018f0000-0000-7000-8000-000000000002"
const orderId = "018f0000-0000-7000-8000-000000000003"
const lineId = "018f0000-0000-7000-8000-000000000004"
const consistencyToken = "dGVzdA.signature"
const principal = { userAccountId: "api-test-user", sessionId: "api-test-session" }

const order = {
  id: orderId,
  tenantId,
  supplierAccountId,
  status: "draft" as const,
  confirmedAt: null,
  total: "12.50",
  lines: [{
    id: lineId,
    itemId: "018f0000-0000-7000-8000-000000000005",
    quantity: "1",
    unitPrice: "12.50",
  }],
}

const unused = () => Effect.die(new Error("unused procurement endpoint in API integration test"))

const makeProcurementStub = (
  observedToken: { value?: string },
): ProcurementServiceContract => ({
  createSupplierAccount: unused,
  listSupplierAccounts: () => Effect.succeed([]),
  createPurchaseOrder: () => Effect.succeed(order),
  getPurchaseOrder: () =>
    Effect.gen(function* () {
      observedToken.value = yield* CurrentConsistencyToken
      return order
    }),
  listPurchaseOrders: () => Effect.succeed([order]),
  listPurchaseReceipts: () => Effect.succeed([]),
  confirmPurchaseOrder: unused,
  cancelPurchaseOrder: unused,
  receivePurchaseOrder: unused,
})

const inventoryService: InventoryServiceContract = {
  listWarehouses: unused,
  listItems: unused,
  listStockBalances: unused,
  listStockReservations: unused,
  listStockTransfers: unused,
  listStockMovements: unused,
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

const provideInventory = HttpRouter.middleware<{ provides: InventoryService }>()(
  (httpEffect) => Effect.provideService(httpEffect, InventoryService, inventoryService),
)

const TestHttpServices = Layer.mergeAll(
  Path.layer,
  Etag.layerWeak,
  HttpPlatform.layer,
).pipe(Layer.provideMerge(FileSystem.layerNoop({})))

it.layer(TestHttpServices)("procurement API consistency headers", (it) => {
  it.effect("captures on create and forwards the token on read", () =>
    Effect.gen(function* () {
      const observedToken: { value?: string } = {}
      let capturedTenantId: string | undefined
      const readYourWrites: PostgresReadYourWritesService = {
        capture: (captured) => {
          capturedTenantId = captured
          return Effect.succeed(consistencyToken)
        },
        wait: () => Effect.die(new Error("wait is owned by the procurement service")),
      }
      const bearer = Layer.succeed(BearerAuth, {
        bearer: (effect) => Effect.provideService(effect, CurrentPrincipal, principal),
      })
      const bearerClient = HttpApiMiddleware.layerClient(
        BearerAuth,
        ({ request, next }) => next(HttpClientRequest.bearerToken(request, "test-token")),
      )
      const handlers = ProcurementHandlers.pipe(
        Layer.provide(bearer),
        Layer.provide(provideInventory.layer),
        Layer.provide(Layer.succeed(PostgresReadYourWrites, readYourWrites)),
        Layer.provide(Layer.succeed(ProcurementService, makeProcurementStub(observedToken))),
      )
      const client = yield* HttpApiTest.groups(RitseiApi, ["Procurement"]).pipe(
        Effect.provide(Layer.mergeAll(handlers, bearerClient, bearer)),
      )

      const [created, createResponse] = yield* client.Procurement.createPurchaseOrder({
        headers: { "x-tenant-id": tenantId },
        payload: {
          supplierAccountId,
          lines: [{ itemId: order.lines[0]!.itemId, quantity: "1", unitPrice: "12.50" }],
        },
        responseMode: "decoded-and-response",
      })
      assert.deepStrictEqual(created.body, order)
      assert.strictEqual(created.headers["x-ritsei-consistency-token"], consistencyToken)
      assert.strictEqual(createResponse.status, 201)
      assert.strictEqual(createResponse.headers["x-ritsei-consistency-token"], consistencyToken)
      assert.strictEqual(capturedTenantId, tenantId)
      assert.deepStrictEqual(
        yield* client.Procurement.listSupplierAccounts({
          headers: { "x-tenant-id": tenantId },
          query: { limit: 1 },
        }),
        [],
      )
      assert.deepStrictEqual(
        yield* client.Procurement.listPurchaseOrders({
          headers: { "x-tenant-id": tenantId },
          query: { supplierAccountId, status: "draft", limit: 1 },
        }),
        [order],
      )
      assert.deepStrictEqual(
        yield* client.Procurement.listPurchaseReceipts({
          params: { id: orderId },
          headers: { "x-tenant-id": tenantId },
          query: { limit: 1 },
        }),
        [],
      )

      const read = yield* client.Procurement.getPurchaseOrder({
        params: { id: orderId },
        headers: {
          "x-tenant-id": tenantId,
          "x-ritsei-consistency-token": consistencyToken,
        },
      })
      assert.deepStrictEqual(read, order)
      assert.strictEqual(observedToken.value, consistencyToken)
    }))
})

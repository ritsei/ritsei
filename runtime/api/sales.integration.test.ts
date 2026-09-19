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
import { SalesHandlers } from "./handlers.ts"
import { SalesService, type SalesService as SalesServiceContract } from "../../modules/sales/mod.ts"

const tenantId = "018f2000-0000-7000-8000-000000000001"
const customerId = "018f2000-0000-7000-8000-000000000002"
const quotationId = "018f2000-0000-7000-8000-000000000003"
const orderId = "018f2000-0000-7000-8000-000000000004"
const itemId = "018f2000-0000-7000-8000-000000000005"
const principal = { userAccountId: "sales-api-user", sessionId: "sales-api-session" }

const customer = {
  id: customerId,
  tenantId,
  name: "Sales Customer",
  email: "sales@example.test",
}
const quotation = {
  id: quotationId,
  tenantId,
  customerId,
  status: "draft" as const,
  total: "10.00",
}
const draftOrder = {
  id: orderId,
  tenantId,
  customerId,
  quotationId,
  status: "draft" as const,
  confirmedAt: null,
  total: "10.00",
  lines: [{ itemId, quantity: "1", unitPrice: "10.00" }],
}
const confirmedOrder = {
  ...draftOrder,
  status: "confirmed" as const,
  confirmedAt: "2026-09-13T00:00:00.000Z",
}
const cancelledOrder = { ...confirmedOrder, status: "cancelled" as const }

const salesService = (observedInput: { value?: unknown }): SalesServiceContract => ({
  listCustomers: (input) =>
    Effect.sync(() => {
      observedInput.value = input
      return [customer]
    }),
  getCustomer: () => Effect.succeed(customer),
  createCustomer: () => Effect.succeed(customer),
  listQuotations: () => Effect.succeed([quotation]),
  getQuotation: () => Effect.succeed(quotation),
  createQuotation: () => Effect.succeed(quotation),
  listOrders: () => Effect.succeed([draftOrder]),
  getOrder: () => Effect.succeed(draftOrder),
  createOrder: () => Effect.succeed(draftOrder),
  confirmOrder: () => Effect.succeed(confirmedOrder),
  cancelConfirmedOrder: () => Effect.succeed(cancelledOrder),
  getConfirmedOrderTotal: () => Effect.succeed("10.00"),
})

const TestHttpServices = Layer.mergeAll(
  Path.layer,
  Etag.layerWeak,
  HttpPlatform.layer,
).pipe(Layer.provideMerge(FileSystem.layerNoop({})))

it.layer(TestHttpServices)("sales API contracts", (it) => {
  it.effect("forwards tenant and bearer context across Sales reads and commands", () =>
    Effect.gen(function* () {
      const observedInput: { value?: unknown } = {}
      const bearer = Layer.succeed(BearerAuth, {
        bearer: (effect) => Effect.provideService(effect, CurrentPrincipal, principal),
      })
      const bearerClient = HttpApiMiddleware.layerClient(
        BearerAuth,
        ({ request, next }) => next(HttpClientRequest.bearerToken(request, "sales-token")),
      )
      const handlers = SalesHandlers.pipe(
        Layer.provide(bearer),
        Layer.provide(Layer.succeed(SalesService, salesService(observedInput))),
      )
      const client = yield* HttpApiTest.groups(RitseiApi, ["Sales"]).pipe(
        Effect.provide(Layer.mergeAll(handlers, bearerClient, bearer)),
      )
      const headers = { "x-tenant-id": tenantId }

      assert.deepStrictEqual(
        yield* client.Sales.listCustomers({ headers, query: { search: "sales", limit: 10 } }),
        [customer],
      )
      const captured = observedInput.value as { tenantId: string; principal: typeof principal }
      assert.strictEqual(captured.tenantId, tenantId)
      assert.deepStrictEqual(captured.principal, principal)
      assert.deepStrictEqual(
        yield* client.Sales.getCustomer({ params: { id: customerId }, headers }),
        customer,
      )
      assert.deepStrictEqual(
        yield* client.Sales.listQuotations({
          headers,
          query: { customerId, status: "draft", limit: 10 },
        }),
        [quotation],
      )
      assert.deepStrictEqual(
        yield* client.Sales.getQuotation({ params: { id: quotationId }, headers }),
        quotation,
      )
      assert.deepStrictEqual(
        yield* client.Sales.listOrders({
          headers,
          query: { customerId, status: "draft", limit: 10 },
        }),
        [draftOrder],
      )
      assert.deepStrictEqual(
        yield* client.Sales.getOrder({ params: { id: orderId }, headers }),
        draftOrder,
      )
      assert.deepStrictEqual(
        yield* client.Sales.createCustomer({
          headers,
          payload: { name: customer.name, email: customer.email },
        }),
        customer,
      )
      assert.deepStrictEqual(
        yield* client.Sales.createQuotation({
          headers,
          payload: { customerId, total: quotation.total },
        }),
        quotation,
      )
      assert.deepStrictEqual(
        yield* client.Sales.createOrder({
          headers,
          payload: { customerId, quotationId, lines: draftOrder.lines },
        }),
        draftOrder,
      )
      assert.deepStrictEqual(
        yield* client.Sales.confirmOrder({
          params: { id: orderId },
          headers,
          payload: {
            commandId: "sales-command",
            correlationId: "sales-correlation",
            causationId: null,
            idempotencyKey: "sales-confirmation",
          },
        }),
        confirmedOrder,
      )
      assert.deepStrictEqual(
        yield* client.Sales.cancelOrder({ params: { id: orderId }, headers }),
        cancelledOrder,
      )
    }))
})

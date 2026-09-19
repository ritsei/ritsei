import { assert, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as HttpRouter from "effect/unstable/http/HttpRouter"
import * as HttpServerRequest from "effect/unstable/http/HttpServerRequest"
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse"
import * as OpenApi from "effect/unstable/httpapi/OpenApi"
import * as Schema from "effect/Schema"

import { JournalLine } from "../../modules/accounting/mod.ts"
import { RitseiApi } from "./api.ts"
import {
  MAX_REQUEST_BODY_BYTES,
  parseContentLength,
  requestBodyLimitLayer,
} from "./request-limits.ts"

it.effect("accepts the exact large amount at the API journal boundary", () =>
  Effect.sync(() => {
    assert.isTrue(
      Schema.is(JournalLine)({
        accountId: "00000000-0000-4000-8000-000000000001",
        debit: "500000000000000.00",
        credit: "0.00",
      }),
    )
    assert.isFalse(
      Schema.is(JournalLine)({
        accountId: "00000000-0000-4000-8000-000000000001",
        debit: "1000000000000000000.00",
        credit: "0.00",
      }),
    )
  }))

it("parses request body size declarations fail-closed", () => {
  assert.strictEqual(parseContentLength("12"), 12)
  assert.strictEqual(parseContentLength(" 12 "), 12)
  assert.strictEqual(parseContentLength("12x"), "invalid")
  assert.strictEqual(parseContentLength(String(Number.MAX_SAFE_INTEGER)), Number.MAX_SAFE_INTEGER)
  assert.strictEqual(parseContentLength("9".repeat(400)), MAX_REQUEST_BODY_BYTES + 1)
})

it.effect("rejects streamed request bodies over the transport limit", () =>
  Effect.acquireUseRelease(
    Effect.sync(() =>
      HttpRouter.toWebHandler(
        Layer.mergeAll(
          HttpRouter.add(
            "POST",
            "/echo",
            Effect.flatMap(HttpServerRequest.HttpServerRequest, (request) =>
              Effect.map(request.text, HttpServerResponse.text)),
          ),
          requestBodyLimitLayer,
        ),
        { disableLogger: true },
      )
    ),
    ({ handler }) =>
      Effect.gen(function* () {
        const response = yield* Effect.promise(() =>
          handler(
            new Request("http://localhost/echo", {
              method: "POST",
              body: "x".repeat(MAX_REQUEST_BODY_BYTES + 1),
            }),
          )
        )
        assert.strictEqual(response.status, 413)
        assert.deepStrictEqual(yield* Effect.promise(() => response.json()), {
          code: "request_body_too_large",
        })
      }),
    ({ dispose }) => Effect.promise(dispose),
  ))

it.effect("rejects invalid body length declarations before route decoding", () =>
  Effect.acquireUseRelease(
    Effect.sync(() =>
      HttpRouter.toWebHandler(
        Layer.mergeAll(
          HttpRouter.add(
            "POST",
            "/echo",
            Effect.flatMap(HttpServerRequest.HttpServerRequest, (request) =>
              Effect.map(request.text, HttpServerResponse.text)),
          ),
          requestBodyLimitLayer,
        ),
        { disableLogger: true },
      )
    ),
    ({ handler }) =>
      Effect.gen(function* () {
        const invalid = yield* Effect.promise(() =>
          handler(
            new Request("http://localhost/echo", {
              method: "POST",
              headers: { "content-length": "12x" },
              body: "x",
            }),
          )
        )
        assert.strictEqual(invalid.status, 400)
        assert.deepStrictEqual(yield* Effect.promise(() => invalid.json()), {
          code: "invalid_content_length",
        })

        const oversized = yield* Effect.promise(() =>
          handler(
            new Request("http://localhost/echo", {
              method: "POST",
              headers: { "content-length": String(MAX_REQUEST_BODY_BYTES + 1) },
              body: "x",
            }),
          )
        )
        assert.strictEqual(oversized.status, 413)
        assert.deepStrictEqual(yield* Effect.promise(() => oversized.json()), {
          code: "request_body_too_large",
        })
      }),
    ({ dispose }) => Effect.promise(dispose),
  ))

it.effect("rejects malformed UTF-8 before route decoding", () =>
  Effect.acquireUseRelease(
    Effect.sync(() =>
      HttpRouter.toWebHandler(
        Layer.mergeAll(
          HttpRouter.add(
            "POST",
            "/echo",
            Effect.flatMap(
              HttpServerRequest.HttpServerRequest,
              (request) => Effect.map(request.text, HttpServerResponse.text),
            ),
          ),
          requestBodyLimitLayer,
        ),
        { disableLogger: true },
      )
    ),
    ({ handler }) =>
      Effect.gen(function* () {
        const response = yield* Effect.promise(() =>
          handler(
            new Request("http://localhost/echo", {
              method: "POST",
              body: new Uint8Array([0xff]),
            }),
          )
        )
        assert.strictEqual(response.status, 400)
        assert.deepStrictEqual(yield* Effect.promise(() => response.json()), {
          code: "invalid_utf8",
        })
      }),
    ({ dispose }) => Effect.promise(dispose),
  ))

it.effect("derives routing and OpenAPI from the Effect HttpApi contract", () =>
  Effect.sync(() => {
    const specification = OpenApi.fromApi(RitseiApi)

    assert.strictEqual(specification.info.title, "RITSEI API")
    assert.ok(specification.paths["/health"]?.get)
    assert.ok(specification.paths["/auth/config"]?.get)
    assert.ok(specification.paths["/auth/dev/login"]?.post)
    assert.ok(specification.paths["/auth/session"]?.get)
    assert.ok(specification.paths["/auth/logout"]?.post)
    assert.ok(specification.paths["/user-accounts"]?.post)
    assert.ok(specification.paths["/user-accounts/{id}"]?.get)
    assert.ok(specification.paths["/user-accounts/{id}"]?.patch)
    assert.ok(specification.paths["/parties"]?.get)
    assert.ok(specification.paths["/parties"]?.post)
    assert.ok(specification.paths["/parties/{id}"]?.get)
    assert.ok(specification.paths["/parties/{id}/legal-entity"]?.post)
    assert.ok(specification.paths["/legal-entities/{id}/branches"]?.post)
    assert.ok(specification.paths["/parties/{id}/roles"]?.post)
    assert.ok(specification.paths["/parties/{id}/identifiers"]?.post)
    assert.ok(specification.paths["/parties/{id}/relationships"]?.post)
    assert.ok(specification.paths["/parties/{id}/representations"]?.post)
    assert.ok(specification.paths["/party-representations/{id}"]?.patch)
    assert.ok(specification.paths["/sales/customers"]?.get)
    assert.ok(specification.paths["/sales/customers"]?.post)
    assert.ok(specification.paths["/sales/customers/{id}"]?.get)
    assert.ok(specification.paths["/sales/quotations"]?.get)
    assert.ok(specification.paths["/sales/quotations"]?.post)
    assert.ok(specification.paths["/sales/quotations/{id}"]?.get)
    assert.ok(specification.paths["/sales/orders"]?.get)
    assert.ok(specification.paths["/sales/orders"]?.post)
    assert.ok(specification.paths["/sales/orders/{id}"]?.get)
    assert.ok(specification.paths["/sales/orders/{id}/confirm"]?.post)
    assert.ok(specification.paths["/sales/orders/{id}/cancel"]?.post)
    assert.ok(specification.paths["/procurement/supplier-accounts"]?.get)
    assert.ok(specification.paths["/procurement/supplier-accounts"]?.post)
    assert.ok(specification.paths["/procurement/purchase-orders"]?.get)
    assert.ok(specification.paths["/procurement/purchase-orders"]?.post)
    assert.ok(specification.paths["/procurement/purchase-orders/{id}"]?.get)
    assert.ok(specification.paths["/parties/{id}/related-paths"]?.get)
    assert.ok(specification.paths["/procurement/purchase-orders/{id}/confirm"]?.post)
    assert.ok(specification.paths["/procurement/purchase-orders/{id}/cancel"]?.post)
    assert.ok(specification.paths["/procurement/purchase-orders/{id}/receipts"]?.get)
    assert.ok(specification.paths["/procurement/purchase-orders/{id}/receipts"]?.post)
    assert.ok(specification.paths["/inventory/warehouses"]?.get)
    assert.ok(specification.paths["/inventory/warehouses"]?.post)
    assert.ok(specification.paths["/inventory/items"]?.get)
    assert.ok(specification.paths["/inventory/items"]?.post)
    assert.ok(specification.paths["/inventory/adjustments"]?.post)
    assert.ok(specification.paths["/inventory/stock-balances"]?.get)
    assert.ok(specification.paths["/inventory/reservations"]?.get)
    assert.ok(specification.paths["/inventory/reservations"]?.post)
    assert.ok(specification.paths["/inventory/reservations/{id}/release"]?.post)
    assert.ok(specification.paths["/inventory/reservations/{id}/fulfill"]?.post)
    assert.ok(specification.paths["/inventory/transfers"]?.get)
    assert.ok(specification.paths["/inventory/transfers"]?.post)
    assert.ok(specification.paths["/inventory/movements"]?.get)
    assert.ok(specification.paths["/inventory/transfers/{id}/confirm"]?.post)
    assert.ok(specification.paths["/inventory/transfers/{id}/complete"]?.post)
    assert.ok(specification.paths["/accounting/configurations"]?.get)
    assert.ok(specification.paths["/accounting/accounts"]?.get)
    assert.ok(specification.paths["/accounting/periods"]?.get)
    assert.ok(specification.paths["/accounting/revenue-posting-profiles"]?.get)
    assert.ok(specification.paths["/accounting/journals"]?.get)
    assert.ok(specification.paths["/accounting/legal-entities/{id}/configuration"]?.post)
    assert.ok(specification.paths["/accounting/revenue-posting-profiles"]?.post)
    assert.ok(specification.paths["/accounting/periods"]?.post)
    assert.ok(specification.paths["/accounting/periods/{id}/close"]?.post)
    assert.ok(specification.paths["/accounting/financial-staging-evidence"]?.post)
    assert.ok(specification.paths["/accounting/financial-staging-evidence"]?.get)
    assert.ok(specification.paths["/accounting/journals"]?.post)
    assert.ok(specification.paths["/process/order-confirmations"]?.post)
    assert.ok(specification.paths["/process/order-cancellations"]?.post?.responses?.["201"])
    assert.ok(specification.paths["/process/order-fulfillments"]?.post?.responses?.["201"])
    assert.ok(specification.paths["/process/order-confirmations/recover"]?.post)
    assert.ok(specification.paths["/process/order-confirmations/manual-recovery"]?.post)
    assert.ok(specification.components.securitySchemes.bearer)
    assert.ok(specification.paths["/user-accounts"]?.get?.responses?.["503"])
    assert.ok(specification.paths["/tenant-memberships"]?.get)
    assert.ok(specification.paths["/tenant-memberships"]?.post)
    assert.ok(specification.paths["/tenant-memberships/{userAccountId}"]?.get)
    assert.ok(specification.paths["/tenant-memberships/{userAccountId}/capabilities"]?.get)
    assert.ok(specification.paths["/capability-definitions"]?.get)
    assert.ok(specification.paths["/tenant-memberships/{userAccountId}/suspend"]?.post)
    assert.ok(specification.paths["/tenant-memberships/{userAccountId}/activate"]?.post)
    assert.ok(specification.paths["/tenant-memberships/{userAccountId}"]?.delete)
  }))

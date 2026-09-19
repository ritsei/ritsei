import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import {
  ConfirmOrderInput,
  CreateCustomerInput,
  CreateOrderInput,
  CreateQuotationInput,
  Customer,
  GetCustomerInput,
  GetOrderInput,
  GetQuotationInput,
  ListCustomersInput,
  ListOrdersInput,
  ListQuotationsInput,
  Quotation,
  SalesOrder,
  salesRoutes,
} from "../../shared/contracts/generated/sales.ts"
import {
  BrowserConnection,
  decodeInput,
  decodeResponse,
  definedFields,
  mutationRequest,
  querySuffix,
  RequestFailure,
  requestJson,
  responseListMatches,
  responseMatches,
  routeWithId,
} from "../../shared/api.ts"

const Uuid = Schema.String.check(Schema.isUUID())
const CustomerList = Schema.Array(Customer).check(Schema.isMaxLength(200))
const QuotationList = Schema.Array(Quotation).check(Schema.isMaxLength(200))
const SalesOrderList = Schema.Array(SalesOrder).check(Schema.isMaxLength(200))

export const listCustomers = Effect.fn("Frontend.Sales.listCustomers")(
  function* (input: unknown = {}) {
    const decoded = yield* decodeInput(ListCustomersInput, input)
    const body = yield* requestJson(`${salesRoutes.listCustomers}${querySuffix(decoded)}`)
    const customers = yield* decodeResponse(CustomerList, body, "invalid-response")
    const connection = yield* BrowserConnection
    if (!responseListMatches(customers, { tenantId: connection.tenantId })) {
      return yield* Effect.fail(new RequestFailure({ kind: "invalid-response" }))
    }
    return customers
  },
)

export const getCustomer = Effect.fn("Frontend.Sales.getCustomer")(function* (id: unknown) {
  const decoded = yield* decodeInput(GetCustomerInput, { customerId: id })
  const body = yield* requestJson(routeWithId(salesRoutes.getCustomer, decoded.customerId))
  const customer = yield* decodeResponse(Customer, body, "invalid-response")
  const connection = yield* BrowserConnection
  if (
    !responseMatches(customer, {
      id: decoded.customerId,
      tenantId: connection.tenantId,
    })
  ) {
    return yield* Effect.fail(new RequestFailure({ kind: "invalid-response" }))
  }
  return customer
})

export const createCustomer = Effect.fn("Frontend.Sales.createCustomer")(
  function* (input: unknown) {
    const decoded = yield* decodeInput(CreateCustomerInput, input)
    const connection = yield* BrowserConnection
    const body = yield* mutationRequest(salesRoutes.createCustomer, decoded)
    const customer = yield* decodeResponse(Customer, body, "unknown-outcome")
    if (
      !responseMatches(customer, {
        tenantId: connection.tenantId,
        name: decoded.name.trim(),
        email: decoded.email.trim().toLowerCase(),
      })
    ) {
      return yield* Effect.fail(new RequestFailure({ kind: "unknown-outcome" }))
    }
    return customer
  },
)

export const listQuotations = Effect.fn("Frontend.Sales.listQuotations")(
  function* (input: unknown = {}) {
    const decoded = yield* decodeInput(ListQuotationsInput, input)
    const body = yield* requestJson(`${salesRoutes.listQuotations}${querySuffix(decoded)}`)
    const quotations = yield* decodeResponse(QuotationList, body, "invalid-response")
    const connection = yield* BrowserConnection
    if (
      !responseListMatches(quotations, {
        tenantId: connection.tenantId,
        ...definedFields({ customerId: decoded.customerId, status: decoded.status }),
      })
    ) {
      return yield* Effect.fail(new RequestFailure({ kind: "invalid-response" }))
    }
    return quotations
  },
)

export const getQuotation = Effect.fn("Frontend.Sales.getQuotation")(function* (id: unknown) {
  const decoded = yield* decodeInput(GetQuotationInput, { quotationId: id })
  const body = yield* requestJson(routeWithId(salesRoutes.getQuotation, decoded.quotationId))
  const quotation = yield* decodeResponse(Quotation, body, "invalid-response")
  const connection = yield* BrowserConnection
  if (
    !responseMatches(quotation, {
      id: decoded.quotationId,
      tenantId: connection.tenantId,
    })
  ) {
    return yield* Effect.fail(new RequestFailure({ kind: "invalid-response" }))
  }
  return quotation
})

export const createQuotation = Effect.fn("Frontend.Sales.createQuotation")(
  function* (input: unknown) {
    const decoded = yield* decodeInput(CreateQuotationInput, input)
    const connection = yield* BrowserConnection
    const body = yield* mutationRequest(salesRoutes.createQuotation, decoded)
    const quotation = yield* decodeResponse(Quotation, body, "unknown-outcome")
    if (
      !responseMatches(quotation, {
        tenantId: connection.tenantId,
        customerId: decoded.customerId,
        status: "draft",
        total: decoded.total,
      })
    ) {
      return yield* Effect.fail(new RequestFailure({ kind: "unknown-outcome" }))
    }
    return quotation
  },
)

export const listOrders = Effect.fn("Frontend.Sales.listOrders")(
  function* (input: unknown = {}) {
    const decoded = yield* decodeInput(ListOrdersInput, input)
    const body = yield* requestJson(`${salesRoutes.listOrders}${querySuffix(decoded)}`)
    const orders = yield* decodeResponse(SalesOrderList, body, "invalid-response")
    const connection = yield* BrowserConnection
    if (
      !responseListMatches(orders, {
        tenantId: connection.tenantId,
        ...definedFields({ customerId: decoded.customerId, status: decoded.status }),
      })
    ) {
      return yield* Effect.fail(new RequestFailure({ kind: "invalid-response" }))
    }
    return orders
  },
)

export const getOrder = Effect.fn("Frontend.Sales.getOrder")(function* (id: unknown) {
  const decoded = yield* decodeInput(GetOrderInput, { orderId: id })
  const body = yield* requestJson(routeWithId(salesRoutes.getOrder, decoded.orderId))
  const order = yield* decodeResponse(SalesOrder, body, "invalid-response")
  const connection = yield* BrowserConnection
  if (
    !responseMatches(order, {
      id: decoded.orderId,
      tenantId: connection.tenantId,
    })
  ) {
    return yield* Effect.fail(new RequestFailure({ kind: "invalid-response" }))
  }
  return order
})

export const createOrder = Effect.fn("Frontend.Sales.createOrder")(function* (input: unknown) {
  const decoded = yield* decodeInput(CreateOrderInput, input)
  const connection = yield* BrowserConnection
  const body = yield* mutationRequest(salesRoutes.createOrder, decoded)
  const order = yield* decodeResponse(SalesOrder, body, "unknown-outcome")
  if (
    !responseMatches(order, {
      tenantId: connection.tenantId,
      customerId: decoded.customerId,
      quotationId: decoded.quotationId ?? null,
      status: "draft",
    })
  ) {
    return yield* Effect.fail(new RequestFailure({ kind: "unknown-outcome" }))
  }
  return order
})

// Fallow: confirm and cancel are paired lifecycle adapters with the same verified mutation shape.
// fallow-ignore-next-line code-duplication
export const confirmOrder = Effect.fn("Frontend.Sales.confirmOrder")(
  function* (id: unknown, input: unknown) {
    const decodedId = yield* decodeInput(Uuid, id)
    const decoded = yield* decodeInput(ConfirmOrderInput, input)
    const connection = yield* BrowserConnection
    const body = yield* mutationRequest(
      routeWithId(salesRoutes.confirmOrder, decodedId),
      decoded,
    )
    const order = yield* decodeResponse(SalesOrder, body, "unknown-outcome")
    if (
      !responseMatches(order, {
        id: decodedId,
        tenantId: connection.tenantId,
        status: "confirmed",
      })
    ) {
      return yield* Effect.fail(new RequestFailure({ kind: "unknown-outcome" }))
    }
    return order
  },
)

// Fallow: confirm and cancel are paired lifecycle adapters with the same verified mutation shape.
// fallow-ignore-next-line code-duplication
export const cancelOrder = Effect.fn("Frontend.Sales.cancelOrder")(function* (id: unknown) {
  const decodedId = yield* decodeInput(Uuid, id)
  const connection = yield* BrowserConnection
  const body = yield* mutationRequest(routeWithId(salesRoutes.cancelOrder, decodedId))
  const order = yield* decodeResponse(SalesOrder, body, "unknown-outcome")
  if (
    !responseMatches(order, {
      id: decodedId,
      tenantId: connection.tenantId,
      status: "cancelled",
    })
  ) {
    return yield* Effect.fail(new RequestFailure({ kind: "unknown-outcome" }))
  }
  return order
})

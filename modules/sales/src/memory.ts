import * as Effect from "effect/Effect"

import { DatabaseFailure, uuidv7 } from "../../../foundation/mod.ts"
import { EventIdempotencyConflict } from "../../messaging/mod.ts"
import type {
  CancelConfirmedOrderCommand,
  ConfirmOrderCommand,
  CreateCustomerCommand,
  CreateOrderCommand,
  CreateQuotationCommand,
  Customer,
  GetConfirmedOrderTotalCommand,
  GetCustomerCommand,
  GetOrderCommand,
  GetQuotationCommand,
  ListCustomersCommand,
  ListOrdersCommand,
  ListQuotationsCommand,
  Quotation,
  SalesOrder,
} from "./contract.ts"
import {
  CustomerAlreadyExists,
  CustomerNotFound,
  QuotationCustomerMismatch,
  QuotationNotFound,
  SalesOrderConfirmationIdempotencyConflict,
} from "./errors.ts"
import type { SalesStore } from "./store.ts"
import { deriveTotal } from "./store.ts"

export const makeSalesMemoryStore = (): SalesStore => {
  const customers = new Map<string, Customer>()
  const quotations = new Map<string, Quotation>()
  const orders = new Map<string, SalesOrder>()
  const keys = new Map<string, string>()
  const id = uuidv7
  const listCustomers = Effect.fn("SalesStore.memory.listCustomers")(
    (input: ListCustomersCommand) =>
      Effect.sync(() => {
        const search = input.search?.toLowerCase()
        return Array.from(customers.values())
          .filter((customer) => customer.tenantId === input.tenantId)
          .filter((customer) =>
            search === undefined || customer.name.toLowerCase().includes(search) ||
            customer.email.includes(search)
          )
          .sort((left, right) =>
            left.name.localeCompare(right.name) || left.id.localeCompare(right.id)
          )
          .slice(0, input.limit ?? 200)
      }),
  )
  const getCustomer = Effect.fn("SalesStore.memory.getCustomer")(
    (input: GetCustomerCommand) =>
      Effect.sync(() => {
        const customer = customers.get(input.customerId)
        return customer?.tenantId === input.tenantId ? customer : undefined
      }),
  )
  const listQuotations = Effect.fn("SalesStore.memory.listQuotations")(
    (input: ListQuotationsCommand) =>
      Effect.sync(() =>
        Array.from(quotations.values())
          .filter((quotation) => quotation.tenantId === input.tenantId)
          .filter((quotation) =>
            input.customerId === undefined || quotation.customerId === input.customerId
          )
          .filter((quotation) => input.status === undefined || quotation.status === input.status)
          .sort((left, right) => left.id.localeCompare(right.id))
          .slice(0, input.limit ?? 200)
      ),
  )
  const getQuotation = Effect.fn("SalesStore.memory.getQuotation")(
    (input: GetQuotationCommand) =>
      Effect.sync(() => {
        const quotation = quotations.get(input.quotationId)
        return quotation?.tenantId === input.tenantId ? quotation : undefined
      }),
  )
  const listOrders = Effect.fn("SalesStore.memory.listOrders")(
    (input: ListOrdersCommand) =>
      Effect.sync(() =>
        Array.from(orders.values())
          .filter((order) => order.tenantId === input.tenantId)
          .filter((order) =>
            input.customerId === undefined || order.customerId === input.customerId
          )
          .filter((order) => input.status === undefined || order.status === input.status)
          .sort((left, right) => left.id.localeCompare(right.id))
          .slice(0, input.limit ?? 200)
      ),
  )
  const getOrder = Effect.fn("SalesStore.memory.getOrder")(
    (input: GetOrderCommand) =>
      Effect.sync(() => {
        const order = orders.get(input.orderId)
        return order?.tenantId === input.tenantId ? order : undefined
      }),
  )
  const createCustomer = Effect.fn("SalesStore.memory.createCustomer")(
    function* (input: CreateCustomerCommand) {
      const email = input.email.trim().toLowerCase()
      if ([...customers.values()].some((x) => x.tenantId === input.tenantId && x.email === email)) {
        return yield* Effect.fail(new CustomerAlreadyExists({ tenantId: input.tenantId, email }))
      }
      const customer = { id: id(), tenantId: input.tenantId, name: input.name.trim(), email }
      customers.set(customer.id, customer)
      return customer
    },
  )
  const createQuotation = Effect.fn("SalesStore.memory.createQuotation")(
    function* (input: CreateQuotationCommand) {
      if (customers.get(input.customerId)?.tenantId !== input.tenantId) {
        return yield* Effect.fail(
          new CustomerNotFound({ tenantId: input.tenantId, customerId: input.customerId }),
        )
      }
      const quotation = {
        id: id(),
        tenantId: input.tenantId,
        customerId: input.customerId,
        status: "draft" as const,
        total: input.total,
      }
      quotations.set(quotation.id, quotation)
      return quotation
    },
  )
  const createOrder = Effect.fn("SalesStore.memory.createOrder")(
    function* (input: CreateOrderCommand) {
      if (customers.get(input.customerId)?.tenantId !== input.tenantId) {
        return yield* Effect.fail(
          new CustomerNotFound({ tenantId: input.tenantId, customerId: input.customerId }),
        )
      }
      if (input.quotationId !== undefined) {
        const quotation = quotations.get(input.quotationId)
        if (quotation?.tenantId !== input.tenantId) {
          return yield* Effect.fail(
            new QuotationNotFound({ tenantId: input.tenantId, quotationId: input.quotationId }),
          )
        }
        if (quotation.customerId !== input.customerId) {
          return yield* Effect.fail(
            new QuotationCustomerMismatch({
              tenantId: input.tenantId,
              quotationId: input.quotationId,
              customerId: input.customerId,
            }),
          )
        }
      }
      const order: SalesOrder = {
        id: id(),
        tenantId: input.tenantId,
        customerId: input.customerId,
        quotationId: input.quotationId ?? null,
        status: "draft",
        confirmedAt: null,
        total: deriveTotal(input.lines),
        lines: input.lines,
      }
      orders.set(order.id, order)
      return order
    },
  )
  const confirmOrder = Effect.fn("SalesStore.memory.confirmOrder")(
    function* (
      input: ConfirmOrderCommand,
      append: (
        order: SalesOrder,
      ) => Effect.Effect<
        unknown,
        EventIdempotencyConflict | DatabaseFailure | import("effect/Schema").SchemaError
      >,
    ) {
      const order = orders.get(input.orderId)
      if (order?.tenantId !== input.tenantId) return { _tag: "not-found" as const }
      if (order.status === "confirmed") {
        return keys.get(order.id) === input.idempotencyKey
          ? { _tag: "existing" as const, order }
          : yield* Effect.fail(
            new SalesOrderConfirmationIdempotencyConflict({
              tenantId: input.tenantId,
              orderId: input.orderId,
              idempotencyKey: input.idempotencyKey,
            }),
          )
      }
      if (order.status !== "draft") return { _tag: "invalid-state" as const, status: order.status }
      const confirmed = {
        ...order,
        status: "confirmed" as const,
        confirmedAt: new Date().toISOString(),
      }
      yield* append(confirmed)
      orders.set(order.id, confirmed)
      keys.set(order.id, input.idempotencyKey)
      return { _tag: "confirmed" as const, order: confirmed }
    },
  )
  const cancelConfirmedOrder = Effect.fn("SalesStore.memory.cancelConfirmedOrder")(
    function* (input: CancelConfirmedOrderCommand) {
      const order = orders.get(input.orderId)
      if (order?.tenantId !== input.tenantId) {
        return yield* Effect.succeed({ _tag: "not-found" as const })
      }
      if (order.status === "cancelled") return yield* Effect.succeed(order)
      if (order.status !== "confirmed") {
        return yield* Effect.succeed({ _tag: "invalid-state" as const, status: order.status })
      }
      const cancelled = { ...order, status: "cancelled" as const }
      orders.set(order.id, cancelled)
      return yield* Effect.succeed(cancelled)
    },
  )
  const getConfirmedOrderTotal = Effect.fn("SalesStore.memory.getConfirmedOrderTotal")(
    function* (input: GetConfirmedOrderTotalCommand) {
      const order = orders.get(input.orderId)
      if (order?.tenantId !== input.tenantId) {
        return yield* Effect.succeed({ _tag: "not-found" as const })
      }
      return yield* Effect.succeed({
        _tag: "found" as const,
        total: order.total,
        status: order.status,
        confirmedAt: order.confirmedAt,
      })
    },
  )
  return {
    listCustomers,
    getCustomer,
    listQuotations,
    getQuotation,
    listOrders,
    getOrder,
    createCustomer,
    createQuotation,
    createOrder,
    confirmOrder,
    cancelConfirmedOrder,
    getConfirmedOrderTotal,
  }
}

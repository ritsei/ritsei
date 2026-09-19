import { and, asc, eq, ilike, inArray, or } from "drizzle-orm"
import * as Clock from "effect/Clock"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"

import { customers, orderLines, orders, quotations } from "../../../db/schema/sales.ts"
import { Database, DatabaseFailure, isDatabaseConstraint } from "../../../foundation/mod.ts"
import { EventIdempotencyConflict } from "../../messaging/mod.ts"
import type {
  CancelConfirmedOrderCommand,
  ConfirmOrderCommand,
  CreateCustomerCommand,
  CreateOrderCommand,
  CreateQuotationCommand,
  GetConfirmedOrderTotalCommand,
  GetCustomerCommand,
  GetOrderCommand,
  GetQuotationCommand,
  ListCustomersCommand,
  ListOrdersCommand,
  ListQuotationsCommand,
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
import { deriveTotal, toSalesOrder } from "./store.ts"

const customerSelection = {
  id: customers.id,
  tenantId: customers.tenantId,
  name: customers.name,
  email: customers.email,
}
const quotationSelection = {
  id: quotations.id,
  tenantId: quotations.tenantId,
  customerId: quotations.customerId,
  status: quotations.status,
  total: quotations.total,
}
const orderSelection = {
  id: orders.id,
  tenantId: orders.tenantId,
  customerId: orders.customerId,
  quotationId: orders.quotationId,
  status: orders.status,
  confirmedAt: orders.confirmedAt,
  total: orders.total,
}
const orderLineSelection = {
  id: orderLines.id,
  orderId: orderLines.orderId,
  itemId: orderLines.itemId,
  quantity: orderLines.quantity,
  unitPrice: orderLines.unitPrice,
}
type SalesOrderLineRow = {
  readonly id: string
  readonly orderId: string
  readonly itemId: string
  readonly quantity: string
  readonly unitPrice: string
}

export const makeSalesPostgresStore = Effect.fn("Sales.makePostgresStore")(function* () {
  const database = yield* Database
  const clock = yield* Clock.Clock
  const now = () => new Date(clock.currentTimeMillisUnsafe())
  const escapeLikePattern = (value: string): string =>
    value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")
  const listCustomers = Effect.fn("SalesStore.listCustomers")(
    function* (decoded: ListCustomersCommand) {
      const search = decoded.search === undefined
        ? undefined
        : `%${escapeLikePattern(decoded.search)}%`
      return yield* database.query(
        (db) =>
          db.select(customerSelection).from(customers).where(and(
            eq(customers.tenantId, decoded.tenantId),
            search === undefined
              ? undefined
              : or(ilike(customers.name, search), ilike(customers.email, search)),
          )).orderBy(asc(customers.name), asc(customers.id)).limit(decoded.limit ?? 200),
        "sales.customer.list",
      )
    },
  )
  const getCustomer = Effect.fn("SalesStore.getCustomer")(
    function* (decoded: GetCustomerCommand) {
      const rows = yield* database.query(
        (db) =>
          db.select(customerSelection).from(customers).where(and(
            eq(customers.tenantId, decoded.tenantId),
            eq(customers.id, decoded.customerId),
          )).limit(1),
        "sales.customer.get",
      )
      return rows[0]
    },
  )
  const listQuotations = Effect.fn("SalesStore.listQuotations")(
    function* (decoded: ListQuotationsCommand) {
      return yield* database.query(
        (db) =>
          db.select(quotationSelection).from(quotations).where(and(
            eq(quotations.tenantId, decoded.tenantId),
            decoded.customerId === undefined
              ? undefined
              : eq(quotations.customerId, decoded.customerId),
            decoded.status === undefined ? undefined : eq(quotations.status, decoded.status),
          )).orderBy(asc(quotations.id)).limit(decoded.limit ?? 200),
        "sales.quotation.list",
      )
    },
  )
  const getQuotation = Effect.fn("SalesStore.getQuotation")(
    function* (decoded: GetQuotationCommand) {
      const rows = yield* database.query(
        (db) =>
          db.select(quotationSelection).from(quotations).where(and(
            eq(quotations.tenantId, decoded.tenantId),
            eq(quotations.id, decoded.quotationId),
          )).limit(1),
        "sales.quotation.get",
      )
      return rows[0]
    },
  )
  const listOrders = Effect.fn("SalesStore.listOrders")(
    function* (decoded: ListOrdersCommand) {
      const rows = yield* database.query(
        (db) =>
          db.select(orderSelection).from(orders).where(and(
            eq(orders.tenantId, decoded.tenantId),
            decoded.customerId === undefined
              ? undefined
              : eq(orders.customerId, decoded.customerId),
            decoded.status === undefined ? undefined : eq(orders.status, decoded.status),
          )).orderBy(asc(orders.id)).limit(decoded.limit ?? 200),
        "sales.order.list",
      )
      if (rows.length === 0) return []
      const lines = yield* database.query(
        (db) =>
          db.select(orderLineSelection).from(orderLines).where(and(
            eq(orderLines.tenantId, decoded.tenantId),
            inArray(orderLines.orderId, rows.map((row) => row.id)),
          )).orderBy(asc(orderLines.orderId), asc(orderLines.id)),
        "sales.order.lines.list",
      )
      const linesByOrder = new Map<string, Array<SalesOrderLineRow>>()
      for (const line of lines) {
        const orderLinesForOrder = linesByOrder.get(line.orderId) ?? []
        orderLinesForOrder.push(line)
        linesByOrder.set(line.orderId, orderLinesForOrder)
      }
      return rows.map((row) => toSalesOrder(row, linesByOrder.get(row.id) ?? []))
    },
  )
  const getOrder = Effect.fn("SalesStore.getOrder")(
    function* (decoded: GetOrderCommand) {
      const rows = yield* database.query(
        (db) =>
          db.select(orderSelection).from(orders).where(and(
            eq(orders.tenantId, decoded.tenantId),
            eq(orders.id, decoded.orderId),
          )).limit(1),
        "sales.order.get",
      )
      const row = rows[0]
      if (row === undefined) return undefined
      const lines = yield* database.query(
        (db) =>
          db.select(orderLineSelection).from(orderLines).where(and(
            eq(orderLines.tenantId, decoded.tenantId),
            eq(orderLines.orderId, decoded.orderId),
          )).orderBy(asc(orderLines.id)),
        "sales.order.lines.get",
      )
      return toSalesOrder(row, lines)
    },
  )
  const createCustomer = Effect.fn("SalesStore.createCustomer")(
    function* (decoded: CreateCustomerCommand) {
      const email = decoded.email.trim().toLowerCase()
      const rows = yield* database.query((db) =>
        db.insert(customers).values({
          tenantId: decoded.tenantId,
          name: decoded.name.trim(),
          email,
        }).returning(customerSelection), "sales.customer.create").pipe(
          Effect.mapError((error) =>
            isDatabaseConstraint(error, "customers_tenant_email_key")
              ? new CustomerAlreadyExists({ tenantId: decoded.tenantId, email })
              : error
          ),
        )
      return rows[0]!
    },
  )
  const createQuotation = Effect.fn("SalesStore.createQuotation")(
    function* (decoded: CreateQuotationCommand) {
      const rows = yield* database.query((db) =>
        db.insert(quotations).values({
          tenantId: decoded.tenantId,
          customerId: decoded.customerId,
          total: decoded.total,
        }).returning(quotationSelection), "sales.quotation.create").pipe(
          Effect.mapError((error) =>
            isDatabaseConstraint(error, "quotations_tenant_customer_fkey", "23503")
              ? new CustomerNotFound({ tenantId: decoded.tenantId, customerId: decoded.customerId })
              : error
          ),
        )
      return rows[0]!
    },
  )
  const createOrder = Effect.fn("SalesStore.createOrder")(function* (decoded: CreateOrderCommand) {
    const result = yield* database.transaction(async (tx) => {
      if (decoded.quotationId !== undefined) {
        const [quotation] = await tx.select({ customerId: quotations.customerId }).from(quotations)
          .where(and(
            eq(quotations.tenantId, decoded.tenantId),
            eq(quotations.id, decoded.quotationId),
          )).for("update")
        if (quotation !== undefined && quotation.customerId !== decoded.customerId) {
          return { _tag: "quotation-customer-mismatch" as const }
        }
      }
      const [order] = await tx.insert(orders).values({
        tenantId: decoded.tenantId,
        customerId: decoded.customerId,
        quotationId: decoded.quotationId,
        total: deriveTotal(decoded.lines),
      }).returning(orderSelection)
      const lines = await tx.insert(orderLines).values(
        decoded.lines.map((line) => ({
          tenantId: decoded.tenantId,
          orderId: order!.id,
          itemId: line.itemId,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
        })),
      ).returning(orderLineSelection)
      return { _tag: "created" as const, order: toSalesOrder(order!, lines) }
    }, "sales.order.create").pipe(Effect.mapError((error) => {
      if (isDatabaseConstraint(error, "orders_tenant_customer_fkey", "23503")) {
        return new CustomerNotFound({ tenantId: decoded.tenantId, customerId: decoded.customerId })
      }
      if (
        decoded.quotationId !== undefined &&
        isDatabaseConstraint(error, "orders_tenant_quotation_fkey", "23503")
      ) {
        return new QuotationNotFound({
          tenantId: decoded.tenantId,
          quotationId: decoded.quotationId,
        })
      }
      if (
        decoded.quotationId !== undefined &&
        isDatabaseConstraint(error, "orders_tenant_quotation_customer_fkey", "23503")
      ) {
        return new QuotationCustomerMismatch({
          tenantId: decoded.tenantId,
          quotationId: decoded.quotationId,
          customerId: decoded.customerId,
        })
      }
      return error
    }))
    if (result._tag === "quotation-customer-mismatch") {
      return yield* Effect.fail(
        new QuotationCustomerMismatch({
          tenantId: decoded.tenantId,
          quotationId: decoded.quotationId!,
          customerId: decoded.customerId,
        }),
      )
    }
    return result.order
  })
  const confirmOrder = Effect.fn("SalesStore.confirmOrder")(
    function* (
      decoded: ConfirmOrderCommand,
      append: (
        order: SalesOrder,
      ) => Effect.Effect<unknown, EventIdempotencyConflict | DatabaseFailure | Schema.SchemaError>,
    ) {
      return yield* database.withTransaction(
        Effect.gen(function* () {
          const mutation = yield* database.transaction(async (tx) => {
            const [row] = await tx.select({
              ...orderSelection,
              confirmationIdempotencyKey: orders.confirmationIdempotencyKey,
            }).from(orders).where(
              and(eq(orders.tenantId, decoded.tenantId), eq(orders.id, decoded.orderId)),
            ).for("update")
            if (row === undefined) return { _tag: "not-found" as const }
            const lines = await tx.select(orderLineSelection).from(orderLines).where(
              and(eq(orderLines.tenantId, decoded.tenantId), eq(orderLines.orderId, row.id)),
            )
            const current = toSalesOrder(row, lines)
            if (row.status === "confirmed") {
              return row.confirmationIdempotencyKey === decoded.idempotencyKey
                ? { _tag: "existing" as const, order: current }
                : { _tag: "idempotency-conflict" as const }
            }
            if (row.status !== "draft") {
              return { _tag: "invalid-state" as const, status: row.status }
            }
            const confirmedAt = now()
            const [confirmed] = await tx.update(orders).set({
              status: "confirmed",
              confirmationIdempotencyKey: decoded.idempotencyKey,
              confirmedAt,
              updatedAt: confirmedAt,
            }).where(
              and(
                eq(orders.tenantId, decoded.tenantId),
                eq(orders.id, decoded.orderId),
                eq(orders.status, "draft"),
              ),
            ).returning(orderSelection)
            return { _tag: "confirmed" as const, order: toSalesOrder(confirmed!, lines) }
          }, "sales.order.confirm")
          if (mutation._tag === "confirmed") yield* append(mutation.order)
          return mutation
        }),
        "sales.order.confirm.atomic",
      ).pipe(
        Effect.mapError((error) =>
          isDatabaseConstraint(error, "orders_tenant_confirmation_idempotency_key")
            ? new SalesOrderConfirmationIdempotencyConflict({
              tenantId: decoded.tenantId,
              orderId: decoded.orderId,
              idempotencyKey: decoded.idempotencyKey,
            })
            : error
        ),
      )
    },
  )
  const cancelConfirmedOrder = Effect.fn("SalesStore.cancelConfirmedOrder")(
    function* (decoded: CancelConfirmedOrderCommand) {
      return yield* database.transaction(async (tx) => {
        const [row] = await tx.select(orderSelection).from(orders).where(
          and(eq(orders.tenantId, decoded.tenantId), eq(orders.id, decoded.orderId)),
        ).for("update")
        if (row === undefined) return { _tag: "not-found" as const }
        const lines = await tx.select(orderLineSelection).from(orderLines).where(
          and(eq(orderLines.tenantId, decoded.tenantId), eq(orderLines.orderId, row.id)),
        )
        if (row.status === "cancelled") return toSalesOrder(row, lines)
        if (row.status !== "confirmed") {
          return { _tag: "invalid-state" as const, status: row.status }
        }
        const [cancelled] = await tx.update(orders).set({ status: "cancelled", updatedAt: now() })
          .where(
            and(
              eq(orders.tenantId, decoded.tenantId),
              eq(orders.id, decoded.orderId),
              eq(orders.status, "confirmed"),
            ),
          ).returning(orderSelection)
        return toSalesOrder(cancelled!, lines)
      }, "sales.order.cancel")
    },
  )
  const getConfirmedOrderTotal = Effect.fn("SalesStore.getConfirmedOrderTotal")(
    function* (decoded: GetConfirmedOrderTotalCommand) {
      const rows = yield* database.query(
        (db) =>
          db.select({ status: orders.status, confirmedAt: orders.confirmedAt, total: orders.total })
            .from(orders).where(
              and(eq(orders.tenantId, decoded.tenantId), eq(orders.id, decoded.orderId)),
            ).for("update"),
        "sales.order.confirmed_total.lookup",
      )
      const row = rows[0]
      return row === undefined ? { _tag: "not-found" as const } : {
        _tag: "found" as const,
        total: row.total,
        status: row.status,
        confirmedAt: row.confirmedAt?.toISOString() ?? null,
      }
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
  } satisfies SalesStore
})()

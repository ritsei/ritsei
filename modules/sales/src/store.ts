import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"

import { DatabaseFailure, requireExactMajorToMinor } from "../../../foundation/mod.ts"
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
  SalesOrderLine,
} from "./contract.ts"
import {
  CustomerAlreadyExists,
  CustomerNotFound,
  QuotationCustomerMismatch,
  QuotationNotFound,
  SalesOrderConfirmationIdempotencyConflict,
  SalesOrderInvalidState,
  SalesOrderNotFound,
} from "./errors.ts"

export type SalesStoreFailure =
  | DatabaseFailure
  | CustomerAlreadyExists
  | CustomerNotFound
  | QuotationCustomerMismatch
  | QuotationNotFound
  | SalesOrderNotFound
  | SalesOrderInvalidState
  | SalesOrderConfirmationIdempotencyConflict
export type ConfirmationMutation =
  | { readonly _tag: "confirmed" | "existing"; readonly order: SalesOrder }
  | { readonly _tag: "not-found" }
  | { readonly _tag: "idempotency-conflict" }
  | { readonly _tag: "invalid-state"; readonly status: "draft" | "confirmed" | "cancelled" }

export const toSalesOrder = (row: {
  readonly id: string
  readonly tenantId: string
  readonly customerId: string
  readonly quotationId: string | null
  readonly status: "draft" | "confirmed" | "cancelled"
  readonly confirmedAt: Date | null
  readonly total: string
}, lines: ReadonlyArray<SalesOrderLine>): SalesOrder => ({
  id: row.id,
  tenantId: row.tenantId,
  customerId: row.customerId,
  quotationId: row.quotationId,
  status: row.status,
  confirmedAt: row.confirmedAt?.toISOString() ?? null,
  total: row.total,
  lines: lines.map(({ itemId, quantity, unitPrice }) => ({ itemId, quantity, unitPrice })),
})

export interface SalesStore {
  readonly listCustomers: (
    input: ListCustomersCommand,
  ) => Effect.Effect<ReadonlyArray<Customer>, DatabaseFailure>
  readonly getCustomer: (
    input: GetCustomerCommand,
  ) => Effect.Effect<Customer | undefined, DatabaseFailure>
  readonly listQuotations: (
    input: ListQuotationsCommand,
  ) => Effect.Effect<ReadonlyArray<Quotation>, DatabaseFailure>
  readonly getQuotation: (
    input: GetQuotationCommand,
  ) => Effect.Effect<Quotation | undefined, DatabaseFailure>
  readonly listOrders: (
    input: ListOrdersCommand,
  ) => Effect.Effect<ReadonlyArray<SalesOrder>, DatabaseFailure>
  readonly getOrder: (
    input: GetOrderCommand,
  ) => Effect.Effect<SalesOrder | undefined, DatabaseFailure>
  readonly createCustomer: (
    input: CreateCustomerCommand,
  ) => Effect.Effect<Customer, CustomerAlreadyExists | DatabaseFailure>
  readonly createQuotation: (
    input: CreateQuotationCommand,
  ) => Effect.Effect<Quotation, CustomerNotFound | DatabaseFailure>
  readonly createOrder: (
    input: CreateOrderCommand,
  ) => Effect.Effect<
    SalesOrder,
    CustomerNotFound | QuotationCustomerMismatch | QuotationNotFound | DatabaseFailure
  >
  readonly confirmOrder: (
    input: ConfirmOrderCommand,
    append: (
      order: SalesOrder,
    ) => Effect.Effect<unknown, EventIdempotencyConflict | DatabaseFailure | Schema.SchemaError>,
  ) => Effect.Effect<
    ConfirmationMutation,
    | EventIdempotencyConflict
    | DatabaseFailure
    | Schema.SchemaError
    | SalesOrderConfirmationIdempotencyConflict
  >
  readonly cancelConfirmedOrder: (
    input: CancelConfirmedOrderCommand,
  ) => Effect.Effect<
    SalesOrder | { readonly _tag: "not-found" } | {
      readonly _tag: "invalid-state"
      readonly status: "draft" | "confirmed" | "cancelled"
    },
    DatabaseFailure
  >
  readonly getConfirmedOrderTotal: (
    input: GetConfirmedOrderTotalCommand,
  ) => Effect.Effect<
    {
      readonly _tag: "found"
      readonly total: string
      readonly status: "draft" | "confirmed" | "cancelled"
      readonly confirmedAt: string | null
    } | { readonly _tag: "not-found" },
    DatabaseFailure
  >
}

export const deriveTotal = (lines: ReadonlyArray<SalesOrderLine>): string => {
  const cents = lines.reduce(
    (total, line) => total + BigInt(line.quantity) * requireExactMajorToMinor(line.unitPrice, 2),
    0n,
  )
  return `${cents / 100n}.${(cents % 100n).toString().padStart(2, "0")}`
}

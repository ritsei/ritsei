import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"

import { Principal } from "../../auth/mod.ts"
import { FinancialMajorAmount, requireExactMajorToMinor } from "../../../foundation/mod.ts"
import { EventEnvelope, EventIdempotencyConflict } from "../../messaging/mod.ts"
import {
  CustomerAlreadyExists,
  CustomerNotFound,
  QuotationCustomerMismatch,
  QuotationNotFound,
  SalesOrderConfirmationIdempotencyConflict,
  SalesOrderInvalidState,
  SalesOrderNotFound,
} from "./errors.ts"

const NonEmptyString = Schema.String.check(Schema.isPattern(/\S/))
const TrimmedNonEmptyString = Schema.String.check(Schema.makeFilter(
  (value) => /\S/.test(value) && value === value.trim(),
  { expected: "a trimmed nonblank string" },
))
const LowercaseTrimmedNonEmptyString = Schema.String.check(Schema.makeFilter(
  (value) => /\S/.test(value) && value === value.trim() && value === value.toLowerCase(),
  { expected: "a trimmed lowercase nonblank string" },
))
const Uuid = Schema.String.check(Schema.isUUID())
const Money = FinancialMajorAmount
const Quantity = Schema.String.check(
  Schema.makeFilter(
    (value) => /^[1-9]\d*$/.test(value) && BigInt(value) <= 9_223_372_036_854_775_807n,
    { expected: "a positive PostgreSQL bigint quantity" },
  ),
)
const InstantString = EventEnvelope.fields.occurredAt

export const Customer = Schema.Struct({
  id: Uuid,
  tenantId: Uuid,
  name: TrimmedNonEmptyString,
  email: LowercaseTrimmedNonEmptyString,
})
export const QuotationStatus = Schema.Literals(["draft", "sent", "accepted", "rejected", "expired"])
export const SalesOrderStatus = Schema.Literals(["draft", "confirmed", "cancelled"])
export const Quotation = Schema.Struct({
  id: Uuid,
  tenantId: Uuid,
  customerId: Uuid,
  status: QuotationStatus,
  total: Money,
})
export const SalesOrderLine = Schema.Struct({
  itemId: Uuid,
  quantity: Quantity,
  unitPrice: Money,
})
export const SalesOrder = Schema.Struct({
  id: Uuid,
  tenantId: Uuid,
  customerId: Uuid,
  quotationId: Schema.NullOr(Uuid),
  status: SalesOrderStatus,
  confirmedAt: Schema.NullOr(InstantString),
  total: Money,
  lines: Schema.Array(SalesOrderLine).check(Schema.isMinLength(1)),
}).check(Schema.makeFilter(
  (order) =>
    (order.status === "draft" && order.confirmedAt === null) ||
    (order.status !== "draft" && order.confirmedAt !== null),
  { expected: "sales order confirmation metadata consistent with status" },
)).check(Schema.makeFilter(
  (order) => {
    const lineTotal = order.lines.reduce(
      (total, line) => total + requireExactMajorToMinor(line.unitPrice, 2) * BigInt(line.quantity),
      0n,
    )
    return lineTotal === requireExactMajorToMinor(order.total, 2)
  },
  { expected: "sales order total must equal its line totals" },
))

export type Customer = Schema.Schema.Type<typeof Customer>
export type QuotationStatus = Schema.Schema.Type<typeof QuotationStatus>
export type Quotation = Schema.Schema.Type<typeof Quotation>
export type SalesOrderStatus = Schema.Schema.Type<typeof SalesOrderStatus>
export type SalesOrderLine = Schema.Schema.Type<typeof SalesOrderLine>
export type SalesOrder = Schema.Schema.Type<typeof SalesOrder>

const ScopedInput = { principal: Principal, tenantId: Uuid }
const ListLimit = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 200 }))
export const ListCustomersInput = Schema.Struct({
  ...ScopedInput,
  search: Schema.optionalKey(TrimmedNonEmptyString),
  limit: Schema.optionalKey(ListLimit),
})
export const GetCustomerInput = Schema.Struct({
  ...ScopedInput,
  customerId: Uuid,
})
export const ListQuotationsInput = Schema.Struct({
  ...ScopedInput,
  customerId: Schema.optionalKey(Uuid),
  status: Schema.optionalKey(QuotationStatus),
  limit: Schema.optionalKey(ListLimit),
})
export const GetQuotationInput = Schema.Struct({
  ...ScopedInput,
  quotationId: Uuid,
})
export const ListOrdersInput = Schema.Struct({
  ...ScopedInput,
  customerId: Schema.optionalKey(Uuid),
  status: Schema.optionalKey(SalesOrderStatus),
  limit: Schema.optionalKey(ListLimit),
})
export const GetOrderInput = Schema.Struct({
  ...ScopedInput,
  orderId: Uuid,
})
export const CreateCustomerInput = Schema.Struct({
  ...ScopedInput,
  name: NonEmptyString,
  email: NonEmptyString,
})
export const CreateQuotationInput = Schema.Struct({
  ...ScopedInput,
  customerId: Uuid,
  total: Money,
})
export const CreateOrderInput = Schema.Struct({
  ...ScopedInput,
  customerId: Uuid,
  quotationId: Schema.optionalKey(Uuid),
  lines: Schema.Array(SalesOrderLine).check(Schema.isMinLength(1)),
})
export const ConfirmOrderInput = Schema.Struct({
  ...ScopedInput,
  orderId: Uuid,
  commandId: NonEmptyString,
  correlationId: NonEmptyString,
  causationId: Schema.NullOr(NonEmptyString).pipe(
    Schema.withDecodingDefaultKey(Effect.succeed(null)),
  ),
  idempotencyKey: NonEmptyString,
})
export const CancelConfirmedOrderInput = Schema.Struct({ ...ScopedInput, orderId: Uuid })
export const GetConfirmedOrderTotalInput = Schema.Struct({ ...ScopedInput, orderId: Uuid })

export type ListCustomersCommand = Schema.Schema.Type<typeof ListCustomersInput>
export type GetCustomerCommand = Schema.Schema.Type<typeof GetCustomerInput>
export type ListQuotationsCommand = Schema.Schema.Type<typeof ListQuotationsInput>
export type GetQuotationCommand = Schema.Schema.Type<typeof GetQuotationInput>
export type ListOrdersCommand = Schema.Schema.Type<typeof ListOrdersInput>
export type GetOrderCommand = Schema.Schema.Type<typeof GetOrderInput>
export type CreateCustomerCommand = Schema.Schema.Type<typeof CreateCustomerInput>
export type CreateQuotationCommand = Schema.Schema.Type<typeof CreateQuotationInput>
export type CreateOrderCommand = Schema.Schema.Type<typeof CreateOrderInput>
export type ConfirmOrderCommand = Schema.Schema.Type<typeof ConfirmOrderInput>
export type CancelConfirmedOrderCommand = Schema.Schema.Type<typeof CancelConfirmedOrderInput>
export type GetConfirmedOrderTotalCommand = Schema.Schema.Type<typeof GetConfirmedOrderTotalInput>

type CommonFailure =
  | import("../../authorization/mod.ts").AuthorizationDenied
  | import("../../../foundation/mod.ts").DatabaseFailure
  | Schema.SchemaError
export interface SalesService {
  readonly listCustomers: (
    input: unknown,
  ) => Effect.Effect<ReadonlyArray<Customer>, CommonFailure>
  readonly getCustomer: (
    input: unknown,
  ) => Effect.Effect<Customer, CustomerNotFound | CommonFailure>
  readonly listQuotations: (
    input: unknown,
  ) => Effect.Effect<ReadonlyArray<Quotation>, CommonFailure>
  readonly getQuotation: (
    input: unknown,
  ) => Effect.Effect<Quotation, QuotationNotFound | CommonFailure>
  readonly listOrders: (
    input: unknown,
  ) => Effect.Effect<ReadonlyArray<SalesOrder>, CommonFailure>
  readonly getOrder: (
    input: unknown,
  ) => Effect.Effect<SalesOrder, SalesOrderNotFound | CommonFailure>
  readonly createCustomer: (
    input: unknown,
  ) => Effect.Effect<Customer, CustomerAlreadyExists | CommonFailure>
  readonly createQuotation: (
    input: unknown,
  ) => Effect.Effect<Quotation, CustomerNotFound | CommonFailure>
  readonly createOrder: (
    input: unknown,
  ) => Effect.Effect<
    SalesOrder,
    CustomerNotFound | QuotationCustomerMismatch | QuotationNotFound | CommonFailure
  >
  readonly confirmOrder: (
    input: unknown,
  ) => Effect.Effect<
    SalesOrder,
    | EventIdempotencyConflict
    | SalesOrderConfirmationIdempotencyConflict
    | SalesOrderInvalidState
    | SalesOrderNotFound
    | CommonFailure
  >
  readonly cancelConfirmedOrder: (
    input: unknown,
  ) => Effect.Effect<SalesOrder, SalesOrderInvalidState | SalesOrderNotFound | CommonFailure>
  readonly getConfirmedOrderTotal: (
    input: unknown,
  ) => Effect.Effect<string, SalesOrderInvalidState | SalesOrderNotFound | CommonFailure>
}

export {
  CustomerAlreadyExists,
  CustomerNotFound,
  QuotationCustomerMismatch,
  QuotationNotFound,
  SalesOrderConfirmationIdempotencyConflict,
  SalesOrderInvalidState,
  SalesOrderNotFound,
} from "./errors.ts"

export const SalesService = Context.Service<SalesService>("RITSEI/SalesService")

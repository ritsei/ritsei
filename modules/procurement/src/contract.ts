import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"

import { Principal } from "../../auth/mod.ts"
import { AuthorizationDenied } from "../../authorization/mod.ts"
import { InventoryService, UnitOfMeasure } from "../../inventory/mod.ts"
import {
  DatabaseFailure,
  FinancialMajorAmount,
  InstantString,
  ReplicaConsistencyFailure,
  requireExactMajorToMinor,
} from "../../../foundation/mod.ts"
import { EventIdempotencyConflict } from "../../messaging/mod.ts"
import {
  PurchaseOrderConfirmationIdempotencyConflict,
  PurchaseOrderHasReceipts,
  PurchaseOrderInvalidState,
  PurchaseOrderNotFound,
  PurchaseReceiptIdempotencyConflict,
  PurchaseReceiptInventoryReferenceNotFound,
  PurchaseReceiptLineDuplicate,
  PurchaseReceiptLineNotFound,
  PurchaseReceiptQuantityExceeded,
  PurchaseReceiptWarehouseLegalEntityMismatch,
  SupplierAccountAlreadyExists,
  SupplierAccountNotFound,
  SupplierRelationshipNotEligible,
} from "./errors.ts"

const Uuid = Schema.String.check(Schema.isUUID())
const NonEmptyString = Schema.String.check(Schema.isPattern(/\S/))
const TrimmedNonEmptyString = Schema.String.check(Schema.makeFilter(
  (value) => /\S/.test(value) && value === value.trim(),
  { expected: "a trimmed nonblank string" },
))
const Quantity = Schema.String.check(
  Schema.makeFilter(
    (value) => /^[1-9]\d*$/.test(value) && BigInt(value) <= 9_223_372_036_854_775_807n,
    { expected: "a positive PostgreSQL bigint quantity" },
  ),
)

export const SupplierAccount = Schema.Struct({
  id: Uuid,
  tenantId: Uuid,
  supplierRelationshipId: Uuid,
  partyId: Uuid,
  legalEntityId: Uuid,
})

export const PurchaseOrderLine = Schema.Struct({
  itemId: Uuid,
  quantity: Quantity,
  unitPrice: FinancialMajorAmount,
})

export const PurchaseOrderLineSnapshot = Schema.Struct({
  id: Uuid,
  itemId: Uuid,
  quantity: Quantity,
  unitPrice: FinancialMajorAmount,
})

export const PurchaseOrderStatus = Schema.Literals(["draft", "confirmed", "cancelled"])

export const PurchaseOrder = Schema.Struct({
  id: Uuid,
  tenantId: Uuid,
  supplierAccountId: Uuid,
  status: PurchaseOrderStatus,
  confirmedAt: Schema.NullOr(InstantString),
  total: FinancialMajorAmount,
  lines: Schema.Array(PurchaseOrderLineSnapshot).check(Schema.isMinLength(1)),
}).check(Schema.makeFilter(
  (order) =>
    (order.status === "draft" && order.confirmedAt === null) ||
    (order.status !== "draft" && order.confirmedAt !== null),
  { expected: "purchase order confirmation metadata consistent with status" },
)).check(Schema.makeFilter(
  (order) => {
    const lineTotal = order.lines.reduce(
      (total, line) => total + requireExactMajorToMinor(line.unitPrice, 2) * BigInt(line.quantity),
      0n,
    )
    return lineTotal === requireExactMajorToMinor(order.total, 2)
  },
  { expected: "purchase order total must equal its line totals" },
)).check(Schema.makeFilter(
  (order) => new Set(order.lines.map((line) => line.id)).size === order.lines.length,
  { expected: "purchase order line identities must be unique" },
))

export type SupplierAccount = Schema.Schema.Type<typeof SupplierAccount>
export type PurchaseOrderLine = Schema.Schema.Type<typeof PurchaseOrderLine>
export type PurchaseOrderLineSnapshot = Schema.Schema.Type<typeof PurchaseOrderLineSnapshot>
export type PurchaseOrderStatus = Schema.Schema.Type<typeof PurchaseOrderStatus>
export type PurchaseOrder = Schema.Schema.Type<typeof PurchaseOrder>

const ListLimit = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 200 }))

export const CreateSupplierAccountInput = Schema.Struct({
  principal: Principal,
  tenantId: Uuid,
  supplierRelationshipId: Uuid,
})

export const ListSupplierAccountsInput = Schema.Struct({
  principal: Principal,
  tenantId: Uuid,
  limit: Schema.optionalKey(ListLimit),
})

export const CreatePurchaseOrderInput = Schema.Struct({
  principal: Principal,
  tenantId: Uuid,
  supplierAccountId: Uuid,
  lines: Schema.Array(PurchaseOrderLine).check(Schema.isMinLength(1)),
})

export const ListPurchaseOrdersInput = Schema.Struct({
  principal: Principal,
  tenantId: Uuid,
  supplierAccountId: Schema.optionalKey(Uuid),
  status: Schema.optionalKey(PurchaseOrderStatus),
  limit: Schema.optionalKey(ListLimit),
})

export const ConfirmPurchaseOrderInput = Schema.Struct({
  principal: Principal,
  tenantId: Uuid,
  purchaseOrderId: Uuid,
  idempotencyKey: NonEmptyString,
})

export const GetPurchaseOrderInput = Schema.Struct({
  principal: Principal,
  tenantId: Uuid,
  purchaseOrderId: Uuid,
})

export const CancelPurchaseOrderInput = Schema.Struct({
  principal: Principal,
  tenantId: Uuid,
  purchaseOrderId: Uuid,
})

export const PurchaseReceiptLineInput = Schema.Struct({
  purchaseOrderLineId: Uuid,
  quantity: Quantity,
})

export const ListPurchaseReceiptsInput = Schema.Struct({
  principal: Principal,
  tenantId: Uuid,
  purchaseOrderId: Uuid,
  limit: Schema.optionalKey(ListLimit),
})
export type ListSupplierAccounts = Schema.Schema.Type<typeof ListSupplierAccountsInput>
export type ListPurchaseOrders = Schema.Schema.Type<typeof ListPurchaseOrdersInput>
export type ListPurchaseReceipts = Schema.Schema.Type<typeof ListPurchaseReceiptsInput>

export const ReceivePurchaseOrderInput = Schema.Struct({
  principal: Principal,
  tenantId: Uuid,
  purchaseOrderId: Uuid,
  warehouseId: Uuid,
  idempotencyKey: NonEmptyString,
  lines: Schema.Array(PurchaseReceiptLineInput).check(Schema.isMinLength(1)).check(
    Schema.makeFilter(
      (lines) => new Set(lines.map((line) => line.purchaseOrderLineId)).size === lines.length,
      { expected: "purchase receipt lines must reference unique purchase-order lines" },
    ),
  ),
})

export const GoodsReceiptLine = Schema.Struct({
  id: Uuid,
  purchaseOrderLineId: Uuid,
  itemId: Uuid,
  quantity: Quantity,
  unitOfMeasure: UnitOfMeasure,
})

export const GoodsReceipt = Schema.Struct({
  id: Uuid,
  tenantId: Uuid,
  purchaseOrderId: Uuid,
  warehouseId: Uuid,
  idempotencyKey: TrimmedNonEmptyString,
  receivedAt: InstantString,
  lines: Schema.Array(GoodsReceiptLine).check(Schema.isMinLength(1)),
}).check(Schema.makeFilter(
  (receipt) =>
    new Set(receipt.lines.map((line) => line.purchaseOrderLineId)).size === receipt.lines.length,
  { expected: "goods receipt lines must reference unique purchase-order lines" },
)).check(Schema.makeFilter(
  (receipt) => new Set(receipt.lines.map((line) => line.id)).size === receipt.lines.length,
  { expected: "goods receipt line identities must be unique" },
))

export type PurchaseReceiptLineInput = Schema.Schema.Type<typeof PurchaseReceiptLineInput>
export type ReceivePurchaseOrder = Schema.Schema.Type<typeof ReceivePurchaseOrderInput>
export type GoodsReceiptLine = Schema.Schema.Type<typeof GoodsReceiptLine>
export type GoodsReceipt = Schema.Schema.Type<typeof GoodsReceipt>

export type CommonFailure =
  | AuthorizationDenied
  | DatabaseFailure
  | EventIdempotencyConflict
  | Schema.SchemaError

export interface ProcurementService {
  readonly createSupplierAccount: (
    input: unknown,
  ) => Effect.Effect<
    SupplierAccount,
    SupplierAccountAlreadyExists | SupplierRelationshipNotEligible | CommonFailure
  >
  readonly listSupplierAccounts: (
    input: unknown,
  ) => Effect.Effect<
    ReadonlyArray<SupplierAccount>,
    SupplierRelationshipNotEligible | CommonFailure
  >
  readonly createPurchaseOrder: (
    input: unknown,
  ) => Effect.Effect<PurchaseOrder, SupplierAccountNotFound | CommonFailure>
  readonly getPurchaseOrder: (
    input: unknown,
  ) => Effect.Effect<
    PurchaseOrder,
    PurchaseOrderNotFound | ReplicaConsistencyFailure | CommonFailure
  >
  readonly listPurchaseOrders: (
    input: unknown,
  ) => Effect.Effect<ReadonlyArray<PurchaseOrder>, CommonFailure>
  readonly listPurchaseReceipts: (
    input: unknown,
  ) => Effect.Effect<ReadonlyArray<GoodsReceipt>, CommonFailure>
  readonly confirmPurchaseOrder: (
    input: unknown,
  ) => Effect.Effect<
    PurchaseOrder,
    | PurchaseOrderConfirmationIdempotencyConflict
    | PurchaseOrderInvalidState
    | PurchaseOrderNotFound
    | CommonFailure
  >
  readonly cancelPurchaseOrder: (
    input: unknown,
  ) => Effect.Effect<
    PurchaseOrder,
    PurchaseOrderHasReceipts | PurchaseOrderInvalidState | PurchaseOrderNotFound | CommonFailure
  >
  readonly receivePurchaseOrder: (
    input: unknown,
  ) => Effect.Effect<
    GoodsReceipt,
    | PurchaseOrderInvalidState
    | PurchaseOrderNotFound
    | PurchaseReceiptIdempotencyConflict
    | PurchaseReceiptLineDuplicate
    | PurchaseReceiptLineNotFound
    | PurchaseReceiptQuantityExceeded
    | PurchaseReceiptInventoryReferenceNotFound
    | PurchaseReceiptWarehouseLegalEntityMismatch
    | SupplierAccountNotFound
    | SupplierRelationshipNotEligible
    | CommonFailure,
    InventoryService
  >
}

export const ProcurementService = Context.Service<ProcurementService>("RITSEI/ProcurementService")

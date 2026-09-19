import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"

import {
  purchaseOrderLines,
  purchaseOrders,
  purchaseReceiptLines,
  purchaseReceipts,
  supplierAccounts,
} from "../../../db/schema/procurement.ts"
import { PartyService } from "../../party/mod.ts"
import { requireExactMajorToMinor } from "../../../foundation/mod.ts"
import type {
  CreateSupplierAccountInput,
  GoodsReceipt,
  GoodsReceiptLine,
  PurchaseOrder,
  PurchaseOrderLine,
  PurchaseOrderLineSnapshot,
  PurchaseReceiptLineInput,
} from "./contract.ts"
import { SupplierRelationshipNotEligible } from "./errors.ts"

export type ProcurementStore = import("./contract.ts").ProcurementService
type CreateSupplierAccount = Schema.Schema.Type<typeof CreateSupplierAccountInput>

export const loadSupplierRelationship = (party: PartyService, input: CreateSupplierAccount) =>
  party.getRelationship({
    principal: input.principal,
    tenantId: input.tenantId,
    relationshipId: input.supplierRelationshipId,
  }).pipe(
    Effect.catchTag(
      "PartyRelationshipNotFound",
      () =>
        Effect.fail(
          new SupplierRelationshipNotEligible({
            tenantId: input.tenantId,
            supplierRelationshipId: input.supplierRelationshipId,
          }),
        ),
    ),
    Effect.flatMap((relationship) =>
      relationship.kind === "supplier" && relationship.active
        ? Effect.succeed(relationship)
        : Effect.fail(
          new SupplierRelationshipNotEligible({
            tenantId: input.tenantId,
            supplierRelationshipId: input.supplierRelationshipId,
          }),
        )
    ),
  )

export const supplierAccountSelection = {
  id: supplierAccounts.id,
  tenantId: supplierAccounts.tenantId,
  supplierRelationshipId: supplierAccounts.supplierRelationshipId,
}

export const purchaseOrderSelection = {
  id: purchaseOrders.id,
  tenantId: purchaseOrders.tenantId,
  supplierAccountId: purchaseOrders.supplierAccountId,
  status: purchaseOrders.status,
  confirmedAt: purchaseOrders.confirmedAt,
  total: purchaseOrders.total,
}

export const purchaseOrderLineSelection = {
  id: purchaseOrderLines.id,
  itemId: purchaseOrderLines.itemId,
  quantity: purchaseOrderLines.quantity,
  unitPrice: purchaseOrderLines.unitPrice,
}

export const purchaseOrderLineListSelection = {
  purchaseOrderId: purchaseOrderLines.purchaseOrderId,
  ...purchaseOrderLineSelection,
}

export const purchaseReceiptSelection = {
  id: purchaseReceipts.id,
  tenantId: purchaseReceipts.tenantId,
  purchaseOrderId: purchaseReceipts.purchaseOrderId,
  warehouseId: purchaseReceipts.warehouseId,
  idempotencyKey: purchaseReceipts.idempotencyKey,
  receivedAt: purchaseReceipts.receivedAt,
}

export const purchaseReceiptLineSelection = {
  id: purchaseReceiptLines.id,
  purchaseOrderLineId: purchaseReceiptLines.purchaseOrderLineId,
  itemId: purchaseReceiptLines.itemId,
  quantity: purchaseReceiptLines.quantity,
  unitOfMeasure: purchaseReceiptLines.unitOfMeasure,
}

export const purchaseReceiptLineListSelection = {
  receiptId: purchaseReceiptLines.receiptId,
  ...purchaseReceiptLineSelection,
}

export const toGoodsReceipt = (
  row: {
    readonly id: string
    readonly tenantId: string
    readonly purchaseOrderId: string
    readonly warehouseId: string
    readonly idempotencyKey: string
    readonly receivedAt: Date
  },
  lines: ReadonlyArray<GoodsReceiptLine>,
): GoodsReceipt => ({
  id: row.id,
  tenantId: row.tenantId,
  purchaseOrderId: row.purchaseOrderId,
  warehouseId: row.warehouseId,
  idempotencyKey: row.idempotencyKey,
  receivedAt: row.receivedAt.toISOString(),
  lines,
})

export const toGoodsReceiptLine = (row: {
  readonly id: string
  readonly purchaseOrderLineId: string
  readonly itemId: string
  readonly quantity: string
  readonly unitOfMeasure: string
}): GoodsReceiptLine => ({
  id: row.id,
  purchaseOrderLineId: row.purchaseOrderLineId,
  itemId: row.itemId,
  quantity: row.quantity,
  unitOfMeasure: row.unitOfMeasure,
})

export const canonicalReceiptLines = (lines: ReadonlyArray<PurchaseReceiptLineInput>) =>
  [...lines].sort((left, right) =>
    left.purchaseOrderLineId.localeCompare(right.purchaseOrderLineId)
  )

export const sameReceiptLines = (
  left: ReadonlyArray<PurchaseReceiptLineInput>,
  right: ReadonlyArray<GoodsReceiptLine>,
) => {
  const orderedLeft = canonicalReceiptLines(left)
  const orderedRight = [...right].sort((a, b) =>
    a.purchaseOrderLineId.localeCompare(b.purchaseOrderLineId)
  )
  return orderedLeft.length === orderedRight.length && orderedLeft.every((line, index) => {
    const existing = orderedRight[index]!
    return line.purchaseOrderLineId === existing.purchaseOrderLineId &&
      line.quantity === existing.quantity
  })
}

export const toPurchaseOrder = (row: {
  readonly id: string
  readonly tenantId: string
  readonly supplierAccountId: string
  readonly status: "draft" | "confirmed" | "cancelled"
  readonly confirmedAt: Date | null
  readonly total: string
}, lines: ReadonlyArray<PurchaseOrderLineSnapshot>): PurchaseOrder => ({
  id: row.id,
  tenantId: row.tenantId,
  supplierAccountId: row.supplierAccountId,
  status: row.status,
  confirmedAt: row.confirmedAt?.toISOString() ?? null,
  total: row.total,
  lines,
})

export const deriveTotal = (lines: ReadonlyArray<PurchaseOrderLine>): string => {
  const minor = lines.reduce(
    (total, line) => total + BigInt(line.quantity) * requireExactMajorToMinor(line.unitPrice, 2),
    0n,
  )
  return `${minor / 100n}.${(minor % 100n).toString().padStart(2, "0")}`
}

export const withProcurementOperationNames = (service: ProcurementStore): ProcurementStore => ({
  createSupplierAccount: Effect.fn("ProcurementService.createSupplierAccount")((input: unknown) =>
    service.createSupplierAccount(input)
  ),
  listSupplierAccounts: Effect.fn("ProcurementService.listSupplierAccounts")((input: unknown) =>
    service.listSupplierAccounts(input)
  ),
  createPurchaseOrder: Effect.fn("ProcurementService.createPurchaseOrder")((input: unknown) =>
    service.createPurchaseOrder(input)
  ),
  getPurchaseOrder: Effect.fn("ProcurementService.getPurchaseOrder")((input: unknown) =>
    service.getPurchaseOrder(input)
  ),
  listPurchaseOrders: Effect.fn("ProcurementService.listPurchaseOrders")((input: unknown) =>
    service.listPurchaseOrders(input)
  ),
  listPurchaseReceipts: Effect.fn("ProcurementService.listPurchaseReceipts")((input: unknown) =>
    service.listPurchaseReceipts(input)
  ),
  confirmPurchaseOrder: Effect.fn("ProcurementService.confirmPurchaseOrder")((input: unknown) =>
    service.confirmPurchaseOrder(input)
  ),
  cancelPurchaseOrder: Effect.fn("ProcurementService.cancelPurchaseOrder")((input: unknown) =>
    service.cancelPurchaseOrder(input)
  ),
  receivePurchaseOrder: Effect.fn("ProcurementService.receivePurchaseOrder")((input: unknown) =>
    service.receivePurchaseOrder(input)
  ),
})

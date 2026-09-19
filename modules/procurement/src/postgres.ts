import { and, asc, eq, inArray, sql } from "drizzle-orm"
import * as Clock from "effect/Clock"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"

import {
  purchaseOrderLines,
  purchaseOrders,
  purchaseReceiptLines,
  purchaseReceipts,
  supplierAccounts,
} from "../../../db/schema/procurement.ts"
import { AuthorizationService } from "../../authorization/mod.ts"
import { InventoryService } from "../../inventory/mod.ts"
import {
  CurrentConsistencyToken,
  CurrentDatabaseTransaction,
  Database,
  FinancialMajorAmount,
  isDatabaseConstraint,
  PostgresReadYourWrites,
  ReplicaConsistencyFailure,
  uuidv7,
} from "../../../foundation/mod.ts"
import { MessagingService } from "../../messaging/mod.ts"
import { PartyService } from "../../party/mod.ts"
import { ProcurementCapabilities } from "./capabilities.ts"
import {
  CancelPurchaseOrderInput,
  ConfirmPurchaseOrderInput,
  CreatePurchaseOrderInput,
  CreateSupplierAccountInput,
  GetPurchaseOrderInput,
  GoodsReceipt,
  GoodsReceiptLine,
  ListPurchaseOrdersInput,
  ListPurchaseReceiptsInput,
  ListSupplierAccountsInput,
  ProcurementService,
  PurchaseOrderLineSnapshot,
  ReceivePurchaseOrderInput,
} from "./contract.ts"
import {
  ProcurementPurchaseOrderConfirmedEvent,
  PurchaseOrderConfirmedEventPayload,
} from "./events.ts"
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
import {
  canonicalReceiptLines,
  deriveTotal,
  loadSupplierRelationship,
  purchaseOrderLineListSelection,
  purchaseOrderLineSelection,
  purchaseOrderSelection,
  purchaseReceiptLineListSelection,
  purchaseReceiptLineSelection,
  purchaseReceiptSelection,
  sameReceiptLines,
  supplierAccountSelection,
  toGoodsReceipt,
  toGoodsReceiptLine,
  toPurchaseOrder,
  withProcurementOperationNames,
} from "./store.ts"

export const makeProcurementService = Effect.gen(function* () {
  const database = yield* Database
  const readYourWrites = yield* Effect.serviceOption(PostgresReadYourWrites)
  const authorization = yield* AuthorizationService
  const party = yield* PartyService
  const messaging = yield* MessagingService
  const clock = yield* Clock.Clock
  const now = () => new Date(clock.currentTimeMillisUnsafe())

  const service: ProcurementService = {
    createSupplierAccount: (input) =>
      Effect.gen(function* () {
        const decoded = yield* Schema.decodeUnknownEffect(CreateSupplierAccountInput)(input)
        yield* authorization.authorize({
          principal: decoded.principal,
          tenantId: decoded.tenantId,
          capability: ProcurementCapabilities.supplierAccountCreate,
        })
        const relationship = yield* loadSupplierRelationship(party, decoded)
        const rows = yield* database.query(
          (db) =>
            db.insert(supplierAccounts)
              .values({
                tenantId: decoded.tenantId,
                supplierRelationshipId: decoded.supplierRelationshipId,
              })
              .returning(supplierAccountSelection),
          "procurement.supplier_account.create",
        ).pipe(
          Effect.mapError((error) => {
            if (
              isDatabaseConstraint(error, "supplier_accounts_tenant_supplier_relationship_key")
            ) {
              return new SupplierAccountAlreadyExists({
                tenantId: decoded.tenantId,
                supplierRelationshipId: decoded.supplierRelationshipId,
              })
            }
            if (
              isDatabaseConstraint(
                error,
                "supplier_accounts_tenant_supplier_relationship_fkey",
                "23503",
              )
            ) {
              return new SupplierRelationshipNotEligible({
                tenantId: decoded.tenantId,
                supplierRelationshipId: decoded.supplierRelationshipId,
              })
            }
            return error
          }),
        )
        const account = rows[0]!
        return {
          ...account,
          partyId: relationship.partyId,
          legalEntityId: relationship.legalEntityId,
        }
      }),
    // Fallow: memory and PostgreSQL adapters intentionally mirror public read authorization.
    // fallow-ignore-next-line code-duplication
    listSupplierAccounts: (input) =>
      Effect.gen(function* () {
        const decoded = yield* Schema.decodeUnknownEffect(ListSupplierAccountsInput)(input)
        yield* authorization.authorize({
          principal: decoded.principal,
          tenantId: decoded.tenantId,
          capability: ProcurementCapabilities.purchaseOrderRead,
        })
        const rows = yield* database.query(
          (db) =>
            db.select(supplierAccountSelection)
              .from(supplierAccounts)
              .where(eq(supplierAccounts.tenantId, decoded.tenantId))
              .orderBy(asc(supplierAccounts.id))
              .limit(decoded.limit ?? 200),
          "procurement.supplier_account.list",
        )
        return yield* Effect.forEach(rows, (row) =>
          loadSupplierRelationship(party, {
            principal: decoded.principal,
            tenantId: decoded.tenantId,
            supplierRelationshipId: row.supplierRelationshipId,
          }).pipe(
            Effect.map((relationship) => ({
              ...row,
              partyId: relationship.partyId,
              legalEntityId: relationship.legalEntityId,
            })),
          ))
      }),
    // Fallow: memory and PostgreSQL adapters intentionally mirror public command authorization.
    // fallow-ignore-next-line code-duplication
    createPurchaseOrder: (input) =>
      Effect.gen(function* () {
        const decoded = yield* Schema.decodeUnknownEffect(CreatePurchaseOrderInput)(input)
        yield* authorization.authorize({
          principal: decoded.principal,
          tenantId: decoded.tenantId,
          capability: ProcurementCapabilities.purchaseOrderCreate,
        })
        const total = deriveTotal(decoded.lines)
        yield* Schema.decodeUnknownEffect(FinancialMajorAmount)(total)
        return yield* database.transaction(
          async (tx) => {
            const [order] = await tx.insert(purchaseOrders)
              .values({
                tenantId: decoded.tenantId,
                supplierAccountId: decoded.supplierAccountId,
                total,
              })
              .returning(purchaseOrderSelection)
            const lines = await tx.insert(purchaseOrderLines)
              .values(decoded.lines.map((line) => ({
                tenantId: decoded.tenantId,
                purchaseOrderId: order!.id,
                itemId: line.itemId,
                quantity: line.quantity,
                unitPrice: line.unitPrice,
              })))
              .returning(purchaseOrderLineSelection)
            return toPurchaseOrder(order!, lines)
          },
          "procurement.purchase_order.create",
        ).pipe(
          Effect.mapError((error) =>
            isDatabaseConstraint(
                error,
                "purchase_orders_tenant_supplier_account_fkey",
                "23503",
              )
              ? new SupplierAccountNotFound({
                tenantId: decoded.tenantId,
                supplierAccountId: decoded.supplierAccountId,
              })
              : error
          ),
        )
      }),
    getPurchaseOrder: (input) =>
      Effect.gen(function* () {
        const decoded = yield* Schema.decodeUnknownEffect(GetPurchaseOrderInput)(input)
        yield* authorization.authorize({
          principal: decoded.principal,
          tenantId: decoded.tenantId,
          capability: ProcurementCapabilities.purchaseOrderRead,
        })
        const consistencyToken = yield* CurrentConsistencyToken
        const readDatabase = consistencyToken === undefined
          ? database
          : Option.isSome(readYourWrites)
          ? yield* readYourWrites.value.wait(decoded.tenantId, consistencyToken)
          : yield* Effect.fail(new ReplicaConsistencyFailure({ reason: "disabled" }))
        const read = readDatabase.transaction(
          async (tx) => {
            const [row] = await tx.select(purchaseOrderSelection)
              .from(purchaseOrders)
              .where(and(
                eq(purchaseOrders.tenantId, decoded.tenantId),
                eq(purchaseOrders.id, decoded.purchaseOrderId),
              ))
            if (row === undefined) return undefined
            const lines = await tx.select(purchaseOrderLineSelection)
              .from(purchaseOrderLines)
              .where(and(
                eq(purchaseOrderLines.tenantId, decoded.tenantId),
                eq(purchaseOrderLines.purchaseOrderId, row.id),
              ))
            return toPurchaseOrder(row, lines)
          },
          "procurement.purchase_order.get",
        )
        const order = consistencyToken === undefined
          ? yield* read
          : yield* Effect.provideService(read, CurrentDatabaseTransaction, undefined)
        if (order === undefined) {
          return yield* Effect.fail(
            new PurchaseOrderNotFound({
              tenantId: decoded.tenantId,
              purchaseOrderId: decoded.purchaseOrderId,
            }),
          )
        }
        return order
      }),
    listPurchaseOrders: (input) =>
      Effect.gen(function* () {
        const decoded = yield* Schema.decodeUnknownEffect(ListPurchaseOrdersInput)(input)
        yield* authorization.authorize({
          principal: decoded.principal,
          tenantId: decoded.tenantId,
          capability: ProcurementCapabilities.purchaseOrderRead,
        })
        return yield* database.transaction(
          async (tx) => {
            const orders = await tx.select(purchaseOrderSelection)
              .from(purchaseOrders)
              .where(and(
                eq(purchaseOrders.tenantId, decoded.tenantId),
                decoded.supplierAccountId === undefined
                  ? undefined
                  : eq(purchaseOrders.supplierAccountId, decoded.supplierAccountId),
                decoded.status === undefined
                  ? undefined
                  : eq(purchaseOrders.status, decoded.status),
              ))
              .orderBy(asc(purchaseOrders.id))
              .limit(decoded.limit ?? 200)
            if (orders.length === 0) return []
            const lines = await tx.select(purchaseOrderLineListSelection)
              .from(purchaseOrderLines)
              .where(inArray(purchaseOrderLines.purchaseOrderId, orders.map((order) => order.id)))
            const linesByOrder = new Map<string, PurchaseOrderLineSnapshot[]>()
            for (const line of lines) {
              const orderLines = linesByOrder.get(line.purchaseOrderId) ?? []
              orderLines.push({
                id: line.id,
                itemId: line.itemId,
                quantity: line.quantity,
                unitPrice: line.unitPrice,
              })
              linesByOrder.set(line.purchaseOrderId, orderLines)
            }
            return orders.map((order) => toPurchaseOrder(order, linesByOrder.get(order.id) ?? []))
          },
          "procurement.purchase_order.list",
        )
      }),
    // Fallow: memory and PostgreSQL adapters intentionally mirror public receipt-read authorization.
    // fallow-ignore-next-line code-duplication
    listPurchaseReceipts: (input) =>
      Effect.gen(function* () {
        const decoded = yield* Schema.decodeUnknownEffect(ListPurchaseReceiptsInput)(input)
        yield* authorization.authorize({
          principal: decoded.principal,
          tenantId: decoded.tenantId,
          capability: ProcurementCapabilities.purchaseOrderRead,
        })
        return yield* database.transaction(
          async (tx) => {
            const receipts = await tx.select(purchaseReceiptSelection)
              .from(purchaseReceipts)
              .where(and(
                eq(purchaseReceipts.tenantId, decoded.tenantId),
                eq(purchaseReceipts.purchaseOrderId, decoded.purchaseOrderId),
              ))
              .orderBy(asc(purchaseReceipts.id))
              .limit(decoded.limit ?? 200)
            if (receipts.length === 0) return []
            const lines = await tx.select(purchaseReceiptLineListSelection)
              .from(purchaseReceiptLines)
              .where(inArray(purchaseReceiptLines.receiptId, receipts.map((receipt) => receipt.id)))
            const linesByReceipt = new Map<string, GoodsReceiptLine[]>()
            for (const line of lines) {
              const receiptLines = linesByReceipt.get(line.receiptId) ?? []
              receiptLines.push(toGoodsReceiptLine(line))
              linesByReceipt.set(line.receiptId, receiptLines)
            }
            return receipts.map((receipt) =>
              toGoodsReceipt(receipt, linesByReceipt.get(receipt.id) ?? [])
            )
          },
          "procurement.purchase_receipt.list",
        )
      }),
    confirmPurchaseOrder: (input) =>
      Effect.gen(function* () {
        const decoded = yield* Schema.decodeUnknownEffect(ConfirmPurchaseOrderInput)(input)
        yield* authorization.authorize({
          principal: decoded.principal,
          tenantId: decoded.tenantId,
          capability: ProcurementCapabilities.purchaseOrderConfirm,
        })
        const normalizedIdempotencyKey = decoded.idempotencyKey.trim()
        const result = yield* database.withTransaction(
          Effect.gen(function* () {
            const [row] = yield* database.query(
              (db) =>
                db.select({
                  ...purchaseOrderSelection,
                  confirmationIdempotencyKey: purchaseOrders.confirmationIdempotencyKey,
                })
                  .from(purchaseOrders)
                  .where(and(
                    eq(purchaseOrders.tenantId, decoded.tenantId),
                    eq(purchaseOrders.id, decoded.purchaseOrderId),
                  ))
                  .for("update"),
              "procurement.purchase_order.confirm.lookup",
            )
            if (row === undefined) return { _tag: "not-found" as const }
            const lines = yield* database.query(
              (db) =>
                db.select(purchaseOrderLineSelection)
                  .from(purchaseOrderLines)
                  .where(and(
                    eq(purchaseOrderLines.tenantId, decoded.tenantId),
                    eq(purchaseOrderLines.purchaseOrderId, row.id),
                  )),
              "procurement.purchase_order.confirm.lines",
            )
            const current = toPurchaseOrder(row, lines)
            if (row.status === "confirmed") {
              return row.confirmationIdempotencyKey === normalizedIdempotencyKey
                ? { _tag: "existing" as const, order: current }
                : { _tag: "idempotency-conflict" as const }
            }
            if (row.status !== "draft") {
              return { _tag: "invalid-state" as const, status: row.status }
            }
            const confirmedAt = now()
            const [confirmed] = yield* database.query(
              (db) =>
                db.update(purchaseOrders)
                  .set({
                    status: "confirmed",
                    confirmationIdempotencyKey: normalizedIdempotencyKey,
                    confirmedAt,
                    updatedAt: confirmedAt,
                  })
                  .where(and(
                    eq(purchaseOrders.tenantId, decoded.tenantId),
                    eq(purchaseOrders.id, decoded.purchaseOrderId),
                    eq(purchaseOrders.status, "draft"),
                  ))
                  .returning(purchaseOrderSelection),
              "procurement.purchase_order.confirm.update",
            )
            const order = toPurchaseOrder(confirmed!, lines)
            const payload = yield* Schema.decodeUnknownEffect(
              PurchaseOrderConfirmedEventPayload,
            )({
              purchaseOrderId: order.id,
              supplierAccountId: order.supplierAccountId,
              total: order.total,
            })
            yield* messaging.append({
              eventId: uuidv7(),
              eventType: ProcurementPurchaseOrderConfirmedEvent.id,
              eventVersion: ProcurementPurchaseOrderConfirmedEvent.version,
              tenantId: decoded.tenantId,
              aggregateType: ProcurementPurchaseOrderConfirmedEvent.aggregateType,
              aggregateId: order.id,
              commandId: `procurement.purchase_order.confirm:${normalizedIdempotencyKey}`,
              correlationId: `procurement.purchase_order:${order.id}`,
              causationId: null,
              idempotencyKey: normalizedIdempotencyKey,
              actorPrincipalId: decoded.principal.userAccountId,
              occurredAt: confirmedAt.toISOString(),
              payload,
            })
            return { _tag: "confirmed" as const, order }
          }),
          "procurement.purchase_order.confirm",
        ).pipe(
          Effect.mapError((error) =>
            isDatabaseConstraint(
                error,
                "purchase_orders_tenant_confirmation_idempotency_key",
              )
              ? new PurchaseOrderConfirmationIdempotencyConflict({
                tenantId: decoded.tenantId,
                purchaseOrderId: decoded.purchaseOrderId,
                idempotencyKey: normalizedIdempotencyKey,
              })
              : error
          ),
        )
        if (result._tag === "not-found") {
          return yield* Effect.fail(
            new PurchaseOrderNotFound({
              tenantId: decoded.tenantId,
              purchaseOrderId: decoded.purchaseOrderId,
            }),
          )
        }
        if (result._tag === "idempotency-conflict") {
          return yield* Effect.fail(
            new PurchaseOrderConfirmationIdempotencyConflict({
              tenantId: decoded.tenantId,
              purchaseOrderId: decoded.purchaseOrderId,
              idempotencyKey: normalizedIdempotencyKey,
            }),
          )
        }
        if (result._tag === "invalid-state") {
          return yield* Effect.fail(
            new PurchaseOrderInvalidState({
              tenantId: decoded.tenantId,
              purchaseOrderId: decoded.purchaseOrderId,
              status: result.status,
            }),
          )
        }
        return result.order
      }),
    cancelPurchaseOrder: (input) =>
      Effect.gen(function* () {
        const decoded = yield* Schema.decodeUnknownEffect(CancelPurchaseOrderInput)(input)
        yield* authorization.authorize({
          principal: decoded.principal,
          tenantId: decoded.tenantId,
          capability: ProcurementCapabilities.purchaseOrderCancel,
        })
        const result = yield* database.transaction(
          async (tx) => {
            const [row] = await tx.select(purchaseOrderSelection)
              .from(purchaseOrders)
              .where(and(
                eq(purchaseOrders.tenantId, decoded.tenantId),
                eq(purchaseOrders.id, decoded.purchaseOrderId),
              ))
              .for("update")
            if (row === undefined) return { _tag: "not-found" as const }
            const lines = await tx.select(purchaseOrderLineSelection)
              .from(purchaseOrderLines)
              .where(and(
                eq(purchaseOrderLines.tenantId, decoded.tenantId),
                eq(purchaseOrderLines.purchaseOrderId, row.id),
              ))
            const current = toPurchaseOrder(row, lines)
            if (row.status === "cancelled") {
              return { _tag: "existing" as const, order: current }
            }
            if (row.status !== "confirmed") {
              return { _tag: "invalid-state" as const, status: row.status }
            }
            const [receipt] = await tx.select({ id: purchaseReceipts.id })
              .from(purchaseReceipts)
              .where(and(
                eq(purchaseReceipts.tenantId, decoded.tenantId),
                eq(purchaseReceipts.purchaseOrderId, decoded.purchaseOrderId),
              ))
              .limit(1)
            if (receipt !== undefined) return { _tag: "has-receipts" as const }
            const [cancelled] = await tx.update(purchaseOrders)
              .set({ status: "cancelled", updatedAt: now() })
              .where(and(
                eq(purchaseOrders.tenantId, decoded.tenantId),
                eq(purchaseOrders.id, decoded.purchaseOrderId),
                eq(purchaseOrders.status, "confirmed"),
              ))
              .returning(purchaseOrderSelection)
            return { _tag: "cancelled" as const, order: toPurchaseOrder(cancelled!, lines) }
          },
          "procurement.purchase_order.cancel",
        )
        if (result._tag === "not-found") {
          return yield* Effect.fail(
            new PurchaseOrderNotFound({
              tenantId: decoded.tenantId,
              purchaseOrderId: decoded.purchaseOrderId,
            }),
          )
        }
        if (result._tag === "invalid-state") {
          return yield* Effect.fail(
            new PurchaseOrderInvalidState({
              tenantId: decoded.tenantId,
              purchaseOrderId: decoded.purchaseOrderId,
              status: result.status,
            }),
          )
        }
        if (result._tag === "has-receipts") {
          return yield* Effect.fail(
            new PurchaseOrderHasReceipts({
              tenantId: decoded.tenantId,
              purchaseOrderId: decoded.purchaseOrderId,
            }),
          )
        }
        return result.order
      }),
    receivePurchaseOrder: (input) =>
      Effect.gen(function* () {
        const decoded = yield* Schema.decodeUnknownEffect(ReceivePurchaseOrderInput)(input)
        yield* authorization.authorize({
          principal: decoded.principal,
          tenantId: decoded.tenantId,
          capability: ProcurementCapabilities.purchaseReceiptReceive,
        })
        const normalizedIdempotencyKey = decoded.idempotencyKey.trim()
        const lines = canonicalReceiptLines(decoded.lines)
        const duplicateLine = lines.find((line, index) =>
          index > 0 && lines[index - 1]!.purchaseOrderLineId === line.purchaseOrderLineId
        )
        if (duplicateLine !== undefined) {
          return yield* Effect.fail(
            new PurchaseReceiptLineDuplicate({
              tenantId: decoded.tenantId,
              purchaseOrderId: decoded.purchaseOrderId,
              purchaseOrderLineId: duplicateLine.purchaseOrderLineId,
            }),
          )
        }
        const inventory = yield* InventoryService
        const loadExistingReceipt = () =>
          Effect.gen(function* () {
            const existingRows = yield* database.query(
              (db) =>
                db.select(purchaseReceiptSelection)
                  .from(purchaseReceipts)
                  .where(and(
                    eq(purchaseReceipts.tenantId, decoded.tenantId),
                    eq(purchaseReceipts.idempotencyKey, normalizedIdempotencyKey),
                  ))
                  .for("update"),
              "procurement.purchase_receipt.idempotency",
            )
            const existing = existingRows[0]
            if (existing === undefined) return undefined
            const existingLines = yield* database.query(
              (db) =>
                db.select(purchaseReceiptLineSelection)
                  .from(purchaseReceiptLines)
                  .where(and(
                    eq(purchaseReceiptLines.tenantId, decoded.tenantId),
                    eq(purchaseReceiptLines.receiptId, existing.id),
                  )),
              "procurement.purchase_receipt.idempotency.lines",
            )
            return toGoodsReceipt(existing, existingLines.map(toGoodsReceiptLine))
          })
        const acceptExistingReceipt = (receipt: GoodsReceipt) =>
          receipt.purchaseOrderId === decoded.purchaseOrderId &&
            receipt.warehouseId === decoded.warehouseId &&
            sameReceiptLines(lines, receipt.lines)
            ? Effect.succeed(receipt)
            : Effect.fail(
              new PurchaseReceiptIdempotencyConflict({
                tenantId: decoded.tenantId,
                purchaseOrderId: decoded.purchaseOrderId,
                idempotencyKey: normalizedIdempotencyKey,
              }),
            )
        return yield* database.withTransaction(
          Effect.gen(function* () {
            const existing = yield* loadExistingReceipt()
            if (existing !== undefined) return yield* acceptExistingReceipt(existing)

            const orderRows = yield* database.query(
              (db) =>
                db.select(purchaseOrderSelection)
                  .from(purchaseOrders)
                  .where(and(
                    eq(purchaseOrders.tenantId, decoded.tenantId),
                    eq(purchaseOrders.id, decoded.purchaseOrderId),
                  ))
                  .for("update"),
              "procurement.purchase_receipt.purchase_order",
            )
            const order = orderRows[0]
            if (order === undefined) {
              return yield* Effect.fail(
                new PurchaseOrderNotFound({
                  tenantId: decoded.tenantId,
                  purchaseOrderId: decoded.purchaseOrderId,
                }),
              )
            }
            if (order.status !== "confirmed") {
              return yield* Effect.fail(
                new PurchaseOrderInvalidState({
                  tenantId: decoded.tenantId,
                  purchaseOrderId: decoded.purchaseOrderId,
                  status: order.status,
                }),
              )
            }
            const concurrentExisting = yield* loadExistingReceipt()
            if (concurrentExisting !== undefined) {
              return yield* acceptExistingReceipt(concurrentExisting)
            }

            const [supplierAccount] = yield* database.query(
              (db) =>
                db.select({ supplierRelationshipId: supplierAccounts.supplierRelationshipId })
                  .from(supplierAccounts)
                  .where(and(
                    eq(supplierAccounts.tenantId, decoded.tenantId),
                    eq(supplierAccounts.id, order.supplierAccountId),
                  )),
              "procurement.purchase_receipt.supplier_account",
            )
            if (supplierAccount === undefined) {
              return yield* Effect.fail(
                new SupplierAccountNotFound({
                  tenantId: decoded.tenantId,
                  supplierAccountId: order.supplierAccountId,
                }),
              )
            }
            const supplierRelationship = yield* loadSupplierRelationship(party, {
              principal: decoded.principal,
              tenantId: decoded.tenantId,
              supplierRelationshipId: supplierAccount.supplierRelationshipId,
            })
            const legalEntityId = supplierRelationship.legalEntityId

            const orderLines = yield* database.query(
              (db) =>
                db.select(purchaseOrderLineSelection)
                  .from(purchaseOrderLines)
                  .where(and(
                    eq(purchaseOrderLines.tenantId, decoded.tenantId),
                    eq(purchaseOrderLines.purchaseOrderId, decoded.purchaseOrderId),
                  )),
              "procurement.purchase_receipt.purchase_order_lines",
            )
            const linesById = new Map(orderLines.map((line) => [line.id, line]))
            const receivedRows = yield* database.query(
              (db) =>
                db.select({
                  purchaseOrderLineId: purchaseReceiptLines.purchaseOrderLineId,
                  quantity: sql<string>`coalesce(sum(${purchaseReceiptLines.quantity}), 0)::text`,
                })
                  .from(purchaseReceiptLines)
                  .where(and(
                    eq(purchaseReceiptLines.tenantId, decoded.tenantId),
                    eq(purchaseReceiptLines.purchaseOrderId, decoded.purchaseOrderId),
                  ))
                  .groupBy(purchaseReceiptLines.purchaseOrderLineId),
              "procurement.purchase_receipt.received_quantities",
            )
            const receivedByLine = new Map(
              receivedRows.map((row) => [row.purchaseOrderLineId, row.quantity]),
            )
            for (const line of lines) {
              const orderLine = linesById.get(line.purchaseOrderLineId)
              if (orderLine === undefined) {
                return yield* Effect.fail(
                  new PurchaseReceiptLineNotFound({
                    tenantId: decoded.tenantId,
                    purchaseOrderId: decoded.purchaseOrderId,
                    purchaseOrderLineId: line.purchaseOrderLineId,
                  }),
                )
              }
              const received = receivedByLine.get(line.purchaseOrderLineId) ?? "0"
              if (BigInt(received) + BigInt(line.quantity) > BigInt(orderLine.quantity)) {
                return yield* Effect.fail(
                  new PurchaseReceiptQuantityExceeded({
                    tenantId: decoded.tenantId,
                    purchaseOrderId: decoded.purchaseOrderId,
                    purchaseOrderLineId: line.purchaseOrderLineId,
                    ordered: orderLine.quantity,
                    received,
                    requested: line.quantity,
                  }),
                )
              }
            }

            const [receipt] = yield* database.query(
              (db) =>
                db.insert(purchaseReceipts).values({
                  tenantId: decoded.tenantId,
                  purchaseOrderId: decoded.purchaseOrderId,
                  warehouseId: decoded.warehouseId,
                  idempotencyKey: normalizedIdempotencyKey,
                }).returning(purchaseReceiptSelection),
              "procurement.purchase_receipt.create",
            )
            const receivedLines: GoodsReceiptLine[] = []
            for (const line of lines) {
              const orderLine = linesById.get(line.purchaseOrderLineId)!
              const balance = yield* inventory.receiveStock({
                principal: decoded.principal,
                tenantId: decoded.tenantId,
                warehouseId: decoded.warehouseId,
                itemId: orderLine.itemId,
                quantity: line.quantity,
                legalEntityId,
                referenceId: receipt!.id,
              }).pipe(
                Effect.catchTag("InventoryReferenceNotFound", () =>
                  Effect.fail(
                    new PurchaseReceiptInventoryReferenceNotFound({
                      tenantId: decoded.tenantId,
                      warehouseId: decoded.warehouseId,
                      itemId: orderLine.itemId,
                    }),
                  )),
                Effect.catchTag("InventoryWarehouseLegalEntityMismatch", () =>
                  Effect.fail(
                    new PurchaseReceiptWarehouseLegalEntityMismatch({
                      tenantId: decoded.tenantId,
                      warehouseId: decoded.warehouseId,
                      legalEntityId,
                    }),
                  )),
              )
              receivedLines.push({
                id: uuidv7(),
                purchaseOrderLineId: line.purchaseOrderLineId,
                itemId: orderLine.itemId,
                quantity: line.quantity,
                unitOfMeasure: balance.unitOfMeasure,
              })
            }
            yield* database.query(
              (db) =>
                db.insert(purchaseReceiptLines).values(receivedLines.map((line) => ({
                  id: line.id,
                  tenantId: decoded.tenantId,
                  receiptId: receipt!.id,
                  purchaseOrderId: decoded.purchaseOrderId,
                  purchaseOrderLineId: line.purchaseOrderLineId,
                  itemId: line.itemId,
                  quantity: line.quantity,
                  unitOfMeasure: line.unitOfMeasure,
                }))),
              "procurement.purchase_receipt.lines",
            )
            return toGoodsReceipt(receipt!, receivedLines)
          }),
          "procurement.purchase_receipt.receive",
        ).pipe(
          Effect.mapError((error) =>
            isDatabaseConstraint(error, "purchase_receipts_tenant_idempotency_key")
              ? new PurchaseReceiptIdempotencyConflict({
                tenantId: decoded.tenantId,
                purchaseOrderId: decoded.purchaseOrderId,
                idempotencyKey: normalizedIdempotencyKey,
              })
              : error
          ),
        )
      }),
  }
  return withProcurementOperationNames(service)
})

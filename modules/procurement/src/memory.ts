import * as Clock from "effect/Clock"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"

import { AuthorizationService } from "../../authorization/mod.ts"
import { InventoryService } from "../../inventory/mod.ts"
import { FinancialMajorAmount, uuidv7 } from "../../../foundation/mod.ts"
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
  PurchaseOrder,
  ReceivePurchaseOrderInput,
  SupplierAccount,
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
} from "./errors.ts"
import {
  canonicalReceiptLines,
  deriveTotal,
  loadSupplierRelationship,
  sameReceiptLines,
  withProcurementOperationNames,
} from "./store.ts"

export const makeProcurementTestLayer = () =>
  Layer.effect(
    ProcurementService,
    Effect.gen(function* () {
      const authorization = yield* AuthorizationService
      const messaging = yield* MessagingService
      const party = yield* PartyService
      const clock = yield* Clock.Clock
      const now = () => new Date(clock.currentTimeMillisUnsafe())
      const storedSupplierAccounts = new Map<string, SupplierAccount>()
      const storedPurchaseOrders = new Map<string, PurchaseOrder>()
      const confirmationKeys = new Map<string, string>()
      const confirmationOrderIdsByKey = new Map<string, string>()
      const storedReceipts = new Map<string, GoodsReceipt>()
      const receivedQuantities = new Map<string, bigint>()

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
            if (
              [...storedSupplierAccounts.values()].some((account) =>
                account.tenantId === decoded.tenantId &&
                account.supplierRelationshipId === decoded.supplierRelationshipId
              )
            ) {
              return yield* Effect.fail(
                new SupplierAccountAlreadyExists({
                  tenantId: decoded.tenantId,
                  supplierRelationshipId: decoded.supplierRelationshipId,
                }),
              )
            }
            const account: SupplierAccount = {
              id: uuidv7(),
              tenantId: decoded.tenantId,
              supplierRelationshipId: decoded.supplierRelationshipId,
              partyId: relationship.partyId,
              legalEntityId: relationship.legalEntityId,
            }
            storedSupplierAccounts.set(account.id, account)
            return account
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
            return [...storedSupplierAccounts.values()]
              .filter((account) => account.tenantId === decoded.tenantId)
              .sort((left, right) => left.id.localeCompare(right.id))
              .slice(0, decoded.limit ?? 200)
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
            if (
              storedSupplierAccounts.get(decoded.supplierAccountId)?.tenantId !== decoded.tenantId
            ) {
              return yield* Effect.fail(
                new SupplierAccountNotFound({
                  tenantId: decoded.tenantId,
                  supplierAccountId: decoded.supplierAccountId,
                }),
              )
            }
            const order: PurchaseOrder = {
              id: uuidv7(),
              tenantId: decoded.tenantId,
              supplierAccountId: decoded.supplierAccountId,
              status: "draft",
              confirmedAt: null,
              total,
              lines: decoded.lines.map((line) => ({ id: uuidv7(), ...line })),
            }
            storedPurchaseOrders.set(order.id, order)
            return order
          }),
        getPurchaseOrder: (input) =>
          Effect.gen(function* () {
            const decoded = yield* Schema.decodeUnknownEffect(GetPurchaseOrderInput)(input)
            yield* authorization.authorize({
              principal: decoded.principal,
              tenantId: decoded.tenantId,
              capability: ProcurementCapabilities.purchaseOrderRead,
            })
            const order = storedPurchaseOrders.get(decoded.purchaseOrderId)
            if (order?.tenantId !== decoded.tenantId) {
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
            return [...storedPurchaseOrders.values()]
              .filter((order) =>
                order.tenantId === decoded.tenantId &&
                (decoded.supplierAccountId === undefined ||
                  order.supplierAccountId === decoded.supplierAccountId) &&
                (decoded.status === undefined || order.status === decoded.status)
              )
              .sort((left, right) => left.id.localeCompare(right.id))
              .slice(0, decoded.limit ?? 200)
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
            return [...storedReceipts.values()]
              .filter((receipt) =>
                receipt.tenantId === decoded.tenantId &&
                receipt.purchaseOrderId === decoded.purchaseOrderId
              )
              .sort((left, right) => left.id.localeCompare(right.id))
              .slice(0, decoded.limit ?? 200)
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
            const order = storedPurchaseOrders.get(decoded.purchaseOrderId)
            if (order?.tenantId !== decoded.tenantId) {
              return yield* Effect.fail(
                new PurchaseOrderNotFound({
                  tenantId: decoded.tenantId,
                  purchaseOrderId: decoded.purchaseOrderId,
                }),
              )
            }
            if (order.status === "confirmed") {
              if (confirmationKeys.get(order.id) !== normalizedIdempotencyKey) {
                return yield* Effect.fail(
                  new PurchaseOrderConfirmationIdempotencyConflict({
                    tenantId: decoded.tenantId,
                    purchaseOrderId: decoded.purchaseOrderId,
                    idempotencyKey: normalizedIdempotencyKey,
                  }),
                )
              }
              return order
            }
            if (order.status !== "draft") {
              return yield* Effect.fail(
                new PurchaseOrderInvalidState({
                  tenantId: decoded.tenantId,
                  purchaseOrderId: decoded.purchaseOrderId,
                  status: order.status,
                }),
              )
            }
            const confirmationKey = `${decoded.tenantId}:${normalizedIdempotencyKey}`
            const existingOrderId = confirmationOrderIdsByKey.get(confirmationKey)
            if (existingOrderId !== undefined && existingOrderId !== order.id) {
              return yield* Effect.fail(
                new PurchaseOrderConfirmationIdempotencyConflict({
                  tenantId: decoded.tenantId,
                  purchaseOrderId: decoded.purchaseOrderId,
                  idempotencyKey: normalizedIdempotencyKey,
                }),
              )
            }
            const confirmed: PurchaseOrder = {
              ...order,
              status: "confirmed",
              confirmedAt: now().toISOString(),
            }
            const payload = yield* Schema.decodeUnknownEffect(
              PurchaseOrderConfirmedEventPayload,
            )({
              purchaseOrderId: confirmed.id,
              supplierAccountId: confirmed.supplierAccountId,
              total: confirmed.total,
            })
            yield* messaging.append({
              eventId: uuidv7(),
              eventType: ProcurementPurchaseOrderConfirmedEvent.id,
              eventVersion: ProcurementPurchaseOrderConfirmedEvent.version,
              tenantId: decoded.tenantId,
              aggregateType: ProcurementPurchaseOrderConfirmedEvent.aggregateType,
              aggregateId: confirmed.id,
              commandId: `procurement.purchase_order.confirm:${normalizedIdempotencyKey}`,
              correlationId: `procurement.purchase_order:${confirmed.id}`,
              causationId: null,
              idempotencyKey: normalizedIdempotencyKey,
              actorPrincipalId: decoded.principal.userAccountId,
              occurredAt: confirmed.confirmedAt!,
              payload,
            })
            storedPurchaseOrders.set(order.id, confirmed)
            confirmationKeys.set(order.id, normalizedIdempotencyKey)
            confirmationOrderIdsByKey.set(confirmationKey, order.id)
            return confirmed
          }),
        cancelPurchaseOrder: (input) =>
          Effect.gen(function* () {
            const decoded = yield* Schema.decodeUnknownEffect(CancelPurchaseOrderInput)(input)
            yield* authorization.authorize({
              principal: decoded.principal,
              tenantId: decoded.tenantId,
              capability: ProcurementCapabilities.purchaseOrderCancel,
            })
            const order = storedPurchaseOrders.get(decoded.purchaseOrderId)
            if (order?.tenantId !== decoded.tenantId) {
              return yield* Effect.fail(
                new PurchaseOrderNotFound({
                  tenantId: decoded.tenantId,
                  purchaseOrderId: decoded.purchaseOrderId,
                }),
              )
            }
            if (order.status === "cancelled") return order
            if (order.status !== "confirmed") {
              return yield* Effect.fail(
                new PurchaseOrderInvalidState({
                  tenantId: decoded.tenantId,
                  purchaseOrderId: decoded.purchaseOrderId,
                  status: order.status,
                }),
              )
            }
            if (
              [...storedReceipts.values()].some((receipt) =>
                receipt.tenantId === decoded.tenantId && receipt.purchaseOrderId === order.id
              )
            ) {
              return yield* Effect.fail(
                new PurchaseOrderHasReceipts({
                  tenantId: decoded.tenantId,
                  purchaseOrderId: decoded.purchaseOrderId,
                }),
              )
            }
            const cancelled: PurchaseOrder = { ...order, status: "cancelled" }
            storedPurchaseOrders.set(order.id, cancelled)
            return cancelled
          }),
        receivePurchaseOrder: (input) =>
          Effect.gen(function* () {
            const inventory = yield* InventoryService
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
            const receiptKey = `${decoded.tenantId}:${normalizedIdempotencyKey}`
            const existing = storedReceipts.get(receiptKey)
            if (existing !== undefined) {
              if (
                existing.purchaseOrderId !== decoded.purchaseOrderId ||
                existing.warehouseId !== decoded.warehouseId ||
                !sameReceiptLines(lines, existing.lines)
              ) {
                return yield* Effect.fail(
                  new PurchaseReceiptIdempotencyConflict({
                    tenantId: decoded.tenantId,
                    purchaseOrderId: decoded.purchaseOrderId,
                    idempotencyKey: normalizedIdempotencyKey,
                  }),
                )
              }
              return existing
            }
            const order = storedPurchaseOrders.get(decoded.purchaseOrderId)
            if (order?.tenantId !== decoded.tenantId) {
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
            const supplierAccount = storedSupplierAccounts.get(order.supplierAccountId)
            if (supplierAccount === undefined) {
              return yield* Effect.fail(
                new SupplierAccountNotFound({
                  tenantId: decoded.tenantId,
                  supplierAccountId: order.supplierAccountId,
                }),
              )
            }
            const linesById = new Map(order.lines.map((line) => [line.id, line]))
            const nextQuantities = new Map(receivedQuantities)
            const receiptId = uuidv7()
            const receivedLines: GoodsReceiptLine[] = []
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
              const receivedKey = `${decoded.purchaseOrderId}:${line.purchaseOrderLineId}`
              const received = nextQuantities.get(receivedKey) ?? 0n
              if (received + BigInt(line.quantity) > BigInt(orderLine.quantity)) {
                return yield* Effect.fail(
                  new PurchaseReceiptQuantityExceeded({
                    tenantId: decoded.tenantId,
                    purchaseOrderId: decoded.purchaseOrderId,
                    purchaseOrderLineId: line.purchaseOrderLineId,
                    ordered: orderLine.quantity,
                    received: String(received),
                    requested: line.quantity,
                  }),
                )
              }
              const balance = yield* inventory.receiveStock({
                principal: decoded.principal,
                tenantId: decoded.tenantId,
                warehouseId: decoded.warehouseId,
                itemId: orderLine.itemId,
                quantity: line.quantity,
                legalEntityId: supplierAccount.legalEntityId,
                referenceId: receiptId,
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
                      legalEntityId: supplierAccount.legalEntityId,
                    }),
                  )),
              )
              nextQuantities.set(receivedKey, received + BigInt(line.quantity))
              receivedLines.push({
                id: uuidv7(),
                purchaseOrderLineId: line.purchaseOrderLineId,
                itemId: orderLine.itemId,
                quantity: line.quantity,
                unitOfMeasure: balance.unitOfMeasure,
              })
            }
            for (const [key, quantity] of nextQuantities) receivedQuantities.set(key, quantity)
            const receipt: GoodsReceipt = {
              id: receiptId,
              tenantId: decoded.tenantId,
              purchaseOrderId: decoded.purchaseOrderId,
              warehouseId: decoded.warehouseId,
              idempotencyKey: normalizedIdempotencyKey,
              receivedAt: now().toISOString(),
              lines: receivedLines,
            }
            storedReceipts.set(receiptKey, receipt)
            return receipt
          }),
      }
      return withProcurementOperationNames(service)
    }),
  )

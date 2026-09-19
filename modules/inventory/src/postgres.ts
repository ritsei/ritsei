import { and, asc, eq, gte, ilike, inArray, or, sql } from "drizzle-orm"
import * as Clock from "effect/Clock"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"

import {
  items,
  movements,
  reservations,
  stockBalances,
  stockTransferLines,
  stockTransfers,
  warehouses,
} from "../../../db/schema/inventory.ts"
import { AuthorizationService } from "../../authorization/mod.ts"
import { InventoryCapabilities } from "./capabilities.ts"
import { Database, DatabaseFailure, isDatabaseConstraint, uuidv7 } from "../../../foundation/mod.ts"
import { MessagingService } from "../../messaging/mod.ts"
import { InventoryStockCorrectedEvent, StockCorrectedEventPayload } from "./events.ts"
import {
  AdjustStockInput,
  CompleteStockTransferInput,
  ConfirmStockTransferInput,
  CreateItemInput,
  CreateStockTransferInput,
  CreateWarehouseInput,
  FulfillReservationInput,
  InventoryService,
  ListItemsInput,
  ListStockBalancesInput,
  ListStockMovementsInput,
  ListStockReservationsInput,
  ListStockTransfersInput,
  ListWarehousesInput,
  ReceiveStockInput,
  ReleaseReservationInput,
  ReserveStockInput,
  StockCorrection,
  StockTransfer,
  StockTransferLine,
  StockTransferStatus,
} from "./contract.ts"
import {
  InventoryReferenceNotFound,
  InventoryUnitOfMeasureMismatch,
  InventoryWarehouseLegalEntityMismatch,
  ItemAlreadyExists,
  StockCorrectionIdempotencyConflict,
  StockReservationIdempotencyConflict,
  StockReservationInvalidState,
  StockReservationLegalEntityMismatch,
  StockReservationNotFound,
  StockTransferDifferentLegalEntity,
  StockTransferDuplicateItem,
  StockTransferInvalidState,
  StockTransferItemNotFound,
  StockTransferNotFound,
  StockTransferSameWarehouse,
  StockTransferWarehouseNotFound,
  StockUnavailable,
  WarehouseAlreadyExists,
  WarehouseBranchNotFound,
  WarehouseLegalEntityNotFound,
} from "./errors.ts"

const referenceFailure = (tenantId: string, warehouseId: string, itemId: string) =>
  new InventoryReferenceNotFound({ tenantId, warehouseId, itemId })

const warehouseSelection = {
  id: warehouses.id,
  tenantId: warehouses.tenantId,
  legalEntityId: warehouses.legalEntityId,
  primaryBranchId: warehouses.primaryBranchId,
  name: warehouses.name,
}

const itemSelection = {
  id: items.id,
  tenantId: items.tenantId,
  sku: items.sku,
  name: items.name,
  unitOfMeasure: items.unitOfMeasure,
}

const balanceSelection = {
  tenantId: stockBalances.tenantId,
  warehouseId: stockBalances.warehouseId,
  itemId: stockBalances.itemId,
  onHand: stockBalances.onHand,
  reserved: stockBalances.reserved,
  unitOfMeasure: items.unitOfMeasure,
}

const movementSelection = {
  id: movements.id,
  tenantId: movements.tenantId,
  warehouseId: movements.warehouseId,
  itemId: movements.itemId,
  quantity: movements.quantity,
  kind: movements.kind,
  referenceId: movements.referenceId,
  unitOfMeasure: movements.unitOfMeasure,
  reason: movements.reason,
  idempotencyKey: movements.idempotencyKey,
}

const correctionSelection = {
  id: movements.id,
  tenantId: movements.tenantId,
  kind: movements.kind,
  warehouseId: movements.warehouseId,
  itemId: movements.itemId,
  adjustment: movements.quantity,
  unitOfMeasure: movements.unitOfMeasure,
  reason: movements.reason,
  idempotencyKey: movements.idempotencyKey,
}

const toStockCorrection = (row: {
  readonly id: string
  readonly tenantId: string
  readonly kind: "receipt" | "issue" | "reservation" | "release"
  readonly warehouseId: string
  readonly itemId: string
  readonly adjustment: string
  readonly unitOfMeasure: string | null
  readonly reason: string | null
  readonly idempotencyKey: string | null
}): StockCorrection => ({
  id: row.id,
  tenantId: row.tenantId,
  warehouseId: row.warehouseId,
  itemId: row.itemId,
  adjustment: row.adjustment,
  unitOfMeasure: row.unitOfMeasure!,
  reason: row.reason!,
  idempotencyKey: row.idempotencyKey!,
})

const reservationSelection = {
  id: reservations.id,
  tenantId: reservations.tenantId,
  warehouseId: reservations.warehouseId,
  itemId: reservations.itemId,
  quantity: reservations.quantity,
  idempotencyKey: reservations.idempotencyKey,
  status: reservations.status,
}

const transferSelection = {
  id: stockTransfers.id,
  tenantId: stockTransfers.tenantId,
  legalEntityId: stockTransfers.legalEntityId,
  sourceWarehouseId: stockTransfers.sourceWarehouseId,
  destinationWarehouseId: stockTransfers.destinationWarehouseId,
  status: stockTransfers.status,
  confirmedAt: stockTransfers.confirmedAt,
  completedAt: stockTransfers.completedAt,
}

const transferLineSelection = {
  itemId: stockTransferLines.itemId,
  quantity: stockTransferLines.quantity,
}

const toStockTransfer = (
  row: {
    readonly id: string
    readonly tenantId: string
    readonly legalEntityId: string
    readonly sourceWarehouseId: string
    readonly destinationWarehouseId: string
    readonly status: StockTransferStatus
    readonly confirmedAt: Date | null
    readonly completedAt: Date | null
  },
  lines: readonly StockTransferLine[],
): StockTransfer => ({
  id: row.id,
  tenantId: row.tenantId,
  legalEntityId: row.legalEntityId,
  sourceWarehouseId: row.sourceWarehouseId,
  destinationWarehouseId: row.destinationWarehouseId,
  status: row.status,
  confirmedAt: row.confirmedAt?.toISOString() ?? null,
  completedAt: row.completedAt?.toISOString() ?? null,
  lines,
})

const mapTransferCreateError = (
  error: DatabaseFailure,
  input: Schema.Schema.Type<typeof CreateStockTransferInput>,
) =>
  isDatabaseConstraint(error, "stock_transfers_distinct_warehouses_check", "23514")
    ? new StockTransferSameWarehouse({
      tenantId: input.tenantId,
      warehouseId: input.sourceWarehouseId,
    })
    : error

const escapeLikePattern = (value: string) =>
  value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")

export const makeInventoryPostgresService = Effect.gen(function* () {
  const database = yield* Database
  const authorization = yield* AuthorizationService
  const messaging = yield* MessagingService
  const clock = yield* Clock.Clock
  const now = () => new Date(clock.currentTimeMillisUnsafe())
  const store = {
    listWarehouses: (input) =>
      Effect.gen(function* () {
        const decoded = yield* Schema.decodeUnknownEffect(ListWarehousesInput)(input)
        yield* authorization.authorize({
          principal: decoded.principal,
          tenantId: decoded.tenantId,
          capability: InventoryCapabilities.warehouseRead,
        })
        return yield* database.query(
          (db) =>
            db.select(warehouseSelection)
              .from(warehouses)
              .where(and(
                eq(warehouses.tenantId, decoded.tenantId),
                decoded.legalEntityId === undefined
                  ? undefined
                  : eq(warehouses.legalEntityId, decoded.legalEntityId),
              ))
              .orderBy(asc(warehouses.id))
              .limit(decoded.limit ?? 200),
          "inventory.warehouse.list",
        )
      }),
    listItems: (input) =>
      Effect.gen(function* () {
        const decoded = yield* Schema.decodeUnknownEffect(ListItemsInput)(input)
        yield* authorization.authorize({
          principal: decoded.principal,
          tenantId: decoded.tenantId,
          capability: InventoryCapabilities.itemRead,
        })
        const search = decoded.search === undefined ? undefined : escapeLikePattern(decoded.search)
        return yield* database.query(
          (db) =>
            db.select(itemSelection)
              .from(items)
              .where(and(
                eq(items.tenantId, decoded.tenantId),
                search === undefined ? undefined : or(
                  ilike(items.sku, `%${search}%`),
                  ilike(items.name, `%${search}%`),
                ),
              ))
              .orderBy(asc(items.id))
              .limit(decoded.limit ?? 200),
          "inventory.item.list",
        )
      }),
    listStockBalances: (input) =>
      Effect.gen(function* () {
        const decoded = yield* Schema.decodeUnknownEffect(ListStockBalancesInput)(input)
        yield* authorization.authorize({
          principal: decoded.principal,
          tenantId: decoded.tenantId,
          capability: InventoryCapabilities.stockRead,
        })
        return yield* database.query(
          (db) =>
            db.select(balanceSelection)
              .from(stockBalances)
              .innerJoin(
                items,
                and(
                  eq(items.tenantId, stockBalances.tenantId),
                  eq(items.id, stockBalances.itemId),
                ),
              )
              .where(and(
                eq(stockBalances.tenantId, decoded.tenantId),
                decoded.warehouseId === undefined
                  ? undefined
                  : eq(stockBalances.warehouseId, decoded.warehouseId),
                decoded.itemId === undefined ? undefined : eq(stockBalances.itemId, decoded.itemId),
              ))
              .orderBy(asc(stockBalances.warehouseId), asc(stockBalances.itemId))
              .limit(decoded.limit ?? 200),
          "inventory.stock.balance.list",
        )
      }),
    listStockReservations: (input) =>
      Effect.gen(function* () {
        const decoded = yield* Schema.decodeUnknownEffect(ListStockReservationsInput)(input)
        yield* authorization.authorize({
          principal: decoded.principal,
          tenantId: decoded.tenantId,
          capability: InventoryCapabilities.stockRead,
        })
        return yield* database.query(
          (db) =>
            db.select(reservationSelection)
              .from(reservations)
              .where(and(
                eq(reservations.tenantId, decoded.tenantId),
                decoded.warehouseId === undefined
                  ? undefined
                  : eq(reservations.warehouseId, decoded.warehouseId),
                decoded.itemId === undefined ? undefined : eq(reservations.itemId, decoded.itemId),
                decoded.status === undefined ? undefined : eq(reservations.status, decoded.status),
              ))
              .orderBy(asc(reservations.id))
              .limit(decoded.limit ?? 200),
          "inventory.stock.reservation.list",
        )
      }),
    listStockTransfers: (input) =>
      Effect.gen(function* () {
        const decoded = yield* Schema.decodeUnknownEffect(ListStockTransfersInput)(input)
        yield* authorization.authorize({
          principal: decoded.principal,
          tenantId: decoded.tenantId,
          capability: InventoryCapabilities.stockRead,
        })
        return yield* database.transaction(
          async (tx) => {
            const transfers = await tx.select(transferSelection)
              .from(stockTransfers)
              .where(and(
                eq(stockTransfers.tenantId, decoded.tenantId),
                decoded.warehouseId === undefined ? undefined : or(
                  eq(stockTransfers.sourceWarehouseId, decoded.warehouseId),
                  eq(stockTransfers.destinationWarehouseId, decoded.warehouseId),
                ),
                decoded.status === undefined
                  ? undefined
                  : eq(stockTransfers.status, decoded.status),
              ))
              .orderBy(asc(stockTransfers.id))
              .limit(decoded.limit ?? 200)
            if (transfers.length === 0) return []
            const lines = await tx.select({
              transferId: stockTransferLines.transferId,
              itemId: stockTransferLines.itemId,
              quantity: stockTransferLines.quantity,
            })
              .from(stockTransferLines)
              .where(and(
                eq(stockTransferLines.tenantId, decoded.tenantId),
                inArray(stockTransferLines.transferId, transfers.map((transfer) => transfer.id)),
              ))
              .orderBy(asc(stockTransferLines.transferId), asc(stockTransferLines.itemId))
            const linesByTransfer = new Map<string, StockTransferLine[]>()
            for (const line of lines) {
              const transferLines = linesByTransfer.get(line.transferId) ?? []
              transferLines.push({ itemId: line.itemId, quantity: line.quantity })
              linesByTransfer.set(line.transferId, transferLines)
            }
            return transfers.map((transfer) =>
              toStockTransfer(transfer, linesByTransfer.get(transfer.id) ?? [])
            )
          },
          "inventory.stock.transfer.list",
        )
      }),
    listStockMovements: (input) =>
      Effect.gen(function* () {
        const decoded = yield* Schema.decodeUnknownEffect(ListStockMovementsInput)(input)
        yield* authorization.authorize({
          principal: decoded.principal,
          tenantId: decoded.tenantId,
          capability: InventoryCapabilities.stockRead,
        })
        return yield* database.query(
          (db) =>
            db.select(movementSelection)
              .from(movements)
              .where(and(
                eq(movements.tenantId, decoded.tenantId),
                decoded.warehouseId === undefined
                  ? undefined
                  : eq(movements.warehouseId, decoded.warehouseId),
                decoded.itemId === undefined ? undefined : eq(movements.itemId, decoded.itemId),
                decoded.kind === undefined ? undefined : eq(movements.kind, decoded.kind),
              ))
              .orderBy(asc(movements.createdAt), asc(movements.id))
              .limit(decoded.limit ?? 200),
          "inventory.stock.movement.list",
        )
      }),
    createWarehouse: (input) =>
      Effect.gen(function* () {
        const decoded = yield* Schema.decodeUnknownEffect(CreateWarehouseInput)(input)
        yield* authorization.authorize({
          principal: decoded.principal,
          tenantId: decoded.tenantId,
          capability: InventoryCapabilities.warehouseCreate,
        })
        const name = decoded.name.trim()
        const primaryBranchId = decoded.primaryBranchId ?? null
        const rows = yield* database.query(
          (db) =>
            db.insert(warehouses).values({
              tenantId: decoded.tenantId,
              legalEntityId: decoded.legalEntityId,
              primaryBranchId,
              name,
            }).returning({
              id: warehouses.id,
              tenantId: warehouses.tenantId,
              legalEntityId: warehouses.legalEntityId,
              primaryBranchId: warehouses.primaryBranchId,
              name: warehouses.name,
            }),
          "inventory.warehouse.create",
        ).pipe(
          Effect.mapError((error) => {
            if (isDatabaseConstraint(error, "warehouses_tenant_name_key")) {
              return new WarehouseAlreadyExists({ tenantId: decoded.tenantId, name })
            }
            if (isDatabaseConstraint(error, "warehouses_tenant_legal_entity_fkey", "23503")) {
              return new WarehouseLegalEntityNotFound({
                tenantId: decoded.tenantId,
                legalEntityId: decoded.legalEntityId,
              })
            }
            if (
              primaryBranchId !== null &&
              isDatabaseConstraint(error, "warehouses_tenant_legal_entity_branch_fkey", "23503")
            ) {
              return new WarehouseBranchNotFound({
                tenantId: decoded.tenantId,
                legalEntityId: decoded.legalEntityId,
                branchId: primaryBranchId,
              })
            }
            return error
          }),
        )
        return rows[0]!
      }),
    createItem: (input) =>
      Effect.gen(function* () {
        const decoded = yield* Schema.decodeUnknownEffect(CreateItemInput)(input)
        yield* authorization.authorize({
          principal: decoded.principal,
          tenantId: decoded.tenantId,
          capability: InventoryCapabilities.itemCreate,
        })
        const sku = decoded.sku.trim().toUpperCase()
        const unitOfMeasure = decoded.unitOfMeasure.trim().toUpperCase()
        const rows = yield* database.query(
          (db) =>
            db.insert(items).values({
              tenantId: decoded.tenantId,
              sku,
              name: decoded.name.trim(),
              unitOfMeasure,
            }).returning({
              id: items.id,
              tenantId: items.tenantId,
              sku: items.sku,
              name: items.name,
              unitOfMeasure: items.unitOfMeasure,
            }),
          "inventory.item.create",
        ).pipe(
          Effect.mapError((error) =>
            isDatabaseConstraint(error, "items_tenant_sku_key")
              ? new ItemAlreadyExists({ tenantId: decoded.tenantId, sku })
              : error
          ),
        )
        return rows[0]!
      }),
    receiveStock: (input) =>
      Effect.gen(function* () {
        const decoded = yield* Schema.decodeUnknownEffect(ReceiveStockInput)(input)
        yield* authorization.authorize({
          principal: decoded.principal,
          tenantId: decoded.tenantId,
          capability: InventoryCapabilities.stockReceive,
        })
        const balance = yield* database.transaction(
          async (tx) => {
            const [warehouse] = await tx.select({ legalEntityId: warehouses.legalEntityId })
              .from(warehouses)
              .where(and(
                eq(warehouses.tenantId, decoded.tenantId),
                eq(warehouses.id, decoded.warehouseId),
              ))
              .for("update")
            const [item] = await tx.select({ unitOfMeasure: items.unitOfMeasure })
              .from(items)
              .where(and(eq(items.tenantId, decoded.tenantId), eq(items.id, decoded.itemId)))
            if (warehouse === undefined || item === undefined) return { _tag: "not-found" as const }
            if (
              decoded.legalEntityId !== undefined &&
              warehouse.legalEntityId !== decoded.legalEntityId
            ) {
              return { _tag: "legal-entity-mismatch" as const }
            }
            const rows = await tx.insert(stockBalances)
              .values({
                tenantId: decoded.tenantId,
                warehouseId: decoded.warehouseId,
                itemId: decoded.itemId,
                onHand: decoded.quantity,
              })
              .onConflictDoUpdate({
                target: [stockBalances.tenantId, stockBalances.warehouseId, stockBalances.itemId],
                set: {
                  onHand: sql`${stockBalances.onHand} + ${decoded.quantity}`,
                  updatedAt: now(),
                },
              })
              .returning({
                tenantId: stockBalances.tenantId,
                warehouseId: stockBalances.warehouseId,
                itemId: stockBalances.itemId,
                onHand: stockBalances.onHand,
                reserved: stockBalances.reserved,
              })
            await tx.insert(movements).values({
              tenantId: decoded.tenantId,
              warehouseId: decoded.warehouseId,
              itemId: decoded.itemId,
              quantity: decoded.quantity,
              kind: "receipt",
              referenceId: decoded.referenceId ?? null,
            })
            return {
              _tag: "created" as const,
              balance: { ...rows[0]!, unitOfMeasure: item.unitOfMeasure },
            }
          },
          "inventory.stock.receive",
        ).pipe(
          Effect.mapError((error) =>
            isDatabaseConstraint(error, "stock_balances_warehouse_fkey", "23503") ||
              isDatabaseConstraint(error, "stock_balances_item_fkey", "23503")
              ? referenceFailure(decoded.tenantId, decoded.warehouseId, decoded.itemId)
              : error
          ),
        )
        if (balance._tag === "not-found") {
          return yield* Effect.fail(
            referenceFailure(decoded.tenantId, decoded.warehouseId, decoded.itemId),
          )
        }
        if (balance._tag === "legal-entity-mismatch") {
          return yield* Effect.fail(
            new InventoryWarehouseLegalEntityMismatch({
              tenantId: decoded.tenantId,
              warehouseId: decoded.warehouseId,
              legalEntityId: decoded.legalEntityId!,
            }),
          )
        }
        return balance.balance
      }),
    adjustStock: (input) =>
      Effect.gen(function* () {
        const decoded = yield* Schema.decodeUnknownEffect(AdjustStockInput)(input)
        yield* authorization.authorize({
          principal: decoded.principal,
          tenantId: decoded.tenantId,
          capability: InventoryCapabilities.stockAdjust,
        })
        const unitOfMeasure = decoded.unitOfMeasure.trim().toUpperCase()
        const reason = decoded.reason.trim()
        const commandId = decoded.commandId.trim()
        const correlationId = decoded.correlationId.trim()
        const causationId = decoded.causationId?.trim() ?? null
        const idempotencyKey = decoded.idempotencyKey.trim()
        const result = yield* database.withTransaction(
          Effect.gen(function* () {
            const mutation = yield* database.transaction(
              async (tx) => {
                const [existing] = await tx.select(correctionSelection)
                  .from(movements)
                  .where(
                    and(
                      eq(movements.tenantId, decoded.tenantId),
                      eq(movements.idempotencyKey, idempotencyKey),
                    ),
                  )
                  .for("update")
                if (existing !== undefined) {
                  if (
                    existing.warehouseId !== decoded.warehouseId ||
                    existing.itemId !== decoded.itemId ||
                    existing.adjustment !== decoded.adjustment ||
                    existing.unitOfMeasure !== unitOfMeasure ||
                    existing.reason !== reason
                  ) return { _tag: "idempotency-conflict" as const }
                  return { _tag: "existing" as const, correction: toStockCorrection(existing) }
                }

                const [item] = await tx.select({ unitOfMeasure: items.unitOfMeasure })
                  .from(items)
                  .where(and(eq(items.tenantId, decoded.tenantId), eq(items.id, decoded.itemId)))
                  .for("update")
                const [warehouse] = await tx.select({ id: warehouses.id })
                  .from(warehouses)
                  .where(
                    and(
                      eq(warehouses.tenantId, decoded.tenantId),
                      eq(warehouses.id, decoded.warehouseId),
                    ),
                  )
                if (item === undefined || warehouse === undefined) {
                  return { _tag: "not-found" as const }
                }
                if (item.unitOfMeasure !== unitOfMeasure) {
                  return {
                    _tag: "uom-mismatch" as const,
                    expected: item.unitOfMeasure,
                    actual: unitOfMeasure,
                  }
                }

                const adjustment = BigInt(decoded.adjustment)
                const occurredAt = now()
                const [balance] = await tx.select({
                  onHand: stockBalances.onHand,
                  reserved: stockBalances.reserved,
                }).from(stockBalances).where(
                  and(
                    eq(stockBalances.tenantId, decoded.tenantId),
                    eq(stockBalances.warehouseId, decoded.warehouseId),
                    eq(stockBalances.itemId, decoded.itemId),
                  ),
                ).for("update")
                if (balance !== undefined) {
                  const [existingAfterLock] = await tx.select(correctionSelection)
                    .from(movements)
                    .where(and(
                      eq(movements.tenantId, decoded.tenantId),
                      eq(movements.idempotencyKey, idempotencyKey),
                    ))
                    .for("update")
                  if (existingAfterLock !== undefined) {
                    if (
                      existingAfterLock.warehouseId !== decoded.warehouseId ||
                      existingAfterLock.itemId !== decoded.itemId ||
                      existingAfterLock.adjustment !== decoded.adjustment ||
                      existingAfterLock.unitOfMeasure !== unitOfMeasure ||
                      existingAfterLock.reason !== reason
                    ) return { _tag: "idempotency-conflict" as const }
                    return {
                      _tag: "existing" as const,
                      correction: toStockCorrection(existingAfterLock),
                    }
                  }
                }
                if (adjustment < 0n) {
                  if (
                    balance === undefined ||
                    BigInt(balance.onHand) + adjustment < BigInt(balance.reserved)
                  ) return { _tag: "unavailable" as const }
                  await tx.update(stockBalances).set({
                    onHand: sql`${stockBalances.onHand} + ${decoded.adjustment}`,
                    updatedAt: occurredAt,
                  }).where(
                    and(
                      eq(stockBalances.tenantId, decoded.tenantId),
                      eq(stockBalances.warehouseId, decoded.warehouseId),
                      eq(stockBalances.itemId, decoded.itemId),
                    ),
                  )
                } else {
                  await tx.insert(stockBalances).values({
                    tenantId: decoded.tenantId,
                    warehouseId: decoded.warehouseId,
                    itemId: decoded.itemId,
                    onHand: decoded.adjustment,
                  }).onConflictDoUpdate({
                    target: [
                      stockBalances.tenantId,
                      stockBalances.warehouseId,
                      stockBalances.itemId,
                    ],
                    set: {
                      onHand: sql`${stockBalances.onHand} + ${decoded.adjustment}`,
                      updatedAt: occurredAt,
                    },
                  })
                }
                const [correction] = await tx.insert(movements).values({
                  tenantId: decoded.tenantId,
                  warehouseId: decoded.warehouseId,
                  itemId: decoded.itemId,
                  quantity: decoded.adjustment,
                  kind: adjustment < 0n ? "issue" : "receipt",
                  unitOfMeasure,
                  reason,
                  idempotencyKey,
                }).returning(correctionSelection)
                return {
                  _tag: "created" as const,
                  correction: toStockCorrection(correction!),
                  occurredAt,
                }
              },
              "inventory.stock.adjust",
            )

            if (mutation._tag === "created") {
              const payload = yield* Schema.decodeUnknownEffect(StockCorrectedEventPayload)({
                correctionId: mutation.correction.id,
                warehouseId: mutation.correction.warehouseId,
                itemId: mutation.correction.itemId,
              })
              yield* messaging.append({
                eventId: uuidv7(),
                eventType: InventoryStockCorrectedEvent.id,
                eventVersion: InventoryStockCorrectedEvent.version,
                tenantId: decoded.tenantId,
                aggregateType: InventoryStockCorrectedEvent.aggregateType,
                aggregateId: mutation.correction.id,
                commandId,
                correlationId,
                causationId,
                idempotencyKey,
                actorPrincipalId: decoded.principal.userAccountId,
                occurredAt: mutation.occurredAt.toISOString(),
                payload,
              })
            }
            return mutation
          }),
          "inventory.stock.adjust.atomic",
        ).pipe(
          Effect.catch((error) => {
            if (!isDatabaseConstraint(error, "movements_tenant_idempotency_key")) {
              return Effect.fail(error)
            }
            return database.query(
              (db) =>
                db.select(correctionSelection).from(movements).where(
                  and(
                    eq(movements.tenantId, decoded.tenantId),
                    eq(movements.idempotencyKey, idempotencyKey),
                  ),
                ),
              "inventory.stock.adjust.idempotency",
            ).pipe(
              Effect.map((rows) => {
                const existing = rows[0]
                return existing !== undefined &&
                    existing.warehouseId === decoded.warehouseId &&
                    existing.itemId === decoded.itemId &&
                    existing.adjustment === decoded.adjustment &&
                    existing.unitOfMeasure === unitOfMeasure &&
                    existing.reason === reason
                  ? { _tag: "existing" as const, correction: toStockCorrection(existing) }
                  : { _tag: "idempotency-conflict" as const }
              }),
            )
          }),
        )
        if (result._tag === "idempotency-conflict") {
          return yield* Effect.fail(
            new StockCorrectionIdempotencyConflict({ tenantId: decoded.tenantId, idempotencyKey }),
          )
        }
        if (result._tag === "not-found") {
          return yield* Effect.fail(
            referenceFailure(decoded.tenantId, decoded.warehouseId, decoded.itemId),
          )
        }
        if (result._tag === "uom-mismatch") {
          return yield* Effect.fail(
            new InventoryUnitOfMeasureMismatch({
              tenantId: decoded.tenantId,
              itemId: decoded.itemId,
              expected: result.expected,
              actual: result.actual,
            }),
          )
        }
        if (result._tag === "unavailable") {
          return yield* Effect.fail(
            new StockUnavailable({
              tenantId: decoded.tenantId,
              warehouseId: decoded.warehouseId,
              itemId: decoded.itemId,
              requested: decoded.adjustment,
            }),
          )
        }
        return result.correction
      }),
    reserveStock: (input) =>
      Effect.gen(function* () {
        const decoded = yield* Schema.decodeUnknownEffect(ReserveStockInput)(input)
        yield* authorization.authorize({
          principal: decoded.principal,
          tenantId: decoded.tenantId,
          capability: InventoryCapabilities.stockReserve,
        })
        const normalizedIdempotencyKey = decoded.idempotencyKey?.trim()
        const reservation = yield* database.transaction(
          async (tx) => {
            if (decoded.legalEntityId !== undefined) {
              const [warehouse] = await tx.select({ legalEntityId: warehouses.legalEntityId })
                .from(warehouses)
                .where(and(
                  eq(warehouses.tenantId, decoded.tenantId),
                  eq(warehouses.id, decoded.warehouseId),
                ))
                .for("update")
              if (warehouse?.legalEntityId !== decoded.legalEntityId) {
                return { _tag: "legal-entity-mismatch" as const }
              }
            }
            if (normalizedIdempotencyKey !== undefined) {
              const existingRows = await tx.select({
                id: reservations.id,
                tenantId: reservations.tenantId,
                warehouseId: reservations.warehouseId,
                itemId: reservations.itemId,
                quantity: reservations.quantity,
                idempotencyKey: reservations.idempotencyKey,
                status: reservations.status,
              })
                .from(reservations)
                .where(
                  and(
                    eq(reservations.tenantId, decoded.tenantId),
                    eq(reservations.idempotencyKey, normalizedIdempotencyKey),
                  ),
                )
                .for("update")
              const existing = existingRows[0]
              if (existing !== undefined) {
                if (
                  existing.warehouseId !== decoded.warehouseId ||
                  existing.itemId !== decoded.itemId ||
                  existing.quantity !== decoded.quantity
                ) {
                  return { _tag: "idempotency-conflict" as const }
                }
                return { _tag: "existing" as const, reservation: existing }
              }
            }

            const updated = await tx.update(stockBalances)
              .set({
                reserved: sql`${stockBalances.reserved} + ${decoded.quantity}`,
                updatedAt: now(),
              })
              .where(
                and(
                  eq(stockBalances.tenantId, decoded.tenantId),
                  eq(stockBalances.warehouseId, decoded.warehouseId),
                  eq(stockBalances.itemId, decoded.itemId),
                  gte(sql`${stockBalances.onHand} - ${stockBalances.reserved}`, decoded.quantity),
                ),
              )
              .returning({ itemId: stockBalances.itemId })
            if (updated[0] === undefined) return { _tag: "unavailable" as const }

            const rows = await tx.insert(reservations).values({
              tenantId: decoded.tenantId,
              warehouseId: decoded.warehouseId,
              itemId: decoded.itemId,
              quantity: decoded.quantity,
              idempotencyKey: normalizedIdempotencyKey ?? null,
            }).returning({
              id: reservations.id,
              tenantId: reservations.tenantId,
              warehouseId: reservations.warehouseId,
              itemId: reservations.itemId,
              quantity: reservations.quantity,
              idempotencyKey: reservations.idempotencyKey,
              status: reservations.status,
            })
            const row = rows[0]!
            await tx.insert(movements).values({
              tenantId: decoded.tenantId,
              warehouseId: decoded.warehouseId,
              itemId: decoded.itemId,
              quantity: decoded.quantity,
              kind: "reservation",
              referenceId: row.id,
            })
            return { _tag: "created" as const, reservation: row }
          },
          "inventory.stock.reserve",
        ).pipe(
          Effect.catch((error) => {
            if (
              !isDatabaseConstraint(error, "reservations_tenant_idempotency_key") ||
              normalizedIdempotencyKey === undefined
            ) return Effect.fail(error)
            return database.query(
              (db) =>
                db.select(reservationSelection).from(reservations).where(and(
                  eq(reservations.tenantId, decoded.tenantId),
                  eq(reservations.idempotencyKey, normalizedIdempotencyKey),
                )),
              "inventory.stock.reserve.idempotency",
            ).pipe(
              Effect.map((rows) => {
                const existing = rows[0]
                return existing !== undefined &&
                    existing.warehouseId === decoded.warehouseId &&
                    existing.itemId === decoded.itemId &&
                    existing.quantity === decoded.quantity
                  ? { _tag: "existing" as const, reservation: existing }
                  : { _tag: "idempotency-conflict" as const }
              }),
            )
          }),
        )
        if (reservation._tag === "legal-entity-mismatch") {
          return yield* Effect.fail(
            new StockReservationLegalEntityMismatch({
              tenantId: decoded.tenantId,
              warehouseId: decoded.warehouseId,
              legalEntityId: decoded.legalEntityId!,
            }),
          )
        }
        if (reservation._tag === "idempotency-conflict") {
          return yield* Effect.fail(
            new StockReservationIdempotencyConflict({
              tenantId: decoded.tenantId,
              idempotencyKey: normalizedIdempotencyKey!,
            }),
          )
        }
        if (reservation._tag === "existing" || reservation._tag === "created") {
          return reservation.reservation
        }
        return yield* Effect.fail(
          new StockUnavailable({
            tenantId: decoded.tenantId,
            warehouseId: decoded.warehouseId,
            itemId: decoded.itemId,
            requested: decoded.quantity,
          }),
        )
      }),
    releaseReservation: (input) =>
      Effect.gen(function* () {
        const decoded = yield* Schema.decodeUnknownEffect(ReleaseReservationInput)(input)
        yield* authorization.authorize({
          principal: decoded.principal,
          tenantId: decoded.tenantId,
          capability: InventoryCapabilities.stockRelease,
        })
        const result = yield* database.transaction(
          async (tx) => {
            const [reservation] = await tx.select(reservationSelection)
              .from(reservations)
              .where(
                and(
                  eq(reservations.tenantId, decoded.tenantId),
                  eq(reservations.id, decoded.reservationId),
                ),
              )
              .for("update")
            if (reservation === undefined) return { _tag: "not-found" as const }
            if (reservation.status === "released") {
              return { _tag: "existing" as const, reservation }
            }
            if (reservation.status !== "active") {
              return { _tag: "invalid-state" as const, status: reservation.status }
            }

            const timestamp = now()
            const [releasedBalance] = await tx.update(stockBalances)
              .set({
                reserved: sql`${stockBalances.reserved} - ${reservation.quantity}`,
                updatedAt: timestamp,
              })
              .where(
                and(
                  eq(stockBalances.tenantId, decoded.tenantId),
                  eq(stockBalances.warehouseId, reservation.warehouseId),
                  eq(stockBalances.itemId, reservation.itemId),
                  sql`${stockBalances.reserved} >= ${reservation.quantity}`,
                ),
              )
              .returning({ tenantId: stockBalances.tenantId })
            if (releasedBalance === undefined) {
              return {
                _tag: "unavailable" as const,
                warehouseId: reservation.warehouseId,
                itemId: reservation.itemId,
                requested: reservation.quantity,
              }
            }
            const [released] = await tx.update(reservations)
              .set({ status: "released", updatedAt: timestamp })
              .where(eq(reservations.id, reservation.id))
              .returning(reservationSelection)
            await tx.insert(movements).values({
              tenantId: decoded.tenantId,
              warehouseId: reservation.warehouseId,
              itemId: reservation.itemId,
              quantity: String(-BigInt(reservation.quantity)),
              kind: "release",
              referenceId: reservation.id,
            })
            return { _tag: "released" as const, reservation: released! }
          },
          "inventory.stock.release",
        )
        if (result._tag === "not-found") {
          return yield* Effect.fail(
            new StockReservationNotFound({
              tenantId: decoded.tenantId,
              reservationId: decoded.reservationId,
            }),
          )
        }
        if (result._tag === "invalid-state") {
          return yield* Effect.fail(
            new StockReservationInvalidState({
              tenantId: decoded.tenantId,
              reservationId: decoded.reservationId,
              operation: "release",
              status: result.status,
            }),
          )
        }
        if (result._tag === "unavailable") {
          return yield* Effect.fail(
            new StockUnavailable({
              tenantId: decoded.tenantId,
              warehouseId: result.warehouseId,
              itemId: result.itemId,
              requested: result.requested,
            }),
          )
        }
        return result.reservation
      }),
    fulfillReservation: (input) =>
      Effect.gen(function* () {
        const decoded = yield* Schema.decodeUnknownEffect(FulfillReservationInput)(input)
        yield* authorization.authorize({
          principal: decoded.principal,
          tenantId: decoded.tenantId,
          capability: InventoryCapabilities.stockFulfill,
        })
        const result = yield* database.transaction(
          async (tx) => {
            const [reservation] = await tx.select(reservationSelection)
              .from(reservations)
              .where(
                and(
                  eq(reservations.tenantId, decoded.tenantId),
                  eq(reservations.id, decoded.reservationId),
                ),
              )
              .for("update")
            if (reservation === undefined) return { _tag: "not-found" as const }
            if (reservation.status === "fulfilled") {
              return { _tag: "existing" as const, reservation }
            }
            if (reservation.status !== "active") {
              return { _tag: "invalid-state" as const, status: reservation.status }
            }

            const timestamp = now()
            const [fulfilledBalance] = await tx.update(stockBalances)
              .set({
                onHand: sql`${stockBalances.onHand} - ${reservation.quantity}`,
                reserved: sql`${stockBalances.reserved} - ${reservation.quantity}`,
                updatedAt: timestamp,
              })
              .where(
                and(
                  eq(stockBalances.tenantId, decoded.tenantId),
                  eq(stockBalances.warehouseId, reservation.warehouseId),
                  eq(stockBalances.itemId, reservation.itemId),
                  sql`${stockBalances.onHand} >= ${reservation.quantity}`,
                  sql`${stockBalances.reserved} >= ${reservation.quantity}`,
                ),
              )
              .returning({ tenantId: stockBalances.tenantId })
            if (fulfilledBalance === undefined) {
              return {
                _tag: "unavailable" as const,
                warehouseId: reservation.warehouseId,
                itemId: reservation.itemId,
                requested: reservation.quantity,
              }
            }
            const [fulfilled] = await tx.update(reservations)
              .set({ status: "fulfilled", updatedAt: timestamp })
              .where(eq(reservations.id, reservation.id))
              .returning(reservationSelection)
            await tx.insert(movements).values({
              tenantId: decoded.tenantId,
              warehouseId: reservation.warehouseId,
              itemId: reservation.itemId,
              quantity: String(-BigInt(reservation.quantity)),
              kind: "issue",
              referenceId: reservation.id,
            })
            return { _tag: "fulfilled" as const, reservation: fulfilled! }
          },
          "inventory.stock.fulfill",
        )
        if (result._tag === "not-found") {
          return yield* Effect.fail(
            new StockReservationNotFound({
              tenantId: decoded.tenantId,
              reservationId: decoded.reservationId,
            }),
          )
        }
        if (result._tag === "invalid-state") {
          return yield* Effect.fail(
            new StockReservationInvalidState({
              tenantId: decoded.tenantId,
              reservationId: decoded.reservationId,
              operation: "fulfill",
              status: result.status,
            }),
          )
        }
        if (result._tag === "unavailable") {
          return yield* Effect.fail(
            new StockUnavailable({
              tenantId: decoded.tenantId,
              warehouseId: result.warehouseId,
              itemId: result.itemId,
              requested: result.requested,
            }),
          )
        }
        return result.reservation
      }),
    createTransfer: (input) =>
      Effect.gen(function* () {
        const decoded = yield* Schema.decodeUnknownEffect(CreateStockTransferInput)(input)
        yield* authorization.authorize({
          principal: decoded.principal,
          tenantId: decoded.tenantId,
          capability: InventoryCapabilities.stockTransferCreate,
        })
        if (decoded.sourceWarehouseId === decoded.destinationWarehouseId) {
          return yield* Effect.fail(
            new StockTransferSameWarehouse({
              tenantId: decoded.tenantId,
              warehouseId: decoded.sourceWarehouseId,
            }),
          )
        }
        const itemIds = new Set<string>()
        for (const line of decoded.lines) {
          if (itemIds.has(line.itemId)) {
            return yield* Effect.fail(
              new StockTransferDuplicateItem({ tenantId: decoded.tenantId, itemId: line.itemId }),
            )
          }
          itemIds.add(line.itemId)
        }

        const result = yield* database.transaction(
          async (tx) => {
            const warehouseRows = await tx.select({
              id: warehouses.id,
              legalEntityId: warehouses.legalEntityId,
            })
              .from(warehouses)
              .where(
                and(
                  eq(warehouses.tenantId, decoded.tenantId),
                  inArray(warehouses.id, [
                    decoded.sourceWarehouseId,
                    decoded.destinationWarehouseId,
                  ]),
                ),
              )
              .for("update")
            const warehousesById = new Map(warehouseRows.map((row) => [row.id, row]))
            const sourceWarehouse = warehousesById.get(decoded.sourceWarehouseId)
            const destinationWarehouse = warehousesById.get(decoded.destinationWarehouseId)
            const missingWarehouseId = sourceWarehouse === undefined
              ? decoded.sourceWarehouseId
              : destinationWarehouse === undefined
              ? decoded.destinationWarehouseId
              : undefined
            if (missingWarehouseId !== undefined) {
              return { _tag: "warehouse-not-found" as const, warehouseId: missingWarehouseId }
            }
            if (sourceWarehouse!.legalEntityId !== destinationWarehouse!.legalEntityId) {
              return {
                _tag: "different-legal-entity" as const,
                sourceWarehouseId: decoded.sourceWarehouseId,
                destinationWarehouseId: decoded.destinationWarehouseId,
              }
            }

            const itemRows = await tx.select({ id: items.id })
              .from(items)
              .where(
                and(
                  eq(items.tenantId, decoded.tenantId),
                  inArray(items.id, [...itemIds]),
                ),
              )
              .for("update")
            const existingItemIds = new Set(itemRows.map((row) => row.id))
            const missingItemId = decoded.lines.find((line) => !existingItemIds.has(line.itemId))
              ?.itemId
            if (missingItemId !== undefined) {
              return { _tag: "item-not-found" as const, itemId: missingItemId }
            }

            const [row] = await tx.insert(stockTransfers).values({
              tenantId: decoded.tenantId,
              legalEntityId: sourceWarehouse!.legalEntityId,
              sourceWarehouseId: decoded.sourceWarehouseId,
              destinationWarehouseId: decoded.destinationWarehouseId,
            }).returning(transferSelection)
            await tx.insert(stockTransferLines).values(
              decoded.lines.map((line) => ({
                tenantId: decoded.tenantId,
                transferId: row!.id,
                itemId: line.itemId,
                quantity: line.quantity,
              })),
            )
            return {
              _tag: "created" as const,
              transfer: toStockTransfer(row!, decoded.lines),
            }
          },
          "inventory.stock.transfer.create",
        ).pipe(Effect.mapError((error) => mapTransferCreateError(error, decoded)))

        if (result._tag === "warehouse-not-found") {
          return yield* Effect.fail(
            new StockTransferWarehouseNotFound({
              tenantId: decoded.tenantId,
              warehouseId: result.warehouseId,
            }),
          )
        }
        if (result._tag === "different-legal-entity") {
          return yield* Effect.fail(
            new StockTransferDifferentLegalEntity({
              tenantId: decoded.tenantId,
              sourceWarehouseId: result.sourceWarehouseId,
              destinationWarehouseId: result.destinationWarehouseId,
            }),
          )
        }
        if (result._tag === "item-not-found") {
          return yield* Effect.fail(
            new StockTransferItemNotFound({ tenantId: decoded.tenantId, itemId: result.itemId }),
          )
        }
        return result.transfer
      }),
    confirmTransfer: (input) =>
      Effect.gen(function* () {
        const decoded = yield* Schema.decodeUnknownEffect(ConfirmStockTransferInput)(input)
        yield* authorization.authorize({
          principal: decoded.principal,
          tenantId: decoded.tenantId,
          capability: InventoryCapabilities.stockTransferConfirm,
        })
        const result = yield* database.transaction(
          async (tx) => {
            const [row] = await tx.select(transferSelection)
              .from(stockTransfers)
              .where(
                and(
                  eq(stockTransfers.tenantId, decoded.tenantId),
                  eq(stockTransfers.id, decoded.transferId),
                ),
              )
              .for("update")
            if (row === undefined) return { _tag: "not-found" as const }

            const lines = await tx.select(transferLineSelection)
              .from(stockTransferLines)
              .where(
                and(
                  eq(stockTransferLines.tenantId, decoded.tenantId),
                  eq(stockTransferLines.transferId, decoded.transferId),
                ),
              )
              .orderBy(stockTransferLines.itemId)
            const current = toStockTransfer(row, lines)
            if (row.status !== "draft") return { _tag: "existing" as const, transfer: current }

            const balances = lines.length === 0 ? [] : await tx.select({
              itemId: stockBalances.itemId,
              onHand: stockBalances.onHand,
              reserved: stockBalances.reserved,
            })
              .from(stockBalances)
              .where(
                and(
                  eq(stockBalances.tenantId, decoded.tenantId),
                  eq(stockBalances.warehouseId, row.sourceWarehouseId),
                  inArray(stockBalances.itemId, lines.map((line) => line.itemId)),
                ),
              )
              .orderBy(stockBalances.itemId)
              .for("update")
            const balancesByItem = new Map(balances.map((balance) => [balance.itemId, balance]))
            for (const line of lines) {
              const balance = balancesByItem.get(line.itemId)
              if (
                balance === undefined ||
                BigInt(balance.onHand) - BigInt(balance.reserved) < BigInt(line.quantity)
              ) {
                return {
                  _tag: "unavailable" as const,
                  warehouseId: row.sourceWarehouseId,
                  itemId: line.itemId,
                  requested: line.quantity,
                }
              }
            }

            const timestamp = now()
            for (const line of lines) {
              await tx.update(stockBalances)
                .set({
                  onHand: sql`${stockBalances.onHand} - ${line.quantity}`,
                  updatedAt: timestamp,
                })
                .where(
                  and(
                    eq(stockBalances.tenantId, decoded.tenantId),
                    eq(stockBalances.warehouseId, row.sourceWarehouseId),
                    eq(stockBalances.itemId, line.itemId),
                  ),
                )
            }
            if (lines.length > 0) {
              await tx.insert(movements).values(
                lines.map((line) => ({
                  tenantId: decoded.tenantId,
                  warehouseId: row.sourceWarehouseId,
                  itemId: line.itemId,
                  quantity: String(-BigInt(line.quantity)),
                  kind: "issue" as const,
                  referenceId: row.id,
                })),
              )
            }
            const [confirmed] = await tx.update(stockTransfers)
              .set({ status: "confirmed", confirmedAt: timestamp, updatedAt: timestamp })
              .where(
                and(
                  eq(stockTransfers.tenantId, decoded.tenantId),
                  eq(stockTransfers.id, decoded.transferId),
                  eq(stockTransfers.status, "draft"),
                ),
              )
              .returning(transferSelection)
            return { _tag: "confirmed" as const, transfer: toStockTransfer(confirmed!, lines) }
          },
          "inventory.stock.transfer.confirm",
        )

        if (result._tag === "not-found") {
          return yield* Effect.fail(
            new StockTransferNotFound({
              tenantId: decoded.tenantId,
              transferId: decoded.transferId,
            }),
          )
        }
        if (result._tag === "unavailable") {
          return yield* Effect.fail(
            new StockUnavailable({
              tenantId: decoded.tenantId,
              warehouseId: result.warehouseId,
              itemId: result.itemId,
              requested: result.requested,
            }),
          )
        }
        return result.transfer
      }),
    completeTransfer: (input) =>
      Effect.gen(function* () {
        const decoded = yield* Schema.decodeUnknownEffect(CompleteStockTransferInput)(input)
        yield* authorization.authorize({
          principal: decoded.principal,
          tenantId: decoded.tenantId,
          capability: InventoryCapabilities.stockTransferComplete,
        })
        const result = yield* database.transaction(
          async (tx) => {
            const [row] = await tx.select(transferSelection)
              .from(stockTransfers)
              .where(
                and(
                  eq(stockTransfers.tenantId, decoded.tenantId),
                  eq(stockTransfers.id, decoded.transferId),
                ),
              )
              .for("update")
            if (row === undefined) return { _tag: "not-found" as const }

            const lines = await tx.select(transferLineSelection)
              .from(stockTransferLines)
              .where(
                and(
                  eq(stockTransferLines.tenantId, decoded.tenantId),
                  eq(stockTransferLines.transferId, decoded.transferId),
                ),
              )
              .orderBy(stockTransferLines.itemId)
            const current = toStockTransfer(row, lines)
            if (row.status === "completed") return { _tag: "existing" as const, transfer: current }
            if (row.status !== "confirmed") {
              return { _tag: "invalid-state" as const, status: row.status }
            }

            const timestamp = now()
            for (const line of lines) {
              await tx.insert(stockBalances).values({
                tenantId: decoded.tenantId,
                warehouseId: row.destinationWarehouseId,
                itemId: line.itemId,
                onHand: line.quantity,
              }).onConflictDoUpdate({
                target: [stockBalances.tenantId, stockBalances.warehouseId, stockBalances.itemId],
                set: {
                  onHand: sql`${stockBalances.onHand} + ${line.quantity}`,
                  updatedAt: timestamp,
                },
              })
            }
            if (lines.length > 0) {
              await tx.insert(movements).values(
                lines.map((line) => ({
                  tenantId: decoded.tenantId,
                  warehouseId: row.destinationWarehouseId,
                  itemId: line.itemId,
                  quantity: line.quantity,
                  kind: "receipt" as const,
                  referenceId: row.id,
                })),
              )
            }
            const [completed] = await tx.update(stockTransfers)
              .set({ status: "completed", completedAt: timestamp, updatedAt: timestamp })
              .where(
                and(
                  eq(stockTransfers.tenantId, decoded.tenantId),
                  eq(stockTransfers.id, decoded.transferId),
                  eq(stockTransfers.status, "confirmed"),
                ),
              )
              .returning(transferSelection)
            return { _tag: "completed" as const, transfer: toStockTransfer(completed!, lines) }
          },
          "inventory.stock.transfer.complete",
        )

        if (result._tag === "not-found") {
          return yield* Effect.fail(
            new StockTransferNotFound({
              tenantId: decoded.tenantId,
              transferId: decoded.transferId,
            }),
          )
        }
        if (result._tag === "invalid-state") {
          return yield* Effect.fail(
            new StockTransferInvalidState({
              tenantId: decoded.tenantId,
              transferId: decoded.transferId,
              operation: "complete",
              status: result.status,
            }),
          )
        }
        return result.transfer
      }),
  } satisfies InventoryService
  return {
    listWarehouses: Effect.fn("InventoryStore.listWarehouses")((input: unknown) =>
      store.listWarehouses(input)
    ),
    listItems: Effect.fn("InventoryStore.listItems")((input: unknown) => store.listItems(input)),
    listStockBalances: Effect.fn("InventoryStore.listStockBalances")((input: unknown) =>
      store.listStockBalances(input)
    ),
    listStockReservations: Effect.fn("InventoryStore.listStockReservations")((input: unknown) =>
      store.listStockReservations(input)
    ),
    listStockTransfers: Effect.fn("InventoryStore.listStockTransfers")((input: unknown) =>
      store.listStockTransfers(input)
    ),
    listStockMovements: Effect.fn("InventoryStore.listStockMovements")((input: unknown) =>
      store.listStockMovements(input)
    ),
    createWarehouse: Effect.fn("InventoryStore.createWarehouse")((input: unknown) =>
      store.createWarehouse(input)
    ),
    createItem: Effect.fn("InventoryStore.createItem")((input: unknown) => store.createItem(input)),
    receiveStock: Effect.fn("InventoryStore.receiveStock")((input: unknown) =>
      store.receiveStock(input)
    ),
    adjustStock: Effect.fn("InventoryStore.adjustStock")((input: unknown) =>
      store.adjustStock(input)
    ),
    reserveStock: Effect.fn("InventoryStore.reserveStock")((input: unknown) =>
      store.reserveStock(input)
    ),
    releaseReservation: Effect.fn("InventoryStore.releaseReservation")((input: unknown) =>
      store.releaseReservation(input)
    ),
    fulfillReservation: Effect.fn("InventoryStore.fulfillReservation")((input: unknown) =>
      store.fulfillReservation(input)
    ),
    createTransfer: Effect.fn("InventoryStore.createTransfer")((input: unknown) =>
      store.createTransfer(input)
    ),
    confirmTransfer: Effect.fn("InventoryStore.confirmTransfer")((input: unknown) =>
      store.confirmTransfer(input)
    ),
    completeTransfer: Effect.fn("InventoryStore.completeTransfer")((input: unknown) =>
      store.completeTransfer(input)
    ),
  } satisfies InventoryService
})

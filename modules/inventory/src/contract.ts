import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"

import { Principal } from "../../auth/mod.ts"
import type { AuthorizationDenied } from "../../authorization/mod.ts"
import type { DatabaseFailure } from "../../../foundation/mod.ts"
import { EventEnvelope } from "../../messaging/mod.ts"
import type { EventIdempotencyConflict } from "../../messaging/mod.ts"
import type {
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

const Uuid = Schema.String.check(Schema.isUUID())
const Quantity = Schema.String.check(
  Schema.makeFilter(
    (value) => /^[1-9]\d*$/.test(value) && BigInt(value) <= 9_223_372_036_854_775_807n,
    { expected: "a positive PostgreSQL bigint quantity" },
  ),
)
const NonNegativeQuantity = Schema.String.check(
  Schema.makeFilter(
    (value) => /^(0|[1-9]\d*)$/.test(value) && BigInt(value) <= 9_223_372_036_854_775_807n,
    { expected: "a non-negative PostgreSQL bigint quantity" },
  ),
)
const SignedQuantity = Schema.String.check(
  Schema.makeFilter(
    (value) => {
      if (!/^-?[1-9]\d*$/.test(value)) return false
      const quantity = BigInt(value)
      return quantity >= -9_223_372_036_854_775_808n &&
        quantity <= 9_223_372_036_854_775_807n
    },
    { expected: "a non-zero PostgreSQL bigint quantity" },
  ),
)
const NonEmptyString = Schema.String.check(Schema.isPattern(/\S/))
const TrimmedNonEmptyString = Schema.String.check(Schema.makeFilter(
  (value) => /\S/.test(value) && value === value.trim(),
  { expected: "a trimmed nonblank string" },
))
const UpperNonEmptyString = Schema.String.check(Schema.makeFilter(
  (value) => /\S/.test(value) && value === value.trim() && value === value.toUpperCase(),
  { expected: "a trimmed uppercase nonblank string" },
))
const InstantString = EventEnvelope.fields.occurredAt
export const UnitOfMeasure = Schema.String.check(Schema.isPattern(/^[A-Z][A-Z0-9_-]*$/))
const UnitOfMeasureInput = NonEmptyString
const DefaultUnitOfMeasure = UnitOfMeasureInput.pipe(
  Schema.withDecodingDefaultKey(Effect.succeed("EA")),
)

export const Warehouse = Schema.Struct({
  id: Uuid,
  tenantId: Uuid,
  legalEntityId: Uuid,
  primaryBranchId: Schema.NullOr(Uuid),
  name: TrimmedNonEmptyString,
})
export const Item = Schema.Struct({
  id: Uuid,
  tenantId: Uuid,
  sku: UpperNonEmptyString,
  name: TrimmedNonEmptyString,
  unitOfMeasure: UnitOfMeasure,
})
export const StockBalance = Schema.Struct({
  tenantId: Uuid,
  warehouseId: Uuid,
  itemId: Uuid,
  onHand: NonNegativeQuantity,
  reserved: NonNegativeQuantity,
  unitOfMeasure: UnitOfMeasure,
}).check(Schema.makeFilter(
  (balance) => BigInt(balance.reserved) <= BigInt(balance.onHand),
  { expected: "reserved stock cannot exceed on-hand stock" },
))
export const StockCorrection = Schema.Struct({
  id: Uuid,
  tenantId: Uuid,
  warehouseId: Uuid,
  itemId: Uuid,
  adjustment: SignedQuantity,
  unitOfMeasure: UnitOfMeasure,
  reason: TrimmedNonEmptyString,
  idempotencyKey: TrimmedNonEmptyString,
})
export const StockReservationStatus = Schema.Literals(["active", "released", "fulfilled"])
export const StockMovementKind = Schema.Literals(["receipt", "issue", "reservation", "release"])
export const StockReservation = Schema.Struct({
  id: Uuid,
  tenantId: Uuid,
  warehouseId: Uuid,
  itemId: Uuid,
  quantity: Quantity,
  idempotencyKey: Schema.NullOr(TrimmedNonEmptyString),
  status: StockReservationStatus,
})
export const StockTransferStatus = Schema.Literals(["draft", "confirmed", "completed"])
export const StockTransferLine = Schema.Struct({
  itemId: Uuid,
  quantity: Quantity,
})
export const StockMovement = Schema.Struct({
  id: Uuid,
  tenantId: Uuid,
  warehouseId: Uuid,
  itemId: Uuid,
  quantity: SignedQuantity,
  kind: StockMovementKind,
  referenceId: Schema.NullOr(Uuid),
  unitOfMeasure: Schema.NullOr(UnitOfMeasure),
  reason: Schema.NullOr(TrimmedNonEmptyString),
  idempotencyKey: Schema.NullOr(TrimmedNonEmptyString),
})
export const StockTransfer = Schema.Struct({
  id: Uuid,
  tenantId: Uuid,
  legalEntityId: Uuid,
  sourceWarehouseId: Uuid,
  destinationWarehouseId: Uuid,
  status: StockTransferStatus,
  confirmedAt: Schema.NullOr(InstantString),
  completedAt: Schema.NullOr(InstantString),
  lines: Schema.Array(StockTransferLine).check(Schema.isMinLength(1)),
}).check(Schema.makeFilter(
  (transfer) =>
    transfer.sourceWarehouseId !== transfer.destinationWarehouseId &&
    ((transfer.status === "draft" &&
      transfer.confirmedAt === null &&
      transfer.completedAt === null) ||
      (transfer.status === "confirmed" &&
        transfer.confirmedAt !== null &&
        transfer.completedAt === null) ||
      (transfer.status === "completed" &&
        transfer.confirmedAt !== null &&
        transfer.completedAt !== null)),
  { expected: "stock transfer identity, status, and dates are consistent" },
)).check(Schema.makeFilter(
  (transfer) => new Set(transfer.lines.map((line) => line.itemId)).size === transfer.lines.length,
  { expected: "stock transfer items must be unique" },
))

export type Warehouse = Schema.Schema.Type<typeof Warehouse>
export type Item = Schema.Schema.Type<typeof Item>
export type StockBalance = Schema.Schema.Type<typeof StockBalance>
export type StockCorrection = Schema.Schema.Type<typeof StockCorrection>
export type StockReservation = Schema.Schema.Type<typeof StockReservation>
export type StockMovementKind = Schema.Schema.Type<typeof StockMovementKind>
export type StockMovement = Schema.Schema.Type<typeof StockMovement>
export type StockTransferStatus = Schema.Schema.Type<typeof StockTransferStatus>
export type StockTransferLine = Schema.Schema.Type<typeof StockTransferLine>
export type StockTransfer = Schema.Schema.Type<typeof StockTransfer>

const ListLimit = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 200 }))
const ScopedInput = { principal: Principal, tenantId: Uuid }
export const ListWarehousesInput = Schema.Struct({
  ...ScopedInput,
  legalEntityId: Schema.optionalKey(Uuid),
  limit: Schema.optionalKey(ListLimit),
})
export const ListItemsInput = Schema.Struct({
  ...ScopedInput,
  search: Schema.optionalKey(Schema.String.check(
    Schema.makeFilter(
      (value) => value === value.trim() && value.length > 0 && value.length <= 256,
      { expected: "a trimmed item search up to 256 characters" },
    ),
  )),
  limit: Schema.optionalKey(ListLimit),
})
export const ListStockBalancesInput = Schema.Struct({
  ...ScopedInput,
  warehouseId: Schema.optionalKey(Uuid),
  itemId: Schema.optionalKey(Uuid),
  limit: Schema.optionalKey(ListLimit),
})
export const ListStockReservationsInput = Schema.Struct({
  ...ScopedInput,
  warehouseId: Schema.optionalKey(Uuid),
  itemId: Schema.optionalKey(Uuid),
  status: Schema.optionalKey(StockReservationStatus),
  limit: Schema.optionalKey(ListLimit),
})
export const ListStockTransfersInput = Schema.Struct({
  ...ScopedInput,
  warehouseId: Schema.optionalKey(Uuid),
  status: Schema.optionalKey(StockTransferStatus),
  limit: Schema.optionalKey(ListLimit),
})
export const ListStockMovementsInput = Schema.Struct({
  ...ScopedInput,
  warehouseId: Schema.optionalKey(Uuid),
  itemId: Schema.optionalKey(Uuid),
  kind: Schema.optionalKey(StockMovementKind),
  limit: Schema.optionalKey(ListLimit),
})

export const CreateWarehouseInput = Schema.Struct({
  ...ScopedInput,
  legalEntityId: Uuid,
  primaryBranchId: Schema.optionalKey(Uuid),
  name: NonEmptyString,
})
export const CreateItemInput = Schema.Struct({
  ...ScopedInput,
  sku: NonEmptyString,
  name: NonEmptyString,
  unitOfMeasure: DefaultUnitOfMeasure,
})
export const ReceiveStockInput = Schema.Struct({
  ...ScopedInput,
  warehouseId: Uuid,
  itemId: Uuid,
  quantity: Quantity,
  legalEntityId: Schema.optionalKey(Schema.String.check(Schema.isUUID())),
  referenceId: Schema.optionalKey(Schema.String.check(Schema.isUUID())),
})
export const AdjustStockInput = Schema.Struct({
  principal: Principal,
  tenantId: Uuid,
  warehouseId: Uuid,
  itemId: Uuid,
  adjustment: SignedQuantity,
  unitOfMeasure: UnitOfMeasureInput,
  reason: NonEmptyString,
  commandId: NonEmptyString,
  correlationId: NonEmptyString,
  causationId: Schema.optionalKey(Schema.NullOr(NonEmptyString)),
  idempotencyKey: NonEmptyString,
})
export const ReserveStockInput = Schema.Struct({
  ...ScopedInput,
  warehouseId: Uuid,
  itemId: Uuid,
  quantity: Quantity,
  legalEntityId: Schema.optionalKey(Uuid),
  idempotencyKey: Schema.optionalKey(Schema.String.check(Schema.isPattern(/\S/))),
})
export const ReleaseReservationInput = Schema.Struct({
  ...ScopedInput,
  reservationId: Uuid,
})
export const FulfillReservationInput = ReleaseReservationInput
export const CreateStockTransferInput = Schema.Struct({
  ...ScopedInput,
  sourceWarehouseId: Uuid,
  destinationWarehouseId: Uuid,
  lines: Schema.Array(StockTransferLine).check(Schema.isMinLength(1)).check(Schema.makeFilter(
    (lines) => new Set(lines.map((line) => line.itemId)).size === lines.length,
    { expected: "stock transfer items must be unique" },
  )),
}).check(Schema.makeFilter(
  (transfer) => transfer.sourceWarehouseId !== transfer.destinationWarehouseId,
  { expected: "stock transfer warehouses must be distinct" },
))
export const ConfirmStockTransferInput = Schema.Struct({
  ...ScopedInput,
  transferId: Uuid,
})
export const CompleteStockTransferInput = ConfirmStockTransferInput

type CommonFailure = AuthorizationDenied | DatabaseFailure | Schema.SchemaError

export interface InventoryService {
  readonly listWarehouses: (
    input: unknown,
  ) => Effect.Effect<ReadonlyArray<Warehouse>, CommonFailure>
  readonly listItems: (
    input: unknown,
  ) => Effect.Effect<ReadonlyArray<Item>, CommonFailure>
  readonly listStockBalances: (
    input: unknown,
  ) => Effect.Effect<ReadonlyArray<StockBalance>, CommonFailure>
  readonly listStockReservations: (
    input: unknown,
  ) => Effect.Effect<ReadonlyArray<StockReservation>, CommonFailure>
  readonly listStockTransfers: (
    input: unknown,
  ) => Effect.Effect<ReadonlyArray<StockTransfer>, CommonFailure>
  readonly listStockMovements: (
    input: unknown,
  ) => Effect.Effect<ReadonlyArray<StockMovement>, CommonFailure>
  readonly createWarehouse: (
    input: unknown,
  ) => Effect.Effect<
    Warehouse,
    WarehouseAlreadyExists | WarehouseBranchNotFound | WarehouseLegalEntityNotFound | CommonFailure
  >
  readonly createItem: (input: unknown) => Effect.Effect<Item, ItemAlreadyExists | CommonFailure>
  readonly receiveStock: (
    input: unknown,
  ) => Effect.Effect<
    StockBalance,
    InventoryReferenceNotFound | InventoryWarehouseLegalEntityMismatch | CommonFailure
  >
  readonly adjustStock: (
    input: unknown,
  ) => Effect.Effect<
    StockCorrection,
    | InventoryReferenceNotFound
    | InventoryUnitOfMeasureMismatch
    | StockCorrectionIdempotencyConflict
    | StockUnavailable
    | EventIdempotencyConflict
    | CommonFailure
  >
  readonly reserveStock: (
    input: unknown,
  ) => Effect.Effect<
    StockReservation,
    | StockReservationIdempotencyConflict
    | StockReservationLegalEntityMismatch
    | StockUnavailable
    | CommonFailure
  >
  readonly releaseReservation: (
    input: unknown,
  ) => Effect.Effect<
    StockReservation,
    StockReservationInvalidState | StockReservationNotFound | StockUnavailable | CommonFailure
  >
  readonly fulfillReservation: (
    input: unknown,
  ) => Effect.Effect<
    StockReservation,
    StockReservationInvalidState | StockReservationNotFound | StockUnavailable | CommonFailure
  >
  readonly createTransfer: (
    input: unknown,
  ) => Effect.Effect<
    StockTransfer,
    | StockTransferDifferentLegalEntity
    | StockTransferDuplicateItem
    | StockTransferItemNotFound
    | StockTransferSameWarehouse
    | StockTransferWarehouseNotFound
    | CommonFailure
  >
  readonly confirmTransfer: (
    input: unknown,
  ) => Effect.Effect<
    StockTransfer,
    | StockUnavailable
    | StockTransferNotFound
    | CommonFailure
  >
  readonly completeTransfer: (
    input: unknown,
  ) => Effect.Effect<
    StockTransfer,
    | StockTransferInvalidState
    | StockTransferNotFound
    | CommonFailure
  >
}

export const InventoryService = Context.Service<InventoryService>("RITSEI/InventoryService")

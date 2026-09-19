import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import {
  AdjustStockInput,
  CreateItemInput,
  CreateStockTransferInput,
  CreateWarehouseInput,
  inventoryRoutes,
  Item,
  ListItemsInput,
  ListStockBalancesInput,
  ListStockMovementsInput,
  ListStockReservationsInput,
  ListStockTransfersInput,
  ListWarehousesInput,
  ReceiveStockInput,
  ReserveStockInput,
  StockBalance,
  StockCorrection,
  StockMovement,
  StockReservation,
  StockTransfer,
  Warehouse,
} from "../../shared/contracts/generated/inventory.ts"
import {
  connectionTenant,
  decodeInput,
  decodeResponse,
  definedFields,
  mutationRequest,
  querySuffix,
  RequestFailure,
  requestJson,
  responseListMatches,
  responseMatches,
  routeWithId,
} from "../../shared/api.ts"

const Uuid = Schema.String.check(Schema.isUUID())
const WarehouseList = Schema.Array(Warehouse).check(Schema.isMaxLength(200))
const ItemList = Schema.Array(Item).check(Schema.isMaxLength(200))
const BalanceList = Schema.Array(StockBalance).check(Schema.isMaxLength(200))
const ReservationList = Schema.Array(StockReservation).check(Schema.isMaxLength(200))
const TransferList = Schema.Array(StockTransfer).check(Schema.isMaxLength(200))
const MovementList = Schema.Array(StockMovement).check(Schema.isMaxLength(200))

const belongsToWarehouse = (
  warehouseId: string | undefined,
  sourceWarehouseId: string,
  destinationWarehouseId: string,
) =>
  warehouseId === undefined ||
  sourceWarehouseId === warehouseId ||
  destinationWarehouseId === warehouseId

export const listWarehouses = Effect.fn("Frontend.Inventory.listWarehouses")(
  function* (input: unknown = {}) {
    const decoded = yield* decodeInput(ListWarehousesInput, input)
    const body = yield* requestJson(
      `${inventoryRoutes.listWarehouses}${querySuffix(decoded)}`,
    )
    const warehouses = yield* decodeResponse(WarehouseList, body, "invalid-response")
    const connection = yield* connectionTenant
    if (
      !responseListMatches(warehouses, {
        tenantId: connection.tenantId,
        ...definedFields({ legalEntityId: decoded.legalEntityId }),
      })
    ) {
      return yield* Effect.fail(new RequestFailure({ kind: "invalid-response" }))
    }
    return warehouses
  },
)

export const listItems = Effect.fn("Frontend.Inventory.listItems")(
  function* (input: unknown = {}) {
    const decoded = yield* decodeInput(ListItemsInput, input)
    const body = yield* requestJson(`${inventoryRoutes.listItems}${querySuffix(decoded)}`)
    const items = yield* decodeResponse(ItemList, body, "invalid-response")
    const connection = yield* connectionTenant
    if (!responseListMatches(items, { tenantId: connection.tenantId })) {
      return yield* Effect.fail(new RequestFailure({ kind: "invalid-response" }))
    }
    return items
  },
)

export const listStockBalances = Effect.fn("Frontend.Inventory.listStockBalances")(
  function* (input: unknown = {}) {
    const decoded = yield* decodeInput(ListStockBalancesInput, input)
    const body = yield* requestJson(
      `${inventoryRoutes.listStockBalances}${querySuffix(decoded)}`,
    )
    const balances = yield* decodeResponse(BalanceList, body, "invalid-response")
    const connection = yield* connectionTenant
    if (
      !responseListMatches(balances, {
        tenantId: connection.tenantId,
        ...definedFields({ warehouseId: decoded.warehouseId, itemId: decoded.itemId }),
      })
    ) {
      return yield* Effect.fail(new RequestFailure({ kind: "invalid-response" }))
    }
    return balances
  },
)

export const listStockReservations = Effect.fn("Frontend.Inventory.listStockReservations")(
  function* (input: unknown = {}) {
    const decoded = yield* decodeInput(ListStockReservationsInput, input)
    const body = yield* requestJson(
      `${inventoryRoutes.listStockReservations}${querySuffix(decoded)}`,
    )
    const reservations = yield* decodeResponse(ReservationList, body, "invalid-response")
    const connection = yield* connectionTenant
    if (
      !responseListMatches(reservations, {
        tenantId: connection.tenantId,
        ...definedFields({
          warehouseId: decoded.warehouseId,
          itemId: decoded.itemId,
          status: decoded.status,
        }),
      })
    ) {
      return yield* Effect.fail(new RequestFailure({ kind: "invalid-response" }))
    }
    return reservations
  },
)

export const listStockTransfers = Effect.fn("Frontend.Inventory.listStockTransfers")(
  function* (input: unknown = {}) {
    const decoded = yield* decodeInput(ListStockTransfersInput, input)
    const body = yield* requestJson(
      `${inventoryRoutes.listStockTransfers}${querySuffix(decoded)}`,
    )
    const transfers = yield* decodeResponse(TransferList, body, "invalid-response")
    const connection = yield* connectionTenant
    if (
      !responseListMatches(transfers, {
        tenantId: connection.tenantId,
        ...definedFields({ status: decoded.status }),
      }) ||
      !transfers.every((transfer) =>
        belongsToWarehouse(
          decoded.warehouseId,
          transfer.sourceWarehouseId,
          transfer.destinationWarehouseId,
        )
      )
    ) {
      return yield* Effect.fail(new RequestFailure({ kind: "invalid-response" }))
    }
    return transfers
  },
)

export const listStockMovements = Effect.fn("Frontend.Inventory.listStockMovements")(
  function* (input: unknown = {}) {
    const decoded = yield* decodeInput(ListStockMovementsInput, input)
    const body = yield* requestJson(
      `${inventoryRoutes.listStockMovements}${querySuffix(decoded)}`,
    )
    const movements = yield* decodeResponse(MovementList, body, "invalid-response")
    const connection = yield* connectionTenant
    if (
      !responseListMatches(movements, {
        tenantId: connection.tenantId,
        ...definedFields({
          warehouseId: decoded.warehouseId,
          itemId: decoded.itemId,
          kind: decoded.kind,
        }),
      })
    ) {
      return yield* Effect.fail(new RequestFailure({ kind: "invalid-response" }))
    }
    return movements
  },
)

export const createWarehouse = Effect.fn("Frontend.Inventory.createWarehouse")(
  function* (input: unknown) {
    const decoded = yield* decodeInput(CreateWarehouseInput, input)
    const connection = yield* connectionTenant
    const body = yield* mutationRequest(inventoryRoutes.createWarehouse, decoded)
    const warehouse = yield* decodeResponse(Warehouse, body, "unknown-outcome")
    if (
      !responseMatches(warehouse, {
        tenantId: connection.tenantId,
        legalEntityId: decoded.legalEntityId,
        name: decoded.name.trim(),
      })
    ) {
      return yield* Effect.fail(new RequestFailure({ kind: "unknown-outcome" }))
    }
    return warehouse
  },
)

export const createItem = Effect.fn("Frontend.Inventory.createItem")(
  function* (input: unknown) {
    const decoded = yield* decodeInput(CreateItemInput, input)
    const connection = yield* connectionTenant
    const body = yield* mutationRequest(inventoryRoutes.createItem, decoded)
    const item = yield* decodeResponse(Item, body, "unknown-outcome")
    if (
      !responseMatches(item, {
        tenantId: connection.tenantId,
        sku: decoded.sku.trim().toUpperCase(),
        name: decoded.name.trim(),
        ...definedFields({
          unitOfMeasure: decoded.unitOfMeasure?.trim().toUpperCase(),
        }),
      })
    ) {
      return yield* Effect.fail(new RequestFailure({ kind: "unknown-outcome" }))
    }
    return item
  },
)

export const adjustStock = Effect.fn("Frontend.Inventory.adjustStock")(
  function* (input: unknown) {
    const decoded = yield* decodeInput(AdjustStockInput, input)
    const connection = yield* connectionTenant
    const body = yield* mutationRequest(inventoryRoutes.adjustStock, decoded)
    const correction = yield* decodeResponse(StockCorrection, body, "unknown-outcome")
    if (
      !responseMatches(correction, {
        tenantId: connection.tenantId,
        warehouseId: decoded.warehouseId,
        itemId: decoded.itemId,
        adjustment: decoded.adjustment,
        idempotencyKey: decoded.idempotencyKey,
      })
    ) {
      return yield* Effect.fail(new RequestFailure({ kind: "unknown-outcome" }))
    }
    return correction
  },
)

export const receiveStock = Effect.fn("Frontend.Inventory.receiveStock")(
  function* (input: unknown) {
    const decoded = yield* decodeInput(ReceiveStockInput, input)
    const connection = yield* connectionTenant
    const body = yield* mutationRequest(inventoryRoutes.receiveStock, decoded)
    const balance = yield* decodeResponse(StockBalance, body, "unknown-outcome")
    if (
      !responseMatches(balance, {
        tenantId: connection.tenantId,
        warehouseId: decoded.warehouseId,
        itemId: decoded.itemId,
      })
    ) {
      return yield* Effect.fail(new RequestFailure({ kind: "unknown-outcome" }))
    }
    return balance
  },
)

export const reserveStock = Effect.fn("Frontend.Inventory.reserveStock")(
  function* (input: unknown) {
    const decoded = yield* decodeInput(ReserveStockInput, input)
    const connection = yield* connectionTenant
    const body = yield* mutationRequest(inventoryRoutes.reserveStock, decoded)
    const reservation = yield* decodeResponse(StockReservation, body, "unknown-outcome")
    if (
      !responseMatches(reservation, {
        tenantId: connection.tenantId,
        warehouseId: decoded.warehouseId,
        itemId: decoded.itemId,
        quantity: decoded.quantity,
        status: "active",
      })
    ) {
      return yield* Effect.fail(new RequestFailure({ kind: "unknown-outcome" }))
    }
    return reservation
  },
)

// Fallow: reservation and transfer lifecycle adapters intentionally share the same verified command shape.
// fallow-ignore-next-line code-duplication
const reservationCommand = (
  name: "releaseReservation" | "fulfillReservation",
  route: string,
  expectedStatus: "released" | "fulfilled",
) =>
  Effect.fn(`Frontend.Inventory.${name}`)(function* (id: unknown) {
    const decodedId = yield* decodeInput(Uuid, id)
    const connection = yield* connectionTenant
    const body = yield* mutationRequest(routeWithId(route, decodedId))
    const reservation = yield* decodeResponse(StockReservation, body, "unknown-outcome")
    if (
      !responseMatches(reservation, {
        id: decodedId,
        tenantId: connection.tenantId,
        status: expectedStatus,
      })
    ) {
      return yield* Effect.fail(new RequestFailure({ kind: "unknown-outcome" }))
    }
    return reservation
  })

export const releaseReservation = reservationCommand(
  "releaseReservation",
  inventoryRoutes.releaseReservation,
  "released",
)
export const fulfillReservation = reservationCommand(
  "fulfillReservation",
  inventoryRoutes.fulfillReservation,
  "fulfilled",
)

export const createTransfer = Effect.fn("Frontend.Inventory.createTransfer")(
  function* (input: unknown) {
    const decoded = yield* decodeInput(CreateStockTransferInput, input)
    const connection = yield* connectionTenant
    const body = yield* mutationRequest(inventoryRoutes.createTransfer, decoded)
    const transfer = yield* decodeResponse(StockTransfer, body, "unknown-outcome")
    if (
      !responseMatches(transfer, {
        tenantId: connection.tenantId,
        sourceWarehouseId: decoded.sourceWarehouseId,
        destinationWarehouseId: decoded.destinationWarehouseId,
        status: "draft",
      })
    ) {
      return yield* Effect.fail(new RequestFailure({ kind: "unknown-outcome" }))
    }
    return transfer
  },
)

// Fallow: reservation and transfer lifecycle adapters intentionally share the same verified command shape.
// fallow-ignore-next-line code-duplication
const transferCommand = (
  name: "confirmTransfer" | "completeTransfer",
  route: string,
  expectedStatus: "confirmed" | "completed",
) =>
  Effect.fn(`Frontend.Inventory.${name}`)(function* (id: unknown) {
    const decodedId = yield* decodeInput(Uuid, id)
    const connection = yield* connectionTenant
    const body = yield* mutationRequest(routeWithId(route, decodedId))
    const transfer = yield* decodeResponse(StockTransfer, body, "unknown-outcome")
    if (
      !responseMatches(transfer, {
        id: decodedId,
        tenantId: connection.tenantId,
        status: expectedStatus,
      })
    ) {
      return yield* Effect.fail(new RequestFailure({ kind: "unknown-outcome" }))
    }
    return transfer
  })

export const confirmTransfer = transferCommand(
  "confirmTransfer",
  inventoryRoutes.confirmTransfer,
  "confirmed",
)
export const completeTransfer = transferCommand(
  "completeTransfer",
  inventoryRoutes.completeTransfer,
  "completed",
)

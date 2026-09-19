import { useMutation, useQueryClient } from "@tanstack/solid-query"
import type {
  AdjustStockInput,
  CreateItemInput,
  CreateStockTransferInput,
  CreateWarehouseInput,
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
import type { RequestFailure } from "../../shared/api.ts"
import { createServerQuery, serverQueryKey } from "../../shared/server-query.ts"
import { type ApiScope, runRequest } from "../../shared/runtime.ts"
import {
  adjustStock,
  completeTransfer,
  confirmTransfer,
  createItem,
  createTransfer,
  createWarehouse,
  fulfillReservation,
  listItems,
  listStockBalances,
  listStockMovements,
  listStockReservations,
  listStockTransfers,
  listWarehouses,
  receiveStock,
  releaseReservation,
  reserveStock,
} from "./service.ts"

const inventoryCollectionKey = ["inventory", "collection"] as const
const warehousesKey = [...inventoryCollectionKey, "warehouses"] as const
const itemsKey = [...inventoryCollectionKey, "items"] as const
const balancesKey = [...inventoryCollectionKey, "balances"] as const
const reservationsKey = [...inventoryCollectionKey, "reservations"] as const
const transfersKey = [...inventoryCollectionKey, "transfers"] as const
const movementsKey = [...inventoryCollectionKey, "movements"] as const

const invalidate = (
  client: ReturnType<typeof useQueryClient>,
  tenantId: string,
  key: readonly [string, ...readonly unknown[]],
) => client.invalidateQueries({ queryKey: serverQueryKey(tenantId, key) })

const invalidateStock = (client: ReturnType<typeof useQueryClient>, tenantId: string) =>
  Promise.all([
    invalidate(client, tenantId, balancesKey),
    invalidate(client, tenantId, reservationsKey),
    invalidate(client, tenantId, movementsKey),
  ])

export function createWarehousesQuery(scope: ApiScope, input: ListWarehousesInput = {}) {
  return createServerQuery<readonly Warehouse[], RequestFailure>({
    tenantId: scope.tenantId,
    key: [...warehousesKey, input],
    cache: "collection",
    load: ({ signal }) => runRequest(scope, listWarehouses(input), signal),
  })
}

export function createItemsQuery(scope: ApiScope, input: ListItemsInput = {}) {
  return createServerQuery<readonly Item[], RequestFailure>({
    tenantId: scope.tenantId,
    key: [...itemsKey, input],
    cache: "collection",
    load: ({ signal }) => runRequest(scope, listItems(input), signal),
  })
}

export function createStockBalancesQuery(scope: ApiScope, input: ListStockBalancesInput = {}) {
  return createServerQuery<readonly StockBalance[], RequestFailure>({
    tenantId: scope.tenantId,
    key: [...balancesKey, input],
    cache: "collection",
    load: ({ signal }) => runRequest(scope, listStockBalances(input), signal),
  })
}

export function createStockReservationsQuery(
  scope: ApiScope,
  input: ListStockReservationsInput = {},
) {
  return createServerQuery<readonly StockReservation[], RequestFailure>({
    tenantId: scope.tenantId,
    key: [...reservationsKey, input],
    cache: "collection",
    load: ({ signal }) => runRequest(scope, listStockReservations(input), signal),
  })
}

export function createStockTransfersQuery(scope: ApiScope, input: ListStockTransfersInput = {}) {
  return createServerQuery<readonly StockTransfer[], RequestFailure>({
    tenantId: scope.tenantId,
    key: [...transfersKey, input],
    cache: "collection",
    load: ({ signal }) => runRequest(scope, listStockTransfers(input), signal),
  })
}

export function createStockMovementsQuery(scope: ApiScope, input: ListStockMovementsInput = {}) {
  return createServerQuery<readonly StockMovement[], RequestFailure>({
    tenantId: scope.tenantId,
    key: [...movementsKey, input],
    cache: "collection",
    load: ({ signal }) => runRequest(scope, listStockMovements(input), signal),
  })
}

export function createWarehouseMutation(
  scope: ApiScope,
  afterSuccess?: (warehouse: Warehouse) => void,
) {
  const client = useQueryClient()
  return useMutation<Warehouse, RequestFailure, CreateWarehouseInput>(() => ({
    mutationFn: (input) => runRequest(scope, createWarehouse(input)),
    onSuccess: (warehouse) => {
      afterSuccess?.(warehouse)
      return invalidate(client, scope.tenantId, warehousesKey)
    },
  }))
}

export function createItemMutation(scope: ApiScope, afterSuccess?: (item: Item) => void) {
  const client = useQueryClient()
  return useMutation<Item, RequestFailure, CreateItemInput>(() => ({
    mutationFn: (input) => runRequest(scope, createItem(input)),
    onSuccess: (item) => {
      afterSuccess?.(item)
      return invalidate(client, scope.tenantId, itemsKey)
    },
  }))
}

export function createReceiveStockMutation(
  scope: ApiScope,
  afterSuccess?: (balance: StockBalance) => void,
) {
  const client = useQueryClient()
  return useMutation<StockBalance, RequestFailure, ReceiveStockInput>(() => ({
    mutationFn: (input) => runRequest(scope, receiveStock(input)),
    onSuccess: (balance) => {
      afterSuccess?.(balance)
      return invalidateStock(client, scope.tenantId)
    },
  }))
}

export function createAdjustStockMutation(
  scope: ApiScope,
  afterSuccess?: (correction: StockCorrection) => void,
) {
  const client = useQueryClient()
  return useMutation<StockCorrection, RequestFailure, AdjustStockInput>(() => ({
    mutationFn: (input) => runRequest(scope, adjustStock(input)),
    onSuccess: (correction) => {
      afterSuccess?.(correction)
      return invalidateStock(client, scope.tenantId)
    },
  }))
}

export function createReserveStockMutation(
  scope: ApiScope,
  afterSuccess?: (reservation: StockReservation) => void,
) {
  const client = useQueryClient()
  return useMutation<StockReservation, RequestFailure, ReserveStockInput>(() => ({
    mutationFn: (input) => runRequest(scope, reserveStock(input)),
    onSuccess: (reservation) => {
      afterSuccess?.(reservation)
      return invalidateStock(client, scope.tenantId)
    },
  }))
}

export function createReleaseReservationMutation(
  scope: ApiScope,
  afterSuccess?: (reservation: StockReservation) => void,
) {
  const client = useQueryClient()
  return useMutation<StockReservation, RequestFailure, { id: string }>(() => ({
    mutationFn: ({ id }) => runRequest(scope, releaseReservation(id)),
    onSuccess: (reservation) => {
      afterSuccess?.(reservation)
      return invalidateStock(client, scope.tenantId)
    },
  }))
}

export function createFulfillReservationMutation(
  scope: ApiScope,
  afterSuccess?: (reservation: StockReservation) => void,
) {
  const client = useQueryClient()
  return useMutation<StockReservation, RequestFailure, { id: string }>(() => ({
    mutationFn: ({ id }) => runRequest(scope, fulfillReservation(id)),
    onSuccess: (reservation) => {
      afterSuccess?.(reservation)
      return invalidateStock(client, scope.tenantId)
    },
  }))
}

export function createTransferMutation(
  scope: ApiScope,
  afterSuccess?: (transfer: StockTransfer) => void,
) {
  const client = useQueryClient()
  return useMutation<StockTransfer, RequestFailure, CreateStockTransferInput>(() => ({
    mutationFn: (input) => runRequest(scope, createTransfer(input)),
    onSuccess: (transfer) => {
      afterSuccess?.(transfer)
      return invalidate(client, scope.tenantId, transfersKey)
    },
  }))
}

export function createConfirmTransferMutation(
  scope: ApiScope,
  afterSuccess?: (transfer: StockTransfer) => void,
) {
  const client = useQueryClient()
  return useMutation<StockTransfer, RequestFailure, { id: string }>(() => ({
    mutationFn: ({ id }) => runRequest(scope, confirmTransfer(id)),
    onSuccess: (transfer) => {
      afterSuccess?.(transfer)
      return Promise.all([
        invalidate(client, scope.tenantId, transfersKey),
        invalidate(client, scope.tenantId, balancesKey),
        invalidate(client, scope.tenantId, movementsKey),
      ])
    },
  }))
}

export function createCompleteTransferMutation(
  scope: ApiScope,
  afterSuccess?: (transfer: StockTransfer) => void,
) {
  const client = useQueryClient()
  return useMutation<StockTransfer, RequestFailure, { id: string }>(() => ({
    mutationFn: ({ id }) => runRequest(scope, completeTransfer(id)),
    onSuccess: (transfer) => {
      afterSuccess?.(transfer)
      return Promise.all([
        invalidate(client, scope.tenantId, transfersKey),
        invalidateStock(client, scope.tenantId),
      ])
    },
  }))
}

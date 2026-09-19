import { useMutation, useQueryClient } from "@tanstack/solid-query"
import type {
  CreatePurchaseOrderInput,
  CreateSupplierAccountInput,
  GoodsReceipt,
  ListPurchaseOrdersInput,
  ListPurchaseReceiptsInput,
  ListSupplierAccountsInput,
  PurchaseOrder,
  ReceivePurchaseOrderInput,
  SupplierAccount,
} from "../../shared/contracts/generated/procurement.ts"
import type { RequestFailure } from "../../shared/api.ts"
import { createServerQuery, serverQueryKey } from "../../shared/server-query.ts"
import { type ApiScope, runRequest } from "../../shared/runtime.ts"
import {
  cancelPurchaseOrder,
  confirmPurchaseOrder,
  createPurchaseOrder,
  createSupplierAccount,
  getPurchaseOrder,
  listPurchaseOrders,
  listPurchaseReceipts,
  listSupplierAccounts,
  receivePurchaseOrder,
} from "./service.ts"

const procurementCollectionKey = ["procurement", "collection"] as const
const supplierAccountsKey = [...procurementCollectionKey, "supplier-accounts"] as const
const purchaseOrdersKey = [...procurementCollectionKey, "purchase-orders"] as const
const purchaseOrderDetailKey = (id: string) => ["procurement", "purchase-order", id] as const
const purchaseReceiptsKey = (id: string) => ["procurement", "purchase-receipts", id] as const

const invalidateSupplierAccounts = (
  client: ReturnType<typeof useQueryClient>,
  tenantId: string,
) => client.invalidateQueries({ queryKey: serverQueryKey(tenantId, supplierAccountsKey) })

const invalidatePurchaseOrders = (
  client: ReturnType<typeof useQueryClient>,
  tenantId: string,
) => client.invalidateQueries({ queryKey: serverQueryKey(tenantId, purchaseOrdersKey) })

const invalidatePurchaseOrder = (
  client: ReturnType<typeof useQueryClient>,
  tenantId: string,
  id: string,
) => client.invalidateQueries({ queryKey: serverQueryKey(tenantId, purchaseOrderDetailKey(id)) })

const invalidatePurchaseReceipts = (
  client: ReturnType<typeof useQueryClient>,
  tenantId: string,
  id: string,
) => client.invalidateQueries({ queryKey: serverQueryKey(tenantId, purchaseReceiptsKey(id)) })

export function createSupplierAccountsQuery(
  scope: ApiScope,
  input: ListSupplierAccountsInput = {},
) {
  return createServerQuery<readonly SupplierAccount[], RequestFailure>({
    tenantId: scope.tenantId,
    key: [...supplierAccountsKey, input],
    cache: "collection",
    load: ({ signal }) => runRequest(scope, listSupplierAccounts(input), signal),
  })
}

export function createPurchaseOrdersQuery(scope: ApiScope, input: ListPurchaseOrdersInput = {}) {
  return createServerQuery<readonly PurchaseOrder[], RequestFailure>({
    tenantId: scope.tenantId,
    key: [...purchaseOrdersKey, input],
    cache: "collection",
    load: ({ signal }) => runRequest(scope, listPurchaseOrders(input), signal),
  })
}

export function createPurchaseOrderQuery(scope: ApiScope, id: string) {
  return createServerQuery<PurchaseOrder, RequestFailure>({
    tenantId: scope.tenantId,
    key: purchaseOrderDetailKey(id),
    cache: "detail",
    load: ({ signal }) => runRequest(scope, getPurchaseOrder(id), signal),
  })
}

export function createPurchaseReceiptsQuery(
  scope: ApiScope,
  id: string,
  input: ListPurchaseReceiptsInput = {},
) {
  return createServerQuery<readonly GoodsReceipt[], RequestFailure>({
    tenantId: scope.tenantId,
    key: [...purchaseReceiptsKey(id), input],
    cache: "detail",
    load: ({ signal }) => runRequest(scope, listPurchaseReceipts(id, input), signal),
  })
}

export function createSupplierAccountMutation(
  scope: ApiScope,
  afterSuccess?: (account: SupplierAccount) => void,
) {
  const client = useQueryClient()
  return useMutation<SupplierAccount, RequestFailure, CreateSupplierAccountInput>(() => ({
    mutationFn: (input) => runRequest(scope, createSupplierAccount(input)),
    onSuccess: (account) => {
      afterSuccess?.(account)
      return invalidateSupplierAccounts(client, scope.tenantId)
    },
  }))
}

export function createPurchaseOrderMutation(
  scope: ApiScope,
  afterSuccess?: (order: PurchaseOrder) => void,
) {
  const client = useQueryClient()
  return useMutation<PurchaseOrder, RequestFailure, CreatePurchaseOrderInput>(() => ({
    mutationFn: (input) => runRequest(scope, createPurchaseOrder(input)),
    onSuccess: (order) => {
      afterSuccess?.(order)
      return Promise.all([
        invalidatePurchaseOrders(client, scope.tenantId),
        invalidateSupplierAccounts(client, scope.tenantId),
      ])
    },
  }))
}

export function createConfirmPurchaseOrderMutation(
  scope: ApiScope,
  afterSuccess?: (order: PurchaseOrder) => void,
) {
  const client = useQueryClient()
  return useMutation<PurchaseOrder, RequestFailure, { id: string; idempotencyKey: string }>(() => ({
    mutationFn: ({ id, idempotencyKey }) =>
      runRequest(scope, confirmPurchaseOrder(id, { idempotencyKey })),
    onSuccess: (order) => {
      afterSuccess?.(order)
      return Promise.all([
        invalidatePurchaseOrders(client, scope.tenantId),
        invalidatePurchaseOrder(client, scope.tenantId, order.id),
      ])
    },
  }))
}

export function createCancelPurchaseOrderMutation(
  scope: ApiScope,
  afterSuccess?: (order: PurchaseOrder) => void,
) {
  const client = useQueryClient()
  return useMutation<PurchaseOrder, RequestFailure, { id: string }>(() => ({
    mutationFn: ({ id }) => runRequest(scope, cancelPurchaseOrder(id)),
    onSuccess: (order) => {
      afterSuccess?.(order)
      return Promise.all([
        invalidatePurchaseOrders(client, scope.tenantId),
        invalidatePurchaseOrder(client, scope.tenantId, order.id),
      ])
    },
  }))
}

export function createReceivePurchaseOrderMutation(
  scope: ApiScope,
  afterSuccess?: (receipt: GoodsReceipt) => void,
) {
  const client = useQueryClient()
  return useMutation<GoodsReceipt, RequestFailure, { id: string } & ReceivePurchaseOrderInput>(
    () => ({
      mutationFn: ({ id, ...input }) => runRequest(scope, receivePurchaseOrder(id, input)),
      onSuccess: (receipt) => {
        afterSuccess?.(receipt)
        return Promise.all([
          invalidatePurchaseReceipts(client, scope.tenantId, receipt.purchaseOrderId),
          invalidatePurchaseOrder(client, scope.tenantId, receipt.purchaseOrderId),
          invalidatePurchaseOrders(client, scope.tenantId),
        ])
      },
    }),
  )
}

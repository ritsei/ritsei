import { useMutation, useQueryClient } from "@tanstack/solid-query"
import type {
  ConfirmOrderInput,
  CreateCustomerInput,
  CreateOrderInput,
  CreateQuotationInput,
  Customer,
  ListCustomersInput,
  ListOrdersInput,
  ListQuotationsInput,
  Quotation,
  SalesOrder,
} from "../../shared/contracts/generated/sales.ts"
import type { RequestFailure } from "../../shared/api.ts"
import { createServerQuery, serverQueryKey } from "../../shared/server-query.ts"
import { type ApiScope, runRequest } from "../../shared/runtime.ts"
import {
  cancelOrder,
  confirmOrder,
  createCustomer,
  createOrder,
  createQuotation,
  getCustomer,
  getOrder,
  getQuotation,
  listCustomers,
  listOrders,
  listQuotations,
} from "./service.ts"

const salesCollectionKey = ["sales", "collection"] as const
const customersKey = [...salesCollectionKey, "customers"] as const
const quotationsKey = [...salesCollectionKey, "quotations"] as const
const ordersKey = [...salesCollectionKey, "orders"] as const
const customerDetailKey = (id: string) => ["sales", "customer", id] as const
const quotationDetailKey = (id: string) => ["sales", "quotation", id] as const
const orderDetailKey = (id: string) => ["sales", "order", id] as const

const invalidate = (
  client: ReturnType<typeof useQueryClient>,
  tenantId: string,
  key: readonly [string, ...unknown[]],
) => client.invalidateQueries({ queryKey: serverQueryKey(tenantId, key) })

export function createCustomersQuery(scope: ApiScope, input: ListCustomersInput = {}) {
  return createServerQuery<readonly Customer[], RequestFailure>({
    tenantId: scope.tenantId,
    key: [...customersKey, input],
    cache: "collection",
    load: ({ signal }) => runRequest(scope, listCustomers(input), signal),
  })
}

export function createCustomerQuery(scope: ApiScope, id: string) {
  return createServerQuery<Customer, RequestFailure>({
    tenantId: scope.tenantId,
    key: customerDetailKey(id),
    cache: "detail",
    load: ({ signal }) => runRequest(scope, getCustomer(id), signal),
  })
}

export function createQuotationsQuery(scope: ApiScope, input: ListQuotationsInput = {}) {
  return createServerQuery<readonly Quotation[], RequestFailure>({
    tenantId: scope.tenantId,
    key: [...quotationsKey, input],
    cache: "collection",
    load: ({ signal }) => runRequest(scope, listQuotations(input), signal),
  })
}

export function createQuotationQuery(scope: ApiScope, id: string) {
  return createServerQuery<Quotation, RequestFailure>({
    tenantId: scope.tenantId,
    key: quotationDetailKey(id),
    cache: "detail",
    load: ({ signal }) => runRequest(scope, getQuotation(id), signal),
  })
}

export function createOrdersQuery(scope: ApiScope, input: ListOrdersInput = {}) {
  return createServerQuery<readonly SalesOrder[], RequestFailure>({
    tenantId: scope.tenantId,
    key: [...ordersKey, input],
    cache: "collection",
    load: ({ signal }) => runRequest(scope, listOrders(input), signal),
  })
}

export function createOrderQuery(scope: ApiScope, id: string) {
  return createServerQuery<SalesOrder, RequestFailure>({
    tenantId: scope.tenantId,
    key: orderDetailKey(id),
    cache: "detail",
    load: ({ signal }) => runRequest(scope, getOrder(id), signal),
  })
}

export function createCustomerMutation(
  scope: ApiScope,
  afterSuccess?: (customer: Customer) => void,
) {
  const client = useQueryClient()
  return useMutation<Customer, RequestFailure, CreateCustomerInput>(() => ({
    mutationFn: (input) => runRequest(scope, createCustomer(input)),
    onSuccess: (customer) => {
      afterSuccess?.(customer)
      return invalidate(client, scope.tenantId, customersKey)
    },
  }))
}

export function createQuotationMutation(
  scope: ApiScope,
  afterSuccess?: (quotation: Quotation) => void,
) {
  const client = useQueryClient()
  return useMutation<Quotation, RequestFailure, CreateQuotationInput>(() => ({
    mutationFn: (input) => runRequest(scope, createQuotation(input)),
    onSuccess: (quotation) => {
      afterSuccess?.(quotation)
      return Promise.all([
        invalidate(client, scope.tenantId, quotationsKey),
        invalidate(client, scope.tenantId, customersKey),
      ])
    },
  }))
}

export function createOrderMutation(scope: ApiScope, afterSuccess?: (order: SalesOrder) => void) {
  const client = useQueryClient()
  return useMutation<SalesOrder, RequestFailure, CreateOrderInput>(() => ({
    mutationFn: (input) => runRequest(scope, createOrder(input)),
    onSuccess: (order) => {
      afterSuccess?.(order)
      return Promise.all([
        invalidate(client, scope.tenantId, ordersKey),
        invalidate(client, scope.tenantId, quotationsKey),
      ])
    },
  }))
}

export function createConfirmOrderMutation(
  scope: ApiScope,
  afterSuccess?: (order: SalesOrder) => void,
) {
  const client = useQueryClient()
  return useMutation<
    SalesOrder,
    RequestFailure,
    { readonly id: string; readonly input: ConfirmOrderInput }
  >(() => ({
    // Fallow: confirm and cancel mutations intentionally share tenant-scoped invalidation behavior.
    // fallow-ignore-next-line code-duplication
    mutationFn: ({ id, input }) => runRequest(scope, confirmOrder(id, input)),
    onSuccess: (order) => {
      afterSuccess?.(order)
      return Promise.all([
        invalidate(client, scope.tenantId, ordersKey),
        invalidate(client, scope.tenantId, orderDetailKey(order.id)),
      ])
    },
  }))
}

export function createCancelOrderMutation(
  scope: ApiScope,
  afterSuccess?: (order: SalesOrder) => void,
) {
  const client = useQueryClient()
  return useMutation<SalesOrder, RequestFailure, { readonly id: string }>(() => ({
    // Fallow: confirm and cancel mutations intentionally share tenant-scoped invalidation behavior.
    // fallow-ignore-next-line code-duplication
    mutationFn: ({ id }) => runRequest(scope, cancelOrder(id)),
    onSuccess: (order) => {
      afterSuccess?.(order)
      return Promise.all([
        invalidate(client, scope.tenantId, ordersKey),
        invalidate(client, scope.tenantId, orderDetailKey(order.id)),
      ])
    },
  }))
}

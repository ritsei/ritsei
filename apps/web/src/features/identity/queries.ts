import { useMutation, useQueryClient } from "@tanstack/solid-query"
import type { UserAccount } from "../../shared/contracts/generated/identity.ts"
import { type RequestFailure } from "../../shared/api.ts"
import { createServerQuery, serverQueryKey } from "../../shared/server-query.ts"
import { type ApiScope, runRequest } from "../../shared/runtime.ts"
import { createAccount, getAccount, listAccounts, updateAccount } from "./service.ts"

const accountsKey = ["identity", "accounts"] as const
const accountKey = (id: string) => ["identity", "accounts", "detail", id] as const

const refreshAccountCollection = (client: ReturnType<typeof useQueryClient>, tenantId: string) =>
  client.invalidateQueries({ queryKey: serverQueryKey(tenantId, accountsKey) })

export function createAccountsQuery(scope: ApiScope) {
  return createServerQuery<readonly UserAccount[], RequestFailure>({
    tenantId: scope.tenantId,
    key: accountsKey,
    cache: "collection",
    load: ({ signal }) => runRequest(scope, listAccounts(), signal),
  })
}

export function createAccountQuery(scope: ApiScope, id: string) {
  return createServerQuery<UserAccount, RequestFailure>({
    tenantId: scope.tenantId,
    key: accountKey(id),
    cache: "detail",
    load: ({ signal }) => runRequest(scope, getAccount(id), signal),
  })
}

export function createAccountMutation(
  scope: ApiScope,
  afterSuccess?: (account: UserAccount) => void,
) {
  const client = useQueryClient()
  return useMutation<UserAccount, RequestFailure, { email: string }>(() => ({
    mutationFn: (input) => runRequest(scope, createAccount(input)),
    onSuccess: (account) => {
      client.setQueryData(serverQueryKey(scope.tenantId, accountKey(account.id)), account)
      afterSuccess?.(account)
      return refreshAccountCollection(client, scope.tenantId)
    },
  }))
}

export function createAccountEmailMutation(scope: ApiScope) {
  const client = useQueryClient()
  return useMutation<
    UserAccount,
    RequestFailure,
    { id: string; email: string }
  >(() => ({
    mutationFn: (input) => runRequest(scope, updateAccount(input)),
    onSuccess: (account) => {
      client.setQueryData(serverQueryKey(scope.tenantId, accountKey(account.id)), account)
      return refreshAccountCollection(client, scope.tenantId)
    },
  }))
}

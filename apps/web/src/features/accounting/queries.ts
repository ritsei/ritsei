import { useMutation, useQueryClient } from "@tanstack/solid-query"
import type {
  Account,
  AccountingConfiguration,
  AccountingPeriod,
  ClosePeriodInput,
  ConfigureLegalEntityInput,
  ConfigureRevenuePostingInput,
  CreateAccountInput,
  JournalEntry,
  ListAccountingConfigurationsInput,
  ListAccountingPeriodsInput,
  ListAccountsInput,
  ListJournalEntriesInput,
  ListRevenuePostingProfilesInput,
  OpenPeriodInput,
  PostJournalInput,
  RevenuePostingProfile,
} from "../../shared/contracts/generated/accounting.ts"
import type { RequestFailure } from "../../shared/api.ts"
import { createServerQuery } from "../../shared/server-query.ts"
import { type ApiScope, runRequest } from "../../shared/runtime.ts"
import {
  closePeriod,
  configureLegalEntity,
  configureRevenuePosting,
  createAccount,
  listAccounts,
  listConfigurations,
  listJournals,
  listPeriods,
  listRevenuePostingProfiles,
  openPeriod,
  postJournal,
} from "./service.ts"

const accountingCollectionKey = ["accounting", "collection"] as const

const invalidate = (
  client: ReturnType<typeof useQueryClient>,
  tenantId: string,
) => client.invalidateQueries({ queryKey: ["tenant", tenantId, ...accountingCollectionKey] })

export function createAccountingConfigurationsQuery(
  scope: ApiScope,
  input: ListAccountingConfigurationsInput = {},
) {
  return createServerQuery<readonly AccountingConfiguration[], RequestFailure>({
    tenantId: scope.tenantId,
    key: [...accountingCollectionKey, "configurations", input],
    cache: "collection",
    load: ({ signal }) => runRequest(scope, listConfigurations(input), signal),
  })
}

export function createAccountsQuery(scope: ApiScope, input: ListAccountsInput = {}) {
  return createServerQuery<readonly Account[], RequestFailure>({
    tenantId: scope.tenantId,
    key: [...accountingCollectionKey, "accounts", input],
    cache: "collection",
    load: ({ signal }) => runRequest(scope, listAccounts(input), signal),
  })
}

export function createAccountingPeriodsQuery(
  scope: ApiScope,
  input: ListAccountingPeriodsInput = {},
) {
  return createServerQuery<readonly AccountingPeriod[], RequestFailure>({
    tenantId: scope.tenantId,
    key: [...accountingCollectionKey, "periods", input],
    cache: "collection",
    load: ({ signal }) => runRequest(scope, listPeriods(input), signal),
  })
}

export function createRevenuePostingProfilesQuery(
  scope: ApiScope,
  input: ListRevenuePostingProfilesInput = {},
) {
  return createServerQuery<readonly RevenuePostingProfile[], RequestFailure>({
    tenantId: scope.tenantId,
    key: [...accountingCollectionKey, "revenue-posting-profiles", input],
    cache: "collection",
    load: ({ signal }) => runRequest(scope, listRevenuePostingProfiles(input), signal),
  })
}

export function createJournalsQuery(scope: ApiScope, input: ListJournalEntriesInput = {}) {
  return createServerQuery<readonly JournalEntry[], RequestFailure>({
    tenantId: scope.tenantId,
    key: [...accountingCollectionKey, "journals", input],
    cache: "collection",
    load: ({ signal }) => runRequest(scope, listJournals(input), signal),
  })
}

export function createConfigureLegalEntityMutation(
  scope: ApiScope,
  afterSuccess?: (configuration: AccountingConfiguration) => void,
) {
  const client = useQueryClient()
  return useMutation<
    AccountingConfiguration,
    RequestFailure,
    { readonly legalEntityId: string; readonly input: ConfigureLegalEntityInput }
  >(() => ({
    mutationFn: ({ legalEntityId, input }) =>
      runRequest(scope, configureLegalEntity(legalEntityId, input)),
    onSuccess: (configuration) => {
      afterSuccess?.(configuration)
      return invalidate(client, scope.tenantId)
    },
  }))
}

export function createConfigureRevenuePostingMutation(
  scope: ApiScope,
  afterSuccess?: (profile: RevenuePostingProfile) => void,
) {
  const client = useQueryClient()
  return useMutation<
    RevenuePostingProfile,
    RequestFailure,
    ConfigureRevenuePostingInput
  >(() => ({
    mutationFn: (input) => runRequest(scope, configureRevenuePosting(input)),
    onSuccess: (profile) => {
      afterSuccess?.(profile)
      return invalidate(client, scope.tenantId)
    },
  }))
}

export function createOpenPeriodMutation(
  scope: ApiScope,
  afterSuccess?: (period: AccountingPeriod) => void,
) {
  const client = useQueryClient()
  return useMutation<AccountingPeriod, RequestFailure, OpenPeriodInput>(() => ({
    mutationFn: (input) => runRequest(scope, openPeriod(input)),
    onSuccess: (period) => {
      afterSuccess?.(period)
      return invalidate(client, scope.tenantId)
    },
  }))
}

export function createClosePeriodMutation(
  scope: ApiScope,
  periodId: string,
  afterSuccess?: (period: AccountingPeriod) => void,
) {
  const client = useQueryClient()
  return useMutation<AccountingPeriod, RequestFailure, ClosePeriodInput>(() => ({
    mutationFn: (input) => runRequest(scope, closePeriod(periodId, input)),
    onSuccess: (period) => {
      afterSuccess?.(period)
      return invalidate(client, scope.tenantId)
    },
  }))
}

export function createAccountMutation(scope: ApiScope, afterSuccess?: (account: Account) => void) {
  const client = useQueryClient()
  return useMutation<Account, RequestFailure, CreateAccountInput>(() => ({
    mutationFn: (input) => runRequest(scope, createAccount(input)),
    onSuccess: (account) => {
      afterSuccess?.(account)
      return invalidate(client, scope.tenantId)
    },
  }))
}

export function createPostJournalMutation(
  scope: ApiScope,
  afterSuccess?: (journal: JournalEntry) => void,
) {
  const client = useQueryClient()
  return useMutation<JournalEntry, RequestFailure, PostJournalInput>(() => ({
    mutationFn: (input) => runRequest(scope, postJournal(input)),
    onSuccess: (journal) => {
      afterSuccess?.(journal)
      return invalidate(client, scope.tenantId)
    },
  }))
}

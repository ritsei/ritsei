import { useMutation, useQueryClient } from "@tanstack/solid-query"
import type {
  AddTenantMembershipInput,
  CapabilityDefinition,
  DirectCapabilityGrant,
  GrantCapabilityInput,
  ListTenantMembershipsInput,
  TenantMembership,
} from "../../shared/contracts/generated/authorization.ts"
import type { RequestFailure } from "../../shared/api.ts"
import { createServerQuery, serverQueryKey } from "../../shared/server-query.ts"
import { type ApiScope, runRequest } from "../../shared/runtime.ts"
import {
  activateMembership,
  addMembership,
  getMembership,
  grantCapability,
  listCapabilityDefinitions,
  listDirectGrants,
  listMemberships,
  removeMembership,
  suspendMembership,
} from "./service.ts"

const authorizationKey = ["authorization"] as const
const membershipCollectionKey = (input: ListTenantMembershipsInput) =>
  [...authorizationKey, "memberships", input] as const
const membershipDetailKey = (userAccountId: string) =>
  [...authorizationKey, "memberships", "detail", userAccountId] as const
const directGrantsKey = (userAccountId: string) =>
  [...authorizationKey, "direct-grants", userAccountId] as const
const capabilityCatalogKey = [...authorizationKey, "capability-definitions"] as const

const invalidateAuthorization = (
  client: ReturnType<typeof useQueryClient>,
  tenantId: string,
) => client.invalidateQueries({ queryKey: serverQueryKey(tenantId, authorizationKey) })

export function createTenantMembershipsQuery(
  scope: ApiScope,
  input: ListTenantMembershipsInput = {},
) {
  return createServerQuery<readonly TenantMembership[], RequestFailure>({
    tenantId: scope.tenantId,
    key: membershipCollectionKey(input),
    cache: "collection",
    load: ({ signal }) => runRequest(scope, listMemberships(input), signal),
  })
}

export function createTenantMembershipQuery(scope: ApiScope, userAccountId: string) {
  return createServerQuery<TenantMembership, RequestFailure>({
    tenantId: scope.tenantId,
    key: membershipDetailKey(userAccountId),
    cache: "detail",
    load: ({ signal }) => runRequest(scope, getMembership(userAccountId), signal),
  })
}

export function createDirectCapabilityGrantsQuery(scope: ApiScope, userAccountId: string) {
  return createServerQuery<readonly DirectCapabilityGrant[], RequestFailure>({
    tenantId: scope.tenantId,
    key: directGrantsKey(userAccountId),
    cache: "detail",
    load: ({ signal }) => runRequest(scope, listDirectGrants(userAccountId), signal),
  })
}

export function createCapabilityDefinitionsQuery(scope: ApiScope) {
  return createServerQuery<readonly CapabilityDefinition[], RequestFailure>({
    tenantId: scope.tenantId,
    key: capabilityCatalogKey,
    cache: "lookup",
    load: ({ signal }) => runRequest(scope, listCapabilityDefinitions(), signal),
  })
}

export function createAddTenantMembershipMutation(
  scope: ApiScope,
  afterSuccess?: (membership: TenantMembership) => void,
) {
  const client = useQueryClient()
  return useMutation<TenantMembership, RequestFailure, AddTenantMembershipInput>(() => ({
    mutationFn: (input) => runRequest(scope, addMembership(input)),
    onSuccess: (membership) => {
      afterSuccess?.(membership)
      return invalidateAuthorization(client, scope.tenantId)
    },
  }))
}

export function createSuspendTenantMembershipMutation(scope: ApiScope) {
  const client = useQueryClient()
  return useMutation<TenantMembership, RequestFailure, { userAccountId: string }>(() => ({
    mutationFn: ({ userAccountId }) => runRequest(scope, suspendMembership(userAccountId)),
    onSuccess: () => invalidateAuthorization(client, scope.tenantId),
  }))
}

export function createActivateTenantMembershipMutation(scope: ApiScope) {
  const client = useQueryClient()
  return useMutation<TenantMembership, RequestFailure, { userAccountId: string }>(() => ({
    mutationFn: ({ userAccountId }) => runRequest(scope, activateMembership(userAccountId)),
    onSuccess: () => invalidateAuthorization(client, scope.tenantId),
  }))
}

export function createRemoveTenantMembershipMutation(
  scope: ApiScope,
  afterSuccess?: () => void,
) {
  const client = useQueryClient()
  return useMutation<void, RequestFailure, { userAccountId: string }>(() => ({
    mutationFn: ({ userAccountId }) => runRequest(scope, removeMembership(userAccountId)),
    onSuccess: () => {
      afterSuccess?.()
      return invalidateAuthorization(client, scope.tenantId)
    },
  }))
}

export function createGrantCapabilityMutation(scope: ApiScope, afterSuccess?: () => void) {
  const client = useQueryClient()
  return useMutation<void, RequestFailure, GrantCapabilityInput>(() => ({
    mutationFn: (input) => runRequest(scope, grantCapability(input)),
    onSuccess: () => {
      afterSuccess?.()
      return invalidateAuthorization(client, scope.tenantId)
    },
  }))
}

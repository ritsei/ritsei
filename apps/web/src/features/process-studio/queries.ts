import { useMutation, useQueryClient } from "@tanstack/solid-query"
import type {
  ListProcessCatalogInput,
  ListProcessOperatorControlsInput,
  ListProcessOperatorInboxInput,
  ListProcessRuntimeInstancesInput,
  ListProcessWorkflowRunsInput,
  OperateRuntimeInput,
  ProcessCatalogDescriptor,
  ProcessOperatorControl,
  ProcessOperatorInbox,
  ProcessRuntimeInstance,
  ProcessStaticValidation,
  ProcessWorkflowRun,
  ValidateProcessDefinitionInput,
} from "../../shared/contracts/generated/process.ts"
import type { RequestFailure } from "../../shared/api.ts"
import { createServerQuery } from "../../shared/server-query.ts"
import { type ApiScope, runRequest } from "../../shared/runtime.ts"
import {
  listCatalog,
  listOperatorControls,
  listOperatorInbox,
  listRuntimeInstances,
  listWorkflowRuns,
  operateRuntime,
  validateDefinition,
} from "./service.ts"

const processCollectionKey = ["process", "collection"] as const

const invalidate = (
  client: ReturnType<typeof useQueryClient>,
  tenantId: string,
) => client.invalidateQueries({ queryKey: ["tenant", tenantId, ...processCollectionKey] })

export function createProcessCatalogQuery(
  scope: ApiScope,
  input: ListProcessCatalogInput = {},
) {
  return createServerQuery<readonly ProcessCatalogDescriptor[], RequestFailure>({
    tenantId: scope.tenantId,
    key: [...processCollectionKey, "catalog", input],
    cache: "lookup",
    load: ({ signal }) => runRequest(scope, listCatalog(input), signal),
  })
}

export function createProcessRuntimeQuery(
  scope: ApiScope,
  input: ListProcessRuntimeInstancesInput = {},
) {
  return createServerQuery<readonly ProcessRuntimeInstance[], RequestFailure>({
    tenantId: scope.tenantId,
    key: [...processCollectionKey, "runtime", input],
    cache: "collection",
    load: ({ signal }) => runRequest(scope, listRuntimeInstances(input), signal),
  })
}

export function createProcessWorkflowRunsQuery(
  scope: ApiScope,
  input: ListProcessWorkflowRunsInput = {},
) {
  return createServerQuery<readonly ProcessWorkflowRun[], RequestFailure>({
    tenantId: scope.tenantId,
    key: [...processCollectionKey, "workflow-runs", input],
    cache: "collection",
    load: ({ signal }) => runRequest(scope, listWorkflowRuns(input), signal),
  })
}

export function createProcessInboxQuery(
  scope: ApiScope,
  input: ListProcessOperatorInboxInput = {},
) {
  return createServerQuery<ProcessOperatorInbox, RequestFailure>({
    tenantId: scope.tenantId,
    key: [...processCollectionKey, "inbox", input],
    cache: "collection",
    load: ({ signal }) => runRequest(scope, listOperatorInbox(input), signal),
  })
}

export function createProcessControlsQuery(
  scope: ApiScope,
  input: ListProcessOperatorControlsInput = {},
) {
  return createServerQuery<readonly ProcessOperatorControl[], RequestFailure>({
    tenantId: scope.tenantId,
    key: [...processCollectionKey, "operator-controls", input],
    cache: "collection",
    load: ({ signal }) => runRequest(scope, listOperatorControls(input), signal),
  })
}

export function createProcessValidationMutation(
  scope: ApiScope,
  afterSuccess?: (validation: ProcessStaticValidation) => void,
) {
  return useMutation<ProcessStaticValidation, RequestFailure, ValidateProcessDefinitionInput>(
    () => ({
      mutationFn: (input) => runRequest(scope, validateDefinition(input)),
      onSuccess: afterSuccess,
    }),
  )
}

export function createProcessOperatorMutation(
  scope: ApiScope,
  afterSuccess?: (instance: ProcessRuntimeInstance) => void,
) {
  const client = useQueryClient()
  return useMutation<
    ProcessRuntimeInstance,
    RequestFailure,
    { readonly instanceId: string; readonly input: OperateRuntimeInput }
  >(() => ({
    mutationFn: ({ instanceId, input }) => runRequest(scope, operateRuntime(instanceId, input)),
    onSuccess: (instance) => {
      afterSuccess?.(instance)
      return invalidate(client, scope.tenantId)
    },
  }))
}

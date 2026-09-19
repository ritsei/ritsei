import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"

import {
  ListProcessCatalogInput,
  ListProcessOperatorControlsInput,
  ListProcessOperatorInboxInput,
  ListProcessRuntimeInstancesInput,
  ListProcessWorkflowRunsInput,
  OperateRuntimeInput,
  ProcessCatalogDescriptor,
  ProcessJobInboxItem,
  ProcessOperatorControl,
  processRoutes,
  ProcessRuntimeInstance,
  ProcessStaticValidation,
  ProcessWorkflowRun,
  ValidateProcessDefinitionInput,
} from "../../shared/contracts/generated/process.ts"
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
const CatalogList = Schema.Array(ProcessCatalogDescriptor).check(Schema.isMaxLength(200))
const RuntimeList = Schema.Array(ProcessRuntimeInstance).check(Schema.isMaxLength(200))
const WorkflowList = Schema.Array(ProcessWorkflowRun).check(Schema.isMaxLength(200))
const ControlList = Schema.Array(ProcessOperatorControl).check(Schema.isMaxLength(200))
const Inbox = Schema.Struct({
  runtimeInstances: Schema.Array(ProcessRuntimeInstance).check(Schema.isMaxLength(200)),
  jobs: Schema.Array(ProcessJobInboxItem).check(Schema.isMaxLength(200)),
})

const validProcessValidation = (
  validation: ProcessStaticValidation,
  expected: Schema.Schema.Type<typeof ValidateProcessDefinitionInput>,
) =>
  responseMatches(validation, {
    status: "VALIDATED",
    definitionId: expected.definitionId,
    definitionVersion: expected.definitionVersion,
    catalogVersion: expected.catalogVersion,
  }) &&
  validation.references.length === expected.references.length &&
  validation.references.every((reference, index) =>
    responseMatches(reference, expected.references[index]!)
  )

export const listCatalog = Effect.fn("Frontend.Process.listCatalog")(
  function* (input: unknown = {}) {
    const decoded = yield* decodeInput(ListProcessCatalogInput, input)
    const body = yield* requestJson(`${processRoutes.listCatalog}${querySuffix(decoded)}`)
    return yield* decodeResponse(CatalogList, body)
  },
)

export const validateDefinition = Effect.fn("Frontend.Process.validateDefinition")(
  function* (input: unknown) {
    const decoded = yield* decodeInput(ValidateProcessDefinitionInput, input)
    const body = yield* requestJson(processRoutes.validateDefinition, "POST", decoded)
    const validation = yield* decodeResponse(ProcessStaticValidation, body)
    if (!validProcessValidation(validation, decoded)) {
      return yield* Effect.fail(new RequestFailure({ kind: "invalid-response" }))
    }
    return validation
  },
)

export const listRuntimeInstances = Effect.fn("Frontend.Process.listRuntimeInstances")(
  function* (input: unknown = {}) {
    const decoded = yield* decodeInput(ListProcessRuntimeInstancesInput, input)
    const body = yield* requestJson(`${processRoutes.listRuntimeInstances}${querySuffix(decoded)}`)
    const instances = yield* decodeResponse(RuntimeList, body)
    const connection = yield* connectionTenant
    if (
      !responseListMatches(instances, {
        tenantId: connection.tenantId,
        ...definedFields({ status: decoded.status, environment: decoded.environment }),
      })
    ) {
      return yield* Effect.fail(new RequestFailure({ kind: "invalid-response" }))
    }
    return instances
  },
)

export const listWorkflowRuns = Effect.fn("Frontend.Process.listWorkflowRuns")(
  function* (input: unknown = {}) {
    const decoded = yield* decodeInput(ListProcessWorkflowRunsInput, input)
    const body = yield* requestJson(`${processRoutes.listWorkflowRuns}${querySuffix(decoded)}`)
    const runs = yield* decodeResponse(WorkflowList, body)
    const connection = yield* connectionTenant
    if (
      !responseListMatches(runs, {
        tenantId: connection.tenantId,
        ...definedFields({ status: decoded.status, workflowType: decoded.workflowType }),
      })
    ) {
      return yield* Effect.fail(new RequestFailure({ kind: "invalid-response" }))
    }
    return runs
  },
)

export const listOperatorInbox = Effect.fn("Frontend.Process.listOperatorInbox")(
  function* (input: unknown = {}) {
    const decoded = yield* decodeInput(ListProcessOperatorInboxInput, input)
    const body = yield* requestJson(`${processRoutes.listOperatorInbox}${querySuffix(decoded)}`)
    const inbox = yield* decodeResponse(Inbox, body)
    const connection = yield* connectionTenant
    if (
      !responseListMatches(inbox.runtimeInstances, { tenantId: connection.tenantId }) ||
      !responseListMatches(inbox.jobs, { tenantId: connection.tenantId })
    ) {
      return yield* Effect.fail(new RequestFailure({ kind: "invalid-response" }))
    }
    return inbox
  },
)

export const listOperatorControls = Effect.fn("Frontend.Process.listOperatorControls")(
  function* (input: unknown = {}) {
    const decoded = yield* decodeInput(ListProcessOperatorControlsInput, input)
    const body = yield* requestJson(`${processRoutes.listOperatorControls}${querySuffix(decoded)}`)
    const controls = yield* decodeResponse(ControlList, body)
    const connection = yield* connectionTenant
    if (
      !responseListMatches(controls, {
        tenantId: connection.tenantId,
        ...definedFields({ instanceId: decoded.instanceId }),
      })
    ) {
      return yield* Effect.fail(new RequestFailure({ kind: "invalid-response" }))
    }
    return controls
  },
)

export const operateRuntime = Effect.fn("Frontend.Process.operateRuntime")(
  function* (instanceId: unknown, input: unknown) {
    const decodedId = yield* decodeInput(Uuid, instanceId)
    const decoded = yield* decodeInput(OperateRuntimeInput, input)
    const body = yield* mutationRequest(
      routeWithId(processRoutes.operateRuntime, decodedId),
      decoded,
    )
    const instance = yield* decodeResponse(ProcessRuntimeInstance, body, "unknown-outcome")
    const connection = yield* connectionTenant
    if (
      !responseMatches(instance, {
        tenantId: connection.tenantId,
        instanceId: decodedId,
      })
    ) {
      return yield* Effect.fail(new RequestFailure({ kind: "unknown-outcome" }))
    }
    return instance
  },
)

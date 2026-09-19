import { assert, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest"
import * as Path from "effect/Path"
import { Etag, HttpPlatform } from "effect/unstable/http"
import * as HttpApiMiddleware from "effect/unstable/httpapi/HttpApiMiddleware"
import * as HttpApiTest from "effect/unstable/httpapi/HttpApiTest"

import {
  type ProcessCatalogDescriptorType,
  type ProcessJobInboxItemType,
  type ProcessOperatorControlType,
  type ProcessRuntimeInstanceType,
  ProcessService,
  type ProcessServiceShape,
  ProcessStudioService,
  type ProcessStudioServiceShape,
  type ProcessWorkflowRunType,
} from "../../modules/process/mod.ts"
import { BearerAuth, CurrentPrincipal, RitseiApi } from "./api.ts"
import { ProcessHandlers } from "./handlers.ts"

const tenantId = "01930000-0000-7000-8000-000000000001"
const definitionId = "01930000-0000-7000-8000-000000000002"
const instanceId = "01930000-0000-7000-8000-000000000003"
const workflowId = "01930000-0000-7000-8000-000000000004"
const controlId = "01930000-0000-7000-8000-000000000005"
const jobId = "01930000-0000-7000-8000-000000000006"
const principal = { userAccountId: "process-api-user", sessionId: "process-api-session" }
const unused = () => Effect.die(new Error("unused Process API endpoint in integration test"))

const catalog: ProcessCatalogDescriptorType = {
  kind: "DomainAction",
  id: "sales.order.confirm",
  version: 1,
  owningDomain: "sales",
  title: "Confirm sales order",
  description: "Confirm an eligible sales order.",
  stability: "PUBLIC",
  compatibilityRange: { minimumVersion: 1, maximumVersion: 1 },
  requiredCapability: "sales.order.confirm",
  scope: ["tenant"],
  idempotency: "required",
  transactionSemantics: "local_atomic",
  timeoutMs: 30_000,
  maxAttempts: 3,
  preconditions: ["authorized"],
  effects: ["sales_order_confirmed"],
  compensation: { kind: "none", recovery: "manual" },
}

const runtime: ProcessRuntimeInstanceType = {
  instanceId,
  tenantId,
  processDefinitionId: definitionId,
  processDefinitionVersion: 1,
  catalogVersion: 1,
  environment: "DEV",
  status: "failed",
  failureKind: "technical_retry",
  currentNodeId: "node-1",
  revision: 2,
  correlationId: "process-correlation",
  executionPrincipal: "process-runtime",
  completedStepCount: 1,
  stepCount: 2,
  consumedEventCount: 0,
  scheduledTimerCount: 0,
  retryable: true,
  compensationStatus: "not_started",
  requiredAction: "retry",
  createdAt: "2026-09-13T12:00:00.000Z",
  updatedAt: "2026-09-13T12:01:00.000Z",
}

const workflow: ProcessWorkflowRunType = {
  id: workflowId,
  tenantId,
  workflowType: "sales.order.confirmation",
  aggregateId: definitionId,
  idempotencyKey: "process-workflow-1",
  status: "manual_recovery",
  recoveryReason: "worker failed",
  completedAt: null,
  createdAt: "2026-09-13T12:00:00.000Z",
  updatedAt: "2026-09-13T12:01:00.000Z",
}

const job: ProcessJobInboxItemType = {
  id: jobId,
  tenantId,
  jobType: "process.order_confirmation.post_commit",
  idempotencyKey: "process-job-1",
  priority: 100,
  status: "manual_recovery",
  scheduledAt: "2026-09-13T12:00:00.000Z",
  attempts: 1,
  correlationId: "process-correlation",
  completedAt: null,
  createdAt: "2026-09-13T12:00:00.000Z",
  updatedAt: "2026-09-13T12:01:00.000Z",
}

const control: ProcessOperatorControlType = {
  id: controlId,
  tenantId,
  instanceId,
  action: "retry",
  actorPrincipalId: principal.userAccountId,
  idempotencyKey: "process-retry-1",
  reason: "Retry after a transient failure",
  createdAt: "2026-09-13T12:01:00.000Z",
}

const processService: ProcessServiceShape = {
  confirmOrder: unused,
  cancelOrder: unused,
  fulfillOrder: unused,
  recoverOrder: unused,
  markManualRecovery: unused,
  claimJob: unused,
  renewJob: unused,
  completeJob: unused,
  failJob: unused,
}

const TestHttpServices = Layer.mergeAll(
  Path.layer,
  Etag.layerWeak,
  HttpPlatform.layer,
).pipe(Layer.provideMerge(FileSystem.layerNoop({})))

it.layer(TestHttpServices)("Process API", (it) => {
  it.effect("forwards tenant-scoped typed requests through the Process Studio contract", () =>
    Effect.gen(function* () {
      const observed: unknown[] = []
      const studio: ProcessStudioServiceShape = {
        listCatalog: (input) => {
          observed.push(input)
          return Effect.succeed([catalog])
        },
        validateDefinition: (input) => {
          observed.push(input)
          return Effect.succeed({
            status: "VALIDATED" as const,
            definitionId,
            definitionVersion: 1,
            catalogVersion: 1,
            references: [],
          })
        },
        listRuntimeInstances: (input) => {
          observed.push(input)
          return Effect.succeed([runtime])
        },
        getRuntimeInstance: unused,
        listWorkflowRuns: (input) => {
          observed.push(input)
          return Effect.succeed([workflow])
        },
        listOperatorInbox: (input) => {
          observed.push(input)
          return Effect.succeed({ runtimeInstances: [runtime], jobs: [job] })
        },
        listOperatorControls: (input) => {
          observed.push(input)
          return Effect.succeed([control])
        },
        operateRuntime: (input) => {
          observed.push(input)
          return Effect.succeed(runtime)
        },
      }
      const bearer = Layer.succeed(BearerAuth, {
        bearer: (effect) => Effect.provideService(effect, CurrentPrincipal, principal),
      })
      const bearerClient = HttpApiMiddleware.layerClient(
        BearerAuth,
        ({ request, next }) => next(HttpClientRequest.bearerToken(request, "test-token")),
      )
      const handlers = ProcessHandlers.pipe(
        Layer.provide(bearer),
        Layer.provide(Layer.succeed(ProcessService, processService)),
        Layer.provide(Layer.succeed(ProcessStudioService, studio)),
      )
      const client = yield* HttpApiTest.groups(RitseiApi, ["Process"]).pipe(
        Effect.provide(Layer.mergeAll(handlers, bearerClient, bearer)),
      )

      assert.deepStrictEqual(
        yield* client.Process.listCatalog({
          headers: { "x-tenant-id": tenantId },
          query: { kind: "DomainAction", limit: 1 },
        }),
        [catalog],
      )
      assert.deepStrictEqual(
        yield* client.Process.validateDefinition({
          headers: { "x-tenant-id": tenantId },
          payload: {
            definitionId,
            definitionVersion: 1,
            catalogVersion: 1,
            references: [],
          },
        }),
        {
          status: "VALIDATED",
          definitionId,
          definitionVersion: 1,
          catalogVersion: 1,
          references: [],
        },
      )
      assert.deepStrictEqual(
        yield* client.Process.listRuntimeInstances({
          headers: { "x-tenant-id": tenantId },
          query: { status: "failed", environment: "DEV", limit: 1 },
        }),
        [runtime],
      )
      assert.deepStrictEqual(
        yield* client.Process.listWorkflowRuns({
          headers: { "x-tenant-id": tenantId },
          query: { workflowType: "sales.order.confirmation", status: "manual_recovery", limit: 1 },
        }),
        [workflow],
      )
      assert.deepStrictEqual(
        yield* client.Process.listOperatorInbox({
          headers: { "x-tenant-id": tenantId },
          query: { limit: 1 },
        }),
        { runtimeInstances: [runtime], jobs: [job] },
      )
      assert.deepStrictEqual(
        yield* client.Process.listOperatorControls({
          headers: { "x-tenant-id": tenantId },
          query: { instanceId, limit: 1 },
        }),
        [control],
      )
      assert.deepStrictEqual(
        yield* client.Process.operateRuntime({
          params: { id: instanceId },
          headers: { "x-tenant-id": tenantId },
          payload: {
            action: "retry",
            idempotencyKey: "process-retry-2",
            reason: "Retry after a transient failure",
          },
        }),
        [runtime][0],
      )

      assert.strictEqual(observed.length, 7)
      for (const input of observed) {
        assert.deepStrictEqual((input as { principal: unknown }).principal, principal)
        assert.strictEqual((input as { tenantId: string }).tenantId, tenantId)
      }
      assert.deepStrictEqual(observed[0], {
        principal,
        tenantId,
        kind: "DomainAction",
        limit: 1,
      })
      assert.deepStrictEqual(observed.at(-1), {
        principal,
        tenantId,
        instanceId,
        action: "retry",
        idempotencyKey: "process-retry-2",
        reason: "Retry after a transient failure",
      })
    }))
})

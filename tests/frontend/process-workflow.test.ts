import { AxeBuilder } from "@axe-core/playwright"
import { assert, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import type { Page, Route } from "playwright"
import type {
  ProcessCatalogDescriptor,
  ProcessJobInboxItem,
  ProcessOperatorControl,
  ProcessRuntimeInstance,
  ProcessWorkflowRun,
} from "../../apps/web/src/shared/contracts/generated/process.ts"
import { builtApp, connectToTenant } from "./browser.ts"

const tenantId = "01930000-0000-7000-8000-000000000001"
const definitionId = "018f3f77-0c5a-7cc0-8b62-6a163d214123"
const instanceId = "01930000-0000-7000-8000-000000000011"
const workflowId = "01930000-0000-7000-8000-000000000012"
const controlId = "01930000-0000-7000-8000-000000000013"
const jobId = "01930000-0000-7000-8000-000000000014"

const fulfillJson = (route: Route, status: number, body: unknown) =>
  route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) })

const connectAndOpenProcessStudio = async (page: Page, url: string) => {
  await connectToTenant(page, url, "process-session", tenantId, "User accounts")
  await page.getByRole("link", { name: "Process Studio", exact: true }).click()
  await page.getByRole("heading", { name: "Process Studio", exact: true }).waitFor({
    timeout: 5_000,
  })
}

const catalog: ProcessCatalogDescriptor = {
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
  preconditions: ["authorized", "sales_order_draft"],
  effects: ["sales_order_confirmed"],
  compensation: { kind: "none", recovery: "manual" },
}

const makeRuntime = (overrides: Partial<ProcessRuntimeInstance> = {}): ProcessRuntimeInstance => ({
  instanceId,
  tenantId,
  processDefinitionId: definitionId,
  processDefinitionVersion: 1,
  catalogVersion: 1,
  environment: "DEV",
  status: "failed",
  failureKind: "technical_retry",
  currentNodeId: "confirm",
  revision: 2,
  correlationId: "correlation-process-1",
  executionPrincipal: "user-process-1",
  completedStepCount: 1,
  stepCount: 2,
  consumedEventCount: 0,
  scheduledTimerCount: 0,
  retryable: true,
  compensationStatus: "not_started",
  requiredAction: "retry",
  createdAt: "2026-09-13T12:00:00.000Z",
  updatedAt: "2026-09-13T12:01:00.000Z",
  ...overrides,
})

const workflow: ProcessWorkflowRun = {
  id: workflowId,
  tenantId,
  workflowType: "sales.order.confirmation",
  aggregateId: definitionId,
  idempotencyKey: "workflow-process-1",
  status: "succeeded",
  recoveryReason: null,
  completedAt: "2026-09-13T12:01:00.000Z",
  createdAt: "2026-09-13T12:00:00.000Z",
  updatedAt: "2026-09-13T12:01:00.000Z",
}

const job: ProcessJobInboxItem = {
  id: jobId,
  tenantId,
  jobType: "process.order_confirmation.post_commit",
  idempotencyKey: "job-process-1",
  priority: 10,
  status: "pending",
  scheduledAt: "2026-09-13T12:02:00.000Z",
  attempts: 0,
  correlationId: "correlation-process-1",
  completedAt: null,
  createdAt: "2026-09-13T12:00:00.000Z",
  updatedAt: "2026-09-13T12:02:00.000Z",
}

it.effect(
  "connects Process Studio catalog, designer validation, monitor, inbox, and recovery controls",
  () =>
    Effect.gen(function* () {
      const { page, url, errors } = yield* builtApp
      let runtime = makeRuntime()
      let inboxRuntime: ProcessRuntimeInstance[] = [runtime]
      let controls: ProcessOperatorControl[] = []
      const requests: Array<
        { path: string; method: string; headers: Record<string, string>; body: unknown }
      > = []

      yield* Effect.promise(async () => {
        // Fallow: this browser workflow intentionally uses one deterministic Process Studio route matrix.
        // fallow-ignore-next-line complexity
        await page.route("**/api/**", (route) => {
          const request = route.request()
          const requestUrl = new URL(request.url())
          const path = requestUrl.pathname.replace(/^\/api/, "")
          const method = request.method()
          const body = method === "POST" ? request.postDataJSON() : undefined
          requests.push({ path, method, headers: request.headers(), body })

          if (path === "/user-accounts" && method === "GET") return fulfillJson(route, 200, [])
          if (path === "/process/catalog" && method === "GET") {
            return fulfillJson(route, 200, [catalog])
          }
          if (path === "/process/runtime" && method === "GET") {
            return fulfillJson(route, 200, [runtime])
          }
          if (path === "/process/workflow-runs" && method === "GET") {
            return fulfillJson(route, 200, [workflow])
          }
          if (path === "/process/inbox" && method === "GET") {
            return fulfillJson(route, 200, { runtimeInstances: inboxRuntime, jobs: [job] })
          }
          if (path === "/process/operator-controls" && method === "GET") {
            return fulfillJson(route, 200, controls)
          }
          if (path === "/process/definitions/validate" && method === "POST") {
            return fulfillJson(route, 200, {
              status: "VALIDATED",
              definitionId: body.definitionId,
              definitionVersion: body.definitionVersion,
              catalogVersion: body.catalogVersion,
              references: body.references,
            })
          }
          if (path === `/process/runtime/${instanceId}/operator-controls` && method === "POST") {
            runtime = makeRuntime({
              status: "running",
              failureKind: null,
              revision: 3,
              requiredAction: "none",
              retryable: false,
              updatedAt: "2026-09-13T12:03:00.000Z",
            })
            inboxRuntime = []
            controls = [{
              id: controlId,
              tenantId,
              instanceId,
              action: body.action,
              actorPrincipalId: "process-session",
              idempotencyKey: body.idempotencyKey,
              reason: body.reason,
              createdAt: "2026-09-13T12:03:00.000Z",
            }]
            return fulfillJson(route, 200, runtime)
          }
          return fulfillJson(route, 404, { _tag: "ApiNotFound", code: "not_found" })
        })

        await connectAndOpenProcessStudio(page, url)
        await page.getByText("Confirm sales order", { exact: true }).first().waitFor()
        await page.getByRole("tab", { name: "Monitor", exact: true }).click()
        await page.getByText(instanceId, { exact: true }).waitFor()
        await page.getByRole("tab", { name: "Inbox", exact: true }).click()
        await page.getByRole("button", { name: "Retry runtime", exact: true }).click()
        const dialog = page.getByRole("dialog", { name: "Retry runtime" })
        await dialog.getByRole("textbox", { name: "Idempotency key", exact: true }).fill(
          "retry-process-1",
        )
        await dialog.getByRole("textbox", { name: "Reason", exact: true }).fill(
          "Retry after transient worker failure",
        )
        await dialog.getByRole("button", { name: "Confirm retry runtime", exact: true }).click()
        await dialog.waitFor({ state: "hidden" })
        await page.getByText("No runtime recovery actions are waiting.", { exact: true }).waitFor()
        await page.getByRole("tab", { name: "History", exact: true }).click()
        await page.getByText("Retry after transient worker failure", { exact: true }).waitFor()
        await page.getByRole("tab", { name: "Design", exact: true }).click()
        await page.getByRole("button", { name: "Validate draft", exact: true }).click()
        await page.getByText(/Backend catalog validation passed/).waitFor()

        assert.equal(
          requests.find((request) => request.path === "/process/catalog")?.headers.authorization,
          "Bearer process-session",
        )
        assert.equal(
          requests.find((request) => request.path === "/process/catalog")?.headers["x-tenant-id"],
          tenantId,
        )
        assert.deepEqual(
          requests.find((request) =>
            request.path === `/process/runtime/${instanceId}/operator-controls`
          )?.body,
          {
            action: "retry",
            idempotencyKey: "retry-process-1",
            reason: "Retry after transient worker failure",
          },
        )
        assert.deepEqual(
          requests.find((request) => request.path === "/process/definitions/validate")?.body,
          { definitionId, definitionVersion: 1, catalogVersion: 1, references: [] },
        )
        assert.isTrue(
          requests.some((request) =>
            request.path === "/process/runtime" && request.method === "GET"
          ),
        )
        assert.isTrue(
          requests.some((request) =>
            request.path === "/process/workflow-runs" && request.method === "GET"
          ),
        )
        assert.isTrue(
          requests.some((request) => request.path === "/process/inbox" && request.method === "GET"),
        )
        assert.isTrue(
          requests.some((request) =>
            request.path === "/process/operator-controls" && request.method === "GET"
          ),
        )
        assert.deepEqual(errors, [])
        assert.deepEqual(
          await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze().then((result) =>
            result.violations
          ),
          [],
        )
      })
    }),
  { timeout: 120_000 },
)

import { and, asc, desc, eq, inArray } from "drizzle-orm"
import * as Clock from "effect/Clock"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Result from "effect/Result"
import * as Schema from "effect/Schema"

import { AuthorizationDenied, AuthorizationService } from "../../authorization/mod.ts"
import { Principal } from "../../auth/mod.ts"
import { type DomainActionCatalogEntry, type DomainEventCatalogEntry } from "../../catalog/mod.ts"
import {
  Database,
  DatabaseFailure,
  type DrizzleDatabase,
  isDatabaseConstraint,
  uuidv7,
} from "../../../foundation/mod.ts"
import { AccountingTypedActionCatalog, AccountingTypedEventCatalog } from "../../accounting/mod.ts"
import { IdentityTypedActionCatalog, IdentityTypedEventCatalog } from "../../identity/mod.ts"
import { InventoryTypedActionCatalog, InventoryTypedEventCatalog } from "../../inventory/mod.ts"
import { PartyTypedActionCatalog, PartyTypedEventCatalog } from "../../party/mod.ts"
import {
  ProcurementTypedActionCatalog,
  ProcurementTypedEventCatalog,
} from "../../procurement/mod.ts"
import { SalesTypedActionCatalog, SalesTypedEventCatalog } from "../../sales/mod.ts"
import {
  processJobs,
  processOperatorControls,
  processRuntimeCheckpoints,
  workflowRuns,
} from "../../../db/schema/process.ts"
import { ProcessCapabilities } from "./capabilities.ts"
import {
  makeProcessCatalogRegistry,
  ProcessCatalogCapabilityKind,
  ResolveProcessCatalogInput,
} from "./catalog-registry.ts"
import {
  ProcessReleaseValidation,
  ProcessReleaseValidationFailed,
  validateProcessRelease,
} from "./catalog-release.ts"
import { ProcessTypedEventCatalog } from "./catalog.ts"
import {
  makeProcessOperatorService,
  ProcessCompensationStatus,
  ProcessOperatorAction,
  ProcessOperatorActionUnavailable,
  ProcessOperatorConflict,
} from "./operations.ts"
import {
  ProcessCheckpoint,
  ProcessCheckpointInvalid,
  ProcessEnvironment,
  ProcessFailureKind,
  ProcessRuntimeStatus,
  recoverCheckpoint,
} from "./runtime.ts"
import { ProcessCheckpointRevisionConflict } from "./runtime-store.ts"
import { ProcessWorkflowType } from "./service.ts"
import { ProcessOperatorControl } from "./operations-store.ts"

const Uuid = Schema.String.check(Schema.isUUID())
const NonEmptyString = Schema.String.check(Schema.isPattern(/\S/))
const PositiveInt = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 2_147_483_647 }))
const NonNegativeInt = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 2_147_483_647 }))
const Limit = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 200 }))
const Timestamp = Schema.String.check(Schema.isPattern(/\S/))

const CatalogStability = Schema.Literals([
  "PRIVATE",
  "EXPERIMENTAL",
  "PUBLIC",
  "DEPRECATED",
  "RETIRED",
])
const CatalogCompatibilityRange = Schema.Struct({
  minimumVersion: PositiveInt,
  maximumVersion: PositiveInt,
})
const CatalogCompensation = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("action"),
    actionId: NonEmptyString,
    version: PositiveInt,
  }),
  Schema.Struct({
    kind: Schema.Literal("none"),
    recovery: Schema.Literal("manual"),
  }),
])

const CatalogEntryCommon = {
  id: NonEmptyString,
  version: PositiveInt,
  owningDomain: NonEmptyString,
  title: NonEmptyString,
  description: NonEmptyString,
  stability: CatalogStability,
  compatibilityRange: CatalogCompatibilityRange,
}

export const ProcessCatalogAction = Schema.Struct({
  ...CatalogEntryCommon,
  kind: Schema.Literal("DomainAction"),
  requiredCapability: NonEmptyString,
  scope: Schema.Array(NonEmptyString),
  idempotency: Schema.Literals(["required", "inherent", "unsupported"]),
  transactionSemantics: Schema.Literals([
    "local_atomic",
    "coordination_only",
    "durable_external_effect",
  ]),
  timeoutMs: PositiveInt,
  maxAttempts: PositiveInt,
  preconditions: Schema.Array(NonEmptyString),
  effects: Schema.Array(NonEmptyString),
  compensation: CatalogCompensation,
})

export const ProcessCatalogEvent = Schema.Struct({
  ...CatalogEntryCommon,
  kind: Schema.Literal("DomainEvent"),
  scope: Schema.Array(NonEmptyString),
  aggregateType: NonEmptyString,
  correlationFields: Schema.Array(NonEmptyString),
  filterableFields: Schema.Array(NonEmptyString),
  occurredAtSemantics: NonEmptyString,
  deliveryExpectation: NonEmptyString,
  sensitivity: NonEmptyString,
})

export const ProcessCatalogDescriptor = Schema.Union([ProcessCatalogAction, ProcessCatalogEvent])
export type ProcessCatalogDescriptor = Schema.Schema.Type<typeof ProcessCatalogDescriptor>

export const ListProcessCatalogInput = Schema.Struct({
  principal: Principal,
  tenantId: Uuid,
  kind: Schema.optionalKey(ProcessCatalogCapabilityKind),
  limit: Schema.optionalKey(Limit),
})

export const ValidateProcessDefinitionInput = Schema.Struct({
  principal: Principal,
  tenantId: Uuid,
  definitionId: Uuid,
  definitionVersion: PositiveInt,
  catalogVersion: PositiveInt,
  references: Schema.Array(ResolveProcessCatalogInput),
})

export const ProcessStaticValidation = ProcessReleaseValidation
export type ProcessStaticValidation = Schema.Schema.Type<typeof ProcessStaticValidation>

export const ListProcessRuntimeInstancesInput = Schema.Struct({
  principal: Principal,
  tenantId: Uuid,
  status: Schema.optionalKey(ProcessRuntimeStatus),
  environment: Schema.optionalKey(ProcessEnvironment),
  limit: Schema.optionalKey(Limit),
})

export const GetProcessRuntimeInstanceInput = Schema.Struct({
  principal: Principal,
  tenantId: Uuid,
  instanceId: Uuid,
})

export const ProcessRuntimeInstance = Schema.Struct({
  instanceId: Uuid,
  tenantId: Uuid,
  processDefinitionId: Uuid,
  processDefinitionVersion: PositiveInt,
  catalogVersion: PositiveInt,
  environment: ProcessEnvironment,
  status: ProcessRuntimeStatus,
  failureKind: Schema.NullOr(ProcessFailureKind),
  currentNodeId: NonEmptyString,
  revision: NonNegativeInt,
  correlationId: NonEmptyString,
  executionPrincipal: NonEmptyString,
  completedStepCount: NonNegativeInt,
  stepCount: NonNegativeInt,
  consumedEventCount: NonNegativeInt,
  scheduledTimerCount: NonNegativeInt,
  retryable: Schema.Boolean,
  compensationStatus: ProcessCompensationStatus,
  requiredAction: Schema.Union([ProcessOperatorAction, Schema.Literal("none")]),
  createdAt: Timestamp,
  updatedAt: Timestamp,
})
export type ProcessRuntimeInstance = Schema.Schema.Type<typeof ProcessRuntimeInstance>

export const ProcessRuntimeDetail = Schema.Struct({
  instance: ProcessRuntimeInstance,
  checkpoint: ProcessCheckpoint,
})
export type ProcessRuntimeDetail = Schema.Schema.Type<typeof ProcessRuntimeDetail>

const ProcessWorkflowRunStatus = Schema.Literals(["running", "succeeded", "manual_recovery"])
export const ListProcessWorkflowRunsInput = Schema.Struct({
  principal: Principal,
  tenantId: Uuid,
  workflowType: Schema.optionalKey(ProcessWorkflowType),
  status: Schema.optionalKey(ProcessWorkflowRunStatus),
  limit: Schema.optionalKey(Limit),
})

export const ProcessWorkflowRun = Schema.Struct({
  id: Uuid,
  tenantId: Uuid,
  workflowType: ProcessWorkflowType,
  aggregateId: Uuid,
  idempotencyKey: NonEmptyString,
  status: ProcessWorkflowRunStatus,
  recoveryReason: Schema.NullOr(NonEmptyString),
  completedAt: Schema.NullOr(Timestamp),
  createdAt: Timestamp,
  updatedAt: Timestamp,
})
export type ProcessWorkflowRun = Schema.Schema.Type<typeof ProcessWorkflowRun>

export const ProcessJobInboxItem = Schema.Struct({
  id: Uuid,
  tenantId: Uuid,
  jobType: NonEmptyString,
  idempotencyKey: NonEmptyString,
  priority: Schema.Int,
  status: Schema.Literals(["pending", "leased", "completed", "failed", "manual_recovery"]),
  scheduledAt: Timestamp,
  attempts: NonNegativeInt,
  correlationId: NonEmptyString,
  completedAt: Schema.NullOr(Timestamp),
  createdAt: Timestamp,
  updatedAt: Timestamp,
})
export type ProcessJobInboxItem = Schema.Schema.Type<typeof ProcessJobInboxItem>

export const ProcessOperatorInbox = Schema.Struct({
  runtimeInstances: Schema.Array(ProcessRuntimeInstance),
  jobs: Schema.Array(ProcessJobInboxItem),
})
export type ProcessOperatorInbox = Schema.Schema.Type<typeof ProcessOperatorInbox>

export const ListProcessOperatorInboxInput = Schema.Struct({
  principal: Principal,
  tenantId: Uuid,
  limit: Schema.optionalKey(Limit),
})

export const ListProcessOperatorControlsInput = Schema.Struct({
  principal: Principal,
  tenantId: Uuid,
  instanceId: Schema.optionalKey(Uuid),
  limit: Schema.optionalKey(Limit),
})

export const ProcessRuntimeOperatorInput = Schema.Struct({
  principal: Principal,
  tenantId: Uuid,
  instanceId: Uuid,
  action: ProcessOperatorAction,
  idempotencyKey: NonEmptyString,
  reason: NonEmptyString,
})

export const ProcessStudioService = Context.Service<ProcessStudioService>(
  "RITSEI/ProcessStudioService",
)

export interface ProcessStudioService {
  readonly listCatalog: (
    input: unknown,
  ) => Effect.Effect<
    ReadonlyArray<ProcessCatalogDescriptor>,
    Schema.SchemaError | AuthorizationDenied | DatabaseFailure
  >
  readonly validateDefinition: (
    input: unknown,
  ) => Effect.Effect<
    ProcessStaticValidation,
    Schema.SchemaError | AuthorizationDenied | DatabaseFailure | ProcessReleaseValidationFailed
  >
  readonly listRuntimeInstances: (
    input: unknown,
  ) => Effect.Effect<ReadonlyArray<ProcessRuntimeInstance>, StudioFailure>
  readonly getRuntimeInstance: (
    input: unknown,
  ) => Effect.Effect<ProcessRuntimeDetail, StudioFailure>
  readonly listWorkflowRuns: (
    input: unknown,
  ) => Effect.Effect<ReadonlyArray<ProcessWorkflowRun>, StudioFailure>
  readonly listOperatorInbox: (
    input: unknown,
  ) => Effect.Effect<ProcessOperatorInbox, StudioFailure>
  readonly listOperatorControls: (
    input: unknown,
  ) => Effect.Effect<ReadonlyArray<ProcessOperatorControl>, StudioFailure>
  readonly operateRuntime: (
    input: unknown,
  ) => Effect.Effect<ProcessRuntimeInstance, StudioFailure>
}

export class ProcessRuntimeInstanceNotFound
  extends Schema.TaggedError<ProcessRuntimeInstanceNotFound>()("ProcessRuntimeInstanceNotFound", {
    tenantId: Uuid,
    instanceId: Uuid,
  }) {}

export class ProcessStudioRecordCorrupt
  extends Schema.TaggedError<ProcessStudioRecordCorrupt>()("ProcessStudioRecordCorrupt", {
    tenantId: Uuid,
    recordId: Uuid,
    recordType: NonEmptyString,
  }) {}

type StudioFailure =
  | Schema.SchemaError
  | AuthorizationDenied
  | DatabaseFailure
  | ProcessCheckpointInvalid
  | ProcessCheckpointRevisionConflict
  | ProcessOperatorActionUnavailable
  | ProcessOperatorConflict
  | ProcessRuntimeInstanceNotFound
  | ProcessReleaseValidationFailed
  | ProcessStudioRecordCorrupt

const allCatalogEntries: ReadonlyArray<
  DomainActionCatalogEntry | DomainEventCatalogEntry
> = [
  ...IdentityTypedActionCatalog,
  ...IdentityTypedEventCatalog,
  ...PartyTypedActionCatalog,
  ...PartyTypedEventCatalog,
  ...InventoryTypedActionCatalog,
  ...InventoryTypedEventCatalog,
  ...ProcurementTypedActionCatalog,
  ...ProcurementTypedEventCatalog,
  ...SalesTypedActionCatalog,
  ...SalesTypedEventCatalog,
  ...AccountingTypedActionCatalog,
  ...AccountingTypedEventCatalog,
  ...ProcessTypedEventCatalog,
]

const toCatalogDescriptor = (
  entry: DomainActionCatalogEntry | DomainEventCatalogEntry,
): ProcessCatalogDescriptor =>
  entry.kind === "DomainAction"
    ? {
      kind: entry.kind,
      id: entry.id,
      version: entry.version,
      owningDomain: entry.owningDomain,
      title: entry.title,
      description: entry.description,
      stability: entry.stability,
      compatibilityRange: entry.compatibilityRange,
      requiredCapability: entry.requiredCapability,
      scope: entry.scope,
      idempotency: entry.idempotency,
      transactionSemantics: entry.transactionSemantics,
      timeoutMs: entry.timeoutPolicy.timeoutMs,
      maxAttempts: entry.retryPolicy.maxAttempts,
      preconditions: entry.preconditions,
      effects: entry.effects,
      compensation: entry.compensation,
    }
    : {
      kind: entry.kind,
      id: entry.id,
      version: entry.version,
      owningDomain: entry.owningDomain,
      title: entry.title,
      description: entry.description,
      stability: entry.stability,
      compatibilityRange: entry.compatibilityRange,
      scope: entry.scope,
      aggregateType: entry.aggregateType,
      correlationFields: entry.correlationFields,
      filterableFields: entry.filterableFields,
      occurredAtSemantics: entry.occurredAtSemantics,
      deliveryExpectation: entry.deliveryExpectation,
      sensitivity: entry.sensitivity,
    }

const catalogDescriptors = allCatalogEntries
  .filter((entry) => entry.stability === "PUBLIC")
  .map(toCatalogDescriptor)
  .sort((left, right) =>
    `${left.owningDomain}:${left.kind}:${left.id}:${left.version}`.localeCompare(
      `${right.owningDomain}:${right.kind}:${right.id}:${right.version}`,
    )
  )

const operatorCapability = (
  action: Schema.Schema.Type<typeof ProcessOperatorAction>,
) =>
  action === "retry"
    ? ProcessCapabilities.runtimeRetry
    : action === "compensate"
    ? ProcessCapabilities.runtimeCompensate
    : ProcessCapabilities.runtimeManualRecovery

const iso = (value: Date | null): string | null => value?.toISOString() ?? null

const toOperatorControl = (row: {
  readonly id: string
  readonly tenantId: string
  readonly instanceId: string
  readonly action: "retry" | "compensate" | "manual_recovery"
  readonly idempotencyKey: string
  readonly actorPrincipalId: string
  readonly reason: string
  readonly createdAt: Date
}) => ({
  id: row.id,
  tenantId: row.tenantId,
  instanceId: row.instanceId,
  action: row.action,
  idempotencyKey: row.idempotencyKey,
  actorPrincipalId: row.actorPrincipalId,
  reason: row.reason,
  createdAt: row.createdAt.toISOString(),
})

const decodeCheckpointRow = (row: {
  readonly id: string
  readonly tenantId: string
  readonly processDefinitionId: string
  readonly processDefinitionVersion: number
  readonly catalogVersion: number
  readonly environment: "DEV" | "TEST" | "PROD"
  readonly status: "running" | "waiting" | "completed" | "failed" | "manual_recovery"
  readonly failureKind:
    | "business_failure"
    | "technical_retry"
    | "unknown_external_outcome"
    | "compensation_failure"
    | null
  readonly currentNodeId: string
  readonly revision: number
  readonly state: unknown
  readonly correlationId: string
  readonly executionPrincipal: string
}) =>
  recoverCheckpoint(row.state).pipe(
    // Fallow: runtime checkpoint selection intentionally verifies every tenant and version invariant.
    // fallow-ignore-next-line complexity
    Effect.flatMap((checkpoint) =>
      checkpoint.instanceId === row.id &&
        checkpoint.tenantId === row.tenantId &&
        checkpoint.processDefinitionId === row.processDefinitionId &&
        checkpoint.processDefinitionVersion === row.processDefinitionVersion &&
        checkpoint.catalogVersion === row.catalogVersion &&
        checkpoint.environment === row.environment &&
        checkpoint.status === row.status &&
        checkpoint.failureKind === row.failureKind &&
        checkpoint.currentNodeId === row.currentNodeId &&
        checkpoint.revision === row.revision &&
        checkpoint.correlationId === row.correlationId &&
        checkpoint.executionPrincipal === row.executionPrincipal
        ? Effect.succeed(checkpoint)
        : Effect.fail(
          new ProcessCheckpointInvalid({
            reason: "checkpoint metadata disagrees with its persisted state",
          }),
        )
    ),
  )

const toRuntimeInstance = (
  checkpoint: ProcessCheckpoint,
  createdAt: Date,
  updatedAt: Date,
): ProcessRuntimeInstance => {
  const snapshot = makeProcessOperatorService().inspect(checkpoint)
  return {
    instanceId: checkpoint.instanceId,
    tenantId: checkpoint.tenantId,
    processDefinitionId: checkpoint.processDefinitionId,
    processDefinitionVersion: checkpoint.processDefinitionVersion,
    catalogVersion: checkpoint.catalogVersion,
    environment: checkpoint.environment,
    status: checkpoint.status,
    failureKind: checkpoint.failureKind,
    currentNodeId: checkpoint.currentNodeId,
    revision: checkpoint.revision,
    correlationId: checkpoint.correlationId,
    executionPrincipal: checkpoint.executionPrincipal,
    completedStepCount: checkpoint.completedStepIds.length,
    stepCount: checkpoint.stepExecutions.length,
    consumedEventCount: checkpoint.consumedEventIds.length,
    scheduledTimerCount: checkpoint.scheduledTimerIds.length,
    retryable: snapshot.retryable,
    compensationStatus: snapshot.compensationStatus,
    requiredAction: snapshot.requiredAction,
    createdAt: createdAt.toISOString(),
    updatedAt: updatedAt.toISOString(),
  }
}

const toWorkflowRun = (row: {
  readonly id: string
  readonly tenantId: string
  readonly workflowType: string
  readonly aggregateId: string
  readonly idempotencyKey: string
  readonly status: "running" | "succeeded" | "manual_recovery"
  readonly recoveryReason: string | null
  readonly completedAt: Date | null
  readonly createdAt: Date
  readonly updatedAt: Date
}) =>
  Schema.decodeUnknownEffect(ProcessWorkflowRun)({
    id: row.id,
    tenantId: row.tenantId,
    workflowType: row.workflowType,
    aggregateId: row.aggregateId,
    idempotencyKey: row.idempotencyKey,
    status: row.status,
    recoveryReason: row.recoveryReason,
    completedAt: iso(row.completedAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }).pipe(
    Effect.mapError(() =>
      new ProcessStudioRecordCorrupt({
        tenantId: row.tenantId,
        recordId: row.id,
        recordType: "workflow_run",
      })
    ),
  )

const toJobInboxItem = (row: {
  readonly id: string
  readonly tenantId: string
  readonly jobType: string
  readonly idempotencyKey: string
  readonly priority: number
  readonly status: "pending" | "leased" | "completed" | "failed" | "manual_recovery"
  readonly scheduledAt: Date
  readonly attempts: number
  readonly correlationId: string
  readonly completedAt: Date | null
  readonly createdAt: Date
  readonly updatedAt: Date
}) =>
  Schema.decodeUnknownEffect(ProcessJobInboxItem)({
    id: row.id,
    tenantId: row.tenantId,
    jobType: row.jobType,
    idempotencyKey: row.idempotencyKey,
    priority: row.priority,
    status: row.status,
    scheduledAt: row.scheduledAt.toISOString(),
    attempts: row.attempts,
    correlationId: row.correlationId,
    completedAt: iso(row.completedAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }).pipe(
    Effect.mapError(() =>
      new ProcessStudioRecordCorrupt({
        tenantId: row.tenantId,
        recordId: row.id,
        recordType: "process_job",
      })
    ),
  )

const processRuntimeCheckpointSelection = {
  id: processRuntimeCheckpoints.id,
  tenantId: processRuntimeCheckpoints.tenantId,
  processDefinitionId: processRuntimeCheckpoints.processDefinitionId,
  processDefinitionVersion: processRuntimeCheckpoints.processDefinitionVersion,
  catalogVersion: processRuntimeCheckpoints.catalogVersion,
  environment: processRuntimeCheckpoints.environment,
  status: processRuntimeCheckpoints.status,
  failureKind: processRuntimeCheckpoints.failureKind,
  currentNodeId: processRuntimeCheckpoints.currentNodeId,
  revision: processRuntimeCheckpoints.revision,
  state: processRuntimeCheckpoints.state,
  correlationId: processRuntimeCheckpoints.correlationId,
  executionPrincipal: processRuntimeCheckpoints.executionPrincipal,
  createdAt: processRuntimeCheckpoints.createdAt,
  updatedAt: processRuntimeCheckpoints.updatedAt,
}

type RuntimeSelectionStatus = "running" | "waiting" | "completed" | "failed" | "manual_recovery"
type RuntimeSelectionEnvironment = "DEV" | "TEST" | "PROD"

const selectRuntimeCheckpointRows = (
  db: DrizzleDatabase,
  options: {
    tenantId: string
    instanceId?: string
    status?: RuntimeSelectionStatus
    environment?: RuntimeSelectionEnvironment
    limit?: number
  },
) =>
  db.select(processRuntimeCheckpointSelection).from(processRuntimeCheckpoints).where(and(
    eq(processRuntimeCheckpoints.tenantId, options.tenantId),
    options.instanceId === undefined
      ? undefined
      : eq(processRuntimeCheckpoints.id, options.instanceId),
    options.status === undefined ? undefined : eq(processRuntimeCheckpoints.status, options.status),
    options.environment === undefined
      ? undefined
      : eq(processRuntimeCheckpoints.environment, options.environment),
  )).orderBy(desc(processRuntimeCheckpoints.updatedAt), desc(processRuntimeCheckpoints.id))
    .limit(options.limit ?? 200)

const sameOperatorControl = (
  row: {
    readonly instanceId: string
    readonly action: "retry" | "compensate" | "manual_recovery"
    readonly actorPrincipalId: string
    readonly idempotencyKey: string
    readonly reason: string
  },
  input: {
    readonly instanceId: string
    readonly action: "retry" | "compensate" | "manual_recovery"
    readonly actorPrincipalId: string
    readonly idempotencyKey: string
    readonly reason: string
  },
) =>
  row.instanceId === input.instanceId && row.action === input.action &&
  row.actorPrincipalId === input.actorPrincipalId && row.idempotencyKey === input.idempotencyKey &&
  row.reason === input.reason

export const makeProcessStudioService = Effect.gen(function* () {
  const authorization = yield* AuthorizationService
  const database = yield* Database
  const clock = yield* Clock.Clock
  const registry = yield* makeProcessCatalogRegistry(allCatalogEntries)
  const operator = makeProcessOperatorService()
  const now = () => new Date(clock.currentTimeMillisUnsafe())

  const authorize = (
    principal: Schema.Schema.Type<typeof Principal>,
    tenantId: string,
    capability: string,
  ) => authorization.authorize({ principal, tenantId, capability })

  const listCatalog = (input: unknown) =>
    Effect.gen(function* () {
      const decoded = yield* Schema.decodeUnknownEffect(ListProcessCatalogInput)(input)
      yield* authorize(decoded.principal, decoded.tenantId, ProcessCapabilities.catalogRead)
      const entries = decoded.kind === undefined
        ? catalogDescriptors
        : catalogDescriptors.filter((entry) => entry.kind === decoded.kind)
      return entries.slice(0, decoded.limit ?? 200)
    })

  const validateDefinition = (input: unknown) =>
    Effect.gen(function* () {
      const decoded = yield* Schema.decodeUnknownEffect(ValidateProcessDefinitionInput)(input)
      yield* authorize(decoded.principal, decoded.tenantId, ProcessCapabilities.definitionValidate)
      return yield* validateProcessRelease(registry, {
        definitionId: decoded.definitionId,
        definitionVersion: decoded.definitionVersion,
        catalogVersion: decoded.catalogVersion,
        references: decoded.references,
      })
    })

  const listRuntimeInstances = (input: unknown) =>
    Effect.gen(function* () {
      const decoded = yield* Schema.decodeUnknownEffect(ListProcessRuntimeInstancesInput)(input)
      yield* authorize(decoded.principal, decoded.tenantId, ProcessCapabilities.monitorRead)
      const rows = yield* database.query(
        (db) => selectRuntimeCheckpointRows(db, decoded),
        "process.studio.runtime.list",
      )
      return yield* Effect.forEach(rows, (row) =>
        decodeCheckpointRow(row).pipe(
          Effect.map((checkpoint) => toRuntimeInstance(checkpoint, row.createdAt, row.updatedAt)),
        ))
    })

  const getRuntimeInstance = (input: unknown) =>
    Effect.gen(function* () {
      const decoded = yield* Schema.decodeUnknownEffect(GetProcessRuntimeInstanceInput)(input)
      yield* authorize(decoded.principal, decoded.tenantId, ProcessCapabilities.monitorRead)
      const rows = yield* database.query(
        (db) => selectRuntimeCheckpointRows(db, decoded),
        "process.studio.runtime.get",
      )
      const row = rows[0]
      if (row === undefined) {
        return yield* Effect.fail(
          new ProcessRuntimeInstanceNotFound({
            tenantId: decoded.tenantId,
            instanceId: decoded.instanceId,
          }),
        )
      }
      const checkpoint = yield* decodeCheckpointRow(row)
      return {
        instance: toRuntimeInstance(checkpoint, row.createdAt, row.updatedAt),
        checkpoint,
      }
    })

  const listWorkflowRuns = (input: unknown) =>
    Effect.gen(function* () {
      const decoded = yield* Schema.decodeUnknownEffect(ListProcessWorkflowRunsInput)(input)
      yield* authorize(decoded.principal, decoded.tenantId, ProcessCapabilities.monitorRead)
      const rows = yield* database.query(
        (db) =>
          db.select({
            id: workflowRuns.id,
            tenantId: workflowRuns.tenantId,
            workflowType: workflowRuns.workflowType,
            aggregateId: workflowRuns.aggregateId,
            idempotencyKey: workflowRuns.idempotencyKey,
            status: workflowRuns.status,
            recoveryReason: workflowRuns.recoveryReason,
            completedAt: workflowRuns.completedAt,
            createdAt: workflowRuns.createdAt,
            updatedAt: workflowRuns.updatedAt,
          }).from(workflowRuns).where(and(
            eq(workflowRuns.tenantId, decoded.tenantId),
            decoded.workflowType === undefined
              ? undefined
              : eq(workflowRuns.workflowType, decoded.workflowType),
            decoded.status === undefined ? undefined : eq(workflowRuns.status, decoded.status),
          )).orderBy(desc(workflowRuns.updatedAt), desc(workflowRuns.id)).limit(
            decoded.limit ?? 200,
          ),
        "process.studio.workflow-runs.list",
      )
      return yield* Effect.forEach(rows, toWorkflowRun)
    })

  const listOperatorInbox = (input: unknown) =>
    Effect.gen(function* () {
      const decoded = yield* Schema.decodeUnknownEffect(ListProcessOperatorInboxInput)(input)
      yield* authorize(decoded.principal, decoded.tenantId, ProcessCapabilities.inboxRead)
      const limit = decoded.limit ?? 200
      const [checkpointRows, jobRows] = yield* Effect.all([
        database.query(
          (db) =>
            db.select(processRuntimeCheckpointSelection).from(processRuntimeCheckpoints).where(and(
              eq(processRuntimeCheckpoints.tenantId, decoded.tenantId),
              inArray(processRuntimeCheckpoints.status, [
                "running",
                "waiting",
                "failed",
                "manual_recovery",
              ]),
            )).orderBy(
              desc(processRuntimeCheckpoints.updatedAt),
              desc(processRuntimeCheckpoints.id),
            )
              .limit(limit),
          "process.studio.inbox.runtime.list",
        ),
        database.query(
          (db) =>
            db.select({
              id: processJobs.id,
              tenantId: processJobs.tenantId,
              jobType: processJobs.jobType,
              idempotencyKey: processJobs.idempotencyKey,
              priority: processJobs.priority,
              status: processJobs.status,
              scheduledAt: processJobs.scheduledAt,
              attempts: processJobs.attempts,
              correlationId: processJobs.correlationId,
              completedAt: processJobs.completedAt,
              createdAt: processJobs.createdAt,
              updatedAt: processJobs.updatedAt,
            }).from(processJobs).where(and(
              eq(processJobs.tenantId, decoded.tenantId),
              inArray(processJobs.status, ["pending", "leased", "failed", "manual_recovery"]),
            )).orderBy(
              desc(processJobs.priority),
              asc(processJobs.scheduledAt),
              asc(processJobs.id),
            )
              .limit(limit),
          "process.studio.inbox.jobs.list",
        ),
      ])
      const runtimeInstances = yield* Effect.forEach(checkpointRows, (row) =>
        decodeCheckpointRow(row).pipe(
          Effect.flatMap((checkpoint) => {
            const instance = toRuntimeInstance(checkpoint, row.createdAt, row.updatedAt)
            return instance.requiredAction === "none"
              ? Effect.succeed(null)
              : Effect.succeed(instance)
          }),
        )).pipe(
          Effect.map((items) =>
            items.filter((item): item is ProcessRuntimeInstance =>
              item !== null
            )
          ),
        )
      const jobs = yield* Effect.forEach(jobRows, toJobInboxItem)
      return { runtimeInstances, jobs }
    })

  const listOperatorControls = (input: unknown) =>
    Effect.gen(function* () {
      const decoded = yield* Schema.decodeUnknownEffect(ListProcessOperatorControlsInput)(input)
      yield* authorize(decoded.principal, decoded.tenantId, ProcessCapabilities.historyRead)
      const rows = yield* database.query(
        (db) =>
          db.select({
            id: processOperatorControls.id,
            tenantId: processOperatorControls.tenantId,
            instanceId: processOperatorControls.instanceId,
            action: processOperatorControls.action,
            idempotencyKey: processOperatorControls.idempotencyKey,
            actorPrincipalId: processOperatorControls.actorPrincipalId,
            reason: processOperatorControls.reason,
            createdAt: processOperatorControls.createdAt,
          }).from(processOperatorControls).where(and(
            eq(processOperatorControls.tenantId, decoded.tenantId),
            decoded.instanceId === undefined
              ? undefined
              : eq(processOperatorControls.instanceId, decoded.instanceId),
          )).orderBy(desc(processOperatorControls.createdAt), desc(processOperatorControls.id))
            .limit(decoded.limit ?? 200),
        "process.studio.operator-controls.list",
      )
      return yield* Effect.forEach(rows, (row) =>
        Schema.decodeUnknownEffect(ProcessOperatorControl)(toOperatorControl(row)).pipe(
          Effect.mapError(() =>
            new ProcessStudioRecordCorrupt({
              tenantId: row.tenantId,
              recordId: row.id,
              recordType: "operator_control",
            })
          ),
        ))
    })

  const loadRuntimeRow = (tenantId: string, instanceId: string, forUpdate = false) =>
    database.query(
      (db) => {
        const query = db.select(processRuntimeCheckpointSelection).from(processRuntimeCheckpoints)
          .where(and(
            eq(processRuntimeCheckpoints.tenantId, tenantId),
            eq(processRuntimeCheckpoints.id, instanceId),
          ))
        return forUpdate ? query.for("update") : query
      },
      forUpdate ? "process.studio.runtime.lock" : "process.studio.runtime.load",
    )

  const operateRuntime = (input: unknown) =>
    Effect.gen(function* () {
      const decoded = yield* Schema.decodeUnknownEffect(ProcessRuntimeOperatorInput)(input)
      yield* authorize(decoded.principal, decoded.tenantId, operatorCapability(decoded.action))
      const actorPrincipalId = decoded.principal.userAccountId
      const operation = database.withTransaction(
        Effect.gen(function* () {
          const existingRows = yield* database.query(
            (db) =>
              db.select({
                id: processOperatorControls.id,
                tenantId: processOperatorControls.tenantId,
                instanceId: processOperatorControls.instanceId,
                action: processOperatorControls.action,
                idempotencyKey: processOperatorControls.idempotencyKey,
                actorPrincipalId: processOperatorControls.actorPrincipalId,
                reason: processOperatorControls.reason,
              }).from(processOperatorControls).where(and(
                eq(processOperatorControls.tenantId, decoded.tenantId),
                eq(processOperatorControls.idempotencyKey, decoded.idempotencyKey),
              )).for("update"),
            "process.studio.operator-control.idempotency.lookup",
          )
          const existing = existingRows[0]
          if (existing !== undefined) {
            if (
              !sameOperatorControl(existing, {
                instanceId: decoded.instanceId,
                action: decoded.action,
                actorPrincipalId,
                idempotencyKey: decoded.idempotencyKey,
                reason: decoded.reason,
              })
            ) {
              return yield* Effect.fail(
                new ProcessOperatorConflict({
                  tenantId: decoded.tenantId,
                  instanceId: decoded.instanceId,
                  idempotencyKey: decoded.idempotencyKey,
                }),
              )
            }
            const replayRows = yield* loadRuntimeRow(decoded.tenantId, decoded.instanceId, true)
            const replayRow = replayRows[0]
            if (replayRow === undefined) {
              return yield* Effect.fail(
                new ProcessRuntimeInstanceNotFound({
                  tenantId: decoded.tenantId,
                  instanceId: decoded.instanceId,
                }),
              )
            }
            const replayCheckpoint = yield* decodeCheckpointRow(replayRow)
            return toRuntimeInstance(replayCheckpoint, replayRow.createdAt, replayRow.updatedAt)
          }

          const rows = yield* loadRuntimeRow(decoded.tenantId, decoded.instanceId, true)
          const row = rows[0]
          if (row === undefined) {
            return yield* Effect.fail(
              new ProcessRuntimeInstanceNotFound({
                tenantId: decoded.tenantId,
                instanceId: decoded.instanceId,
              }),
            )
          }
          const checkpoint = yield* decodeCheckpointRow(row)
          const updatedCheckpoint = decoded.action === "retry"
            ? yield* operator.retry(checkpoint)
            : decoded.action === "compensate"
            ? yield* operator.startCompensation(checkpoint)
            : yield* operator.requireManualRecovery(checkpoint)
          const updatedAt = now()
          const updatedRows = yield* database.query(
            (db) =>
              db.update(processRuntimeCheckpoints).set({
                status: updatedCheckpoint.status,
                failureKind: updatedCheckpoint.failureKind,
                currentNodeId: updatedCheckpoint.currentNodeId,
                revision: updatedCheckpoint.revision,
                state: updatedCheckpoint,
                updatedAt,
              }).where(and(
                eq(processRuntimeCheckpoints.tenantId, decoded.tenantId),
                eq(processRuntimeCheckpoints.id, decoded.instanceId),
                eq(processRuntimeCheckpoints.revision, checkpoint.revision),
              )).returning({ id: processRuntimeCheckpoints.id }),
            "process.studio.runtime.operator-update",
          )
          if (updatedRows.length !== 1) {
            return yield* Effect.fail(
              new ProcessCheckpointRevisionConflict({
                instanceId: decoded.instanceId,
                expectedRevision: checkpoint.revision + 1,
                actualRevision: updatedCheckpoint.revision,
              }),
            )
          }
          yield* database.query(
            (db) =>
              db.insert(processOperatorControls).values({
                id: uuidv7(),
                tenantId: decoded.tenantId,
                instanceId: decoded.instanceId,
                action: decoded.action,
                idempotencyKey: decoded.idempotencyKey,
                actorPrincipalId,
                reason: decoded.reason,
              }),
            "process.studio.operator-control.record",
          )
          return toRuntimeInstance(updatedCheckpoint, row.createdAt, updatedAt)
        }),
        "process.studio.runtime.operator-control",
      )
      const outcome = yield* operation.pipe(Effect.result)
      if (Result.isSuccess(outcome)) return outcome.success
      if (
        outcome.failure instanceof DatabaseFailure &&
        isDatabaseConstraint(outcome.failure, "operator_controls_tenant_id_key")
      ) {
        const rows = yield* database.query(
          (db) =>
            db.select({
              instanceId: processOperatorControls.instanceId,
              action: processOperatorControls.action,
              actorPrincipalId: processOperatorControls.actorPrincipalId,
              idempotencyKey: processOperatorControls.idempotencyKey,
              reason: processOperatorControls.reason,
            }).from(processOperatorControls).where(and(
              eq(processOperatorControls.tenantId, decoded.tenantId),
              eq(processOperatorControls.idempotencyKey, decoded.idempotencyKey),
            )),
          "process.studio.operator-control.replay.lookup",
        )
        const existing = rows[0]
        if (
          existing !== undefined && sameOperatorControl(existing, {
            instanceId: decoded.instanceId,
            action: decoded.action,
            actorPrincipalId,
            idempotencyKey: decoded.idempotencyKey,
            reason: decoded.reason,
          })
        ) {
          const replay = yield* getRuntimeInstance({
            principal: decoded.principal,
            tenantId: decoded.tenantId,
            instanceId: decoded.instanceId,
          })
          return replay.instance
        }
        return yield* Effect.fail(
          new ProcessOperatorConflict({
            tenantId: decoded.tenantId,
            instanceId: decoded.instanceId,
            idempotencyKey: decoded.idempotencyKey,
          }),
        )
      }
      return yield* Effect.fail(outcome.failure)
    })

  return {
    listCatalog,
    validateDefinition,
    listRuntimeInstances,
    getRuntimeInstance,
    listWorkflowRuns,
    listOperatorInbox,
    listOperatorControls,
    operateRuntime,
  } satisfies ProcessStudioService
})

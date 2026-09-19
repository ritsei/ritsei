import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"

import type { ProcessCheckpoint, ProcessStepExecution } from "./runtime.ts"

const Uuid = Schema.String.check(Schema.isUUID())
const NonEmptyString = Schema.String.check(Schema.isPattern(/\S/))

export const ProcessOperatorAction = Schema.Literals([
  "retry",
  "compensate",
  "manual_recovery",
])
export const ProcessCompensationStatus = Schema.Literals([
  "not_started",
  "in_progress",
  "succeeded",
  "manual_recovery",
])

export const ProcessOperatorControlInput = Schema.Struct({
  tenantId: Uuid,
  instanceId: Uuid,
  action: ProcessOperatorAction,
  actorPrincipalId: NonEmptyString,
  idempotencyKey: NonEmptyString,
  reason: NonEmptyString,
})

export type ProcessOperatorControlInput = Schema.Schema.Type<typeof ProcessOperatorControlInput>

export class ProcessOperatorConflict extends Schema.TaggedError<ProcessOperatorConflict>()(
  "ProcessOperatorConflict",
  {
    tenantId: Uuid,
    instanceId: Uuid,
    idempotencyKey: NonEmptyString,
  },
) {}

export type ProcessOperatorSnapshot = {
  readonly instanceId: string
  readonly status: ProcessCheckpoint["status"]
  readonly currentNodeId: string
  readonly retryable: boolean
  readonly compensationStatus: Schema.Schema.Type<typeof ProcessCompensationStatus>
  readonly requiredAction: Schema.Schema.Type<typeof ProcessOperatorAction> | "none"
  readonly correlationId: string
}

export type ProcessOperatorService = {
  readonly inspect: (checkpoint: ProcessCheckpoint) => ProcessOperatorSnapshot
  readonly retry: (
    checkpoint: ProcessCheckpoint,
  ) => Effect.Effect<ProcessCheckpoint, ProcessOperatorActionUnavailable>
  readonly startCompensation: (
    checkpoint: ProcessCheckpoint,
  ) => Effect.Effect<ProcessCheckpoint, ProcessOperatorActionUnavailable>
  readonly requireManualRecovery: (
    checkpoint: ProcessCheckpoint,
  ) => Effect.Effect<ProcessCheckpoint, ProcessOperatorActionUnavailable>
}

export class ProcessOperatorActionUnavailable
  extends Schema.TaggedError<ProcessOperatorActionUnavailable>()(
    "ProcessOperatorActionUnavailable",
    {
      instanceId: Uuid,
      action: NonEmptyString,
    },
  ) {}

// manual recovery is required for unknown external outcomes and compensation failures.
// compensation is an explicit operator action, never an implicit database rollback.
const lastStep = (checkpoint: ProcessCheckpoint): ProcessStepExecution | undefined =>
  checkpoint.stepExecutions.at(-1)

const compensationStatus = (
  step: ProcessStepExecution | undefined,
): Schema.Schema.Type<typeof ProcessCompensationStatus> =>
  step?.status === "compensation_started"
    ? "in_progress"
    : step?.status === "compensation_succeeded"
    ? "succeeded"
    : step?.status === "manual_recovery_required"
    ? "manual_recovery"
    : "not_started"

const replaceLastStep = (
  checkpoint: ProcessCheckpoint,
  status: ProcessStepExecution["status"],
): ProcessCheckpoint => {
  const current = lastStep(checkpoint)
  if (current === undefined) return checkpoint
  return {
    ...checkpoint,
    revision: checkpoint.revision + 1,
    stepExecutions: [...checkpoint.stepExecutions.slice(0, -1), { ...current, status }],
  }
}

export const makeProcessOperatorService = (): ProcessOperatorService => ({
  inspect: (checkpoint) => {
    const step = lastStep(checkpoint)
    const retryable = step?.status === "retry_scheduled"
    const compensation = compensationStatus(step)
    return {
      instanceId: checkpoint.instanceId,
      status: checkpoint.status,
      currentNodeId: checkpoint.currentNodeId,
      retryable,
      compensationStatus: compensation,
      requiredAction: retryable
        ? "retry"
        : compensation === "not_started" && step?.status === "command_succeeded"
        ? "compensate"
        : checkpoint.failureKind === "unknown_external_outcome" ||
            checkpoint.failureKind === "compensation_failure" ||
            checkpoint.status === "manual_recovery"
        ? "manual_recovery"
        : "none",
      correlationId: checkpoint.correlationId,
    }
  },

  retry: (checkpoint) => {
    const step = lastStep(checkpoint)
    return step?.status === "retry_scheduled"
      ? Effect.succeed({ ...replaceLastStep(checkpoint, "command_requested"), status: "running" })
      : Effect.fail(
        new ProcessOperatorActionUnavailable({
          instanceId: checkpoint.instanceId,
          action: "retry",
        }),
      )
  },

  startCompensation: (checkpoint) => {
    const step = lastStep(checkpoint)
    return step?.status === "command_succeeded"
      ? Effect.succeed({
        ...replaceLastStep(checkpoint, "compensation_started"),
        status: "running",
      })
      : Effect.fail(
        new ProcessOperatorActionUnavailable({
          instanceId: checkpoint.instanceId,
          action: "compensate",
        }),
      )
  },

  requireManualRecovery: (checkpoint) => {
    const step = lastStep(checkpoint)
    return step === undefined
      ? Effect.fail(
        new ProcessOperatorActionUnavailable({
          instanceId: checkpoint.instanceId,
          action: "manual_recovery",
        }),
      )
      : Effect.succeed({
        ...replaceLastStep(checkpoint, "manual_recovery_required"),
        status: "manual_recovery",
      })
  },
})

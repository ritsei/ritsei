import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"

const NonNegativeInt = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 1_000_000 }))
const PositiveBoundedInt = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 1_000_000 }))

const WorkloadClass = Schema.Literals(["command", "query", "async"])
export type WorkloadClass = Schema.Schema.Type<typeof WorkloadClass>

const WorkloadCriticality = Schema.Literals(["protected", "degradable", "discardable"])
type WorkloadCriticality = Schema.Schema.Type<typeof WorkloadCriticality>

const WorkloadConsistency = Schema.Literals(["authoritative", "replica", "projection"])
type WorkloadConsistency = Schema.Schema.Type<typeof WorkloadConsistency>

const WorkloadAdmissionScope = Schema.Literals(["tenant", "principal", "route"])
type WorkloadAdmissionScope = Schema.Schema.Type<typeof WorkloadAdmissionScope>

export const WorkloadMetadata = Schema.Struct({
  workloadClass: WorkloadClass,
  criticality: WorkloadCriticality,
  consistency: WorkloadConsistency,
  estimatedCost: PositiveBoundedInt,
  deadlineMs: PositiveBoundedInt,
  maxInFlight: PositiveBoundedInt,
  maxQueueDepth: NonNegativeInt,
  maxStatementMs: PositiveBoundedInt,
  maxResultItems: PositiveBoundedInt,
  admissionScope: WorkloadAdmissionScope,
})
// The colocated entry profile keeps finite limits without claiming physical isolation.
export const EntryWorkloadLimits = {
  maxInFlight: 64,
  maxQueueDepth: 32,
  maxStatementMs: 5_000,
  maxResultItems: 1_000,
  commandReserve: 8,
} as const

const decodeWorkloadMetadata = (input: unknown) =>
  Schema.decodeUnknownEffect(WorkloadMetadata, { onExcessProperty: "error" })(input)

export const classifyWorkload = Effect.fn("Workload.classify")((input: unknown) =>
  decodeWorkloadMetadata(input)
)

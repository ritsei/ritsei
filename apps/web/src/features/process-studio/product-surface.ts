import {
  applyDesignerAction,
  type DesignerModel,
  makeInitialDesignerModel,
  serializeProcessIr,
  toProcessIr,
} from "./designer-model.ts"

export const ProcessStudioLanes = [
  "copilot_draft",
  "bounded_execution",
  "templates",
] as const
export type ProcessStudioLane = (typeof ProcessStudioLanes)[number]

export const ProcessStudioLaneLabels: Readonly<Record<ProcessStudioLane, string>> = {
  copilot_draft: "Copilot draft",
  bounded_execution: "Bounded execution",
  templates: "Starter drafts",
}

export const ProcessStudioLaneDescriptions: Readonly<Record<ProcessStudioLane, string>> = {
  copilot_draft: "Draft-only assistance; no provider execution.",
  bounded_execution: "Allowlisted actions with review and runtime gates.",
  templates: "Structural starter drafts; catalog authority is loaded from the backend.",
}

export const ProcessDraftSources = ["human", "copilot", "template"] as const
export type ProcessDraftSource = (typeof ProcessDraftSources)[number]

export type ProcessDraftMetadata = {
  readonly status: "DRAFT"
  readonly source: ProcessDraftSource
}

export type ProcessStudioDraft = {
  readonly lane: ProcessStudioLane
  readonly metadata: ProcessDraftMetadata
  readonly model: DesignerModel
}

export type ProcessStudioTemplate = {
  readonly id: string
  readonly version: number
  readonly name: string
  readonly description: string
  readonly model: DesignerModel
}

const templateModel = (
  definitionId: string,
  kind: "HumanTask" | "Decision" | "Timer",
  label: string,
): DesignerModel => {
  const initial = makeInitialDesignerModel()
  const withNode = applyDesignerAction(initial, { _tag: "add_node", kind })
  const node = withNode.nodes.find((candidate) => candidate.kind === kind)
  return node === undefined ? withNode : {
    ...withNode,
    definitionId,
    nodes: withNode.nodes.map((candidate) =>
      candidate.id === node.id ? { ...candidate, label } : candidate
    ),
  }
}

export const ProcessStudioTemplates: readonly ProcessStudioTemplate[] = [
  {
    id: "review-draft",
    version: 1,
    name: "Review draft",
    description: "A human review step ready for backend catalog binding.",
    model: templateModel("018f3f77-0c5a-7cc0-8b62-6a163d214124", "HumanTask", "Review draft"),
  },
  {
    id: "decision-draft",
    version: 1,
    name: "Decision draft",
    description: "A deterministic decision step with no embedded business authority.",
    model: templateModel("018f3f77-0c5a-7cc0-8b62-6a163d214125", "Decision", "Evaluate condition"),
  },
  {
    id: "timer-draft",
    version: 1,
    name: "Timer draft",
    description: "A bounded timer handoff for a governed process definition.",
    model: templateModel("018f3f77-0c5a-7cc0-8b62-6a163d214126", "Timer", "Wait for handoff"),
  },
]

export const getProcessStudioTemplate = (id: string): DesignerModel | undefined =>
  ProcessStudioTemplates.find((template) => template.id === id)?.model

export const makeProcessStudioDraft = (
  model: DesignerModel,
  lane: ProcessStudioLane = "copilot_draft",
  source: ProcessDraftSource = "human",
): ProcessStudioDraft => ({
  lane,
  metadata: { status: "DRAFT", source },
  model,
})

export const serializeProcessStudioDraft = (draft: ProcessStudioDraft): string =>
  serializeProcessIr(toProcessIr(draft.model))

// The process designer keeps only typed mapping and deterministic Process IR in the browser.
// Catalog authority and release validation remain on the backend.
export type ProcessNodeKind =
  | "Start"
  | "DomainCommand"
  | "HumanTask"
  | "Decision"
  | "WaitForEvent"
  | "Timer"
  | "ParallelBranch"
  | "End"
export type ProcessEnvironment = "DEV" | "TEST" | "PROD"
export type MappingType = "string" | "number" | "boolean" | "uuid"

export type CatalogReference = {
  readonly kind: "DomainAction" | "DomainEvent"
  readonly id: string
  readonly version: number
}

export type TypedMapping = {
  readonly sourcePath: string
  readonly targetPath: string
  readonly sourceType: MappingType
  readonly targetType: MappingType
}

export type DesignerNode = {
  readonly id: string
  readonly kind: ProcessNodeKind
  readonly label: string
  readonly capability?: CatalogReference
  readonly mappings: readonly TypedMapping[]
}

export type DesignerModel = {
  readonly definitionId: string
  readonly version: number
  readonly catalogVersion: number
  readonly environment: ProcessEnvironment
  readonly nodes: readonly DesignerNode[]
  readonly edges: readonly { readonly from: string; readonly to: string }[]
}

export type ProcessDesignIr = DesignerModel & {
  readonly formatVersion: 1
  readonly checksum: string
}

export type DesignerAction =
  | { readonly _tag: "add_node"; readonly kind: ProcessNodeKind }
  | { readonly _tag: "reorder_node"; readonly nodeId: string; readonly direction: "up" | "down" }
  | { readonly _tag: "move_node"; readonly sourceId: string; readonly targetId: string }
  | { readonly _tag: "set_label"; readonly nodeId: string; readonly label: string }
  | {
    readonly _tag: "set_capability"
    readonly nodeId: string
    readonly capability?: CatalogReference
  }
  | { readonly _tag: "add_mapping"; readonly nodeId: string; readonly mapping: TypedMapping }

export type DesignerValidationIssue = {
  readonly code:
    | "empty_graph"
    | "duplicate_node"
    | "dangling_edge"
    | "invalid_start"
    | "invalid_end"
    | "unreachable_node"
    | "missing_capability"
    | "invalid_capability"
    | "invalid_mapping"
  readonly nodeId?: string
  readonly message: string
}

const labels: Readonly<Record<ProcessNodeKind, string>> = {
  Start: "Start",
  DomainCommand: "Domain command",
  HumanTask: "Human task",
  Decision: "Decision",
  WaitForEvent: "Wait for event",
  Timer: "Timer",
  ParallelBranch: "Parallel branch",
  End: "End",
}

export const ProcessDesignerNodeKinds: readonly ProcessNodeKind[] = [
  "DomainCommand",
  "HumanTask",
  "Decision",
  "WaitForEvent",
  "Timer",
  "ParallelBranch",
]

export const labelForNodeKind = (kind: ProcessNodeKind): string => labels[kind]

export const makeInitialDesignerModel = (): DesignerModel => ({
  definitionId: "018f3f77-0c5a-7cc0-8b62-6a163d214123",
  version: 1,
  catalogVersion: 1,
  environment: "DEV",
  nodes: [
    { id: "start", kind: "Start", label: labels.Start, mappings: [] },
    { id: "end", kind: "End", label: labels.End, mappings: [] },
  ],
  edges: [{ from: "start", to: "end" }],
})

const nextId = (model: DesignerModel): string => {
  const numbers = model.nodes.map((node) => /^node-(\d+)$/.exec(node.id)?.[1]).filter(Boolean).map(
    Number,
  )
  return `node-${Math.max(0, ...numbers) + 1}`
}

const middle = (nodes: readonly DesignerNode[]): DesignerNode[] =>
  nodes.filter((node) => node.kind !== "Start" && node.kind !== "End")

const linear = (model: DesignerModel, nodes: readonly DesignerNode[]): DesignerModel => {
  const start = model.nodes.find((node) => node.kind === "Start")
  const end = model.nodes.find((node) => node.kind === "End")
  if (start === undefined || end === undefined) return model
  const ordered = [start, ...nodes, end]
  return {
    ...model,
    nodes: ordered,
    edges: ordered.slice(0, -1).map((node, index) => ({
      from: node.id,
      to: ordered[index + 1]!.id,
    })),
  }
}

export const addNode = (model: DesignerModel, kind: ProcessNodeKind): DesignerModel =>
  kind === "Start" || kind === "End" ? model : linear(model, [...middle(model.nodes), {
    id: nextId(model),
    kind,
    label: labels[kind],
    mappings: [],
  }])

export const reorderNode = (
  model: DesignerModel,
  nodeId: string,
  direction: "up" | "down",
): DesignerModel => {
  const nodes = middle(model.nodes)
  const index = nodes.findIndex((node) => node.id === nodeId)
  const target = direction === "up" ? index - 1 : index + 1
  if (index < 0 || target < 0 || target >= nodes.length) return model
  const [node] = nodes.splice(index, 1)
  nodes.splice(target, 0, node!)
  return linear(model, nodes)
}

const moveNodeTo = (
  model: DesignerModel,
  sourceId: string,
  targetId: string,
): DesignerModel => {
  const nodes = middle(model.nodes)
  const sourceIndex = nodes.findIndex((node) => node.id === sourceId)
  const targetIndex = nodes.findIndex((node) => node.id === targetId)
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return model
  const [source] = nodes.splice(sourceIndex, 1)
  const destination = sourceIndex < targetIndex ? targetIndex - 1 : targetIndex
  nodes.splice(destination, 0, source!)
  return linear(model, nodes)
}

export const setNodeLabel = (
  model: DesignerModel,
  nodeId: string,
  label: string,
): DesignerModel => ({
  ...model,
  nodes: model.nodes.map((node) => node.id === nodeId ? { ...node, label } : node),
})

export const setNodeCapability = (
  model: DesignerModel,
  nodeId: string,
  capability?: CatalogReference,
): DesignerModel => ({
  ...model,
  nodes: model.nodes.map((node) => node.id === nodeId ? { ...node, capability } : node),
})

export const addTypedMapping = (
  model: DesignerModel,
  nodeId: string,
  mapping: TypedMapping,
): DesignerModel => ({
  ...model,
  nodes: model.nodes.map((node) =>
    node.id === nodeId ? { ...node, mappings: [...node.mappings, mapping] } : node
  ),
})

export const applyDesignerAction = (
  model: DesignerModel,
  action: DesignerAction,
): DesignerModel => {
  switch (action._tag) {
    case "add_node":
      return addNode(model, action.kind)
    case "reorder_node":
      return reorderNode(model, action.nodeId, action.direction)
    case "move_node":
      return moveNodeTo(model, action.sourceId, action.targetId)
    case "set_label":
      return setNodeLabel(model, action.nodeId, action.label)
    case "set_capability":
      return setNodeCapability(model, action.nodeId, action.capability)
    case "add_mapping":
      return addTypedMapping(model, action.nodeId, action.mapping)
  }
}

const compare = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0
const canonical = (model: DesignerModel) => ({
  formatVersion: 1 as const,
  definitionId: model.definitionId,
  version: model.version,
  catalogVersion: model.catalogVersion,
  environment: model.environment,
  nodes: [...model.nodes].sort((a, b) => compare(a.id, b.id)),
  edges: [...model.edges].sort((a, b) => compare(`${a.from}:${a.to}`, `${b.from}:${b.to}`)),
})

const checksum = (value: string): string => {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, "0")
}

export const toProcessIr = (model: DesignerModel): ProcessDesignIr => {
  const payload = canonical(model)
  return { ...model, formatVersion: 1, checksum: checksum(JSON.stringify(payload)) }
}

export const serializeProcessIr = (ir: ProcessDesignIr): string =>
  JSON.stringify({ ...canonical(ir), checksum: ir.checksum })

const capabilityIssue = (node: DesignerNode): DesignerValidationIssue | undefined => {
  const expectedKind = node.kind === "DomainCommand"
    ? "DomainAction"
    : node.kind === "WaitForEvent"
    ? "DomainEvent"
    : undefined
  if (expectedKind === undefined) {
    return node.capability === undefined ? undefined : {
      code: "invalid_capability",
      nodeId: node.id,
      message: `${node.kind} nodes cannot reference a catalog capability.`,
    }
  }
  if (
    node.capability === undefined || !/\S/.test(node.capability.id) ||
    !Number.isSafeInteger(node.capability.version) || node.capability.version < 1
  ) {
    return {
      code: "missing_capability",
      nodeId: node.id,
      message: `${node.kind} nodes must reference an exact ${expectedKind} catalog capability.`,
    }
  }
  return node.capability.kind === expectedKind ? undefined : {
    code: "invalid_capability",
    nodeId: node.id,
    message: `${node.kind} nodes require ${expectedKind}, not ${node.capability.kind}.`,
  }
}

const mappingIssue = (
  node: DesignerNode,
  mapping: TypedMapping,
): DesignerValidationIssue | undefined =>
  !/\S/.test(mapping.sourcePath) || !/\S/.test(mapping.targetPath) ||
    mapping.sourceType !== mapping.targetType
    ? {
      code: "invalid_mapping",
      nodeId: node.id,
      message: "Typed mappings need non-empty paths and matching source and target types.",
    }
    : undefined

const nodeValidation = (nodes: readonly DesignerNode[]) => {
  const ids = new Set<string>()
  const issues: DesignerValidationIssue[] = []
  for (const node of nodes) {
    if (ids.has(node.id)) {
      issues.push({
        code: "duplicate_node",
        nodeId: node.id,
        message: `Node ID ${node.id} is duplicated.`,
      })
    }
    ids.add(node.id)
    const capabilityProblem = capabilityIssue(node)
    if (capabilityProblem !== undefined) issues.push(capabilityProblem)
    for (const mapping of node.mappings) {
      const issue = mappingIssue(node, mapping)
      if (issue !== undefined) issues.push(issue)
    }
  }
  return { ids, issues }
}

const edgeValidation = (model: DesignerModel, ids: ReadonlySet<string>) => {
  const incoming = new Map<string, number>()
  const outgoing = new Map<string, number>()
  const issues: DesignerValidationIssue[] = []
  for (const edge of model.edges) {
    if (!ids.has(edge.from) || !ids.has(edge.to)) {
      issues.push({
        code: "dangling_edge",
        message: `Edge ${edge.from} -> ${edge.to} references an unknown node.`,
      })
    } else {
      incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1)
      outgoing.set(edge.from, (outgoing.get(edge.from) ?? 0) + 1)
    }
  }
  return { incoming, outgoing, issues }
}

const reachabilityValidation = (
  model: DesignerModel,
  start: DesignerNode | undefined,
): readonly DesignerValidationIssue[] => {
  if (start === undefined) return []
  const reachable = new Set([start.id])
  const pending = [start.id]
  while (pending.length > 0) {
    const current = pending.shift()!
    for (const edge of model.edges) {
      if (edge.from === current && !reachable.has(edge.to)) {
        reachable.add(edge.to)
        pending.push(edge.to)
      }
    }
  }
  return model.nodes.flatMap((node) =>
    reachable.has(node.id) ? [] : [{
      code: "unreachable_node" as const,
      nodeId: node.id,
      message: `Node ${node.label} is not reachable from Start.`,
    }]
  )
}

export const validateDesignerModel = (model: DesignerModel): readonly DesignerValidationIssue[] => {
  if (model.nodes.length === 0) {
    return [{ code: "empty_graph", message: "Add a start and end node before validating." }]
  }
  const { ids, issues } = nodeValidation(model.nodes)
  const edges = edgeValidation(model, ids)
  issues.push(...edges.issues)
  const start = model.nodes.filter((node) => node.kind === "Start")
  const end = model.nodes.filter((node) => node.kind === "End")
  if (start.length !== 1 || edges.outgoing.get(start[0]?.id ?? "") !== 1) {
    issues.push({
      code: "invalid_start",
      message: "The graph needs one start node with one outgoing edge.",
    })
  }
  if (end.length !== 1 || edges.incoming.get(end[0]?.id ?? "") !== 1) {
    issues.push({
      code: "invalid_end",
      message: "The graph needs one end node with one incoming edge.",
    })
  }
  issues.push(...reachabilityValidation(model, start[0]))
  return issues
}

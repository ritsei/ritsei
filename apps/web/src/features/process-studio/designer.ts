/// <reference lib="dom" />

import { createEffect, createRoot, createSignal } from "solid-js"
import type { ProcessCatalogDescriptor } from "../../shared/contracts/generated/process.ts"
import {
  applyDesignerAction,
  type CatalogReference,
  type DesignerModel,
  type DesignerNode,
  labelForNodeKind,
  makeInitialDesignerModel,
  ProcessDesignerNodeKinds,
  type ProcessNodeKind,
  type TypedMapping,
  validateDesignerModel,
} from "./designer-model.ts"
import {
  getProcessStudioTemplate,
  makeProcessStudioDraft,
  type ProcessDraftSource,
  type ProcessStudioDraft,
  type ProcessStudioLane,
  ProcessStudioLaneDescriptions,
  ProcessStudioLaneLabels,
  ProcessStudioLanes,
  ProcessStudioTemplates,
  serializeProcessStudioDraft,
} from "./product-surface.ts"

const tag = <K extends keyof HTMLElementTagNameMap>(name: K): HTMLElementTagNameMap[K] =>
  document.createElement(name)
const text = (value: string): HTMLSpanElement => {
  const node = tag("span")
  node.textContent = value
  return node
}
const button = (value: string, action: () => void, className = ""): HTMLButtonElement => {
  const node = tag("button")
  node.type = "button"
  node.className = className
  node.textContent = value
  node.addEventListener("click", action)
  return node
}

const styleId = "ritsei-process-designer-style"
const ensureStyle = (): void => {
  if (document.getElementById(styleId) !== null) return
  const style = tag("style")
  style.id = styleId
  style.textContent = `
.ritsei-process-designer{background:#f4f0e6;color:#172033;font:15px/1.45 ui-sans-serif,system-ui,sans-serif;min-height:520px}
.ritsei-process-designer *{box-sizing:border-box}.ritsei-process-designer button,.ritsei-process-designer input,.ritsei-process-designer select{font:inherit}
.ritsei-process-designer button{background:#fffdf8;border:1px solid #c9c2b5;border-radius:8px;color:#172033;cursor:pointer;padding:8px 10px;text-align:left}
.ritsei-process-designer button:focus-visible,.ritsei-process-designer input:focus-visible,.ritsei-process-designer select:focus-visible{outline:3px solid #d8f34f;outline-offset:2px}
.ritsei-process-designer input,.ritsei-process-designer select{background:#fffdf8;border:1px solid #c9c2b5;border-radius:7px;padding:8px;width:100%}
.ritsei-process-designer header{align-items:end;background:#172033;color:#fffdf8;display:flex;justify-content:space-between;padding:24px 28px}.ritsei-process-designer h1,.ritsei-process-designer h2,.ritsei-process-designer p{margin:0}
.ritsei-process-designer h1{font-size:clamp(24px,4vw,38px);letter-spacing:-.04em}.ritsei-process-designer h2{font-size:12px;letter-spacing:.1em;text-transform:uppercase}
.ritsei-process-designer .eyebrow{color:#d8f34f;font-size:11px;font-weight:800;letter-spacing:.16em;text-transform:uppercase}.ritsei-process-designer .subtitle{color:#cad3df;margin-top:5px}
.ritsei-process-designer .badge{background:#d8f34f;border-radius:999px;color:#172033;font-size:11px;font-weight:800;padding:5px 9px}.ritsei-process-designer .grid{display:grid;grid-template-columns:190px minmax(280px,1fr) 300px;min-height:450px}
.ritsei-process-designer aside,.ritsei-process-designer main{padding:20px}.ritsei-process-designer aside{border-right:1px solid #d6cfc1}.ritsei-process-designer aside:last-child{border-left:1px solid #d6cfc1;border-right:0}.ritsei-process-designer .palette,.ritsei-process-designer .nodes,.ritsei-process-designer .inspector,.ritsei-process-designer .inspector-fields{display:grid;gap:9px}.ritsei-process-designer .palette{margin-top:14px}.ritsei-process-designer .palette button{border-left:4px solid #5b3cc4}
.ritsei-process-designer nav{background:#fffdf8;border-bottom:1px solid #d6cfc1;display:flex;flex-wrap:wrap;gap:8px;padding:12px 20px}.ritsei-process-designer nav button[aria-pressed="true"]{background:#172033;color:#fffdf8}.ritsei-process-designer .lane-status{color:#596273;font-size:13px;padding:0 20px 12px}.ritsei-process-designer .template-list{display:grid;gap:8px;margin:0 20px 16px}.ritsei-process-designer .template-option{background:#fffdf8;border:1px solid #d6cfc1;border-radius:8px;padding:10px}.ritsei-process-designer .template-option button{border-left:4px solid #d8f34f;width:100%}.ritsei-process-designer .template-option p{color:#596273;font-size:13px;margin:6px 4px 0}.ritsei-process-designer .toolbar{align-items:center;display:flex;gap:10px;justify-content:space-between;margin-bottom:16px}.ritsei-process-designer .toolbar p{color:#596273;font-size:13px}.ritsei-process-designer .validate{background:#5b3cc4;border-color:#5b3cc4;color:#fff;font-weight:700}.ritsei-process-designer .nodes{list-style:none;margin:0;padding:0}.ritsei-process-designer .node{background:#fffdf8;border:1px solid #c9c2b5;border-radius:10px;box-shadow:4px 4px 0 #ded6c8;padding:12px}.ritsei-process-designer .node.selected{border-color:#5b3cc4;box-shadow:4px 4px 0 #d8f34f}.ritsei-process-designer .node button{border:0;padding:0;width:100%}.ritsei-process-designer .meta,.ritsei-process-designer .capability,.ritsei-process-designer .catalog-description{display:block;font-size:12px;margin-top:5px}.ritsei-process-designer .meta{color:#697181}.ritsei-process-designer .capability{color:#5b3cc4;overflow-wrap:anywhere}.ritsei-process-designer .catalog-description{color:#596273}.ritsei-process-designer label{display:grid;font-size:12px;font-weight:700;gap:5px}.ritsei-process-designer .move{display:flex;gap:8px}.ritsei-process-designer .move button{flex:1;text-align:center}.ritsei-process-designer .mapping{border-top:1px solid #d6cfc1;font:11px ui-monospace,SFMono-Regular,monospace;padding-top:10px;overflow-wrap:anywhere}.ritsei-process-designer .validation{background:#fff6d7;border-left:4px solid #d58c13;color:#5b461c;margin-top:18px;padding:10px 12px}.ritsei-process-designer .valid{background:#eaf6d6;border-left-color:#4d8d45;color:#285124}.ritsei-process-designer .validation ul{margin:5px 0 0;padding-left:20px}
@media(max-width:900px){.ritsei-process-designer .grid{grid-template-columns:150px minmax(220px,1fr)}.ritsei-process-designer aside:last-child{border-top:1px solid #d6cfc1;grid-column:1/-1}}@media(max-width:620px){.ritsei-process-designer header{align-items:start;flex-direction:column;gap:14px}.ritsei-process-designer .grid{display:block}.ritsei-process-designer aside{border-bottom:1px solid #d6cfc1;border-right:0}}
@media(prefers-reduced-motion:reduce){.ritsei-process-designer *{scroll-behavior:auto!important;transition:none!important}}
`
  document.head.append(style)
}

type Handlers = {
  readonly add: (kind: ProcessNodeKind) => void
  readonly select: (id: string) => void
  readonly move: (id: string, direction: "up" | "down") => void
  readonly drop: (sourceId: string, targetId: string) => void
  readonly label: (id: string, value: string) => void
  readonly capability: (id: string, value?: CatalogReference) => void
  readonly mapping: (id: string, value: TypedMapping) => void
  readonly validate: () => void
  readonly lane: (lane: ProcessStudioLane) => void
  readonly template: (id: string) => void
}

type ProcessDesignerOptions = {
  readonly catalog?: readonly ProcessCatalogDescriptor[]
  readonly initialModel?: DesignerModel
  readonly onValidate?: (
    model: DesignerModel,
    issues: ReturnType<typeof validateDesignerModel>,
  ) => void
}

const enableDrag = (item: HTMLLIElement, node: DesignerNode, handlers: Handlers): void => {
  if (node.kind === "Start" || node.kind === "End") return
  item.draggable = true
  item.addEventListener("dragstart", (event) => event.dataTransfer?.setData("text/plain", node.id))
  item.addEventListener("dragover", (event) => event.preventDefault())
  item.addEventListener("drop", (event) => {
    event.preventDefault()
    const source = event.dataTransfer?.getData("text/plain")
    if (source) handlers.drop(source, node.id)
  })
}

const appendCapability = (
  card: HTMLDivElement,
  node: DesignerNode,
  catalog: readonly ProcessCatalogDescriptor[],
): void => {
  if (node.capability === undefined) return
  const ref = text(
    `${node.capability.kind}: ${node.capability.id || "unassigned"} v${node.capability.version}`,
  )
  ref.className = "capability"
  card.append(ref)
  const found = catalog.find((entry) =>
    entry.kind === node.capability?.kind &&
    entry.id === node.capability.id && entry.version === node.capability.version
  )
  if (found !== undefined) {
    const description = text(found.title)
    description.className = "catalog-description"
    card.append(description)
  }
}

const nodeView = (
  node: DesignerNode,
  selected: boolean,
  handlers: Handlers,
  catalog: readonly ProcessCatalogDescriptor[],
): HTMLLIElement => {
  const item = tag("li")
  enableDrag(item, node, handlers)
  const card = tag("div")
  card.className = `node${selected ? " selected" : ""}`
  const select = button(node.label, () => handlers.select(node.id))
  select.setAttribute("aria-pressed", String(selected))
  select.setAttribute("aria-label", `Select ${node.label}`)
  card.append(select)
  const meta = text(`${node.kind} · ${node.id}`)
  meta.className = "meta"
  card.append(meta)
  appendCapability(card, node, catalog)
  item.append(card)
  return item
}

const catalogKind = (node: DesignerNode): CatalogReference["kind"] =>
  node.kind === "WaitForEvent" ? "DomainEvent" : "DomainAction"

const catalogKindLabel = (kind: CatalogReference["kind"]): string =>
  kind === "DomainEvent" ? "event" : "action"

const appendMappings = (fields: HTMLElement, node: DesignerNode): void => {
  for (const mapping of node.mappings) {
    const row = text(
      `${mapping.sourcePath} (${mapping.sourceType}) → ${mapping.targetPath} (${mapping.targetType})`,
    )
    row.className = "mapping"
    fields.append(row)
  }
}

const catalogEditor = (
  node: DesignerNode,
  catalog: readonly ProcessCatalogDescriptor[],
  handlers: Handlers,
): HTMLElement => {
  const fields = tag("div")
  fields.className = "inspector-fields"
  const capabilityKind = catalogKind(node)
  const selected = node.capability === undefined
    ? ""
    : `${node.capability.kind}:${node.capability.id}:${node.capability.version}`
  const catalogLabel = tag("label")
  catalogLabel.append(text(`Backend catalog ${catalogKindLabel(capabilityKind)}`))
  const catalogSelect = tag("select")
  catalogSelect.setAttribute("aria-label", `Backend catalog ${catalogKindLabel(capabilityKind)}`)
  const placeholder = tag("option")
  placeholder.value = ""
  placeholder.textContent = "Select an active catalog entry"
  catalogSelect.append(placeholder)
  catalog.filter((entry) => entry.kind === capabilityKind).forEach((entry) => {
    const option = tag("option")
    option.value = `${entry.kind}:${entry.id}:${entry.version}`
    option.textContent = `${entry.title} · ${entry.id} v${entry.version}`
    option.selected = option.value === selected
    catalogSelect.append(option)
  })
  catalogSelect.value = selected
  catalogSelect.addEventListener("change", () => {
    const [kind, id, version] = catalogSelect.value.split(":")
    if (
      kind !== "DomainAction" && kind !== "DomainEvent" || id === undefined || version === undefined
    ) {
      handlers.capability(node.id, undefined)
      return
    }
    handlers.capability(node.id, { kind, id, version: Number(version) })
  })
  catalogLabel.append(catalogSelect)
  fields.append(catalogLabel)
  appendMappings(fields, node)
  fields.append(
    button("Add typed mapping", () =>
      handlers.mapping(node.id, {
        sourcePath: "input.value",
        targetPath: "command.value",
        sourceType: "string",
        targetType: "string",
      })),
  )
  return fields
}

const inspector = (
  node: DesignerNode | undefined,
  catalog: readonly ProcessCatalogDescriptor[],
  handlers: Handlers,
): HTMLElement => {
  const panel = tag("aside")
  panel.setAttribute("aria-label", "Inspector")
  const heading = tag("h2")
  heading.textContent = "Inspector"
  panel.append(heading)
  if (node === undefined) {
    panel.append(text("Select a node to edit the structured definition."))
    return panel
  }
  const form = tag("form")
  form.className = "inspector"
  const name = tag("label")
  name.append(text("Node label"))
  const nameInput = tag("input")
  nameInput.value = node.label
  nameInput.addEventListener("change", () => handlers.label(node.id, nameInput.value))
  name.append(nameInput)
  form.append(name)
  form.append(text(`Kind: ${node.kind}`))
  if (node.kind === "DomainCommand" || node.kind === "WaitForEvent") {
    form.append(catalogEditor(node, catalog, handlers))
  }
  const move = tag("div")
  move.className = "move"
  move.append(
    button("Move up", () => handlers.move(node.id, "up")),
    button("Move down", () => handlers.move(node.id, "down")),
  )
  form.append(move)
  panel.append(form)
  return panel
}

const laneStatus = (lane: ProcessStudioLane): string =>
  lane === "bounded_execution"
    ? `${ProcessStudioLaneDescriptions[lane]} Commands are never executed in the designer.`
    : ProcessStudioLaneDescriptions[lane]

const laneNavigation = (draft: ProcessStudioDraft, handlers: Handlers): HTMLElement => {
  const lanes = tag("nav")
  lanes.setAttribute("aria-label", "Process Studio lanes")
  for (const lane of ProcessStudioLanes) {
    const laneButton = button(ProcessStudioLaneLabels[lane], () => handlers.lane(lane))
    laneButton.setAttribute("aria-pressed", String(draft.lane === lane))
    lanes.append(laneButton)
  }
  return lanes
}

const templateList = (handlers: Handlers): HTMLElement => {
  const templates = tag("div")
  templates.className = "template-list"
  for (const template of ProcessStudioTemplates) {
    const option = tag("div")
    option.className = "template-option"
    const load = button(
      `Load ${template.name} · v${template.version}`,
      () => handlers.template(template.id),
    )
    load.setAttribute(
      "aria-label",
      `Load ${template.name} version ${template.version}: ${template.description}`,
    )
    option.append(load)
    const description = text(template.description)
    option.append(description)
    templates.append(option)
  }
  return templates
}

const nodePalette = (handlers: Handlers): HTMLElement => {
  const palette = tag("aside")
  const heading = tag("h2")
  heading.textContent = "Node palette"
  palette.append(heading)
  const buttons = tag("div")
  buttons.className = "palette"
  for (const kind of ProcessDesignerNodeKinds) {
    buttons.append(button(`＋ ${labelForNodeKind(kind)}`, () => handlers.add(kind)))
  }
  palette.append(buttons)
  return palette
}

const nodeList = (
  model: DesignerModel,
  selected: string,
  handlers: Handlers,
  catalog: readonly ProcessCatalogDescriptor[],
): HTMLOListElement => {
  const nodes = tag("ol")
  nodes.className = "nodes"
  model.nodes.forEach((node, index) => {
    nodes.append(nodeView(node, node.id === selected, handlers, catalog))
    if (index < model.nodes.length - 1) {
      const arrow = tag("li")
      arrow.className = "arrow"
      arrow.setAttribute("aria-hidden", "true")
      arrow.textContent = "↓"
      nodes.append(arrow)
    }
  })
  return nodes
}

const validationPanel = (
  issues: readonly ReturnType<typeof validateDesignerModel>[number][],
): HTMLElement => {
  const validation = tag("div")
  validation.className = "validation"
  validation.setAttribute("aria-live", "polite")
  if (issues.length === 0) {
    validation.classList.add("valid")
    validation.textContent =
      "Draft is structurally valid. Backend catalog validation is still required."
  } else {
    validation.append(text(`${issues.length} validation issue${issues.length === 1 ? "" : "s"}`))
    const list = tag("ul")
    for (const issue of issues) {
      const item = tag("li")
      item.textContent = issue.message
      list.append(item)
    }
    validation.append(list)
  }
  return validation
}

const view = (
  draft: ProcessStudioDraft,
  selected: string,
  issues: readonly ReturnType<typeof validateDesignerModel>[number][],
  catalog: readonly ProcessCatalogDescriptor[],
  handlers: Handlers,
): HTMLElement => {
  const { model } = draft
  const shell = tag("div")
  shell.className = "ritsei-process-designer"
  const header = tag("header")
  const title = tag("div")
  const eyebrow = text("Process Studio / Design time")
  eyebrow.className = "eyebrow"
  title.append(eyebrow)
  const heading = tag("h1")
  heading.textContent = "Governed draft"
  title.append(heading)
  const subtitle = text("Compose typed process structure without executing business semantics.")
  subtitle.className = "subtitle"
  title.append(subtitle)
  const badge = text(`${model.environment} · v${model.version}`)
  badge.className = "badge"
  header.append(title, badge)
  shell.append(header)
  shell.append(laneNavigation(draft, handlers))
  const status = text(laneStatus(draft.lane))
  status.className = "lane-status"
  status.setAttribute("role", "status")
  status.setAttribute("aria-live", "polite")
  shell.append(status)
  if (draft.lane === "templates") shell.append(templateList(handlers))
  const grid = tag("div")
  grid.className = "grid"
  grid.append(nodePalette(handlers))
  const canvas = tag("section")
  canvas.setAttribute("aria-label", "Definition canvas")
  const toolbar = tag("div")
  toolbar.className = "toolbar"
  toolbar.append(
    text("Drag to reorder. Catalog choices come from the authenticated backend."),
    button("Validate draft", handlers.validate, "validate"),
  )
  canvas.append(toolbar)
  canvas.append(nodeList(model, selected, handlers, catalog), validationPanel(issues))
  grid.append(
    canvas,
    inspector(model.nodes.find((node) => node.id === selected), catalog, handlers),
  )
  shell.append(grid)
  return shell
}

export type ProcessDesignerMount = {
  readonly dispose: () => void
  readonly setCatalog: (catalog: readonly ProcessCatalogDescriptor[]) => void
  readonly readIr: () => string
  readonly readDraft: () => ProcessStudioDraft
}

export const mountProcessDesigner = (
  root: HTMLElement,
  options: DesignerModel | ProcessDesignerOptions = {},
): ProcessDesignerMount => {
  ensureStyle()
  const normalized: ProcessDesignerOptions = "nodes" in options
    ? { initialModel: options }
    : options
  const initialModel = normalized.initialModel ?? makeInitialDesignerModel()
  const catalog = normalized.catalog ?? []
  let currentDraft = makeProcessStudioDraft(initialModel)
  let currentIr = serializeProcessStudioDraft(currentDraft)
  let updateCatalog: (nextCatalog: readonly ProcessCatalogDescriptor[]) => void = () => {}
  const dispose = createRoot((rootDispose) => {
    const [model, setModel] = createSignal(initialModel)
    const [lane, setLane] = createSignal<ProcessStudioLane>(currentDraft.lane)
    const [source, setSource] = createSignal(currentDraft.metadata.source)
    const [selected, setSelected] = createSignal(initialModel.nodes[0]?.id ?? "")
    const [issues, setIssues] = createSignal(validateDesignerModel(initialModel))
    const [catalogState, setCatalogState] = createSignal(catalog)
    updateCatalog = setCatalogState
    const update = (
      next: DesignerModel,
      nextLane: ProcessStudioLane = lane(),
      nextSource: ProcessDraftSource = source(),
    ) => {
      const nextIssues = validateDesignerModel(next)
      setModel(next)
      setIssues(nextIssues)
      currentDraft = {
        ...currentDraft,
        model: next,
        lane: nextLane,
        metadata: { status: "DRAFT", source: nextSource },
      }
      currentIr = serializeProcessStudioDraft(currentDraft)
    }
    const handlers: Handlers = {
      add: (kind) => {
        const next = applyDesignerAction(model(), { _tag: "add_node", kind })
        update(next)
        setSelected(next.nodes.at(-2)?.id ?? "")
      },
      select: setSelected,
      move: (id, direction) =>
        update(applyDesignerAction(model(), { _tag: "reorder_node", nodeId: id, direction })),
      drop: (sourceId, targetId) =>
        update(applyDesignerAction(model(), { _tag: "move_node", sourceId, targetId })),
      label: (id, value) =>
        update(applyDesignerAction(model(), { _tag: "set_label", nodeId: id, label: value })),
      capability: (id, value) =>
        update(
          applyDesignerAction(model(), { _tag: "set_capability", nodeId: id, capability: value }),
        ),
      mapping: (id, value) =>
        update(applyDesignerAction(model(), { _tag: "add_mapping", nodeId: id, mapping: value })),
      validate: () => {
        const nextIssues = validateDesignerModel(model())
        setIssues(nextIssues)
        normalized.onValidate?.(model(), nextIssues)
      },
      lane: (next) => {
        setLane(next)
        currentDraft = { ...currentDraft, lane: next }
      },
      template: (id) => {
        const next = getProcessStudioTemplate(id)
        if (next === undefined) return
        setLane("templates")
        setSource("template")
        update(next, "templates", "template")
        setSelected(next.nodes[0]?.id ?? "")
      },
    }
    createEffect(
      () => ({
        draft: {
          model: model(),
          lane: lane(),
          metadata: { status: "DRAFT" as const, source: source() },
        },
        selected: selected(),
        issues: issues(),
        catalog: catalogState(),
      }),
      (current) =>
        root.replaceChildren(
          view(current.draft, current.selected, current.issues, current.catalog, handlers),
        ),
    )
    return rootDispose
  })
  return {
    dispose: () => {
      dispose()
      root.replaceChildren()
    },
    setCatalog: (nextCatalog) => updateCatalog(nextCatalog),
    readIr: () => currentIr,
    readDraft: () => currentDraft,
  }
}

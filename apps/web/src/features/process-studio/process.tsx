import type { JSX } from "@solidjs/web"
import { createEffect, createSignal, For, onSettled, Show, useContext } from "solid-js"
import type {
  OperateRuntimeInput,
  ProcessCatalogDescriptor,
  ProcessJobInboxItem,
  ProcessOperatorControl,
  ProcessRuntimeInstance,
  ProcessStaticValidation,
  ProcessWorkflowRun,
} from "../../shared/contracts/generated/process.ts"
import { failureMessage } from "../../shared/api.ts"
import { CommandFeedback, QueryBoundary } from "../../shared/request-feedback.tsx"
import { ApiRuntime, type ApiScope } from "../../shared/runtime.ts"
import { layout } from "../../ui/foundations/layout.ts"
import { DataTable } from "../../ui/patterns/data-table.tsx"
import { EntityWorkspace } from "../../ui/patterns/entity-workspace.tsx"
import { Badge } from "../../ui/primitives/badge.tsx"
import { Button } from "../../ui/primitives/button.tsx"
import { createDialogOpenChange, Dialog } from "../../ui/primitives/dialog.tsx"
import { Form } from "../../ui/primitives/form.tsx"
import { FormField } from "../../ui/primitives/form-field.tsx"
import { Input } from "../../ui/primitives/input.tsx"
import { Tabs } from "../../ui/primitives/tabs.tsx"
import { surface } from "../../ui/recipes/surface.ts"
import { mountProcessDesigner, type ProcessDesignerMount } from "./designer.ts"
import { type DesignerModel, validateDesignerModel } from "./designer-model.ts"
import {
  createProcessCatalogQuery,
  createProcessControlsQuery,
  createProcessInboxQuery,
  createProcessOperatorMutation,
  createProcessRuntimeQuery,
  createProcessValidationMutation,
  createProcessWorkflowRunsQuery,
} from "./queries.ts"

const styles = {
  grid: layout.contentGrid,
  tableWrap: layout.tableWrap,
  table: layout.table,
  cell: layout.tableCell,
  muted: layout.muted,
  code: layout.code,
  actionRow: layout.actionRow,
  designerHost: layout.designerHost,
}

const statusTone = (status: string): "neutral" | "success" | "warning" | "danger" | "info" =>
  ({
    completed: "success",
    succeeded: "success",
    failed: "danger",
    manual_recovery: "danger",
    running: "info",
    leased: "info",
  } as const)[status] ?? "warning"

const actionLabel = (action: OperateRuntimeInput["action"]): string =>
  action === "manual_recovery"
    ? "Mark manual recovery"
    : action === "compensate"
    ? "Start compensation"
    : "Retry runtime"

const formatTime = (value: string): string => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

function CatalogTable(props: { entries: readonly ProcessCatalogDescriptor[] }) {
  return (
    <DataTable
      surface={false}
      class={styles.tableWrap}
      tableClass={styles.table}
      cellClass={styles.cell}
      captionClass="sr-only"
      caption="Active backend Process catalog"
      rows={props.entries}
      columns={[
        {
          id: "entry",
          header: "Entry",
          cell: (entry) => (
            <>
              <strong>{entry.title}</strong>
              <div class={styles.code}>{entry.kind} · {entry.id} · v{entry.version}</div>
              <div class={styles.muted}>{entry.description}</div>
            </>
          ),
        },
        { id: "owner", header: "Owner", cell: (entry) => entry.owningDomain },
        {
          id: "governance",
          header: "Governance",
          cell: (entry) => (
            <>
              <Badge tone={entry.stability === "PUBLIC" ? "success" : "warning"}>
                {entry.stability}
              </Badge>
              <div>
                Catalog {entry.compatibilityRange.minimumVersion}–{entry.compatibilityRange
                  .maximumVersion}
              </div>
            </>
          ),
        },
        {
          id: "runtime",
          header: "Runtime contract",
          cell: (entry) =>
            entry.kind === "DomainAction"
              ? (
                <>
                  {entry.requiredCapability}
                  <div>{entry.transactionSemantics} · {entry.idempotency}</div>
                </>
              )
              : (
                <>
                  {entry.aggregateType}
                  <div>{entry.deliveryExpectation}</div>
                </>
              ),
        },
      ]}
    />
  )
}

function RuntimeTable(props: { instances: readonly ProcessRuntimeInstance[] }) {
  return (
    <DataTable
      surface={false}
      class={styles.tableWrap}
      tableClass={styles.table}
      cellClass={styles.cell}
      captionClass="sr-only"
      caption="Process runtime instances"
      rows={props.instances}
      columns={[
        {
          id: "instance",
          header: "Instance",
          cell: (instance) => (
            <>
              <div class={styles.code}>{instance.instanceId}</div>
              <div class={styles.muted}>
                {instance.environment} · revision {instance.revision}
              </div>
            </>
          ),
        },
        {
          id: "state",
          header: "State",
          cell: (instance) => (
            <>
              <Badge tone={statusTone(instance.status)}>{instance.status}</Badge>
              <Show when={instance.requiredAction !== "none"}>
                <div>{actionLabel(instance.requiredAction as OperateRuntimeInput["action"])}</div>
              </Show>
            </>
          ),
        },
        {
          id: "definition",
          header: "Definition",
          cell: (instance) => (
            <>
              <div class={styles.code}>{instance.processDefinitionId}</div>
              <div>
                Definition v{instance.processDefinitionVersion} · catalog v{instance.catalogVersion}
              </div>
            </>
          ),
        },
        {
          id: "progress",
          header: "Progress",
          cell: (instance) => (
            <>
              {instance.completedStepCount}/{instance.stepCount} steps
              <div>
                {instance.consumedEventCount} events · {instance.scheduledTimerCount} timers
              </div>
            </>
          ),
        },
        { id: "updated", header: "Updated", cell: (instance) => formatTime(instance.updatedAt) },
      ]}
    />
  )
}

function WorkflowTable(props: { runs: readonly ProcessWorkflowRun[] }) {
  return (
    <DataTable
      surface={false}
      class={styles.tableWrap}
      tableClass={styles.table}
      cellClass={styles.cell}
      captionClass="sr-only"
      caption="Process workflow history"
      rows={props.runs}
      columns={[
        {
          id: "workflow",
          header: "Workflow",
          cell: (run) => (
            <>
              <strong>{run.workflowType}</strong>
              <div class={styles.code}>{run.idempotencyKey}</div>
            </>
          ),
        },
        {
          id: "aggregate",
          header: "Aggregate",
          cell: (run) => <span class={styles.code}>{run.aggregateId}</span>,
        },
        {
          id: "state",
          header: "State",
          cell: (run) => (
            <>
              <Badge tone={statusTone(run.status)}>{run.status}</Badge>
              <Show when={run.recoveryReason}>
                <div>{run.recoveryReason}</div>
              </Show>
            </>
          ),
        },
        { id: "updated", header: "Updated", cell: (run) => formatTime(run.updatedAt) },
      ]}
    />
  )
}

function JobTable(props: { jobs: readonly ProcessJobInboxItem[] }) {
  return (
    <DataTable
      surface={false}
      class={styles.tableWrap}
      tableClass={styles.table}
      cellClass={styles.cell}
      captionClass="sr-only"
      caption="Process operator jobs"
      rows={props.jobs}
      columns={[
        {
          id: "job",
          header: "Job",
          cell: (job) => (
            <>
              <strong>{job.jobType}</strong>
              <div class={styles.code}>{job.idempotencyKey}</div>
            </>
          ),
        },
        {
          id: "state",
          header: "State",
          cell: (job) => <Badge tone={statusTone(job.status)}>{job.status}</Badge>,
        },
        { id: "schedule", header: "Schedule", cell: (job) => formatTime(job.scheduledAt) },
        { id: "attempts", header: "Attempts", cell: (job) => job.attempts },
      ]}
    />
  )
}

function OperatorControlTable(props: { controls: readonly ProcessOperatorControl[] }) {
  return (
    <DataTable
      surface={false}
      class={styles.tableWrap}
      tableClass={styles.table}
      cellClass={styles.cell}
      captionClass="sr-only"
      caption="Process operator control history"
      rows={props.controls}
      columns={[
        { id: "when", header: "When", cell: (control) => formatTime(control.createdAt) },
        {
          id: "action",
          header: "Action",
          cell: (control) => <Badge tone="warning">{control.action}</Badge>,
        },
        {
          id: "instance",
          header: "Instance",
          cell: (control) => <span class={styles.code}>{control.instanceId}</span>,
        },
        {
          id: "actor",
          header: "Actor and reason",
          cell: (control) => (
            <>
              <div class={styles.code}>{control.actorPrincipalId}</div>
              <div>{control.reason}</div>
              <div class={styles.muted}>Idempotency: {control.idempotencyKey}</div>
            </>
          ),
        },
      ]}
    />
  )
}

// Fallow: this dialog intentionally combines action selection, required operator context, and recovery.
// fallow-ignore-next-line complexity
function RuntimeActionDialog(props: {
  instance: ProcessRuntimeInstance
  scope: ApiScope
  reload: () => Promise<unknown>
}) {
  const [open, setOpen] = createSignal(false)
  const [invalid, setInvalid] = createSignal(false)
  const mutation = createProcessOperatorMutation(props.scope, () => {
    setOpen(false)
    void props.reload()
  })
  const action = () =>
    props.instance.requiredAction === "none" ? "manual_recovery" : props.instance.requiredAction

  return (
    <Dialog
      open={open()}
      onOpenChange={createDialogOpenChange(mutation, setOpen, setInvalid)}
      trigger={<span>{actionLabel(action())}</span>}
      triggerVariant={action() === "manual_recovery" ? "danger" : "secondary"}
      title={actionLabel(action())}
      description="This command changes the durable runtime checkpoint. It is authorized and recorded by the backend; no optimistic state is applied in the browser."
    >
      <Form
        class={layout.stack}
        onSubmit={
          // Fallow: this form intentionally keeps operator-control validation at the UI boundary.
          // fallow-ignore-next-line complexity
          (value) => {
            if (mutation.isPending || mutation.error?.kind === "unknown-outcome") return
            const idempotencyKey = typeof value.idempotencyKey === "string"
              ? value.idempotencyKey.trim()
              : ""
            const reason = typeof value.reason === "string" ? value.reason.trim() : ""
            if (!/\S/.test(idempotencyKey) || !/\S/.test(reason)) {
              setInvalid(true)
              return
            }
            setInvalid(false)
            mutation.mutate({
              instanceId: props.instance.instanceId,
              input: { action: action(), idempotencyKey, reason },
            })
          }
        }
      >
        <FormField
          label="Idempotency key"
          required
          helperText="Use a stable key if the command outcome is uncertain."
          error={invalid() ? "Enter an idempotency key and a reason." : undefined}
        >
          {(fieldProps) => (
            <Input {...fieldProps} name="idempotencyKey" autocomplete="off" required />
          )}
        </FormField>
        <FormField label="Reason" required>
          {(fieldProps) => <Input {...fieldProps} name="reason" autocomplete="off" required />}
        </FormField>
        <CommandFeedback
          error={mutation.error}
          pending={mutation.isPending}
          success={mutation.isSuccess}
          successMessage="Runtime control recorded."
          area="Process Studio"
          reload={props.reload}
          reset={() =>
            mutation.reset()}
        />
        <Button
          type="submit"
          variant={action() === "manual_recovery" ? "danger" : "primary"}
          loading={mutation.isPending}
          disabled={mutation.error?.kind === "unknown-outcome"}
        >
          Confirm {actionLabel(action()).toLowerCase()}
        </Button>
      </Form>
    </Dialog>
  )
}

function DesignPanel(props: {
  catalog: ReturnType<typeof createProcessCatalogQuery>
  validation: ReturnType<typeof createProcessValidationMutation>
}) {
  let designer: ProcessDesignerMount | undefined
  const [mountedDesigner, setMountedDesigner] = createSignal<ProcessDesignerMount>()
  const [feedback, setFeedback] = createSignal("")
  const mountDesigner = (host: HTMLDivElement) => {
    if (designer !== undefined) return
    const next = mountProcessDesigner(host, {
      catalog: [],
      onValidate: (model: DesignerModel, issues: ReturnType<typeof validateDesignerModel>) => {
        if (issues.length > 0) {
          setFeedback(
            `Fix ${issues.length} structural issue${
              issues.length === 1 ? "" : "s"
            } before backend validation.`,
          )
          return
        }
        const references = model.nodes.flatMap((node) =>
          node.capability === undefined ? [] : [node.capability]
        )
        setFeedback("Checking the draft against the active backend catalog…")
        props.validation.mutate({
          definitionId: model.definitionId,
          definitionVersion: model.version,
          catalogVersion: model.catalogVersion,
          references,
        })
      },
    })
    designer = next
    setMountedDesigner(next)
  }
  createEffect(
    () => ({ designer: mountedDesigner(), catalog: props.catalog.data ?? [] }),
    ({ designer: next, catalog }) => {
      next?.setCatalog(catalog)
    },
  )
  onSettled(() => () => designer?.dispose())
  return (
    <div class={layout.stack}>
      <section class={[surface(), layout.stack]} aria-labelledby="process-catalog-heading">
        <div class={layout.row}>
          <div class={layout.stack}>
            <h2 id="process-catalog-heading">Active typed catalog</h2>
            <p>
              Actions and events are discovered from the authenticated backend registry. The browser
              cannot release or authorize a definition.
            </p>
          </div>
          <Badge tone="info">{(props.catalog.data ?? []).length} entries</Badge>
        </div>
        <QueryBoundary variant="retry" label="catalog" retry={() => props.catalog.refetch()}>
          <Show
            when={(props.catalog.data ?? []).length > 0}
            fallback={<p role="status">No public catalog entries are available for this tenant.</p>}
          >
            <CatalogTable entries={props.catalog.data ?? []} />
          </Show>
        </QueryBoundary>
      </section>
      <section class={[surface(), layout.stack]} aria-labelledby="process-designer-heading">
        <div class={layout.row}>
          <div class={layout.stack}>
            <h2 id="process-designer-heading">Definition draft</h2>
            <p>
              Structural editing is local; exact catalog references and release policy are
              backend-owned.
            </p>
          </div>
          <Show when={props.validation.isPending}>
            <Badge tone="info">Validating…</Badge>
          </Show>
        </div>
        <div
          ref={mountDesigner}
          class={styles.designerHost}
          aria-label="Process definition designer"
        />
        <Show when={feedback()}>
          <p role="status">{feedback()}</p>
        </Show>
        <Show when={props.validation.error} keyed>
          {(error) => <p role="alert">Backend validation failed: {failureMessage(error)}</p>}
        </Show>
        <Show when={props.validation.data} keyed>
          {(validation: ProcessStaticValidation) => (
            <p role="status">
              Backend catalog validation passed for definition v{validation.definitionVersion}.
            </p>
          )}
        </Show>
      </section>
    </div>
  )
}

function EmptyState(props: { children: JSX.Element }) {
  return <p role="status">{props.children}</p>
}

// Fallow: the Process Studio workspace intentionally composes catalog, validation, runtime, and operator views.
// fallow-ignore-next-line complexity
export function ProcessStudio() {
  const scope = useContext(ApiRuntime)
  const catalog = createProcessCatalogQuery(scope, { limit: 200 })
  const runtime = createProcessRuntimeQuery(scope, { limit: 200 })
  const workflowRuns = createProcessWorkflowRunsQuery(scope, { limit: 200 })
  const inbox = createProcessInboxQuery(scope, { limit: 200 })
  const controls = createProcessControlsQuery(scope, { limit: 200 })
  const validation = createProcessValidationMutation(scope)
  const reload = () =>
    Promise.all([
      catalog.refetch(),
      runtime.refetch(),
      workflowRuns.refetch(),
      inbox.refetch(),
      controls.refetch(),
    ])

  const design = <DesignPanel catalog={catalog} validation={validation} />
  const monitor = (
    <div class={layout.stack}>
      <section class={[surface(), layout.stack]} aria-labelledby="process-runtime-heading">
        <div class={layout.row}>
          <div class={layout.stack}>
            <h2 id="process-runtime-heading">Runtime monitor</h2>
            <p>
              Durable checkpoints are PostgreSQL-backed and summarized without exposing runtime
              payloads.
            </p>
          </div>
          <Badge tone="info">{(runtime.data ?? []).length} instances</Badge>
        </div>
        <QueryBoundary variant="retry" label="runtime instances" retry={() => runtime.refetch()}>
          <Show
            when={(runtime.data ?? []).length > 0}
            fallback={<EmptyState>No runtime instances are visible for this tenant.</EmptyState>}
          >
            <RuntimeTable instances={runtime.data ?? []} />
          </Show>
        </QueryBoundary>
      </section>
      <section class={[surface(), layout.stack]} aria-labelledby="process-workflow-heading">
        <h2 id="process-workflow-heading">Lifecycle workflow history</h2>
        <QueryBoundary
          variant="retry"
          label="workflow history"
          retry={() => workflowRuns.refetch()}
        >
          <Show
            when={(workflowRuns.data ?? []).length > 0}
            fallback={
              <EmptyState>No lifecycle workflow runs are visible for this tenant.</EmptyState>
            }
          >
            <WorkflowTable runs={workflowRuns.data ?? []} />
          </Show>
        </QueryBoundary>
      </section>
    </div>
  )
  const inboxView = (
    <div class={layout.stack}>
      <section class={[surface(), layout.stack]} aria-labelledby="process-inbox-heading">
        <div class={layout.row}>
          <div class={layout.stack}>
            <h2 id="process-inbox-heading">Operator inbox</h2>
            <p>
              Only backend-derived retry, compensation, and manual-recovery actions are offered.
            </p>
          </div>
          <Badge tone="warning">Action required</Badge>
        </div>
        <QueryBoundary variant="retry" label="operator inbox" retry={() => inbox.refetch()}>
          <Show
            when={(inbox.data?.runtimeInstances.length ?? 0) > 0}
            fallback={<EmptyState>No runtime recovery actions are waiting.</EmptyState>}
          >
            <div class={styles.grid}>
              <For each={inbox.data?.runtimeInstances ?? []}>
                {(instance) => (
                  <article class={[surface(), layout.stack]}>
                    <div class={layout.row}>
                      <div class={layout.stack}>
                        <h3>{instance.processDefinitionId}</h3>
                        <span class={styles.code}>{instance.instanceId}</span>
                      </div>
                      <Badge tone="danger">{instance.requiredAction}</Badge>
                    </div>
                    <p>{instance.failureKind ?? "runtime intervention requested"}</p>
                    <RuntimeActionDialog instance={instance} scope={scope} reload={reload} />
                  </article>
                )}
              </For>
            </div>
          </Show>
          <Show when={(inbox.data?.jobs.length ?? 0) > 0}>
            <h3>Committed jobs</h3>
            <JobTable jobs={inbox.data?.jobs ?? []} />
          </Show>
        </QueryBoundary>
      </section>
    </div>
  )
  const history = (
    <section class={[surface(), layout.stack]} aria-labelledby="process-history-heading">
      <div class={layout.row}>
        <div class={layout.stack}>
          <h2 id="process-history-heading">Operator history</h2>
          <p>Durable control records show who acted, why, and which idempotency key was used.</p>
        </div>
        <Badge tone="info">{(controls.data ?? []).length} records</Badge>
      </div>
      <QueryBoundary
        variant="retry"
        label="operator history"
        retry={() =>
          controls.refetch()}
      >
        <Show
          when={(controls.data ?? []).length > 0}
          fallback={<EmptyState>No operator controls have been recorded.</EmptyState>}
        >
          <OperatorControlTable controls={controls.data ?? []} />
        </Show>
      </QueryBoundary>
    </section>
  )

  return (
    <EntityWorkspace
      title="Process Studio"
      description={
        <p>
          Discover released typed catalogs, design governed drafts, monitor durable runtime state,
          and recover only through authorized backend commands.
        </p>
      }
      headerActions={
        <div class={styles.actionRow}>
          <Button type="button" onClick={() => void reload()}>Refresh Process Studio</Button>
        </div>
      }
      aside={
        <div class={layout.stack}>
          <strong>Authority boundary</strong>
          <span class={styles.muted}>
            The browser never grants capabilities, executes providers, releases definitions, or
            becomes the source of workflow truth.
          </span>
        </div>
      }
    >
      <Tabs
        defaultValue="design"
        items={[
          { value: "design", label: "Design", content: design },
          { value: "monitor", label: "Monitor", content: monitor },
          { value: "inbox", label: "Inbox", content: inboxView },
          { value: "history", label: "History", content: history },
        ]}
      />
    </EntityWorkspace>
  )
}

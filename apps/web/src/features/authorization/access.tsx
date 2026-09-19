import { useNavigate } from "@solidjs/router"
import { createMemo, createSignal, Show, untrack, useContext } from "solid-js"
import type {
  Capability,
  CapabilityDefinition,
  DirectCapabilityGrant,
  TenantMembership,
  TenantMembershipStatus,
} from "../../shared/contracts/generated/authorization.ts"
import { failureMessage, type RequestFailure } from "../../shared/api.ts"
import { QueryBoundary } from "../../shared/request-feedback.tsx"
import { ApiRuntime } from "../../shared/runtime.ts"
import { layout } from "../../ui/foundations/layout.ts"
import { DataTable } from "../../ui/patterns/data-table.tsx"
import { EntityWorkspace } from "../../ui/patterns/entity-workspace.tsx"
import { Badge } from "../../ui/primitives/badge.tsx"
import { Button } from "../../ui/primitives/button.tsx"
import { createDialogOpenChange, Dialog } from "../../ui/primitives/dialog.tsx"
import { Form, type FormValue } from "../../ui/primitives/form.tsx"
import { FormField } from "../../ui/primitives/form-field.tsx"
import { Input } from "../../ui/primitives/input.tsx"
import { Select } from "../../ui/primitives/select.tsx"
import { surface } from "../../ui/recipes/surface.ts"
import {
  createActivateTenantMembershipMutation,
  createAddTenantMembershipMutation,
  createCapabilityDefinitionsQuery,
  createDirectCapabilityGrantsQuery,
  createGrantCapabilityMutation,
  createRemoveTenantMembershipMutation,
  createSuspendTenantMembershipMutation,
  createTenantMembershipQuery,
  createTenantMembershipsQuery,
} from "./queries.ts"

const statusOptions = [
  { value: "active", label: "Active" },
  { value: "suspended", label: "Suspended" },
] as const
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const requiredText = (value: FormValue[string]): string | null =>
  typeof value === "string" && /\S/.test(value) ? value.trim() : null

const capabilityLabel = (definition: CapabilityDefinition): string =>
  `${definition.owner} · ${definition.resource.replaceAll("_", " ")} · ${
    definition.verb.replaceAll("_", " ")
  }`

function MutationFeedback(props: {
  error?: RequestFailure | null
  pending: boolean
  success: boolean
  successMessage: string
}) {
  return (
    <>
      <Show when={props.error} keyed>
        {(error) => <p role="alert">{failureMessage(error)}</p>}
      </Show>
      <p role="status">
        {props.pending ? "Saving access change…" : props.success ? props.successMessage : ""}
      </p>
    </>
  )
}

function MembershipFilters(props: { search?: string; status?: TenantMembershipStatus }) {
  const navigate = useNavigate()
  return (
    <Form
      class={layout.row}
      aria-label="Filter tenant memberships"
      onSubmit={
        // Fallow: this filter form intentionally validates and serializes optional access fields together.
        // fallow-ignore-next-line complexity
        (value) => {
          const query = new URLSearchParams()
          const search = requiredText(value.search)
          const status = value.status
          if (search !== null) query.set("search", search)
          if (status === "active" || status === "suspended") query.set("status", status)
          navigate(query.size === 0 ? "/access" : `/access?${query}`)
        }
      }
    >
      <FormField label="Search" helperText="Account ID contains">
        {(fieldProps) => (
          <Input
            {...fieldProps}
            name="search"
            type="search"
            value={props.search ?? ""}
            autocomplete="off"
          />
        )}
      </FormField>
      <FormField label="Status">
        {(fieldProps) => (
          <Select
            {...fieldProps}
            name="status"
            options={statusOptions}
            placeholder="All statuses"
            value={props.status ?? ""}
          />
        )}
      </FormField>
      <Button variant="primary" type="submit">Apply filters</Button>
      <a href="/access">Clear filters</a>
    </Form>
  )
}

function MembershipTable(props: {
  memberships: readonly TenantMembership[]
  selectedUserAccountId?: string
}) {
  return (
    <DataTable
      surface={false}
      caption="Tenant memberships · first 200 matching records"
      rows={props.memberships}
      getRowClass={(membership) =>
        membership.userAccountId === props.selectedUserAccountId
          ? layout.tableRowSelected
          : undefined}
      columns={[
        {
          id: "userAccountId",
          header: "User account",
          cell: (membership) => (
            <a
              class={layout.code}
              href={`/access/${encodeURIComponent(membership.userAccountId)}`}
            >
              {membership.userAccountId}
            </a>
          ),
        },
        {
          id: "status",
          header: "Status",
          cell: (membership) => (
            <Badge tone={membership.status === "active" ? "success" : "warning"}>
              {membership.status === "active" ? "Active" : "Suspended"}
            </Badge>
          ),
        },
        { id: "scope", header: "Scope", cell: () => "Tenant" },
        {
          id: "action",
          header: "Action",
          cell: (membership) => (
            <a
              href={`/access/${encodeURIComponent(membership.userAccountId)}`}
              aria-label={`Open access for account ${membership.userAccountId}`}
            >
              Open
            </a>
          ),
        },
      ]}
    />
  )
}

// Fallow: this dialog intentionally combines scoped membership validation and command feedback.
// fallow-ignore-next-line complexity
function AddMembershipDialog(props: { reload: () => Promise<unknown> }) {
  const scope = useContext(ApiRuntime)
  const navigate = useNavigate()
  const [open, setOpen] = createSignal(false)
  const [invalid, setInvalid] = createSignal(false)
  const mutation = createAddTenantMembershipMutation(scope, (membership) => {
    setOpen(false)
    navigate(`/access/${encodeURIComponent(membership.userAccountId)}`)
  })
  let accountInput: HTMLInputElement | undefined
  return (
    <Dialog
      open={open()}
      onOpenChange={createDialogOpenChange(mutation, setOpen, setInvalid)}
      trigger={<span>Add membership</span>}
      triggerVariant="primary"
      title="Add tenant membership"
      description="Link an existing global user account to the connected tenant. This creates no capability grant."
    >
      <Form
        class={layout.stack}
        onSubmit={
          // Fallow: this form intentionally keeps membership validation at the authorization boundary.
          // fallow-ignore-next-line complexity
          (value) => {
            if (mutation.isPending || mutation.error?.kind === "unknown-outcome") return
            const userAccountId = requiredText(value.userAccountId)
            if (userAccountId === null || !uuidPattern.test(userAccountId)) {
              setInvalid(true)
              accountInput?.focus()
              return
            }
            setInvalid(false)
            mutation.mutate({ userAccountId })
          }
        }
      >
        <FormField
          label="User account ID"
          required
          helperText="Create the global account in User accounts first, then use its UUID here."
          error={invalid() || mutation.error?.kind === "validation"
            ? "Enter a valid user-account UUID."
            : undefined}
        >
          {(fieldProps) => (
            <Input
              {...fieldProps}
              ref={(element) => accountInput = element}
              name="userAccountId"
              autocomplete="off"
              spellcheck={false}
              required
              disabled={mutation.isPending}
            />
          )}
        </FormField>
        <MutationFeedback
          error={mutation.error}
          pending={mutation.isPending}
          success={mutation.isSuccess}
          successMessage="Membership added."
        />
        <Show when={mutation.error?.kind === "unknown-outcome"}>
          <Button
            type="button"
            onClick={() => {
              void props.reload().then(() => {
                mutation.reset()
                setOpen(false)
              })
            }}
          >
            Reload memberships before retrying
          </Button>
        </Show>
        <Button
          variant="primary"
          type="submit"
          loading={mutation.isPending}
          disabled={mutation.error?.kind === "unknown-outcome"}
        >
          Add membership
        </Button>
      </Form>
    </Dialog>
  )
}

// Fallow: this dialog intentionally combines impact review and guarded membership commands.
// fallow-ignore-next-line complexity
function ImpactDialog(props: {
  trigger: string
  title: string
  description: string
  acknowledgement: string
  confirmLabel: string
  danger?: boolean
  pending: boolean
  success: boolean
  error?: RequestFailure | null
  onConfirm: () => void
  reload: () => Promise<unknown>
  reset: () => void
}) {
  const [open, setOpen] = createSignal(false)
  const [acknowledged, setAcknowledged] = createSignal(false)
  return (
    <Dialog
      open={open()}
      onOpenChange={createDialogOpenChange(
        { isPending: props.pending, reset: props.reset },
        setOpen,
        undefined,
        () => setAcknowledged(false),
      )}
      trigger={<span>{props.trigger}</span>}
      triggerVariant={props.danger ? "danger" : "secondary"}
      title={props.title}
      description={props.description}
    >
      <div class={layout.stack}>
        <label class={layout.row}>
          <input
            type="checkbox"
            checked={acknowledged()}
            disabled={props.pending}
            onChange={(event) => setAcknowledged(event.currentTarget.checked)}
          />
          <span>{props.acknowledgement}</span>
        </label>
        <MutationFeedback
          error={props.error}
          pending={props.pending}
          success={props.success}
          successMessage="Access updated."
        />
        <Show when={props.error?.kind === "unknown-outcome"}>
          <Button
            type="button"
            onClick={() => {
              void props.reload().then(() => {
                props.reset()
                setOpen(false)
              })
            }}
          >
            Reload access before retrying
          </Button>
        </Show>
        <Button
          variant={props.danger ? "danger" : "primary"}
          type="button"
          loading={props.pending}
          disabled={!acknowledged() || props.error?.kind === "unknown-outcome"}
          onClick={props.onConfirm}
        >
          {props.confirmLabel}
        </Button>
      </div>
    </Dialog>
  )
}

function MembershipLifecycle(props: {
  membership: TenantMembership
  reloadDetail: () => Promise<unknown>
  reloadAfterRemoval: () => Promise<unknown>
}) {
  const scope = useContext(ApiRuntime)
  const navigate = useNavigate()
  const suspend = createSuspendTenantMembershipMutation(scope)
  const activate = createActivateTenantMembershipMutation(scope)
  const remove = createRemoveTenantMembershipMutation(scope, () => navigate("/access"))
  return (
    <section class={[surface(), layout.stack]} aria-labelledby="membership-commands-heading">
      <h3 id="membership-commands-heading">Membership commands</h3>
      <p>
        The server checks the specific membership capability in the connected tenant before every
        change.
      </p>
      <div class={layout.row}>
        <Show
          when={props.membership.status === "active"}
          fallback={
            <ImpactDialog
              trigger="Activate membership"
              title="Activate tenant membership"
              description={`Restore tenant participation for ${props.membership.userAccountId}.`}
              acknowledgement="I understand that all existing direct grants become usable again at the membership gate."
              confirmLabel="Activate membership"
              pending={activate.isPending}
              success={activate.isSuccess}
              error={activate.error}
              reset={() => activate.reset()}
              reload={props.reloadDetail}
              onConfirm={() => activate.mutate({ userAccountId: props.membership.userAccountId })}
            />
          }
        >
          <ImpactDialog
            trigger="Suspend membership"
            title="Suspend tenant membership"
            description={`Stop tenant access for ${props.membership.userAccountId} until an administrator activates it again.`}
            acknowledgement="I understand this blocks every direct grant in this tenant but does not disable the global account or other tenant memberships."
            confirmLabel="Suspend membership"
            pending={suspend.isPending}
            success={suspend.isSuccess}
            error={suspend.error}
            reset={() => suspend.reset()}
            reload={props.reloadDetail}
            onConfirm={() => suspend.mutate({ userAccountId: props.membership.userAccountId })}
          />
        </Show>
        <ImpactDialog
          trigger="Remove membership"
          title="Remove tenant membership"
          description={`Remove ${props.membership.userAccountId} from tenant ${props.membership.tenantId}.`}
          acknowledgement="I understand this permanently removes every capability grant in this tenant. The global account and memberships in other tenants remain unchanged."
          confirmLabel="Remove membership"
          danger
          pending={remove.isPending}
          success={remove.isSuccess}
          error={remove.error}
          reset={() => remove.reset()}
          reload={props.reloadAfterRemoval}
          onConfirm={() => remove.mutate({ userAccountId: props.membership.userAccountId })}
        />
      </div>
    </section>
  )
}

function CapabilityGrantTable(props: {
  grants: readonly DirectCapabilityGrant[]
  definitions: readonly CapabilityDefinition[]
  membershipStatus: TenantMembershipStatus
}) {
  const definitions = createMemo(() => new Map(props.definitions.map((item) => [item.id, item])))
  return (
    <Show
      when={props.grants.length > 0}
      fallback={<p>No direct capability grants are assigned.</p>}
    >
      <DataTable
        surface={false}
        caption="Direct tenant grants"
        rows={props.grants}
        columns={[
          {
            id: "capability",
            header: "Capability",
            cell: (grant) => <span class={layout.code}>{grant.capability}</span>,
          },
          {
            id: "action",
            header: "Business action",
            cell: (grant) => {
              const definition = definitions().get(grant.capability)
              return definition ? capabilityLabel(definition) : "Catalog unavailable"
            },
          },
          { id: "scope", header: "Scope", cell: () => "Tenant-wide" },
          {
            id: "membership",
            header: "Membership gate",
            cell: () => (
              <Badge tone={props.membershipStatus === "active" ? "success" : "warning"}>
                {props.membershipStatus === "active" ? "Available" : "Blocked"}
              </Badge>
            ),
          },
        ]}
      />
    </Show>
  )
}

// Fallow: this dialog intentionally combines capability selection and guarded authorization commands.
// fallow-ignore-next-line complexity
function GrantCapabilityDialog(props: {
  membership: TenantMembership
  grants: readonly DirectCapabilityGrant[]
  definitions: readonly CapabilityDefinition[]
  reload: () => Promise<unknown>
}) {
  const scope = useContext(ApiRuntime)
  const [open, setOpen] = createSignal(false)
  const [capability, setCapability] = createSignal<Capability | "">("")
  const [acknowledged, setAcknowledged] = createSignal(false)
  const mutation = createGrantCapabilityMutation(scope, () => setOpen(false))
  const granted = createMemo(() => new Set(props.grants.map((grant) => grant.capability)))
  const publicDefinitions = createMemo(() =>
    props.definitions.filter((definition) => definition.stability === "PUBLIC")
  )
  const selected = createMemo(() =>
    publicDefinitions().find((definition) => definition.id === capability())
  )
  const options = createMemo(() =>
    publicDefinitions().map((definition) => ({
      value: definition.id,
      label: `${capabilityLabel(definition)}${
        granted().has(definition.id) ? " · already granted" : ""
      }`,
      disabled: granted().has(definition.id),
    }))
  )
  return (
    <Dialog
      open={open()}
      onOpenChange={createDialogOpenChange(
        mutation,
        setOpen,
        undefined,
        () => {
          setCapability("")
          setAcknowledged(false)
        },
      )}
      trigger={<span>Grant capability</span>}
      triggerVariant="primary"
      title="Grant tenant capability"
      description="Assign one direct tenant-wide business capability. This does not bypass object, domain-policy, or Separation-of-Duties checks."
    >
      <div class={layout.stack}>
        <FormField label="Capability" required>
          {(fieldProps) => (
            <Select
              {...fieldProps}
              options={options()}
              placeholder="Choose capability"
              value={capability()}
              disabled={mutation.isPending}
              onChange={(event) => setCapability(event.currentTarget.value as Capability | "")}
            />
          )}
        </FormField>
        <Show when={selected()} keyed>
          {(definition) => (
            <dl class={layout.detailList}>
              <div class={layout.detailItem}>
                <dt class={layout.detailTerm}>Capability ID</dt>
                <dd class={[layout.detailValue, layout.code]}>{definition.id}</dd>
              </div>
              <div class={layout.detailItem}>
                <dt class={layout.detailTerm}>Declared scope</dt>
                <dd class={layout.detailValue}>{definition.scope.join(", ")}</dd>
              </div>
              <div class={layout.detailItem}>
                <dt class={layout.detailTerm}>Contract</dt>
                <dd class={layout.detailValue}>
                  Version {definition.version} · {definition.stability}
                </dd>
              </div>
            </dl>
          )}
        </Show>
        <label class={layout.row}>
          <input
            type="checkbox"
            checked={acknowledged()}
            disabled={mutation.isPending}
            onChange={(event) => setAcknowledged(event.currentTarget.checked)}
          />
          <span>
            I understand this grants the selected action across the connected tenant and the active
            public API cannot revoke an individual grant.
          </span>
        </label>
        <MutationFeedback
          error={mutation.error}
          pending={mutation.isPending}
          success={mutation.isSuccess}
          successMessage="Capability granted."
        />
        <Show when={mutation.error?.kind === "unknown-outcome"}>
          <Button
            type="button"
            onClick={() => {
              void props.reload().then(() => {
                mutation.reset()
                setOpen(false)
              })
            }}
          >
            Reload permissions before retrying
          </Button>
        </Show>
        <Button
          variant="primary"
          type="button"
          loading={mutation.isPending}
          disabled={capability() === "" || !acknowledged() ||
            mutation.error?.kind === "unknown-outcome"}
          onClick={() => {
            const selectedCapability = capability()
            if (selectedCapability === "") return
            mutation.mutate({
              userAccountId: props.membership.userAccountId,
              capability: selectedCapability,
            })
          }}
        >
          Grant capability
        </Button>
      </div>
    </Dialog>
  )
}

function MembershipDetail(props: {
  userAccountId: string
  reloadMemberships: () => Promise<unknown>
}) {
  const scope = useContext(ApiRuntime)
  const id = untrack(() => props.userAccountId)
  const membership = createTenantMembershipQuery(scope, id)
  const grants = createDirectCapabilityGrantsQuery(scope, id)
  const definitions = createCapabilityDefinitionsQuery(scope)
  const reloadDetail = () => Promise.all([membership.refetch(), grants.refetch()])
  const reloadAfterRemoval = () => props.reloadMemberships().then(() => undefined)
  return (
    <section class={layout.stack} aria-labelledby="access-detail-heading">
      <div class={layout.row}>
        <h2 id="access-detail-heading">Access detail</h2>
        <Button type="button" onClick={() => void reloadDetail()}>Reload access</Button>
      </div>
      <QueryBoundary label="membership" retry={() => membership.refetch()}>
        <Show when={membership.data} keyed>
          {(member) => (
            <div class={layout.stack}>
              <dl class={layout.detailList}>
                <div class={layout.detailItem}>
                  <dt class={layout.detailTerm}>User account</dt>
                  <dd class={[layout.detailValue, layout.code]}>
                    <a href={`/user-accounts/${encodeURIComponent(member.userAccountId)}`}>
                      {member.userAccountId}
                    </a>
                  </dd>
                </div>
                <div class={layout.detailItem}>
                  <dt class={layout.detailTerm}>Membership</dt>
                  <dd class={layout.detailValue}>
                    <Badge tone={member.status === "active" ? "success" : "warning"}>
                      {member.status === "active" ? "Active" : "Suspended"}
                    </Badge>
                  </dd>
                </div>
                <div class={layout.detailItem}>
                  <dt class={layout.detailTerm}>Tenant scope</dt>
                  <dd class={[layout.detailValue, layout.code]}>{member.tenantId}</dd>
                </div>
                <div class={layout.detailItem}>
                  <dt class={layout.detailTerm}>Grant model</dt>
                  <dd class={layout.detailValue}>Direct tenant grants</dd>
                </div>
              </dl>

              <MembershipLifecycle
                membership={member}
                reloadDetail={reloadDetail}
                reloadAfterRemoval={reloadAfterRemoval}
              />

              <section class={layout.stack} aria-labelledby="permission-summary-heading">
                <div class={layout.row}>
                  <h3 id="permission-summary-heading">Permission summary</h3>
                  <Button
                    type="button"
                    onClick={() => void Promise.all([grants.refetch(), definitions.refetch()])}
                  >
                    Reload permissions
                  </Button>
                </div>
                <QueryBoundary
                  label="permissions"
                  retry={() => Promise.all([grants.refetch(), definitions.refetch()])}
                >
                  <CapabilityGrantTable
                    grants={grants.data}
                    definitions={definitions.data}
                    membershipStatus={member.status}
                  />
                  <Show
                    when={member.status === "active"}
                    fallback={<p>Activate this membership before granting another capability.</p>}
                  >
                    <GrantCapabilityDialog
                      membership={member}
                      grants={grants.data}
                      definitions={definitions.data}
                      reload={() => Promise.all([grants.refetch(), membership.refetch()])}
                    />
                  </Show>
                </QueryBoundary>
              </section>

              <section class={[surface(), layout.stack]} aria-labelledby="authorization-ceiling">
                <h3 id="authorization-ceiling">Current authorization ceiling</h3>
                <p>
                  A direct grant is only a coarse tenant capability. Owning domains still check
                  current object relationships, business policy, lifecycle, and active SoD rules.
                </p>
                <p class={layout.muted}>
                  Roles, narrower legal-entity, branch, warehouse, or record scopes, an effective
                  permission matrix, individual grant revocation, policy explanations, immutable
                  decision evidence, and provider-specific access are not exposed by the active
                  public contract.
                </p>
              </section>
            </div>
          )}
        </Show>
      </QueryBoundary>
    </section>
  )
}

export function Access(props: {
  selectedUserAccountId?: string
  search?: string
  status?: TenantMembershipStatus
}) {
  const scope = useContext(ApiRuntime)
  const selectedUserAccountId = untrack(() => props.selectedUserAccountId)
  const search = untrack(() => props.search)
  const status = untrack(() => props.status)
  const query = createTenantMembershipsQuery(scope, {
    ...(search === undefined ? {} : { search }),
    ...(status === undefined ? {} : { status }),
    limit: 200,
  })
  return (
    <EntityWorkspace
      title="Access"
      description={
        <p>
          Tenant membership lifecycle and direct capability grants. The connected tenant remains the
          authorization scope for every read and command.
        </p>
      }
      headerActions={
        <div class={layout.row}>
          <AddMembershipDialog reload={() => query.refetch()} />
          <Button type="button" onClick={() => void query.refetch()}>Reload memberships</Button>
        </div>
      }
      toolbar={<MembershipFilters search={search} status={status} />}
      aside={selectedUserAccountId
        ? (
          <MembershipDetail
            userAccountId={selectedUserAccountId}
            reloadMemberships={() => query.refetch()}
          />
        )
        : undefined}
    >
      <QueryBoundary label="memberships" retry={() => query.refetch()}>
        <Show
          when={query.data.length > 0}
          fallback={<p role="status">No tenant memberships match this search or status.</p>}
        >
          <MembershipTable
            memberships={query.data}
            selectedUserAccountId={selectedUserAccountId}
          />
        </Show>
      </QueryBoundary>
    </EntityWorkspace>
  )
}

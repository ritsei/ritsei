import { useNavigate } from "@solidjs/router"
import type { RequestFailure } from "../../shared/api.ts"
import { createSignal, For, Show, untrack, useContext } from "solid-js"
import type {
  ListPartiesInput,
  PartyDetail as PartyDetailValue,
  PartyDirectoryEntry,
  PartyKind,
  PartyRole,
} from "../../shared/contracts/generated/party.ts"
import { CommandFeedback, QueryBoundary } from "../../shared/request-feedback.tsx"
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
  assignPartyRoleMutation,
  attachPartyIdentifierMutation,
  createBranchMutation,
  createLegalEntityMutation,
  createPartiesQuery,
  createPartyDetailQuery,
  createPartyMutation,
  createPartyRelationshipMutation,
  createPartyRepresentationMutation,
  createRelatedPartyPathsQuery,
  setPartyRepresentationActiveMutation,
} from "./queries.ts"

const kindOptions = [
  { value: "person", label: "Person" },
  { value: "organization", label: "Organization" },
] as const
const roleOptions = [
  { value: "customer", label: "Customer" },
  { value: "supplier", label: "Supplier" },
  { value: "employee", label: "Employee" },
  { value: "partner", label: "Partner" },
] as const

const requiredText = (value: FormValue[string]): string | null =>
  typeof value === "string" && /\S/.test(value) ? value.trim() : null

const optionalText = (value: FormValue[string]): string | undefined => {
  const text = requiredText(value)
  return text === null ? undefined : text
}

const labelForKind = (kind: PartyKind): string => kind === "person" ? "Person" : "Organization"
const labelForRole = (role: PartyRole): string => role.charAt(0).toUpperCase() + role.slice(1)

type PartyDirectoryAccessor = () => readonly PartyDirectoryEntry[]

function PartyCommandSubmit(props: {
  error: RequestFailure | null | undefined
  pending: boolean
  success: boolean
  successMessage: string
  reload: () => Promise<unknown>
  reset: () => void
  label: string
}) {
  return (
    <>
      <CommandFeedback
        error={props.error}
        pending={props.pending}
        success={props.success}
        successMessage={props.successMessage}
        area="Party"
        reload={props.reload}
        reset={props.reset}
      />
      <Button
        variant="primary"
        type="submit"
        loading={props.pending}
        disabled={props.error?.kind === "unknown-outcome"}
      >
        {props.label}
      </Button>
    </>
  )
}

// Fallow: this dialog intentionally combines party input validation and command feedback.
// fallow-ignore-next-line complexity
function CreatePartyDialog(props: { reload: () => Promise<unknown> }) {
  const scope = useContext(ApiRuntime)
  const navigate = useNavigate()
  const [open, setOpen] = createSignal(false)
  const [invalid, setInvalid] = createSignal(false)
  const mutation = createPartyMutation(scope, (party) => {
    setOpen(false)
    navigate(`/parties/${encodeURIComponent(party.id)}`)
  })
  let nameInput: HTMLInputElement | undefined
  return (
    <Dialog
      open={open()}
      onOpenChange={createDialogOpenChange(mutation, setOpen, setInvalid)}
      trigger={<span>Create Party</span>}
      triggerVariant="primary"
      title="Create Party"
      description="Create a tenant-scoped person or organization master record. Business roles and legal context are assigned separately."
    >
      <Form
        class={layout.stack}
        onSubmit={
          // Fallow: this form intentionally keeps Party identity validation at the UI boundary.
          // fallow-ignore-next-line complexity
          (value) => {
            if (mutation.isPending || mutation.error?.kind === "unknown-outcome") return
            const name = requiredText(value.name)
            const kind = value.kind
            if (name === null || (kind !== "person" && kind !== "organization")) {
              setInvalid(true)
              nameInput?.focus()
              return
            }
            setInvalid(false)
            mutation.mutate({ name, kind })
          }
        }
      >
        <FormField
          label="Kind"
          required
          error={invalid() ? "Choose person or organization." : undefined}
        >
          {(fieldProps) => (
            <Select
              {...fieldProps}
              name="kind"
              options={kindOptions}
              placeholder="Choose kind"
              required
              disabled={mutation.isPending}
            />
          )}
        </FormField>
        <FormField
          label="Name"
          required
          helperText="Use the name by which operators identify this Party."
          error={invalid() || mutation.error?.kind === "validation"
            ? "Enter a nonblank name."
            : undefined}
        >
          {(fieldProps) => (
            <Input
              {...fieldProps}
              ref={(element) => nameInput = element}
              name="name"
              autocomplete="off"
              required
              disabled={mutation.isPending}
            />
          )}
        </FormField>
        <PartyCommandSubmit
          error={mutation.error}
          pending={mutation.isPending}
          success={mutation.isSuccess}
          successMessage="Party created."
          reload={props.reload}
          reset={() => mutation.reset()}
          label="Create Party"
        />
      </Form>
    </Dialog>
  )
}

function PartyFilters(props: { search?: string; kind?: PartyKind }) {
  const navigate = useNavigate()
  return (
    <Form
      class={layout.row}
      aria-label="Filter Parties"
      onSubmit={
        // Fallow: this filter form intentionally validates and serializes optional Party fields together.
        // fallow-ignore-next-line complexity
        (value) => {
          const query = new URLSearchParams()
          const search = optionalText(value.search)
          const kind = value.kind
          if (search !== undefined) query.set("search", search)
          if (kind === "person" || kind === "organization") query.set("kind", kind)
          navigate(query.size === 0 ? "/parties" : `/parties?${query}`)
        }
      }
    >
      <FormField label="Search" helperText="Name contains">
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
      <FormField label="Kind">
        {(fieldProps) => (
          <Select
            {...fieldProps}
            name="kind"
            options={kindOptions}
            placeholder="All kinds"
            value={props.kind ?? ""}
          />
        )}
      </FormField>
      <Button variant="primary" type="submit">Apply filters</Button>
      <a href="/parties">Clear filters</a>
    </Form>
  )
}

function PartyTable(props: {
  parties: readonly PartyDirectoryEntry[]
  selectedPartyId?: string
}) {
  return (
    <DataTable
      surface={false}
      caption="Party directory · maximum 200 records"
      rows={props.parties}
      getRowClass={(entry) =>
        entry.party.id === props.selectedPartyId ? layout.tableRowSelected : undefined}
      columns={[
        {
          id: "name",
          header: "Name",
          cell: (entry) => (
            <a href={`/parties/${encodeURIComponent(entry.party.id)}`}>
              {entry.party.name}
            </a>
          ),
        },
        { id: "kind", header: "Kind", cell: (entry) => labelForKind(entry.party.kind) },
        {
          id: "legalEntity",
          header: "Legal context",
          cell: (entry) =>
            entry.legalEntityId === null
              ? <span class={layout.muted}>Not registered</span>
              : <Badge tone="success">Legal entity</Badge>,
        },
        {
          id: "action",
          header: "Action",
          cell: (entry) => (
            <a
              href={`/parties/${encodeURIComponent(entry.party.id)}`}
              aria-label={`Open Party ${entry.party.name}`}
            >
              Open
            </a>
          ),
        },
      ]}
    />
  )
}

function CreateLegalEntityCommand(props: {
  detail: PartyDetailValue
  reload: () => Promise<unknown>
}) {
  const scope = useContext(ApiRuntime)
  const mutation = createLegalEntityMutation(scope)
  return (
    <section class={layout.stack} aria-labelledby="legal-entity-command-heading">
      <h3 id="legal-entity-command-heading">Legal entity</h3>
      <Show
        when={props.detail.party.kind === "organization"}
        fallback={<p class={layout.muted}>Only an organization Party can become a legal entity.</p>}
      >
        <Show
          when={props.detail.legalEntity === null}
          fallback={<p class={layout.muted}>This organization already has legal-entity context.</p>}
        >
          <p>Register this organization as a legal entity before adding branches.</p>
          <Button
            type="button"
            loading={mutation.isPending}
            disabled={mutation.error?.kind === "unknown-outcome"}
            onClick={() => mutation.mutate({ partyId: props.detail.party.id })}
          >
            Register legal entity
          </Button>
          <CommandFeedback
            error={mutation.error}
            pending={mutation.isPending}
            success={mutation.isSuccess}
            successMessage="Legal entity registered."
            reload={props.reload}
            reset={() => mutation.reset()}
          />
        </Show>
      </Show>
    </section>
  )
}

function AssignRoleCommand(props: {
  detail: PartyDetailValue
  reload: () => Promise<unknown>
}) {
  const scope = useContext(ApiRuntime)
  const mutation = assignPartyRoleMutation(scope)
  const options = () =>
    roleOptions.filter((option) => !props.detail.roles.includes(option.value as PartyRole))
  return (
    <details>
      <summary>Assign business role</summary>
      <div class={layout.stack}>
        <p>
          Roles classify eligibility. Sales, Procurement, and other domains retain authority over
          their own accounts and policies.
        </p>
        <Show when={options().length > 0} fallback={<p>All public Party roles are assigned.</p>}>
          <Form
            class={layout.stack}
            onSubmit={
              // Fallow: this form intentionally keeps Party-role validation at the UI boundary.
              // fallow-ignore-next-line complexity
              (value) => {
                if (mutation.isPending || mutation.error?.kind === "unknown-outcome") return
                const role = value.role
                if (!roleOptions.some((option) => option.value === role)) return
                mutation.mutate({ partyId: props.detail.party.id, role: role as PartyRole })
              }
            }
          >
            <FormField label="Role" required>
              {(fieldProps) => (
                <Select
                  {...fieldProps}
                  name="role"
                  options={options()}
                  placeholder="Choose role"
                  required
                  disabled={mutation.isPending}
                />
              )}
            </FormField>
            <PartyCommandSubmit
              error={mutation.error}
              pending={mutation.isPending}
              success={mutation.isSuccess}
              successMessage="Role assigned."
              reload={props.reload}
              reset={() => mutation.reset()}
              label="Assign role"
            />
          </Form>
        </Show>
      </div>
    </details>
  )
}

function AttachIdentifierCommand(props: {
  detail: PartyDetailValue
  legalEntities: PartyDirectoryAccessor
  reload: () => Promise<unknown>
}) {
  const scope = useContext(ApiRuntime)
  // Fallow: identifier and representation commands intentionally share the same guarded form shape.
  // fallow-ignore-next-line code-duplication
  const mutation = attachPartyIdentifierMutation(scope)
  const [invalid, setInvalid] = createSignal(false)
  return (
    <details>
      <summary>Attach external identifier</summary>
      <Form
        class={layout.stack}
        onSubmit={
          // Fallow: this form intentionally keeps external-identifier validation at the UI boundary.
          // fallow-ignore-next-line complexity
          (value) => {
            if (mutation.isPending || mutation.error?.kind === "unknown-outcome") return
            const provider = requiredText(value.provider)
            const scheme = requiredText(value.scheme)
            const scopeValue = requiredText(value.scope)
            const identifierValue = requiredText(value.value)
            if (
              provider === null || scheme === null || scopeValue === null ||
              identifierValue === null
            ) {
              setInvalid(true)
              return
            }
            setInvalid(false)
            mutation.mutate({
              partyId: props.detail.party.id,
              provider,
              scheme,
              scope: scopeValue,
              value: identifierValue,
              ...(requiredText(value.legalEntityId) === null
                ? {}
                : { legalEntityId: String(value.legalEntityId) }),
            })
          }
        }
      >
        <p>Provider and scheme are normalized by the authoritative Party service.</p>
        <FormField
          label="Provider"
          required
          error={invalid() ? "Complete every required identifier field." : undefined}
        >
          {(fieldProps) => <Input {...fieldProps} name="provider" required />}
        </FormField>
        <FormField label="Scheme" required>
          {(fieldProps) => <Input {...fieldProps} name="scheme" required />}
        </FormField>
        <FormField label="Scope" required>
          {(fieldProps) => <Input {...fieldProps} name="scope" required />}
        </FormField>
        <FormField label="Legal entity" helperText="Optional legal-entity scope">
          {(fieldProps) => (
            <Select
              {...fieldProps}
              name="legalEntityId"
              placeholder="Tenant-wide"
              options={props.legalEntities().flatMap((entry) =>
                entry.legalEntityId === null ? [] : [{
                  value: entry.legalEntityId,
                  label: entry.party.name,
                }]
              )}
            />
          )}
        </FormField>
        <FormField label="Identifier value" required>
          {(fieldProps) => <Input {...fieldProps} name="value" required />}
        </FormField>
        <PartyCommandSubmit
          error={mutation.error}
          pending={mutation.isPending}
          success={mutation.isSuccess}
          successMessage="Identifier attached."
          reload={props.reload}
          reset={() => mutation.reset()}
          label="Attach identifier"
        />
      </Form>
    </details>
  )
}

function CreateRelationshipCommand(props: {
  detail: PartyDetailValue
  reload: () => Promise<unknown>
}) {
  const scope = useContext(ApiRuntime)
  const mutation = createPartyRelationshipMutation(scope)
  const eligibleKinds = () =>
    roleOptions.filter((option) => props.detail.roles.includes(option.value as PartyRole))
  return (
    <details>
      <summary>Create legal-entity relationship</summary>
      <div class={layout.stack}>
        <p>A relationship requires the matching Party role and a different legal entity.</p>
        <Show
          when={eligibleKinds().length > 0}
          fallback={<p class={layout.muted}>Assign a matching Party role first.</p>}
        >
          <Form
            class={layout.stack}
            onSubmit={
              // Fallow: this form intentionally keeps Party relationship validation at the UI boundary.
              // fallow-ignore-next-line complexity
              (value) => {
                if (mutation.isPending || mutation.error?.kind === "unknown-outcome") return
                const legalEntityId = requiredText(value.legalEntityId)
                const kind = value.kind
                if (
                  legalEntityId === null ||
                  !eligibleKinds().some((option) => option.value === kind)
                ) return
                mutation.mutate({
                  partyId: props.detail.party.id,
                  legalEntityId,
                  kind: kind as PartyRole,
                })
              }
            }
          >
            <FormField label="Relationship kind" required>
              {(fieldProps) => (
                <Select
                  {...fieldProps}
                  name="kind"
                  options={eligibleKinds()}
                  placeholder="Choose kind"
                  required
                />
              )}
            </FormField>
            <FormField
              label="Legal entity ID"
              required
              helperText="Copy the UUID from another organization Party's legal context."
            >
              {(fieldProps) => <Input {...fieldProps} name="legalEntityId" required />}
            </FormField>
            <PartyCommandSubmit
              error={mutation.error}
              pending={mutation.isPending}
              success={mutation.isSuccess}
              successMessage="Relationship created."
              reload={props.reload}
              reset={() => mutation.reset()}
              label="Create relationship"
            />
          </Form>
        </Show>
      </div>
    </details>
  )
}

function CreateBranchCommand(props: {
  detail: PartyDetailValue
  reload: () => Promise<unknown>
}) {
  const scope = useContext(ApiRuntime)
  const mutation = createBranchMutation(scope)
  const [invalid, setInvalid] = createSignal(false)
  return (
    <details>
      <summary>Create branch</summary>
      <Show
        when={props.detail.legalEntity}
        keyed
        fallback={<p class={layout.muted}>Register a legal entity before creating branches.</p>}
      >
        {(legalEntity) => (
          <Form
            class={layout.stack}
            onSubmit={
              // Fallow: this form intentionally keeps branch-name validation at the UI boundary.
              // fallow-ignore-next-line complexity
              (value) => {
                if (mutation.isPending || mutation.error?.kind === "unknown-outcome") return
                const name = requiredText(value.name)
                if (name === null) {
                  setInvalid(true)
                  return
                }
                setInvalid(false)
                mutation.mutate({
                  legalEntityId: legalEntity.id,
                  name,
                  ...(optionalText(value.timezone) === undefined
                    ? {}
                    : { timezone: optionalText(value.timezone) }),
                  ...(optionalText(value.localTaxRegistration) === undefined
                    ? {}
                    : { localTaxRegistration: optionalText(value.localTaxRegistration) }),
                  ...(optionalText(value.dedicatedJournalCode) === undefined
                    ? {}
                    : { dedicatedJournalCode: optionalText(value.dedicatedJournalCode) }),
                })
              }
            }
          >
            <FormField
              label="Branch name"
              required
              error={invalid() ? "Enter a nonblank branch name." : undefined}
            >
              {(fieldProps) => <Input {...fieldProps} name="name" required />}
            </FormField>
            <FormField label="Timezone">
              {(fieldProps) => <Input {...fieldProps} name="timezone" />}
            </FormField>
            <FormField label="Local tax registration">
              {(fieldProps) => <Input {...fieldProps} name="localTaxRegistration" />}
            </FormField>
            <FormField label="Dedicated journal code">
              {(fieldProps) => <Input {...fieldProps} name="dedicatedJournalCode" />}
            </FormField>
            <PartyCommandSubmit
              error={mutation.error}
              pending={mutation.isPending}
              success={mutation.isSuccess}
              successMessage="Branch created."
              reload={props.reload}
              reset={() => mutation.reset()}
              label="Create branch"
            />
          </Form>
        )}
      </Show>
    </details>
  )
}

function CreateRepresentationCommand(props: {
  detail: PartyDetailValue
  reload: () => Promise<unknown>
}) {
  const scope = useContext(ApiRuntime)
  // Fallow: identifier and representation commands intentionally share the same guarded form shape.
  // fallow-ignore-next-line code-duplication
  const mutation = createPartyRepresentationMutation(scope)
  const [invalid, setInvalid] = createSignal(false)
  return (
    <details>
      <summary>Link user account representation</summary>
      <Form
        class={layout.stack}
        onSubmit={
          // Fallow: this form intentionally keeps Party-representation validation at the UI boundary.
          // fallow-ignore-next-line complexity
          (value) => {
            if (mutation.isPending || mutation.error?.kind === "unknown-outcome") return
            const userAccountId = requiredText(value.userAccountId)
            const kind = requiredText(value.kind)
            if (userAccountId === null || kind === null) {
              setInvalid(true)
              return
            }
            setInvalid(false)
            mutation.mutate({ partyId: props.detail.party.id, userAccountId, kind })
          }
        }
      >
        <p>A representation identifies whom an account represents; it does not grant access.</p>
        <FormField
          label="User account ID"
          required
          helperText="Copy the UUID from User accounts."
          error={invalid() || mutation.error?.kind === "validation"
            ? "Enter a valid user-account UUID and representation kind."
            : undefined}
        >
          {(fieldProps) => <Input {...fieldProps} name="userAccountId" required />}
        </FormField>
        <FormField label="Representation kind" required>
          {(fieldProps) => <Input {...fieldProps} name="kind" value="self" required />}
        </FormField>
        <PartyCommandSubmit
          error={mutation.error}
          pending={mutation.isPending}
          success={mutation.isSuccess}
          reload={props.reload}
          reset={() => mutation.reset()}
          successMessage="Representation linked."
          label="Link representation"
        />
      </Form>
    </details>
  )
}

function RepresentationTable(props: {
  detail: PartyDetailValue
  reload: () => Promise<unknown>
}) {
  const scope = useContext(ApiRuntime)
  const mutation = setPartyRepresentationActiveMutation(scope)
  return (
    <section class={[surface(), layout.stack]} aria-labelledby="representations-heading">
      <h3 id="representations-heading">User-account representations</h3>
      <Show
        when={props.detail.representations.length > 0}
        fallback={<p>No user accounts represent this Party.</p>}
      >
        <DataTable
          surface={false}
          caption="Party user-account representations"
          captionClass="sr-only"
          rows={props.detail.representations}
          columns={[
            {
              id: "userAccountId",
              header: "User account ID",
              cell: (representation) => (
                <span class={layout.code}>{representation.userAccountId}</span>
              ),
            },
            { id: "kind", header: "Kind", cell: (representation) => representation.kind },
            {
              id: "state",
              header: "State",
              cell: (representation) => (
                <Badge tone={representation.active ? "success" : "warning"}>
                  {representation.active ? "Active" : "Inactive"}
                </Badge>
              ),
            },
            {
              id: "action",
              header: "Action",
              cell: (representation) => (
                <Button
                  type="button"
                  loading={mutation.isPending}
                  disabled={mutation.error?.kind === "unknown-outcome"}
                  aria-label={`${
                    representation.active ? "Deactivate" : "Activate"
                  } representation for ${representation.userAccountId}`}
                  onClick={() =>
                    mutation.mutate({
                      representationId: representation.id,
                      active: !representation.active,
                    })}
                >
                  {representation.active ? "Deactivate" : "Activate"}
                </Button>
              ),
            },
          ]}
        />
      </Show>
      <CommandFeedback
        error={mutation.error}
        pending={mutation.isPending}
        success={mutation.isSuccess}
        successMessage="Representation state saved."
        reload={props.reload}
        reset={() => mutation.reset()}
      />
    </section>
  )
}

function RelatedPaths(props: {
  partyId: string
  legalEntities: PartyDirectoryAccessor
}) {
  const scope = useContext(ApiRuntime)
  const query = createRelatedPartyPathsQuery(scope, props.partyId, { limit: 100 })
  const nameForParty = (partyId: string) =>
    props.legalEntities().find((entry) => entry.party.id === partyId)?.party.name ?? partyId
  return (
    <section class={[surface(), layout.stack]} aria-labelledby="related-paths-heading">
      <div class={layout.row}>
        <h3 id="related-paths-heading">Related-party paths</h3>
        <Button type="button" onClick={() => void query.refetch()}>Reload paths</Button>
      </div>
      <p class={layout.muted}>Bounded two-edge analysis; never authorization evidence.</p>
      <QueryBoundary label="related paths" retry={() => query.refetch()}>
        <Show
          when={query.data.length > 0}
          fallback={<p>No non-reflexive related-party paths were found.</p>}
        >
          <ul>
            <For each={query.data}>
              {(path) => (
                <li>
                  {labelForRole(path.relationshipKind)} relationship to {nameForParty(
                    path.targetPartyId,
                  )}
                </li>
              )}
            </For>
          </ul>
        </Show>
      </QueryBoundary>
    </section>
  )
}

function PartyFacts(props: {
  detail: PartyDetailValue
  legalEntities: PartyDirectoryAccessor
  reload: () => Promise<unknown>
}) {
  const nameForLegalEntity = (legalEntityId: string) =>
    props.legalEntities().find((entry) => entry.legalEntityId === legalEntityId)?.party.name ??
      legalEntityId
  return (
    <div class={layout.stack}>
      <dl class={layout.detailList}>
        <div class={layout.detailItem}>
          <dt class={layout.detailTerm}>Name</dt>
          <dd class={layout.detailValue}>{props.detail.party.name}</dd>
        </div>
        <div class={layout.detailItem}>
          <dt class={layout.detailTerm}>Kind</dt>
          <dd class={layout.detailValue}>{labelForKind(props.detail.party.kind)}</dd>
        </div>
        <div class={layout.detailItem}>
          <dt class={layout.detailTerm}>Party ID</dt>
          <dd class={[layout.detailValue, layout.code]}>{props.detail.party.id}</dd>
        </div>
      </dl>

      <section class={[surface(), layout.stack]} aria-labelledby="roles-heading">
        <h3 id="roles-heading">Business roles</h3>
        <Show when={props.detail.roles.length > 0} fallback={<p>No roles assigned.</p>}>
          <div class={layout.row}>
            <For each={props.detail.roles}>
              {(role) => <Badge>{labelForRole(role)}</Badge>}
            </For>
          </div>
        </Show>
        <p class={layout.muted}>The public contract does not permit role removal.</p>
      </section>

      <section class={[surface(), layout.stack]} aria-labelledby="identifiers-heading">
        <h3 id="identifiers-heading">External identifiers</h3>
        <Show
          when={props.detail.identifiers.length > 0}
          fallback={<p>No external identifiers attached.</p>}
        >
          <DataTable
            surface={false}
            caption="Party external identifiers"
            captionClass="sr-only"
            rows={props.detail.identifiers}
            columns={[
              { id: "provider", header: "Provider", cell: (identifier) => identifier.provider },
              { id: "scheme", header: "Scheme", cell: (identifier) => identifier.scheme },
              { id: "scope", header: "Scope", cell: (identifier) => identifier.scope },
              { id: "value", header: "Value", cell: (identifier) => identifier.value },
            ]}
          />
        </Show>
        <p class={layout.muted}>Identifier edit and detach are not public Party operations.</p>
      </section>

      <section class={[surface(), layout.stack]} aria-labelledby="legal-context-heading">
        <h3 id="legal-context-heading">Legal and branch context</h3>
        <Show
          when={props.detail.legalEntity}
          keyed
          fallback={<p>This Party is not registered as a legal entity.</p>}
        >
          {(legalEntity) => (
            <>
              <p>
                Legal entity ID: <code>{legalEntity.id}</code>
              </p>
              <Show when={props.detail.branches.length > 0} fallback={<p>No branches created.</p>}>
                <ul>
                  <For each={props.detail.branches}>
                    {(branch) => (
                      <li>
                        <strong>{branch.name}</strong>
                        {branch.timezone ? ` · ${branch.timezone}` : ""}
                        {branch.localTaxRegistration
                          ? ` · tax registration ${branch.localTaxRegistration}`
                          : ""}
                        {branch.dedicatedJournalCode
                          ? ` · journal ${branch.dedicatedJournalCode}`
                          : ""}
                      </li>
                    )}
                  </For>
                </ul>
              </Show>
            </>
          )}
        </Show>
      </section>

      <section class={[surface(), layout.stack]} aria-labelledby="relationships-heading">
        <h3 id="relationships-heading">Legal-entity relationships</h3>
        <Show
          when={props.detail.relationships.length > 0}
          fallback={<p>No legal-entity relationships recorded.</p>}
        >
          <div class={layout.scroll}>
            <table>
              <thead>
                <tr>
                  <th scope="col">Kind</th>
                  <th scope="col">Legal entity</th>
                  <th scope="col">State</th>
                </tr>
              </thead>
              <tbody>
                <For each={props.detail.relationships}>
                  {(relationship) => (
                    <tr>
                      <td>{labelForRole(relationship.kind)}</td>
                      <td>{nameForLegalEntity(relationship.legalEntityId)}</td>
                      <td>
                        <Badge tone={relationship.active ? "success" : "warning"}>
                          {relationship.active ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </Show>
        <p class={layout.muted}>Relationship deactivation is not exposed by the public contract.</p>
      </section>

      <RepresentationTable detail={props.detail} reload={props.reload} />
      <RelatedPaths partyId={props.detail.party.id} legalEntities={props.legalEntities} />
    </div>
  )
}

function PartyCommands(props: {
  detail: PartyDetailValue
  legalEntities: PartyDirectoryAccessor
  reload: () => Promise<unknown>
}) {
  return (
    <section class={[surface(), layout.stack]} aria-labelledby="party-commands-heading">
      <h2 id="party-commands-heading">Eligible commands</h2>
      <p>
        Every command is checked again by the backend. Party rename and deletion are unavailable
        because no public contract owns those operations.
      </p>
      <CreateLegalEntityCommand detail={props.detail} reload={props.reload} />
      <AssignRoleCommand detail={props.detail} reload={props.reload} />
      <AttachIdentifierCommand
        detail={props.detail}
        legalEntities={props.legalEntities}
        reload={props.reload}
      />
      <CreateRelationshipCommand detail={props.detail} reload={props.reload} />
      <CreateBranchCommand detail={props.detail} reload={props.reload} />
      <CreateRepresentationCommand detail={props.detail} reload={props.reload} />
    </section>
  )
}

function PartyDetail(props: { id: string }) {
  const scope = useContext(ApiRuntime)
  const id = untrack(() => props.id)
  const query = createPartyDetailQuery(scope, id)
  const directory = createPartiesQuery(scope, { limit: 200 })
  return (
    <section class={layout.stack} aria-labelledby="party-detail-heading">
      <div class={layout.row}>
        <h2 id="party-detail-heading">Party detail</h2>
        <Button type="button" onClick={() => void query.refetch()}>Reload detail</Button>
      </div>
      <QueryBoundary label="Party detail" retry={() => query.refetch()}>
        <Show when={query.data} keyed>
          {(detail) => (
            <div class={layout.stack}>
              <PartyFacts
                detail={detail}
                legalEntities={() => directory.data}
                reload={() => query.refetch()}
              />
              <PartyCommands
                detail={detail}
                legalEntities={() => directory.data}
                reload={() => Promise.all([query.refetch(), directory.refetch()])}
              />
            </div>
          )}
        </Show>
      </QueryBoundary>
    </section>
  )
}

export function Parties(props: {
  selectedPartyId?: string
  search?: string
  kind?: PartyKind
}) {
  const scope = useContext(ApiRuntime)
  const input: ListPartiesInput = {
    ...(props.search === undefined ? {} : { search: props.search }),
    ...(props.kind === undefined ? {} : { kind: props.kind }),
    limit: 200,
  }
  const query = createPartiesQuery(scope, input)
  return (
    <EntityWorkspace
      title="Parties"
      description={
        <p>
          Tenant-scoped people and organizations, their identifiers, roles, legal context,
          relationships, and user-account representations.
        </p>
      }
      headerActions={
        <div class={layout.row}>
          <CreatePartyDialog reload={() => query.refetch()} />
          <Button type="button" onClick={() => void query.refetch()}>Reload Parties</Button>
        </div>
      }
      toolbar={<PartyFilters search={props.search} kind={props.kind} />}
      aside={props.selectedPartyId ? <PartyDetail id={props.selectedPartyId} /> : undefined}
    >
      <QueryBoundary label="Parties" retry={() => query.refetch()}>
        <Show
          when={query.data.length > 0}
          fallback={<p role="status">No Parties match the current filters.</p>}
        >
          <PartyTable parties={query.data} selectedPartyId={props.selectedPartyId} />
        </Show>
      </QueryBoundary>
    </EntityWorkspace>
  )
}

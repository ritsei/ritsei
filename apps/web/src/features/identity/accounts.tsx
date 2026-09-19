import { createSignal, onSettled, Show, untrack, useContext } from "solid-js"
import type { UserAccount } from "../../shared/contracts/generated/identity.ts"
import { failureMessage } from "../../shared/api.ts"
import { CommandFeedback, QueryBoundary } from "../../shared/request-feedback.tsx"
import { ApiRuntime } from "../../shared/runtime.ts"
import { layout } from "../../ui/foundations/layout.ts"
import { Badge } from "../../ui/primitives/badge.tsx"
import { Button } from "../../ui/primitives/button.tsx"
import { createDialogOpenChange, Dialog } from "../../ui/primitives/dialog.tsx"
import { Form } from "../../ui/primitives/form.tsx"
import { FormField } from "../../ui/primitives/form-field.tsx"
import { Input } from "../../ui/primitives/input.tsx"
import { DataTable } from "../../ui/patterns/data-table.tsx"
import { EntityWorkspace } from "../../ui/patterns/entity-workspace.tsx"
import { CartographyField } from "../../ui/renderers/cartography/cartography-field.tsx"
import { surface } from "../../ui/recipes/surface.ts"
import { projectAccountNetwork } from "./projections/account-network.ts"
import {
  createAccountEmailMutation,
  createAccountMutation,
  createAccountQuery,
  createAccountsQuery,
} from "./queries.ts"

function AccountTable(props: {
  accounts: readonly UserAccount[]
  selectedAccountId?: string
}) {
  return (
    <DataTable
      surface={false}
      caption="Tenant membership accounts · maximum 200 records"
      rows={props.accounts}
      getRowClass={(account) =>
        account.id === props.selectedAccountId ? layout.tableRowSelected : undefined}
      columns={[
        {
          id: "email",
          header: "Email",
          cell: (account) => (
            <a href={`/user-accounts/${encodeURIComponent(account.id)}`}>
              {account.email}
            </a>
          ),
        },
        {
          id: "status",
          header: "Global status",
          cell: (account) => (
            <Badge tone={account.status === "active" ? "success" : "warning"}>
              {account.status === "active" ? "Active" : "Disabled"}
            </Badge>
          ),
        },
        {
          id: "action",
          header: "Action",
          cell: (account) => (
            <a
              href={`/user-accounts/${encodeURIComponent(account.id)}`}
              aria-label={`Open account for ${account.email}`}
            >
              Open
            </a>
          ),
        },
      ]}
    />
  )
}

// Fallow: this dialog intentionally combines identity input validation and unknown-outcome recovery.
// fallow-ignore-next-line complexity
function CreateAccountDialog(props: { reload: () => Promise<unknown> }) {
  const scope = useContext(ApiRuntime)
  const [open, setOpen] = createSignal(false)
  const [invalid, setInvalid] = createSignal(false)
  let formElement: HTMLFormElement | undefined
  let emailInput: HTMLInputElement | undefined
  const mutation = createAccountMutation(scope, () => {
    formElement?.reset()
    setInvalid(false)
    setOpen(false)
  })
  return (
    <Dialog
      open={open()}
      onOpenChange={createDialogOpenChange(mutation, setOpen, setInvalid)}
      trigger={<span>Create account</span>}
      triggerVariant="primary"
      title="Create user account"
      description="Create a global identity and link it to the connected tenant. The server authorizes the command before writing."
    >
      <Form
        ref={(element) => {
          formElement = element
        }}
        class={layout.stack}
        onSubmit={(value) => {
          if (mutation.isPending || mutation.error?.kind === "unknown-outcome") return
          const email = value.email
          if (typeof email !== "string" || !/\S/.test(email)) {
            setInvalid(true)
            emailInput?.focus()
            return
          }
          setInvalid(false)
          mutation.mutate({ email })
        }}
      >
        <FormField
          label="Email"
          required
          helperText="The identity service normalizes casing and surrounding whitespace."
          error={invalid() || mutation.error?.kind === "validation"
            ? "Enter a nonblank email."
            : undefined}
        >
          {(fieldProps) => (
            <Input
              {...fieldProps}
              ref={(element) => {
                emailInput = element
              }}
              name="email"
              type="email"
              inputmode="email"
              autocomplete="off"
              required
              disabled={mutation.isPending}
            />
          )}
        </FormField>
        <CommandFeedback
          error={mutation.error?.kind === "validation" ? null : mutation.error}
          pending={mutation.isPending}
          success={mutation.isSuccess}
          successMessage="Account created."
          area="accounts"
          reload={props.reload}
          reset={() => mutation.reset()}
        />
        <Button
          variant="primary"
          type="submit"
          loading={mutation.isPending}
          disabled={mutation.error?.kind === "unknown-outcome"}
        >
          Create account
        </Button>
      </Form>
    </Dialog>
  )
}

function EmailEditor(
  props: {
    account: UserAccount
    close: () => void
    reload: () => Promise<unknown>
  },
) {
  const scope = useContext(ApiRuntime)
  const account = untrack(() => props.account)
  const [invalid, setInvalid] = createSignal(false)
  const mutation = createAccountEmailMutation(scope)
  let emailInput: HTMLInputElement | undefined
  onSettled(() => emailInput?.focus())
  return (
    <section class={surface()} aria-labelledby="edit-heading">
      <Form
        class={layout.stack}
        onSubmit={(value) => {
          if (mutation.isPending || mutation.error?.kind === "unknown-outcome") return
          const email = value.email
          if (typeof email !== "string" || !/\S/.test(email)) {
            setInvalid(true)
            emailInput?.focus()
            return
          }
          setInvalid(false)
          mutation.mutate({ id: account.id, email })
        }}
      >
        <h3 id="edit-heading">Edit account email</h3>
        <p>
          This changes the global account, including its use in other tenants. The server checks
          your permission again when you save.
        </p>
        <FormField
          label="Email"
          required
          helperText="Account changes are never retried automatically."
          error={invalid() || mutation.error?.kind === "validation"
            ? "Enter a nonblank email."
            : undefined}
        >
          {(fieldProps) => (
            <Input
              {...fieldProps}
              ref={(element) => {
                emailInput = element
              }}
              name="email"
              type="email"
              inputmode="email"
              autocomplete="off"
              value={account.email}
              required
              disabled={mutation.isPending}
            />
          )}
        </FormField>
        <Show when={mutation.isError && mutation.error?.kind !== "validation"}>
          <p role="alert">{failureMessage(mutation.error)}</p>
        </Show>
        <p role="status">
          {mutation.isPending
            ? "Saving email…"
            : mutation.isSuccess
            ? "Email saved. The tenant account views are refreshing."
            : ""}
        </p>
        <div class={layout.row}>
          <Button
            variant="primary"
            type="submit"
            loading={mutation.isPending}
            disabled={mutation.error?.kind === "unknown-outcome"}
          >
            Save email
          </Button>
          <Button type="button" disabled={mutation.isPending} onClick={props.close}>
            Close editor
          </Button>
          <Show when={mutation.error?.kind === "unknown-outcome"}>
            <Button
              type="button"
              onClick={() => {
                void props.reload().then(props.close)
              }}
            >
              Reload before retrying
            </Button>
          </Show>
        </div>
      </Form>
    </section>
  )
}

function AccountDetail(props: { id: string }) {
  const scope = useContext(ApiRuntime)
  const id = untrack(() => props.id)
  const query = createAccountQuery(scope, id)
  const [editing, setEditing] = createSignal(false)
  let editTrigger: HTMLButtonElement | undefined
  const closeEditor = () => {
    setEditing(false)
    editTrigger?.focus()
  }
  return (
    <section class={layout.stack} aria-labelledby="account-detail-heading">
      <div class={layout.row}>
        <h2 id="account-detail-heading">Account detail</h2>
        <Button
          type="button"
          onClick={() => {
            void query.refetch()
          }}
        >
          Reload detail
        </Button>
      </div>
      <QueryBoundary label="account detail" retry={() => query.refetch()}>
        <Show when={query.data} keyed>
          {(account) => (
            <div class={layout.stack}>
              <dl class={layout.detailList}>
                <div class={layout.detailItem}>
                  <dt class={layout.detailTerm}>Email</dt>
                  <dd class={layout.detailValue}>{account.email}</dd>
                </div>
                <div class={layout.detailItem}>
                  <dt class={layout.detailTerm}>Global status</dt>
                  <dd class={layout.detailValue}>
                    <Badge tone={account.status === "active" ? "success" : "warning"}>
                      {account.status === "active" ? "Active" : "Disabled"}
                    </Badge>
                  </dd>
                </div>
                <div class={layout.detailItem}>
                  <dt class={layout.detailTerm}>Account ID</dt>
                  <dd class={[layout.detailValue, layout.code]}>{account.id}</dd>
                </div>
              </dl>

              <div class={layout.row}>
                <Button
                  ref={(element) => {
                    editTrigger = element
                  }}
                  type="button"
                  onClick={() => setEditing(true)}
                >
                  Edit email
                </Button>
              </div>

              <Show when={editing()}>
                <EmailEditor
                  account={account}
                  close={closeEditor}
                  reload={() => query.refetch()}
                />
              </Show>
              <p class={layout.muted}>
                Global disable, enable, and permanent removal are trusted identity operations and
                are intentionally unavailable to tenant administrators. Manage tenant access in
                Access instead.
              </p>
            </div>
          )}
        </Show>
      </QueryBoundary>
    </section>
  )
}

export function Accounts(props: { selectedAccountId?: string }) {
  const scope = useContext(ApiRuntime)
  const query = createAccountsQuery(scope)
  const [selectedVisualSegment, setSelectedVisualSegment] = createSignal<string | null>(null)
  return (
    <EntityWorkspace
      title="User accounts"
      description={
        <p>
          Global identities linked to the connected tenant. Account provisioning and email changes
          remain server-authorized; tenant membership state is managed separately in Access.
        </p>
      }
      headerActions={
        <div class={layout.row}>
          <CreateAccountDialog reload={() => query.refetch()} />
          <Button
            type="button"
            onClick={() => {
              void query.refetch()
            }}
          >
            Reload accounts
          </Button>
        </div>
      }
      aside={props.selectedAccountId ? <AccountDetail id={props.selectedAccountId} /> : undefined}
    >
      <QueryBoundary
        label="user accounts"
        retryLabel="Try loading again"
        retry={() => query.refetch()}
      >
        <Show
          when={query.data.length > 0}
          fallback={<p role="status">No user accounts are linked to this tenant.</p>}
        >
          <CartographyField
            intent={projectAccountNetwork(query.data)}
            selectedMarkerId={selectedVisualSegment() ?? undefined}
            onInteraction={(interaction) => {
              if (interaction.type === "select") setSelectedVisualSegment(interaction.targetId)
            }}
          >
            <Show when={selectedVisualSegment()}>
              {(segment) => <p role="status">Selected visual segment: {segment()}</p>}
            </Show>
          </CartographyField>
          <AccountTable
            accounts={query.data}
            selectedAccountId={props.selectedAccountId}
          />
        </Show>
      </QueryBoundary>
    </EntityWorkspace>
  )
}

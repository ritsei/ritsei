import { createMemo, createSignal, onSettled, Show, untrack, useContext } from "solid-js"
import type { UserAccount } from "../../shared/contracts/generated/identity.ts"
import { failureMessage } from "../../shared/api.ts"
import { CommandFeedback, QueryBoundary } from "../../shared/request-feedback.tsx"
import { ApiRuntime } from "../../shared/runtime.ts"
import { layout } from "../../ui/foundations/layout.ts"
import { Button } from "../../ui/primitives/button.tsx"
import { createDialogOpenChange, Dialog } from "../../ui/primitives/dialog.tsx"
import { Form } from "../../ui/primitives/form.tsx"
import { FormField } from "../../ui/primitives/form-field.tsx"
import { Input } from "../../ui/primitives/input.tsx"
import { DataTable } from "../../ui/patterns/data-table.tsx"
import { CartographyField } from "../../ui/renderers/cartography/cartography-field.tsx"
import { projectAccountNetwork } from "./projections/account-network.ts"
import {
  createAccountEmailMutation,
  createAccountMutation,
  createAccountQuery,
  createAccountsQuery,
} from "./queries.ts"

function AccountStatus(props: { status: UserAccount["status"] }) {
  return (
    <span
      class={[
        layout.statusText,
        props.status === "active" ? layout.statusActive : layout.statusDisabled,
      ]}
    >
      {props.status === "active" ? "Active" : "Disabled"}
    </span>
  )
}

function AccountTable(props: { accounts: readonly UserAccount[] }) {
  return (
    <DataTable
      surface={false}
      tableClass={layout.collectionTable}
      caption="User accounts linked to this tenant"
      rows={props.accounts}
      columns={[
        {
          id: "email",
          header: "Email",
          rowHeader: true,
          cell: (account) => (
            <div class={layout.rowIdentity}>
              <a class={layout.quietLink} href={`/user-accounts/${encodeURIComponent(account.id)}`}>
                {account.email}
              </a>
              <span class={[layout.rowReference, layout.mobileReference]} title={account.id}>
                ID {account.id.slice(0, 8)}…{account.id.slice(-4)}
              </span>
            </div>
          ),
        },
        {
          id: "reference",
          header: "Account ID",
          cell: (account) => <span class={layout.rowReference}>{account.id}</span>,
        },
        {
          id: "status",
          header: "Global status",
          cell: (account) => <AccountStatus status={account.status} />,
        },
        {
          id: "action",
          header: "View",
          cell: (account) => (
            <a
              class={layout.quietLink}
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
      description="Create a global account and link it to this tenant."
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
          helperText="This email identifies the account across tenants."
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
    saved: () => void
  },
) {
  const scope = useContext(ApiRuntime)
  const account = untrack(() => props.account)
  const [invalid, setInvalid] = createSignal(false)
  const mutation = createAccountEmailMutation(scope, props.saved)
  let emailInput: HTMLInputElement | undefined
  onSettled(() => emailInput?.focus())
  return (
    <section class={layout.documentSection} aria-labelledby="edit-heading">
      <Form
        class={layout.formArea}
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
        <h3 id="edit-heading">Change email</h3>
        <p class={layout.workspaceDescription}>
          The new address will identify this account wherever it is linked.
        </p>
        <FormField
          label="Email"
          required
          helperText="Account changes are not retried automatically."
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
        <div class={layout.formActions}>
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
  const [saved, setSaved] = createSignal(false)
  let editTrigger: HTMLButtonElement | undefined
  const closeEditor = () => {
    setEditing(false)
    queueMicrotask(() => editTrigger?.focus())
  }
  return (
    <section class={layout.stack} aria-label="User account">
      <a class={layout.quietLink} href="/user-accounts">← All accounts</a>
      <header class={layout.workspaceHeading}>
        <div class={layout.workspaceTitle}>
          <span class={layout.resultCount}>Global account</span>
          <h1>{query.data?.email ?? "User account"}</h1>
          <Show
            when={query.data}
            keyed
            fallback={<span class={layout.objectReference}>Account ID {id}</span>}
          >
            {(account) => (
              <div class={layout.objectMetadata}>
                <AccountStatus status={account.status} />
                <span class={layout.objectReference}>Account ID {account.id}</span>
              </div>
            )}
          </Show>
        </div>
        <Show when={query.data && !editing()}>
          <div class={layout.row}>
            <Button
              ref={(element) => editTrigger = element}
              variant="primary"
              type="button"
              onClick={() => {
                setSaved(false)
                setEditing(true)
              }}
            >
              Edit email
            </Button>
            <Button type="button" onClick={() => void query.refetch()}>Reload detail</Button>
          </div>
        </Show>
      </header>
      <Show when={saved()}>
        <p role="status" class={layout.statusActive}>Email saved.</p>
      </Show>
      <QueryBoundary label="account detail" retry={() => query.refetch()}>
        <Show when={query.data} keyed>
          {(account) => (
            <div class={layout.documentGrid}>
              <section class={layout.stack} aria-labelledby="account-detail-heading">
                <h2 id="account-detail-heading">Account detail</h2>
                <Show
                  when={editing()}
                  fallback={
                    <dl class={layout.detailList}>
                      <div class={layout.detailItem}>
                        <dt class={layout.detailTerm}>Email</dt>
                        <dd class={layout.detailValue}>{account.email}</dd>
                      </div>
                    </dl>
                  }
                >
                  <EmailEditor
                    account={account}
                    close={closeEditor}
                    saved={() => {
                      closeEditor()
                      setSaved(true)
                    }}
                    reload={() => query.refetch()}
                  />
                </Show>
              </section>
              <aside class={layout.documentAside} aria-label="Account scope">
                <div class={layout.stack}>
                  <h2>Tenant access</h2>
                  <p class={layout.workspaceDescription}>
                    Account email is global. Tenant membership and permissions are managed
                    separately.
                  </p>
                  <a href="/access">Open Access</a>
                  <p class={layout.workspaceDescription}>
                    Global status changes and removal are not available in this workspace.
                  </p>
                </div>
              </aside>
            </div>
          )}
        </Show>
      </QueryBoundary>
    </section>
  )
}

function AccountCollection() {
  const scope = useContext(ApiRuntime)
  const query = createAccountsQuery(scope)
  const [search, setSearch] = createSignal("")
  const [status, setStatus] = createSignal("all")
  const filtered = createMemo(() => {
    const term = search().trim().toLocaleLowerCase()
    return (query.data ?? []).filter((account) =>
      (status() === "all" || account.status === status()) &&
      (account.email.toLocaleLowerCase().includes(term) ||
        account.id.toLocaleLowerCase().includes(term))
    )
  })
  return (
    <section class={layout.stack} aria-label="User accounts">
      <header class={layout.workspaceHeading}>
        <div class={layout.workspaceTitle}>
          <h1>User accounts</h1>
          <p class={layout.workspaceDescription}>
            Global accounts linked to this tenant. Manage membership and permissions in Access.
          </p>
        </div>
        <CreateAccountDialog reload={() => query.refetch()} />
      </header>
      <QueryBoundary
        label="user accounts"
        retryLabel="Try loading again"
        retry={() => query.refetch()}
      >
        <div class={layout.collectionToolbar}>
          <p class={layout.resultCount} role="status">
            {filtered().length} of {query.data.length} loaded accounts
          </p>
          <div class={layout.collectionControls}>
            <label class={[layout.fieldLabel, layout.searchField]}>
              Find email or ID
              <Input
                type="search"
                value={search()}
                onInput={(event) => setSearch(event.currentTarget.value)}
                placeholder="Search loaded accounts"
              />
            </label>
            <label class={[layout.fieldLabel, layout.filterField]}>
              Global status
              <select
                class={layout.filterSelect}
                value={status()}
                onChange={(event) => setStatus(event.currentTarget.value)}
              >
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="disabled">Disabled</option>
              </select>
            </label>
            <Button type="button" onClick={() => void query.refetch()}>Reload accounts</Button>
          </div>
        </div>
        <Show
          when={filtered().length > 0}
          fallback={
            <div class={layout.emptyCollection} role="status">
              <p>
                {query.data.length === 0
                  ? "No user accounts are linked to this tenant."
                  : "No loaded accounts match these filters."}
              </p>
              <Show when={query.data.length > 0}>
                <Button
                  type="button"
                  onClick={() => {
                    setSearch("")
                    setStatus("all")
                  }}
                >
                  Clear filters
                </Button>
              </Show>
            </div>
          }
        >
          <AccountTable accounts={filtered()} />
        </Show>
        <Show when={query.data.length > 0}>
          <details class={layout.documentSection}>
            <summary>Account distribution</summary>
            <CartographyField
              intent={projectAccountNetwork(query.data)}
              selectedMarkerId={status() === "all" ? undefined : status()}
              onInteraction={(interaction) => {
                if (interaction.type === "select") setStatus(interaction.targetId)
              }}
            >
              <Show when={status() !== "all"}>
                <p role="status">Showing {status()} accounts in the table above.</p>
              </Show>
            </CartographyField>
          </details>
        </Show>
      </QueryBoundary>
    </section>
  )
}

export function Accounts(props: { selectedAccountId?: string }) {
  return (
    <Show when={props.selectedAccountId} fallback={<AccountCollection />}>
      {(id) => <AccountDetail id={id()} />}
    </Show>
  )
}

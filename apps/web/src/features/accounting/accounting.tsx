import { useNavigate } from "@solidjs/router"
import type { JSX } from "@solidjs/web"
import { createSignal, For, Show, useContext } from "solid-js"
import type {
  Account,
  AccountingConfiguration,
  AccountingPeriod,
  AccountingPeriodStatus,
  AccountType,
  JournalEntry,
  JournalStatus,
  RevenuePostingProfile,
} from "../../shared/contracts/generated/accounting.ts"
import { CommandFeedback, QueryBoundary } from "../../shared/request-feedback.tsx"
import { ApiRuntime } from "../../shared/runtime.ts"
import { layout } from "../../ui/foundations/layout.ts"
import { DataTable } from "../../ui/patterns/data-table.tsx"
import { EntityWorkspace } from "../../ui/patterns/entity-workspace.tsx"
import { Badge } from "../../ui/primitives/badge.tsx"
import { Button } from "../../ui/primitives/button.tsx"
import { createDialogOpenChange, Dialog } from "../../ui/primitives/dialog.tsx"
import { Form } from "../../ui/primitives/form.tsx"
import { FormField } from "../../ui/primitives/form-field.tsx"
import { Input } from "../../ui/primitives/input.tsx"
import { Select } from "../../ui/primitives/select.tsx"
import { surface } from "../../ui/recipes/surface.ts"
import {
  createAccountingConfigurationsQuery,
  createAccountingPeriodsQuery,
  createAccountMutation,
  createAccountsQuery,
  createClosePeriodMutation,
  createConfigureLegalEntityMutation,
  createConfigureRevenuePostingMutation,
  createJournalsQuery,
  createOpenPeriodMutation,
  createPostJournalMutation,
  createRevenuePostingProfilesQuery,
} from "./queries.ts"

const accountTypeOptions = [
  { value: "asset", label: "Asset" },
  { value: "liability", label: "Liability" },
  { value: "equity", label: "Equity" },
  { value: "revenue", label: "Revenue" },
  { value: "expense", label: "Expense" },
] as const
const periodStatusOptions = [
  { value: "open", label: "Open" },
  { value: "closed", label: "Closed" },
] as const
const journalStatusOptions = [
  { value: "posted", label: "Posted" },
  { value: "reversed", label: "Reversed" },
] as const
const postingOptions = [
  { value: "true", label: "Posting enabled" },
  { value: "false", label: "Posting disabled" },
] as const
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const currencyPattern = /^[A-Z]{3}$/
const accountCodePattern = /^\S+$/
const moneyPattern = /^\d{1,18}\.\d{2}$/
const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/

const requiredText = (value: FormDataEntryValue | null | undefined): string | null =>
  typeof value === "string" && /\S/.test(value) ? value.trim() : null

const isIsoDate = (value: string): boolean => {
  if (!isoDatePattern.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

const toMinor = (value: string): bigint => {
  const [whole, fraction] = value.split(".")
  return BigInt(whole!) * 100n + BigInt(fraction!)
}

const configurationTone = (
  configuration: AccountingConfiguration,
): "neutral" | "success" | "warning" => configuration.postingEnabled ? "success" : "warning"
const periodTone = (status: AccountingPeriodStatus): "neutral" | "success" | "warning" =>
  status === "open" ? "success" : "neutral"
const journalTone = (status: JournalStatus): "neutral" | "success" | "warning" =>
  status === "posted" ? "success" : "warning"

// Fallow: this dialog intentionally owns the complete guarded Accounting setup flow.
// fallow-ignore-next-line complexity
function ConfigureLegalEntityDialog(props: { reload: () => Promise<unknown> }) {
  const scope = useContext(ApiRuntime)
  const [open, setOpen] = createSignal(false)
  const [invalid, setInvalid] = createSignal(false)
  const mutation = createConfigureLegalEntityMutation(scope, () => {
    setOpen(false)
    void props.reload()
  })
  let legalEntityInput: HTMLInputElement | undefined

  return (
    // Fallow: Accounting configuration dialogs intentionally share the same guarded form shell.
    // fallow-ignore-next-line code-duplication
    <Dialog
      open={open()}
      onOpenChange={createDialogOpenChange(mutation, setOpen, setInvalid)}
      trigger={<span>Configure legal entity</span>}
      triggerVariant="primary"
      title="Configure legal entity"
      description="Create the Accounting baseline configuration. PostgreSQL remains the active engine until the separately gated TigerBeetle cutover is approved."
    >
      <Form
        class={layout.stack}
        onSubmit={
          // Fallow: this guarded financial form validates backend-bound input before submission.
          // fallow-ignore-next-line complexity
          (value) => {
            if (mutation.isPending || mutation.error?.kind === "unknown-outcome") return
            const legalEntityId = requiredText(value.legalEntityId)
            const baseCurrency = requiredText(value.baseCurrency)?.toUpperCase() ?? null
            const fiscalYearStartMonth = Number(requiredText(value.fiscalYearStartMonth))
            const postingEnabled = value.postingEnabled
            if (
              legalEntityId === null || !uuidPattern.test(legalEntityId) ||
              baseCurrency === null || !currencyPattern.test(baseCurrency) ||
              !Number.isInteger(fiscalYearStartMonth) || fiscalYearStartMonth < 1 ||
              fiscalYearStartMonth > 12 || (postingEnabled !== "true" && postingEnabled !== "false")
            ) {
              setInvalid(true)
              legalEntityInput?.focus()
              return
            }
            setInvalid(false)
            mutation.mutate({
              legalEntityId,
              input: {
                baseCurrency,
                precision: 2,
                fiscalYearStartMonth,
                postingEnabled: postingEnabled === "true",
              },
            })
          }
        }
      >
        <FormField
          label="Legal entity ID"
          required
          error={invalid() || mutation.error?.kind === "validation"
            ? "Enter a valid legal entity UUID and complete every field."
            : undefined}
        >
          {(fieldProps) => (
            <Input
              {...fieldProps}
              ref={(element) => legalEntityInput = element}
              name="legalEntityId"
              autocomplete="off"
              spellcheck={false}
              required
              disabled={mutation.isPending}
            />
          )}
        </FormField>
        <FormField label="Base currency" required helperText="Use the uppercase ISO currency code.">
          {(fieldProps) => (
            <Input
              {...fieldProps}
              name="baseCurrency"
              value="USD"
              maxlength={3}
              autocomplete="off"
              spellcheck={false}
              required
              disabled={mutation.isPending}
            />
          )}
        </FormField>
        <FormField label="Fiscal year start month" required>
          {(fieldProps) => (
            <Input
              {...fieldProps}
              name="fiscalYearStartMonth"
              type="number"
              min={1}
              max={12}
              value="1"
              required
              disabled={mutation.isPending}
            />
          )}
        </FormField>
        <FormField label="Posting policy" required>
          {(fieldProps) => (
            <Select
              {...fieldProps}
              name="postingEnabled"
              options={postingOptions}
              value="true"
              required
              disabled={mutation.isPending}
            />
          )}
        </FormField>
        <p class={layout.muted}>
          Precision is fixed at two decimal places by the Accounting contract.
        </p>
        <CommandFeedback
          error={mutation.error}
          pending={mutation.isPending}
          success={mutation.isSuccess}
          successMessage="Legal entity configuration created."
          area="Finance"
          reload={props.reload}
          reset={() => mutation.reset()}
        />
        <Button
          variant="primary"
          type="submit"
          loading={mutation.isPending}
          disabled={mutation.error?.kind === "unknown-outcome"}
        >
          Save configuration
        </Button>
      </Form>
    </Dialog>
  )
}

// Fallow: this dialog intentionally owns the complete guarded Accounting setup flow.
// fallow-ignore-next-line complexity
function CreateAccountDialog(props: { reload: () => Promise<unknown> }) {
  const scope = useContext(ApiRuntime)
  const [open, setOpen] = createSignal(false)
  const [invalid, setInvalid] = createSignal(false)
  const mutation = createAccountMutation(scope, () => {
    setOpen(false)
    void props.reload()
  })
  let codeInput: HTMLInputElement | undefined

  return (
    <Dialog
      open={open()}
      onOpenChange={createDialogOpenChange(mutation, setOpen, setInvalid)}
      trigger={<span>Create account</span>}
      triggerVariant="secondary"
      title="Create account"
      description="Add a tenant-scoped chart-of-accounts record. Account codes are normalized by the backend."
    >
      <Form
        class={layout.stack}
        onSubmit={
          // Fallow: this form intentionally keeps tenant-scoped account validation at the UI boundary.
          // fallow-ignore-next-line complexity
          (value) => {
            if (mutation.isPending || mutation.error?.kind === "unknown-outcome") return
            const code = requiredText(value.code)
            const name = requiredText(value.name)
            const type = requiredText(value.type)
            if (
              code === null || !accountCodePattern.test(code) ||
              name === null ||
              !accountTypeOptions.some((option) => option.value === type)
            ) {
              setInvalid(true)
              codeInput?.focus()
              return
            }
            setInvalid(false)
            mutation.mutate({
              code,
              name,
              type: type as AccountType,
            })
          }
        }
      >
        <FormField
          label="Account code"
          required
          error={invalid() || mutation.error?.kind === "validation"
            ? "Enter a nonblank code, name, and account type."
            : undefined}
        >
          {(fieldProps) => (
            <Input
              {...fieldProps}
              ref={(element) => codeInput = element}
              name="code"
              autocomplete="off"
              spellcheck={false}
              required
              disabled={mutation.isPending}
            />
          )}
        </FormField>
        <FormField label="Account name" required>
          {(fieldProps) => (
            <Input
              {...fieldProps}
              name="name"
              autocomplete="off"
              required
              disabled={mutation.isPending}
            />
          )}
        </FormField>
        <FormField label="Account type" required>
          {(fieldProps) => (
            <Select
              {...fieldProps}
              name="type"
              options={accountTypeOptions}
              placeholder="Choose account type"
              required
              disabled={mutation.isPending}
            />
          )}
        </FormField>
        <CommandFeedback
          error={mutation.error}
          pending={mutation.isPending}
          success={mutation.isSuccess}
          successMessage="Account created."
          area="Finance"
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

// Fallow: this dialog intentionally owns the complete guarded Accounting setup flow.
// fallow-ignore-next-line complexity
function ConfigureRevenuePostingDialog(props: {
  accounts: () => readonly Account[]
  reload: () => Promise<unknown>
}) {
  const scope = useContext(ApiRuntime)
  const [open, setOpen] = createSignal(false)
  const [invalid, setInvalid] = createSignal(false)
  const mutation = createConfigureRevenuePostingMutation(scope, () => {
    setOpen(false)
    void props.reload()
  })
  let legalEntityInput: HTMLInputElement | undefined

  return (
    // Fallow: Accounting configuration dialogs intentionally share the same guarded form shell.
    // fallow-ignore-next-line code-duplication
    <Dialog
      open={open()}
      onOpenChange={createDialogOpenChange(mutation, setOpen, setInvalid)}
      trigger={<span>Configure revenue profile</span>}
      triggerVariant="secondary"
      title="Configure revenue posting profile"
      description="Bind one tenant-scoped legal entity to its receivable and revenue accounts. The backend validates account ownership and types."
    >
      <Form
        class={layout.stack}
        onSubmit={
          // Fallow: this form intentionally keeps tenant-scoped posting validation at the UI boundary.
          // fallow-ignore-next-line complexity
          (value) => {
            if (mutation.isPending || mutation.error?.kind === "unknown-outcome") return
            const legalEntityId = requiredText(value.legalEntityId)
            const receivableAccountId = requiredText(value.receivableAccountId)
            const revenueAccountId = requiredText(value.revenueAccountId)
            if (
              legalEntityId === null || !uuidPattern.test(legalEntityId) ||
              receivableAccountId === null || !uuidPattern.test(receivableAccountId) ||
              revenueAccountId === null || !uuidPattern.test(revenueAccountId) ||
              receivableAccountId === revenueAccountId
            ) {
              setInvalid(true)
              legalEntityInput?.focus()
              return
            }
            setInvalid(false)
            mutation.mutate({ legalEntityId, receivableAccountId, revenueAccountId })
          }
        }
      >
        <FormField
          label="Legal entity ID"
          required
          error={invalid() || mutation.error?.kind === "validation"
            ? "Enter a valid legal entity UUID and choose distinct accounts."
            : undefined}
        >
          {(fieldProps) => (
            <Input
              {...fieldProps}
              ref={(element) => legalEntityInput = element}
              name="legalEntityId"
              autocomplete="off"
              spellcheck={false}
              required
              disabled={mutation.isPending}
            />
          )}
        </FormField>
        <FormField label="Receivable account" required helperText="Choose an asset account.">
          {(fieldProps) => (
            <Select
              {...fieldProps}
              name="receivableAccountId"
              options={props.accounts().filter((account) => account.type === "asset").map((
                account,
              ) => ({
                value: account.id,
                label: `${account.code} · ${account.name}`,
              }))}
              placeholder="Choose receivable account"
              required
              disabled={mutation.isPending}
            />
          )}
        </FormField>
        <FormField label="Revenue account" required helperText="Choose a revenue account.">
          {(fieldProps) => (
            <Select
              {...fieldProps}
              name="revenueAccountId"
              options={props.accounts().filter((account) => account.type === "revenue").map((
                account,
              ) => ({
                value: account.id,
                label: `${account.code} · ${account.name}`,
              }))}
              placeholder="Choose revenue account"
              required
              disabled={mutation.isPending}
            />
          )}
        </FormField>
        <CommandFeedback
          error={mutation.error}
          pending={mutation.isPending}
          success={mutation.isSuccess}
          successMessage="Revenue profile configured."
          area="Finance"
          reload={props.reload}
          reset={() => mutation.reset()}
        />
        <Button
          variant="primary"
          type="submit"
          loading={mutation.isPending}
          disabled={mutation.error?.kind === "unknown-outcome"}
        >
          Save revenue profile
        </Button>
      </Form>
    </Dialog>
  )
}

// Fallow: this dialog intentionally owns the complete guarded Accounting setup flow.
// fallow-ignore-next-line complexity
function OpenPeriodDialog(props: { reload: () => Promise<unknown> }) {
  const scope = useContext(ApiRuntime)
  const [open, setOpen] = createSignal(false)
  const [invalid, setInvalid] = createSignal(false)
  const mutation = createOpenPeriodMutation(scope, () => {
    setOpen(false)
    void props.reload()
  })
  let legalEntityInput: HTMLInputElement | undefined

  return (
    // Fallow: Accounting configuration dialogs intentionally share the same guarded form shell.
    // fallow-ignore-next-line code-duplication
    <Dialog
      open={open()}
      onOpenChange={createDialogOpenChange(mutation, setOpen, setInvalid)}
      trigger={<span>Open period</span>}
      triggerVariant="secondary"
      title="Open accounting period"
      description="Open a non-overlapping period for a tenant-scoped legal entity. Closing is terminal in the current P2 baseline."
    >
      <Form
        class={layout.stack}
        onSubmit={
          // Fallow: this form intentionally keeps period overlap validation at the UI boundary.
          // fallow-ignore-next-line complexity
          (value) => {
            if (mutation.isPending || mutation.error?.kind === "unknown-outcome") return
            const legalEntityId = requiredText(value.legalEntityId)
            const startsOn = requiredText(value.startsOn)
            const endsOn = requiredText(value.endsOn)
            if (
              legalEntityId === null || !uuidPattern.test(legalEntityId) ||
              startsOn === null || !isIsoDate(startsOn) ||
              endsOn === null || !isIsoDate(endsOn) || startsOn > endsOn
            ) {
              setInvalid(true)
              legalEntityInput?.focus()
              return
            }
            setInvalid(false)
            mutation.mutate({ legalEntityId, startsOn, endsOn })
          }
        }
      >
        <FormField
          label="Legal entity ID"
          required
          error={invalid() || mutation.error?.kind === "validation"
            ? "Enter a valid legal entity UUID and an ordered ISO date range."
            : undefined}
        >
          {(fieldProps) => (
            <Input
              {...fieldProps}
              ref={(element) => legalEntityInput = element}
              name="legalEntityId"
              autocomplete="off"
              spellcheck={false}
              required
              disabled={mutation.isPending}
            />
          )}
        </FormField>
        <FormField label="Starts on" required>
          {(fieldProps) => (
            <Input
              {...fieldProps}
              name="startsOn"
              type="date"
              required
              disabled={mutation.isPending}
            />
          )}
        </FormField>
        <FormField label="Ends on" required>
          {(fieldProps) => (
            <Input
              {...fieldProps}
              name="endsOn"
              type="date"
              required
              disabled={mutation.isPending}
            />
          )}
        </FormField>
        <CommandFeedback
          error={mutation.error}
          pending={mutation.isPending}
          success={mutation.isSuccess}
          successMessage="Accounting period opened."
          area="Finance"
          reload={props.reload}
          reset={() => mutation.reset()}
        />
        <Button
          variant="primary"
          type="submit"
          loading={mutation.isPending}
          disabled={mutation.error?.kind === "unknown-outcome"}
        >
          Open period
        </Button>
      </Form>
    </Dialog>
  )
}

function ClosePeriodDialog(props: { period: AccountingPeriod; reload: () => Promise<unknown> }) {
  const scope = useContext(ApiRuntime)
  const [open, setOpen] = createSignal(false)
  const mutation = createClosePeriodMutation(scope, props.period.id, () => {
    setOpen(false)
    void props.reload()
  })

  return (
    <Dialog
      open={open()}
      onOpenChange={createDialogOpenChange(mutation, setOpen)}
      trigger={<span>Close</span>}
      triggerVariant="danger"
      title="Close accounting period"
      description={`Close ${props.period.startsOn} through ${props.period.endsOn}? Closing is terminal and pending financial operations will be rejected by the backend.`}
    >
      <Form
        class={layout.stack}
        onSubmit={() => {
          if (mutation.isPending || mutation.error?.kind === "unknown-outcome") return
          mutation.mutate({ legalEntityId: props.period.legalEntityId })
        }}
      >
        <p>
          This command creates an immutable lifecycle transition for period{" "}
          <span class={layout.code}>
            {props.period.id}
          </span>.
        </p>
        <CommandFeedback
          error={mutation.error}
          pending={mutation.isPending}
          success={mutation.isSuccess}
          successMessage="Accounting period closed."
          area="Finance"
          reload={props.reload}
          reset={() => mutation.reset()}
        />
        <Button
          variant="danger"
          type="submit"
          loading={mutation.isPending}
          disabled={mutation.error?.kind === "unknown-outcome"}
        >
          Confirm close
        </Button>
      </Form>
    </Dialog>
  )
}

// Fallow: this dialog intentionally owns the complete guarded Accounting posting flow.
// fallow-ignore-next-line complexity
function PostJournalDialog(props: {
  accounts: () => readonly Account[]
  reload: () => Promise<unknown>
}) {
  const scope = useContext(ApiRuntime)
  const [open, setOpen] = createSignal(false)
  const [invalid, setInvalid] = createSignal(false)
  const [lineIndexes, setLineIndexes] = createSignal([0, 1])
  const mutation = createPostJournalMutation(scope, () => {
    setOpen(false)
    void props.reload()
  })
  let referenceInput: HTMLInputElement | undefined

  return (
    <Dialog
      open={open()}
      onOpenChange={createDialogOpenChange(
        mutation,
        setOpen,
        setInvalid,
        () => setLineIndexes([0, 1]),
      )}
      trigger={<span>Post journal</span>}
      triggerVariant="secondary"
      title="Post journal"
      description="Submit a balanced, exact two-decimal journal. The backend rechecks account ownership, authorization, and financial policy before accepting it."
    >
      <Show
        when={props.accounts().length >= 2}
        fallback={
          <p role="status">
            No two tenant-scoped accounts are available for a journal. Create the required accounts
            before posting.
          </p>
        }
      >
        <Form
          class={layout.stack}
          onSubmit={
            // Fallow: this form intentionally keeps balanced journal validation at the UI boundary.
            // fallow-ignore-next-line complexity
            (value, event) => {
              if (mutation.isPending || mutation.error?.kind === "unknown-outcome") return
              const reference = requiredText(value.reference)
              const form = new FormData(event.currentTarget as HTMLFormElement)
              const lines = lineIndexes().flatMap((index) => {
                const accountId = requiredText(form.get(`accountId-${index}`))
                const debit = requiredText(form.get(`debit-${index}`))
                const credit = requiredText(form.get(`credit-${index}`))
                if (accountId === null && debit === null && credit === null) return []
                return [{ accountId, debit, credit }]
              })
              // Fallow: exact-line validation intentionally remains adjacent to journal submission.
              // fallow-ignore-next-line complexity
              const validLines = lines.length >= 2 && lines.every((line) => {
                if (
                  line.accountId === null || !uuidPattern.test(line.accountId) ||
                  line.debit === null || !moneyPattern.test(line.debit) ||
                  line.credit === null || !moneyPattern.test(line.credit)
                ) return false
                const debit = toMinor(line.debit)
                const credit = toMinor(line.credit)
                return (debit > 0n) !== (credit > 0n)
              })
              const balanced = validLines && lines.reduce(
                (total, line) => ({
                  debit: total.debit + toMinor(line.debit!),
                  credit: total.credit + toMinor(line.credit!),
                }),
                { debit: 0n, credit: 0n },
              )
              if (
                reference === null ||
                !validLines ||
                balanced === false ||
                balanced.debit !== balanced.credit
              ) {
                setInvalid(true)
                referenceInput?.focus()
                return
              }
              setInvalid(false)
              mutation.mutate({
                reference,
                lines: lines.map((line) => ({
                  accountId: line.accountId!,
                  debit: line.debit!,
                  credit: line.credit!,
                })),
              })
            }
          }
        >
          <FormField
            label="Reference"
            required
            error={invalid() || mutation.error?.kind === "validation"
              ? "Enter a reference and at least two balanced lines with exact amounts."
              : undefined}
          >
            {(fieldProps) => (
              <Input
                {...fieldProps}
                ref={(element) => referenceInput = element}
                name="reference"
                autocomplete="off"
                required
                disabled={mutation.isPending}
              />
            )}
          </FormField>
          <div class={layout.stack}>
            <div class={layout.row}>
              <h3>Journal lines</h3>
              <Button
                type="button"
                onClick={() =>
                  setLineIndexes((current) => [...current, Math.max(...current, -1) + 1])}
                disabled={mutation.isPending}
              >
                Add line
              </Button>
            </div>
            <For each={lineIndexes()}>
              {(index, position) => (
                <div class={[surface(), layout.stack]}>
                  <div class={layout.row}>
                    <h4>Line {position() + 1}</h4>
                    <Show when={lineIndexes().length > 2}>
                      <Button
                        type="button"
                        onClick={() =>
                          setLineIndexes((current) =>
                            current.filter((_, item) => item !== position())
                          )}
                        disabled={mutation.isPending}
                      >
                        Remove line
                      </Button>
                    </Show>
                  </div>
                  <FormField label="Account" required>
                    {(fieldProps) => (
                      <Select
                        {...fieldProps}
                        name={`accountId-${index}`}
                        options={props.accounts().map((account) => ({
                          value: account.id,
                          label: `${account.code} · ${account.name}`,
                        }))}
                        placeholder="Choose account"
                        required
                        disabled={mutation.isPending}
                      />
                    )}
                  </FormField>
                  <FormField
                    label="Debit"
                    required
                    helperText="Use an exact amount such as 125.00."
                  >
                    {(fieldProps) => (
                      <Input
                        {...fieldProps}
                        name={`debit-${index}`}
                        inputmode="decimal"
                        autocomplete="off"
                        required
                        disabled={mutation.isPending}
                      />
                    )}
                  </FormField>
                  <FormField
                    label="Credit"
                    required
                    helperText="Use an exact amount such as 125.00."
                  >
                    {(fieldProps) => (
                      <Input
                        {...fieldProps}
                        name={`credit-${index}`}
                        inputmode="decimal"
                        autocomplete="off"
                        required
                        disabled={mutation.isPending}
                      />
                    )}
                  </FormField>
                </div>
              )}
            </For>
          </div>
          <p class={layout.muted}>
            Exactly one side of each line must be positive, and total debits must equal total
            credits.
          </p>
          <CommandFeedback
            error={mutation.error}
            pending={mutation.isPending}
            success={mutation.isSuccess}
            successMessage="Journal posted."
            area="Finance"
            reload={props.reload}
            reset={() => mutation.reset()}
          />
          <Button
            variant="primary"
            type="submit"
            loading={mutation.isPending}
            disabled={mutation.error?.kind === "unknown-outcome"}
          >
            Post journal
          </Button>
        </Form>
      </Show>
    </Dialog>
  )
}

function AccountingFilters(props: {
  legalEntityId?: string
  accountType?: AccountType
  periodStatus?: AccountingPeriodStatus
  journalStatus?: JournalStatus
}) {
  const navigate = useNavigate()
  return (
    <Form
      class={layout.row}
      aria-label="Filter Accounting records"
      onSubmit={
        // Fallow: this filter form intentionally validates and serializes several optional fields together.
        // fallow-ignore-next-line complexity
        (value) => {
          const query = new URLSearchParams()
          const legalEntityId = requiredText(value.legalEntityId)
          const accountType = requiredText(value.accountType)
          const periodStatus = requiredText(value.periodStatus)
          const journalStatus = requiredText(value.journalStatus)
          if (legalEntityId !== null && uuidPattern.test(legalEntityId)) {
            query.set("legalEntityId", legalEntityId)
          }
          if (
            accountType !== null &&
            accountTypeOptions.some((option) => option.value === accountType)
          ) {
            query.set("accountType", accountType)
          }
          if (
            periodStatus !== null &&
            periodStatusOptions.some((option) => option.value === periodStatus)
          ) {
            query.set("periodStatus", periodStatus)
          }
          if (
            journalStatus !== null &&
            journalStatusOptions.some((option) => option.value === journalStatus)
          ) {
            query.set("journalStatus", journalStatus)
          }
          navigate(query.size === 0 ? "/accounting" : `/accounting?${query}`)
        }
      }
    >
      <FormField label="Legal entity ID">
        {(fieldProps) => (
          <Input
            {...fieldProps}
            name="legalEntityId"
            value={props.legalEntityId ?? ""}
            autocomplete="off"
            spellcheck={false}
            placeholder="All legal entities"
          />
        )}
      </FormField>
      <FormField label="Account type">
        {(fieldProps) => (
          <Select
            {...fieldProps}
            name="accountType"
            options={accountTypeOptions}
            value={props.accountType ?? ""}
            placeholder="All account types"
          />
        )}
      </FormField>
      <FormField label="Period status">
        {(fieldProps) => (
          <Select
            {...fieldProps}
            name="periodStatus"
            options={periodStatusOptions}
            value={props.periodStatus ?? ""}
            placeholder="All periods"
          />
        )}
      </FormField>
      <FormField label="Journal status">
        {(fieldProps) => (
          <Select
            {...fieldProps}
            name="journalStatus"
            options={journalStatusOptions}
            value={props.journalStatus ?? ""}
            placeholder="All journals"
          />
        )}
      </FormField>
      <Button type="submit">Apply filters</Button>
      <a href="/accounting">Clear filters</a>
    </Form>
  )
}

function ConfigurationTable(props: { configurations: readonly AccountingConfiguration[] }) {
  return (
    <DataTable
      surface={false}
      caption="Legal-entity configurations · first 200 matching records"
      rows={props.configurations}
      columns={[
        {
          id: "legalEntityId",
          header: "Legal entity",
          cell: (configuration) => <span class={layout.code}>{configuration.legalEntityId}</span>,
        },
        {
          id: "baseCurrency",
          header: "Currency",
          cell: (configuration) => <span class={layout.code}>{configuration.baseCurrency}</span>,
        },
        { id: "precision", header: "Precision", cell: (configuration) => configuration.precision },
        {
          id: "fiscalYearStartMonth",
          header: "Fiscal start",
          cell: (configuration) => configuration.fiscalYearStartMonth,
        },
        {
          id: "postingEnabled",
          header: "Posting",
          cell: (configuration) => (
            <Badge tone={configurationTone(configuration)}>
              {configuration.postingEnabled ? "enabled" : "disabled"}
            </Badge>
          ),
        },
        {
          id: "financialEngine",
          header: "Engine",
          cell: (configuration) => configuration.financialEngine,
        },
      ]}
    />
  )
}

function AccountTable(props: { accounts: readonly Account[] }) {
  return (
    <DataTable
      surface={false}
      caption="Chart of accounts · first 200 matching records"
      rows={props.accounts}
      columns={[
        {
          id: "code",
          header: "Code",
          cell: (account) => <span class={layout.code}>{account.code}</span>,
        },
        { id: "name", header: "Name", cell: (account) => account.name },
        {
          id: "type",
          header: "Type",
          cell: (account) => <Badge tone="neutral">{account.type}</Badge>,
        },
        {
          id: "id",
          header: "Account ID",
          cell: (account) => <span class={layout.code}>{account.id}</span>,
        },
      ]}
    />
  )
}

function PeriodTable(props: {
  periods: readonly AccountingPeriod[]
  reload: () => Promise<unknown>
}) {
  return (
    <DataTable
      surface={false}
      caption="Accounting periods · first 200 matching records"
      rows={props.periods}
      columns={[
        {
          id: "id",
          header: "Period ID",
          cell: (period) => <span class={layout.code}>{period.id}</span>,
        },
        {
          id: "legalEntityId",
          header: "Legal entity",
          cell: (period) => <span class={layout.code}>{period.legalEntityId}</span>,
        },
        { id: "startsOn", header: "Starts", cell: (period) => period.startsOn },
        { id: "endsOn", header: "Ends", cell: (period) => period.endsOn },
        {
          id: "status",
          header: "Status",
          cell: (period) => <Badge tone={periodTone(period.status)}>{period.status}</Badge>,
        },
        {
          id: "action",
          header: "Action",
          cell: (period) => (
            <Show
              when={period.status === "open"}
              fallback={<span class={layout.muted}>Closed</span>}
            >
              <ClosePeriodDialog period={period} reload={props.reload} />
            </Show>
          ),
        },
      ]}
    />
  )
}

function RevenuePostingProfileTable(props: { profiles: readonly RevenuePostingProfile[] }) {
  return (
    <DataTable
      surface={false}
      caption="Revenue posting profiles · first 200 matching records"
      rows={props.profiles}
      columns={[
        {
          id: "legalEntityId",
          header: "Legal entity",
          cell: (profile) => <span class={layout.code}>{profile.legalEntityId}</span>,
        },
        {
          id: "receivableAccountId",
          header: "Receivable account",
          cell: (profile) => <span class={layout.code}>{profile.receivableAccountId}</span>,
        },
        {
          id: "revenueAccountId",
          header: "Revenue account",
          cell: (profile) => <span class={layout.code}>{profile.revenueAccountId}</span>,
        },
      ]}
    />
  )
}

function JournalTable(props: { journals: readonly JournalEntry[]; selectedJournalId?: string }) {
  return (
    <DataTable
      surface={false}
      caption="Posted journal history · first 200 matching records"
      rows={props.journals}
      getRowClass={(journal) =>
        journal.id === props.selectedJournalId ? layout.tableRowSelected : undefined}
      columns={[
        {
          id: "id",
          header: "Journal ID",
          cell: (journal) => (
            <a class={layout.code} href={`/accounting/${encodeURIComponent(journal.id)}`}>
              {journal.id}
            </a>
          ),
        },
        { id: "reference", header: "Reference", cell: (journal) => journal.reference },
        {
          id: "status",
          header: "Status",
          cell: (journal) => <Badge tone={journalTone(journal.status)}>{journal.status}</Badge>,
        },
        { id: "postedAt", header: "Posted at", cell: (journal) => journal.postedAt },
        { id: "lines", header: "Lines", cell: (journal) => journal.lines.length },
        {
          id: "action",
          header: "Action",
          cell: (journal) => (
            <a
              href={`/accounting/${encodeURIComponent(journal.id)}`}
              aria-label={`Open journal ${journal.reference}`}
            >
              Open
            </a>
          ),
        },
      ]}
    />
  )
}

function JournalDetail(props: { id: string; journals: readonly JournalEntry[] }) {
  const journal = () => props.journals.find((candidate) => candidate.id === props.id)
  return (
    <section class={layout.stack} aria-labelledby="journal-detail-heading">
      <div class={layout.row}>
        <h2 id="journal-detail-heading">Journal detail</h2>
        <a href="/accounting">Close detail</a>
      </div>
      <Show
        when={journal()}
        keyed
        fallback={
          <div class={layout.stack}>
            <p role="alert">This journal is not present in the current bounded result.</p>
            <a href="/accounting">Return to Accounting</a>
          </div>
        }
      >
        {(entry) => (
          <div class={layout.stack}>
            <dl class={layout.detailList}>
              <div class={layout.detailItem}>
                <dt class={layout.detailTerm}>Journal ID</dt>
                <dd class={[layout.detailValue, layout.code]}>{entry.id}</dd>
              </div>
              <div class={layout.detailItem}>
                <dt class={layout.detailTerm}>Reference</dt>
                <dd class={layout.detailValue}>{entry.reference}</dd>
              </div>
              <div class={layout.detailItem}>
                <dt class={layout.detailTerm}>Status</dt>
                <dd class={layout.detailValue}>
                  <Badge tone={journalTone(entry.status)}>{entry.status}</Badge>
                </dd>
              </div>
              <div class={layout.detailItem}>
                <dt class={layout.detailTerm}>Posted at</dt>
                <dd class={layout.detailValue}>{entry.postedAt}</dd>
              </div>
              <Show when={entry.reversesEntryId}>
                <div class={layout.detailItem}>
                  <dt class={layout.detailTerm}>Reverses entry</dt>
                  <dd class={[layout.detailValue, layout.code]}>{entry.reversesEntryId}</dd>
                </div>
              </Show>
            </dl>
            <section class={[surface(), layout.stack]} aria-labelledby="journal-lines-heading">
              <h3 id="journal-lines-heading">Balanced journal lines</h3>
              <div class={layout.scroll}>
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Account</th>
                      <th scope="col">Debit</th>
                      <th scope="col">Credit</th>
                    </tr>
                  </thead>
                  <tbody>
                    <For each={entry.lines}>
                      {(line) => (
                        <tr>
                          <td class={layout.code}>{line.accountId}</td>
                          <td class={layout.code}>{line.debit}</td>
                          <td class={layout.code}>{line.credit}</td>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}
      </Show>
    </section>
  )
}

function EmptyState(props: { children: JSX.Element }) {
  return <p role="status">{props.children}</p>
}

// Fallow: the Accounting workspace intentionally composes five tenant-scoped read surfaces and commands.
// fallow-ignore-next-line complexity
export function Accounting(props: {
  selectedJournalId?: string
  legalEntityId?: string
  accountType?: AccountType
  periodStatus?: AccountingPeriodStatus
  journalStatus?: JournalStatus
}) {
  const scope = useContext(ApiRuntime)
  const configurations = createAccountingConfigurationsQuery(scope, {
    ...(props.legalEntityId === undefined ? {} : { legalEntityId: props.legalEntityId }),
    limit: 200,
  })
  const accounts = createAccountsQuery(scope, {
    ...(props.accountType === undefined ? {} : { type: props.accountType }),
    limit: 200,
  })
  const periods = createAccountingPeriodsQuery(scope, {
    ...(props.legalEntityId === undefined ? {} : { legalEntityId: props.legalEntityId }),
    ...(props.periodStatus === undefined ? {} : { status: props.periodStatus }),
    limit: 200,
  })
  const profiles = createRevenuePostingProfilesQuery(scope, {
    ...(props.legalEntityId === undefined ? {} : { legalEntityId: props.legalEntityId }),
    limit: 200,
  })
  const journals = createJournalsQuery(scope, {
    ...(props.journalStatus === undefined ? {} : { status: props.journalStatus }),
    limit: 200,
  })
  const reload = () =>
    Promise.all([
      configurations.refetch(),
      accounts.refetch(),
      periods.refetch(),
      profiles.refetch(),
      journals.refetch(),
    ])

  return (
    <EntityWorkspace
      title="Accounting"
      description={
        <p>
          Tenant-scoped configuration, chart-of-accounts, period, revenue-mapping, and
          posted-journal evidence. Financial engine cutover and posting authority remain
          backend-gated.
        </p>
      }
      headerActions={
        <div class={layout.row}>
          <ConfigureLegalEntityDialog reload={reload} />
          <CreateAccountDialog reload={reload} />
          <ConfigureRevenuePostingDialog accounts={() => accounts.data ?? []} reload={reload} />
          <OpenPeriodDialog reload={reload} />
          <PostJournalDialog accounts={() => accounts.data ?? []} reload={reload} />
          <Button type="button" onClick={() => void reload()}>Reload Finance</Button>
        </div>
      }
      toolbar={
        <AccountingFilters
          legalEntityId={props.legalEntityId}
          accountType={props.accountType}
          periodStatus={props.periodStatus}
          journalStatus={props.journalStatus}
        />
      }
      aside={props.selectedJournalId
        ? <JournalDetail id={props.selectedJournalId} journals={journals.data ?? []} />
        : undefined}
    >
      <section
        class={[surface(), layout.stack]}
        aria-labelledby="accounting-configurations-heading"
      >
        <div class={layout.row}>
          <div class={layout.stack}>
            <h2 id="accounting-configurations-heading">Legal-entity configuration</h2>
            <p>
              Configuration is created once per legal entity; PostgreSQL is the active baseline
              engine.
            </p>
          </div>
        </div>
        <QueryBoundary label="configurations" retry={() => configurations.refetch()}>
          <Show
            when={(configurations.data ?? []).length > 0}
            fallback={
              <EmptyState>No Accounting configurations match the current filter.</EmptyState>
            }
          >
            <ConfigurationTable configurations={configurations.data ?? []} />
          </Show>
        </QueryBoundary>
      </section>
      <section class={[surface(), layout.stack]} aria-labelledby="accounting-accounts-heading">
        <div class={layout.row}>
          <div class={layout.stack}>
            <h2 id="accounting-accounts-heading">Chart of accounts</h2>
            <p>Account records are tenant-scoped and normalized by the Accounting service.</p>
          </div>
        </div>
        <QueryBoundary label="accounts" retry={() => accounts.refetch()}>
          <Show
            when={(accounts.data ?? []).length > 0}
            fallback={<EmptyState>No accounts match the current filter.</EmptyState>}
          >
            <AccountTable accounts={accounts.data ?? []} />
          </Show>
        </QueryBoundary>
      </section>
      <section class={[surface(), layout.stack]} aria-labelledby="accounting-periods-heading">
        <h2 id="accounting-periods-heading">Accounting periods</h2>
        <QueryBoundary label="periods" retry={() => periods.refetch()}>
          <Show
            when={(periods.data ?? []).length > 0}
            fallback={<EmptyState>No accounting periods match the current filter.</EmptyState>}
          >
            <PeriodTable periods={periods.data ?? []} reload={reload} />
          </Show>
        </QueryBoundary>
      </section>
      <section class={[surface(), layout.stack]} aria-labelledby="accounting-profiles-heading">
        <h2 id="accounting-profiles-heading">Revenue posting profiles</h2>
        <p>
          Profiles identify the owner-controlled receivable and revenue accounts for each legal
          entity.
        </p>
        <QueryBoundary label="revenue posting profiles" retry={() => profiles.refetch()}>
          <Show
            when={(profiles.data ?? []).length > 0}
            fallback={
              <EmptyState>No revenue posting profiles match the current filter.</EmptyState>
            }
          >
            <RevenuePostingProfileTable profiles={profiles.data ?? []} />
          </Show>
        </QueryBoundary>
      </section>
      <section class={[surface(), layout.stack]} aria-labelledby="accounting-journals-heading">
        <div class={layout.row}>
          <div class={layout.stack}>
            <h2 id="accounting-journals-heading">Posted journal history</h2>
            <p>
              History is read-only here; posting and reversal commands remain backend-authorized.
            </p>
          </div>
        </div>
        <QueryBoundary label="journal history" retry={() => journals.refetch()}>
          <Show
            when={(journals.data ?? []).length > 0}
            fallback={
              <EmptyState>No posted or reversed journals match the current filter.</EmptyState>
            }
          >
            <JournalTable
              journals={journals.data ?? []}
              selectedJournalId={props.selectedJournalId}
            />
          </Show>
        </QueryBoundary>
      </section>
    </EntityWorkspace>
  )
}

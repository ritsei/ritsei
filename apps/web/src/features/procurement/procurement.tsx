import { useNavigate } from "@solidjs/router"
import { createSignal, For, Show, untrack, useContext } from "solid-js"
import type {
  GoodsReceipt,
  PurchaseOrder,
  PurchaseOrderStatus,
  SupplierAccount,
} from "../../shared/contracts/generated/procurement.ts"
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
  createCancelPurchaseOrderMutation,
  createConfirmPurchaseOrderMutation,
  createPurchaseOrderMutation,
  createPurchaseOrderQuery,
  createPurchaseOrdersQuery,
  createPurchaseReceiptsQuery,
  createReceivePurchaseOrderMutation,
  createSupplierAccountMutation,
  createSupplierAccountsQuery,
} from "./queries.ts"

const statusOptions = [
  { value: "draft", label: "Draft" },
  { value: "confirmed", label: "Confirmed" },
  { value: "cancelled", label: "Cancelled" },
] as const
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const quantityPattern = /^[1-9]\d*$/
const moneyPattern = /^\d+\.\d{2}$/

const requiredText = (value: FormDataEntryValue | null | undefined): string | null =>
  typeof value === "string" && /\S/.test(value) ? value.trim() : null

// Fallow: procurement statuses intentionally use the same small UI mapping as Inventory.
// fallow-ignore-next-line code-duplication
const statusTone = (status: PurchaseOrderStatus): "neutral" | "success" | "warning" =>
  status === "confirmed" ? "success" : status === "cancelled" ? "warning" : "neutral"

// Fallow: this dialog intentionally combines supplier validation and guarded procurement commands.
// fallow-ignore-next-line complexity
function CreateSupplierAccountDialog(props: { reload: () => Promise<unknown> }) {
  const scope = useContext(ApiRuntime)
  const [open, setOpen] = createSignal(false)
  const [invalid, setInvalid] = createSignal(false)
  const mutation = createSupplierAccountMutation(scope, () => {
    setOpen(false)
    void props.reload()
  })
  let relationshipInput: HTMLInputElement | undefined
  return (
    <Dialog
      open={open()}
      onOpenChange={createDialogOpenChange(mutation, setOpen, setInvalid)}
      trigger={<span>Create supplier account</span>}
      triggerVariant="primary"
      title="Create supplier account"
      description="Create the Procurement-owned tenant identity for an active Party supplier relationship."
    >
      <Form
        class={layout.stack}
        onSubmit={
          // Fallow: this form intentionally keeps supplier-account validation at the UI boundary.
          // fallow-ignore-next-line complexity
          (value) => {
            if (mutation.isPending || mutation.error?.kind === "unknown-outcome") return
            const supplierRelationshipId = requiredText(value.supplierRelationshipId)
            if (supplierRelationshipId === null || !uuidPattern.test(supplierRelationshipId)) {
              setInvalid(true)
              relationshipInput?.focus()
              return
            }
            setInvalid(false)
            mutation.mutate({ supplierRelationshipId })
          }
        }
      >
        <p>
          Create the supplier relationship in <a href="/parties">Parties</a>{" "}
          first. Procurement does not create or rename Party records.
        </p>
        <FormField
          label="Supplier relationship ID"
          required
          helperText="Copy the UUID from the supplier relationship in Party detail."
          error={invalid() || mutation.error?.kind === "validation"
            ? "Enter a valid supplier relationship UUID."
            : undefined}
        >
          {(fieldProps) => (
            <Input
              {...fieldProps}
              ref={(element) => relationshipInput = element}
              name="supplierRelationshipId"
              autocomplete="off"
              spellcheck={false}
              required
              disabled={mutation.isPending}
            />
          )}
        </FormField>
        <CommandFeedback
          error={mutation.error}
          pending={mutation.isPending}
          success={mutation.isSuccess}
          successMessage="Supplier account created."
          reload={props.reload}
          reset={() => mutation.reset()}
        />
        <Button
          variant="primary"
          type="submit"
          loading={mutation.isPending}
          disabled={mutation.error?.kind === "unknown-outcome"}
        >
          Create supplier account
        </Button>
      </Form>
    </Dialog>
  )
}

function CreatePurchaseOrderDialog(props: {
  supplierAccounts: () => readonly SupplierAccount[]
  reload: () => Promise<unknown>
}) {
  const scope = useContext(ApiRuntime)
  const navigate = useNavigate()
  const [open, setOpen] = createSignal(false)
  const [invalid, setInvalid] = createSignal(false)
  const [lineIndexes, setLineIndexes] = createSignal([0])
  const mutation = createPurchaseOrderMutation(scope, (order) => {
    setOpen(false)
    navigate(`/procurement/${encodeURIComponent(order.id)}`)
  })
  return (
    <Dialog
      open={open()}
      onOpenChange={createDialogOpenChange(
        mutation,
        setOpen,
        setInvalid,
        () => setLineIndexes([0]),
      )}
      trigger={<span>Create purchase order</span>}
      triggerVariant="primary"
      title="Create purchase order"
      description="Create a draft purchase order. Total is derived from the submitted quantities and exact two-decimal unit prices."
    >
      <Show
        when={props.supplierAccounts().length > 0}
        fallback={
          <p role="status">
            No supplier accounts are available in this tenant. Create one before creating a purchase
            order.
          </p>
        }
      >
        <Form
          class={layout.stack}
          onSubmit={
            // Fallow: this form intentionally keeps purchase-order line validation at the UI boundary.
            // fallow-ignore-next-line complexity
            (value, event) => {
              if (mutation.isPending || mutation.error?.kind === "unknown-outcome") return
              const supplierAccountId = requiredText(value.supplierAccountId)
              const form = new FormData(event.currentTarget as HTMLFormElement)
              const lines = lineIndexes().flatMap((index) => {
                const itemId = requiredText(form.get(`itemId-${index}`))
                const quantity = requiredText(form.get(`quantity-${index}`))
                const unitPrice = requiredText(form.get(`unitPrice-${index}`))
                if (itemId === null && quantity === null && unitPrice === null) return []
                return [{ itemId, quantity, unitPrice }]
              })
              // Fallow: purchase-order line validation intentionally remains adjacent to submission.
              // fallow-ignore-next-line complexity
              const validLines = lines.every((line) =>
                line.itemId !== null && uuidPattern.test(line.itemId) &&
                line.quantity !== null && quantityPattern.test(line.quantity) &&
                line.unitPrice !== null && moneyPattern.test(line.unitPrice)
              )
              if (
                supplierAccountId === null || !uuidPattern.test(supplierAccountId) ||
                lines.length === 0 || !validLines
              ) {
                setInvalid(true)
                return
              }
              setInvalid(false)
              mutation.mutate({
                supplierAccountId,
                lines: lines.map((line) => ({
                  itemId: line.itemId!,
                  quantity: line.quantity!,
                  unitPrice: line.unitPrice!,
                })),
              })
            }
          }
        >
          <FormField
            label="Supplier account"
            required
            error={invalid() ? "Choose a supplier account and complete every line." : undefined}
          >
            {(fieldProps) => (
              <Select
                {...fieldProps}
                name="supplierAccountId"
                options={props.supplierAccounts().map((account) => ({
                  value: account.id,
                  label: `${account.id} · relationship ${account.supplierRelationshipId}`,
                }))}
                placeholder="Choose supplier account"
                required
                disabled={mutation.isPending}
              />
            )}
          </FormField>
          <div class={layout.stack}>
            <div class={layout.row}>
              <h3>Order lines</h3>
              <Button
                type="button"
                onClick={() => setLineIndexes([...lineIndexes(), lineIndexes().length])}
                disabled={mutation.isPending}
              >
                Add line
              </Button>
            </div>
            <For each={lineIndexes()}>
              {(index, position) => (
                <fieldset class={[surface(), layout.stack]}>
                  <legend>Line {position() + 1}</legend>
                  <FormField
                    label="Item ID"
                    required
                    helperText="Inventory identity remains authoritative outside Procurement."
                  >
                    {(fieldProps) => (
                      <Input
                        {...fieldProps}
                        name={`itemId-${index}`}
                        autocomplete="off"
                        spellcheck={false}
                        required
                        disabled={mutation.isPending}
                      />
                    )}
                  </FormField>
                  <FormField label="Quantity" required>
                    {(fieldProps) => (
                      <Input
                        {...fieldProps}
                        name={`quantity-${index}`}
                        inputmode="numeric"
                        autocomplete="off"
                        required
                        disabled={mutation.isPending}
                      />
                    )}
                  </FormField>
                  <FormField
                    label="Unit price"
                    required
                    helperText="Exact major amount, for example 12.50."
                  >
                    {(fieldProps) => (
                      <Input
                        {...fieldProps}
                        name={`unitPrice-${index}`}
                        inputmode="decimal"
                        autocomplete="off"
                        required
                        disabled={mutation.isPending}
                      />
                    )}
                  </FormField>
                  <Show when={lineIndexes().length > 1}>
                    <Button
                      type="button"
                      onClick={() =>
                        setLineIndexes(lineIndexes().filter((lineIndex) => lineIndex !== index))}
                      disabled={mutation.isPending}
                    >
                      Remove line
                    </Button>
                  </Show>
                </fieldset>
              )}
            </For>
          </div>
          <Show when={invalid()}>
            <p role="alert">Complete a supplier account and every line with valid values.</p>
          </Show>
          <CommandFeedback
            error={mutation.error}
            pending={mutation.isPending}
            success={mutation.isSuccess}
            successMessage="Purchase order created."
            reload={props.reload}
            reset={() => mutation.reset()}
          />
          <Button
            variant="primary"
            type="submit"
            loading={mutation.isPending}
            disabled={mutation.error?.kind === "unknown-outcome"}
          >
            Create purchase order
          </Button>
        </Form>
      </Show>
    </Dialog>
  )
}

function ConfirmPurchaseOrderDialog(props: {
  order: PurchaseOrder
  reload: () => Promise<unknown>
}) {
  const scope = useContext(ApiRuntime)
  const [open, setOpen] = createSignal(false)
  const mutation = createConfirmPurchaseOrderMutation(scope, () => setOpen(false))
  const [invalid, setInvalid] = createSignal(false)
  return (
    <Dialog
      open={open()}
      onOpenChange={createDialogOpenChange(mutation, setOpen, setInvalid)}
      trigger={<span>Confirm purchase order</span>}
      triggerVariant="primary"
      title="Confirm purchase order"
      description="Confirmation freezes the purchase-order snapshot and publishes the owner-controlled confirmation fact. It is not supplier acceptance or receipt."
    >
      <Form
        class={layout.stack}
        onSubmit={
          // Fallow: this form intentionally keeps purchase-order confirmation validation at the UI boundary.
          // fallow-ignore-next-line complexity
          (value) => {
            if (mutation.isPending || mutation.error?.kind === "unknown-outcome") return
            const idempotencyKey = requiredText(value.idempotencyKey)
            if (idempotencyKey === null) {
              setInvalid(true)
              return
            }
            setInvalid(false)
            mutation.mutate({ id: props.order.id, idempotencyKey })
          }
        }
      >
        <FormField
          label="Confirmation key"
          required
          helperText="Reuse this key if the response is lost; do not invent a new key for a retry."
          error={invalid() ? "Enter a nonblank confirmation key." : undefined}
        >
          {(fieldProps) => (
            <Input
              {...fieldProps}
              name="idempotencyKey"
              value={`confirm:${props.order.id}`}
              autocomplete="off"
              required
              disabled={mutation.isPending}
            />
          )}
        </FormField>
        <CommandFeedback
          error={mutation.error}
          pending={mutation.isPending}
          success={mutation.isSuccess}
          successMessage="Purchase order confirmed."
          reload={props.reload}
          reset={() => mutation.reset()}
        />
        <Button
          variant="primary"
          type="submit"
          loading={mutation.isPending}
          disabled={mutation.error?.kind === "unknown-outcome"}
        >
          Confirm purchase order
        </Button>
      </Form>
    </Dialog>
  )
}

function CancelPurchaseOrderDialog(props: {
  order: PurchaseOrder
  reload: () => Promise<unknown>
}) {
  const scope = useContext(ApiRuntime)
  const [open, setOpen] = createSignal(false)
  const mutation = createCancelPurchaseOrderMutation(scope, () => setOpen(false))
  return (
    <Dialog
      open={open()}
      onOpenChange={createDialogOpenChange(mutation, setOpen)}
      trigger={<span>Cancel purchase order</span>}
      triggerVariant="danger"
      title="Cancel purchase order"
      description="Cancellation is terminal and does not reverse receipts, stock, supplier acknowledgement, or financial facts."
    >
      <div class={layout.stack}>
        <p>Only a confirmed order without receipt evidence can be cancelled.</p>
        <CommandFeedback
          error={mutation.error}
          pending={mutation.isPending}
          success={mutation.isSuccess}
          successMessage="Purchase order cancelled."
          reload={props.reload}
          reset={() => mutation.reset()}
        />
        <Button
          variant="danger"
          type="button"
          loading={mutation.isPending}
          disabled={mutation.error?.kind === "unknown-outcome"}
          onClick={() => mutation.mutate({ id: props.order.id })}
        >
          Cancel purchase order
        </Button>
      </div>
    </Dialog>
  )
}

function ReceivePurchaseOrderDialog(props: {
  order: PurchaseOrder
  reload: () => Promise<unknown>
}) {
  const scope = useContext(ApiRuntime)
  const [open, setOpen] = createSignal(false)
  const [invalid, setInvalid] = createSignal(false)
  const mutation = createReceivePurchaseOrderMutation(scope, () => setOpen(false))
  return (
    <Dialog
      open={open()}
      onOpenChange={createDialogOpenChange(mutation, setOpen, setInvalid)}
      trigger={<span>Receive goods</span>}
      triggerVariant="primary"
      title="Receive goods"
      description="Record bounded receipt evidence and invoke Inventory's authoritative stock receipt. Leave a line blank when it is not part of this partial receipt."
    >
      <Form
        class={layout.stack}
        onSubmit={
          // Fallow: this form intentionally keeps receipt evidence validation at the UI boundary.
          // fallow-ignore-next-line complexity
          (value, event) => {
            if (mutation.isPending || mutation.error?.kind === "unknown-outcome") return
            const warehouseId = requiredText(value.warehouseId)
            const idempotencyKey = requiredText(value.idempotencyKey)
            const form = new FormData(event.currentTarget as HTMLFormElement)
            const lines = props.order.lines.flatMap((line) => {
              const quantity = requiredText(form.get(`receipt-quantity-${line.id}`))
              return quantity === null ? [] : [{ purchaseOrderLineId: line.id, quantity }]
            })
            const valid = warehouseId !== null && uuidPattern.test(warehouseId) &&
              idempotencyKey !== null && lines.length > 0 &&
              lines.every((line) => quantityPattern.test(line.quantity))
            if (!valid) {
              setInvalid(true)
              return
            }
            setInvalid(false)
            mutation.mutate({
              id: props.order.id,
              warehouseId,
              idempotencyKey,
              lines,
            })
          }
        }
      >
        <FormField
          label="Warehouse ID"
          required
          helperText="Use a tenant-local warehouse aligned with the supplier account legal entity."
        >
          {(fieldProps) => (
            <Input
              {...fieldProps}
              name="warehouseId"
              autocomplete="off"
              spellcheck={false}
              required
              disabled={mutation.isPending}
            />
          )}
        </FormField>
        <FormField
          label="Receipt idempotency key"
          required
          helperText="Use a new key for a new receipt; reuse it only to retry the same receipt."
        >
          {(fieldProps) => (
            <Input
              {...fieldProps}
              name="idempotencyKey"
              value={`receipt:${props.order.id}`}
              autocomplete="off"
              required
              disabled={mutation.isPending}
            />
          )}
        </FormField>
        <fieldset class={layout.stack}>
          <legend>Receipt quantities</legend>
          <For each={props.order.lines}>
            {(line) => (
              <FormField
                label={`Item ${line.itemId} · ordered ${line.quantity}`}
                helperText={`Purchase-order line ${line.id}`}
              >
                {(fieldProps) => (
                  <Input
                    {...fieldProps}
                    name={`receipt-quantity-${line.id}`}
                    inputmode="numeric"
                    autocomplete="off"
                    disabled={mutation.isPending}
                  />
                )}
              </FormField>
            )}
          </For>
        </fieldset>
        <Show when={invalid()}>
          <p role="alert">Enter a valid warehouse, key, and at least one positive quantity.</p>
        </Show>
        <CommandFeedback
          error={mutation.error}
          pending={mutation.isPending}
          success={mutation.isSuccess}
          successMessage="Goods receipt recorded."
          reload={props.reload}
          reset={() => mutation.reset()}
        />
        <Button
          variant="primary"
          type="submit"
          loading={mutation.isPending}
          disabled={mutation.error?.kind === "unknown-outcome"}
        >
          Receive goods
        </Button>
      </Form>
    </Dialog>
  )
}

function SupplierAccountsTable(props: { accounts: readonly SupplierAccount[] }) {
  return (
    <DataTable
      surface={false}
      caption="Supplier accounts · maximum 200 records"
      rows={props.accounts}
      columns={[
        {
          id: "id",
          header: "Account ID",
          cell: (account) => <span class={layout.code}>{account.id}</span>,
        },
        {
          id: "supplierRelationshipId",
          header: "Supplier relationship",
          cell: (account) => <span class={layout.code}>{account.supplierRelationshipId}</span>,
        },
        {
          id: "partyId",
          header: "Party",
          cell: (account) => <span class={layout.code}>{account.partyId}</span>,
        },
        {
          id: "legalEntityId",
          header: "Legal entity",
          cell: (account) => <span class={layout.code}>{account.legalEntityId}</span>,
        },
      ]}
    />
  )
}

function PurchaseOrderTable(props: {
  orders: readonly PurchaseOrder[]
  selectedPurchaseOrderId?: string
}) {
  return (
    <DataTable
      surface={false}
      caption="Purchase orders · first 200 matching records"
      rows={props.orders}
      getRowClass={(order) =>
        order.id === props.selectedPurchaseOrderId ? layout.tableRowSelected : undefined}
      columns={[
        {
          id: "id",
          header: "Purchase order",
          cell: (order) => (
            <a class={layout.code} href={`/procurement/${encodeURIComponent(order.id)}`}>
              {order.id}
            </a>
          ),
        },
        {
          id: "supplierAccountId",
          header: "Supplier account",
          cell: (order) => <span class={layout.code}>{order.supplierAccountId}</span>,
        },
        {
          id: "status",
          header: "Status",
          cell: (order) => <Badge tone={statusTone(order.status)}>{order.status}</Badge>,
        },
        {
          id: "total",
          header: "Total",
          cell: (order) => <span class={layout.code}>{order.total}</span>,
        },
        { id: "lines", header: "Lines", cell: (order) => order.lines.length },
        {
          id: "action",
          header: "Action",
          cell: (order) => (
            <a
              href={`/procurement/${encodeURIComponent(order.id)}`}
              aria-label={`Open purchase order ${order.id}`}
            >
              Open
            </a>
          ),
        },
      ]}
    />
  )
}

function ProcurementFilters(props: {
  supplierAccounts: readonly SupplierAccount[]
  supplierAccountId?: string
  status?: PurchaseOrderStatus
}) {
  const navigate = useNavigate()
  return (
    <Form
      class={layout.row}
      aria-label="Filter purchase orders"
      onSubmit={
        // Fallow: this filter form intentionally validates and serializes optional Procurement fields together.
        // fallow-ignore-next-line complexity
        (value) => {
          const query = new URLSearchParams()
          const supplierAccountId = requiredText(value.supplierAccountId)
          const status = value.status
          if (supplierAccountId !== null) query.set("supplierAccountId", supplierAccountId)
          if (status === "draft" || status === "confirmed" || status === "cancelled") {
            query.set("status", status)
          }
          navigate(query.size === 0 ? "/procurement" : `/procurement?${query}`)
        }
      }
    >
      <FormField label="Supplier account">
        {(fieldProps) => (
          <Select
            {...fieldProps}
            name="supplierAccountId"
            options={props.supplierAccounts.map((account) => ({
              value: account.id,
              label: account.id,
            }))}
            placeholder="All supplier accounts"
            value={props.supplierAccountId ?? ""}
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
      <a href="/procurement">Clear filters</a>
    </Form>
  )
}

function PurchaseOrderFacts(props: { order: PurchaseOrder }) {
  return (
    <>
      <dl class={layout.detailList}>
        <div class={layout.detailItem}>
          <dt class={layout.detailTerm}>Purchase order ID</dt>
          <dd class={[layout.detailValue, layout.code]}>{props.order.id}</dd>
        </div>
        <div class={layout.detailItem}>
          <dt class={layout.detailTerm}>Supplier account</dt>
          <dd class={[layout.detailValue, layout.code]}>{props.order.supplierAccountId}</dd>
        </div>
        <div class={layout.detailItem}>
          <dt class={layout.detailTerm}>Status</dt>
          <dd class={layout.detailValue}>
            <Badge tone={statusTone(props.order.status)}>{props.order.status}</Badge>
          </dd>
        </div>
        <div class={layout.detailItem}>
          <dt class={layout.detailTerm}>Total (major amount)</dt>
          <dd class={[layout.detailValue, layout.code]}>{props.order.total}</dd>
        </div>
        <div class={layout.detailItem}>
          <dt class={layout.detailTerm}>Confirmed at</dt>
          <dd class={layout.detailValue}>{props.order.confirmedAt ?? "Not confirmed"}</dd>
        </div>
      </dl>
      <section class={[surface(), layout.stack]} aria-labelledby="purchase-order-lines-heading">
        <h3 id="purchase-order-lines-heading">Immutable order-line snapshot</h3>
        <DataTable
          surface={false}
          caption="Purchase-order line snapshot"
          captionClass="sr-only"
          rows={props.order.lines}
          columns={[
            {
              id: "id",
              header: "Line ID",
              cell: (line) => <span class={layout.code}>{line.id}</span>,
            },
            {
              id: "itemId",
              header: "Item ID",
              cell: (line) => <span class={layout.code}>{line.itemId}</span>,
            },
            {
              id: "quantity",
              header: "Quantity",
              cell: (line) => <span class={layout.code}>{line.quantity}</span>,
            },
            {
              id: "unitPrice",
              header: "Unit price",
              cell: (line) => <span class={layout.code}>{line.unitPrice}</span>,
            },
          ]}
        />
      </section>
    </>
  )
}

function ReceiptTable(props: { receipts: readonly GoodsReceipt[] }) {
  return (
    <section class={[surface(), layout.stack]} aria-labelledby="goods-receipts-heading">
      <h3 id="goods-receipts-heading">Goods receipt evidence</h3>
      <Show when={props.receipts.length > 0} fallback={<p>No receipt evidence recorded.</p>}>
        <DataTable
          surface={false}
          caption="Receipt history · maximum 200 records"
          rows={props.receipts}
          columns={[
            {
              id: "id",
              header: "Receipt ID",
              cell: (receipt) => <span class={layout.code}>{receipt.id}</span>,
            },
            {
              id: "warehouseId",
              header: "Warehouse",
              cell: (receipt) => <span class={layout.code}>{receipt.warehouseId}</span>,
            },
            { id: "receivedAt", header: "Received at", cell: (receipt) => receipt.receivedAt },
            { id: "lines", header: "Lines", cell: (receipt) => receipt.lines.length },
          ]}
        />
      </Show>
    </section>
  )
}

function PurchaseOrderDetail(props: { id: string }) {
  const scope = useContext(ApiRuntime)
  const id = untrack(() => props.id)
  const query = createPurchaseOrderQuery(scope, id)
  const receipts = createPurchaseReceiptsQuery(scope, id, { limit: 200 })
  const reload = () => Promise.all([query.refetch(), receipts.refetch()])
  return (
    <section class={layout.stack} aria-labelledby="purchase-order-detail-heading">
      <div class={layout.row}>
        <h2 id="purchase-order-detail-heading">Purchase order detail</h2>
        <Button type="button" onClick={() => void reload()}>Reload detail</Button>
      </div>
      <QueryBoundary label="purchase order" retry={() => query.refetch()}>
        <Show when={query.data} keyed>
          {(order) => (
            <div class={layout.stack}>
              <PurchaseOrderFacts order={order} />
              <section class={[surface(), layout.stack]} aria-labelledby="order-commands-heading">
                <h3 id="order-commands-heading">Eligible commands</h3>
                <p>
                  Procurement owns the order snapshot. Confirmation, cancellation, and receipt
                  commands are checked again by the backend and never mutate Inventory directly.
                </p>
                <div class={layout.row}>
                  <Show when={order.status === "draft"}>
                    <ConfirmPurchaseOrderDialog order={order} reload={reload} />
                  </Show>
                  <Show when={order.status === "confirmed"}>
                    <ReceivePurchaseOrderDialog order={order} reload={reload} />
                    <CancelPurchaseOrderDialog order={order} reload={reload} />
                  </Show>
                  <Show when={order.status === "cancelled"}>
                    <p class={layout.muted}>This order is terminal and immutable.</p>
                  </Show>
                </div>
              </section>
              <QueryBoundary label="receipt evidence" retry={() => receipts.refetch()}>
                <ReceiptTable receipts={receipts.data} />
              </QueryBoundary>
            </div>
          )}
        </Show>
      </QueryBoundary>
    </section>
  )
}

function SupplierAccountsSection(props: {
  accounts: readonly SupplierAccount[]
  reload: () => Promise<unknown>
}) {
  return (
    <section class={[surface(), layout.stack]} aria-labelledby="supplier-accounts-heading">
      <div class={layout.row}>
        <div class={layout.stack}>
          <h2 id="supplier-accounts-heading">Supplier accounts</h2>
          <p>Tenant-local Procurement identities backed by active Party supplier relationships.</p>
        </div>
        <Button type="button" onClick={() => void props.reload()}>Reload accounts</Button>
      </div>
      <Show
        when={props.accounts.length > 0}
        fallback={<p role="status">No supplier accounts are registered in this tenant.</p>}
      >
        <SupplierAccountsTable accounts={props.accounts} />
      </Show>
    </section>
  )
}

export function Procurement(props: {
  selectedPurchaseOrderId?: string
  supplierAccountId?: string
  status?: PurchaseOrderStatus
}) {
  const scope = useContext(ApiRuntime)
  const supplierAccounts = createSupplierAccountsQuery(scope, { limit: 200 })
  const orders = createPurchaseOrdersQuery(scope, {
    ...(props.supplierAccountId === undefined
      ? {}
      : { supplierAccountId: props.supplierAccountId }),
    ...(props.status === undefined ? {} : { status: props.status }),
    limit: 200,
  })
  return (
    <EntityWorkspace
      title="Procurement"
      description={
        <p>
          Supplier accounts, purchase-order commitments, receipt evidence, and bounded lifecycle
          commands for the active tenant.
        </p>
      }
      headerActions={
        <div class={layout.row}>
          <CreateSupplierAccountDialog reload={() => supplierAccounts.refetch()} />
          <CreatePurchaseOrderDialog
            supplierAccounts={() => supplierAccounts.data}
            reload={() => orders.refetch()}
          />
          <Button type="button" onClick={() => void orders.refetch()}>Reload orders</Button>
        </div>
      }
      toolbar={
        <ProcurementFilters
          supplierAccounts={supplierAccounts.data}
          supplierAccountId={props.supplierAccountId}
          status={props.status}
        />
      }
      aside={props.selectedPurchaseOrderId
        ? <PurchaseOrderDetail id={props.selectedPurchaseOrderId} />
        : undefined}
    >
      <QueryBoundary label="procurement" retry={() => orders.refetch()}>
        <SupplierAccountsSection
          accounts={supplierAccounts.data}
          reload={() => supplierAccounts.refetch()}
        />
        <Show
          when={orders.data.length > 0}
          fallback={<p role="status">No purchase orders match the current filters.</p>}
        >
          <PurchaseOrderTable
            orders={orders.data}
            selectedPurchaseOrderId={props.selectedPurchaseOrderId}
          />
        </Show>
      </QueryBoundary>
    </EntityWorkspace>
  )
}

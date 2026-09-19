import { useNavigate } from "@solidjs/router"
import { createSignal, For, Show, untrack, useContext } from "solid-js"
import type {
  Customer,
  Quotation,
  QuotationStatus,
  SalesOrder,
  SalesOrderStatus,
} from "../../shared/contracts/generated/sales.ts"
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
  createCancelOrderMutation,
  createConfirmOrderMutation,
  createCustomerMutation,
  createCustomerQuery,
  createCustomersQuery,
  createOrderMutation,
  createOrderQuery,
  createOrdersQuery,
  createQuotationMutation,
  createQuotationQuery,
  createQuotationsQuery,
} from "./queries.ts"

const quotationStatusOptions = [
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "accepted", label: "Accepted" },
  { value: "rejected", label: "Rejected" },
  { value: "expired", label: "Expired" },
] as const
const orderStatusOptions = [
  { value: "draft", label: "Draft" },
  { value: "confirmed", label: "Confirmed" },
  { value: "cancelled", label: "Cancelled" },
] as const
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const moneyPattern = /^\d+\.\d{2}$/
const quantityPattern = /^[1-9]\d*$/
const emailPattern = /^[^\s@]+@[^\s@]+$/

const requiredText = (value: FormDataEntryValue | null | undefined): string | null =>
  typeof value === "string" && /\S/.test(value) ? value.trim() : null

const quotationTone = (status: QuotationStatus): "neutral" | "success" | "warning" =>
  status === "accepted"
    ? "success"
    : status === "rejected" || status === "expired"
    ? "warning"
    : "neutral"
const orderTone = (status: SalesOrderStatus): "neutral" | "success" | "warning" =>
  status === "confirmed" ? "success" : status === "cancelled" ? "warning" : "neutral"

function CreateCustomerDialog(props: { reload: () => Promise<unknown> }) {
  const scope = useContext(ApiRuntime)
  const [open, setOpen] = createSignal(false)
  const [invalid, setInvalid] = createSignal(false)
  const mutation = createCustomerMutation(scope, () => {
    setOpen(false)
    void props.reload()
  })
  return (
    <Dialog
      open={open()}
      onOpenChange={createDialogOpenChange(mutation, setOpen, setInvalid)}
      trigger={<span>Create customer</span>}
      triggerVariant="primary"
      title="Create customer"
      description="Create a tenant-local Sales customer master record. Customer identity remains bounded to this tenant."
    >
      <Form
        class={layout.stack}
        onSubmit={
          // Fallow: this form intentionally keeps customer validation at the UI boundary.
          // fallow-ignore-next-line complexity
          (value) => {
            if (mutation.isPending || mutation.error?.kind === "unknown-outcome") return
            const name = requiredText(value.name)
            const email = requiredText(value.email)
            if (name === null || email === null || !emailPattern.test(email)) {
              setInvalid(true)
              return
            }
            setInvalid(false)
            mutation.mutate({ name, email })
          }
        }
      >
        <FormField
          label="Customer name"
          required
          error={invalid() ? "Enter a customer name and a valid email address." : undefined}
        >
          {(fieldProps) => (
            <Input
              {...fieldProps}
              name="name"
              autocomplete="organization"
              required
              disabled={mutation.isPending}
            />
          )}
        </FormField>
        <FormField label="Email" required>
          {(fieldProps) => (
            <Input
              {...fieldProps}
              name="email"
              type="email"
              autocomplete="email"
              required
              disabled={mutation.isPending}
            />
          )}
        </FormField>
        <CommandFeedback
          error={mutation.error}
          pending={mutation.isPending}
          success={mutation.isSuccess}
          successMessage="Customer created."
          reload={props.reload}
          reset={() => mutation.reset()}
        />
        <Button
          variant="primary"
          type="submit"
          loading={mutation.isPending}
          disabled={mutation.error?.kind === "unknown-outcome"}
        >
          Create customer
        </Button>
      </Form>
    </Dialog>
  )
}

// Fallow: quotation and order creation intentionally share the same guarded sales-document shell.
// fallow-ignore-next-line code-duplication
function CreateQuotationDialog(props: {
  customers: () => readonly Customer[]
  reload: () => Promise<unknown>
}) {
  const scope = useContext(ApiRuntime)
  const navigate = useNavigate()
  const [open, setOpen] = createSignal(false)
  const [invalid, setInvalid] = createSignal(false)
  const mutation = createQuotationMutation(scope, (quotation) => {
    setOpen(false)
    navigate(`/sales/quotations/${encodeURIComponent(quotation.id)}`)
  })
  return (
    <Dialog
      open={open()}
      onOpenChange={createDialogOpenChange(mutation, setOpen, setInvalid)}
      trigger={<span>Create quotation</span>}
      triggerVariant="primary"
      title="Create quotation"
      description="Create a draft quotation with a customer and exact two-decimal total. Quotation transitions are backend-owned."
    >
      <Show
        when={props.customers().length > 0}
        fallback={<p role="status">Create a customer before creating a quotation.</p>}
      >
        <Form
          class={layout.stack}
          onSubmit={
            // Fallow: this form intentionally keeps quotation validation at the UI boundary.
            // fallow-ignore-next-line complexity
            (value) => {
              if (mutation.isPending || mutation.error?.kind === "unknown-outcome") return
              const customerId = requiredText(value.customerId)
              const total = requiredText(value.total)
              if (
                customerId === null || !uuidPattern.test(customerId) || total === null ||
                !moneyPattern.test(total)
              ) {
                setInvalid(true)
                return
              }
              setInvalid(false)
              mutation.mutate({ customerId, total })
            }
          }
        >
          <FormField
            label="Customer"
            required
            error={invalid() ? "Choose a customer and enter a valid total." : undefined}
          >
            {(fieldProps) => (
              <Select
                {...fieldProps}
                name="customerId"
                options={props.customers().map((customer) => ({
                  value: customer.id,
                  label: `${customer.name} · ${customer.email}`,
                }))}
                placeholder="Choose customer"
                required
                disabled={mutation.isPending}
              />
            )}
          </FormField>
          <FormField
            label="Quoted total"
            required
            helperText="Exact major amount, for example 1250.00."
          >
            {(fieldProps) => (
              <Input
                {...fieldProps}
                name="total"
                inputmode="decimal"
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
            successMessage="Quotation created."
            reload={props.reload}
            reset={() => mutation.reset()}
          />
          <Button
            variant="primary"
            type="submit"
            loading={mutation.isPending}
            disabled={mutation.error?.kind === "unknown-outcome"}
          >
            Create quotation
          </Button>
        </Form>
      </Show>
    </Dialog>
  )
}

// Fallow: quotation and order creation intentionally share the same guarded sales-document shell.
// fallow-ignore-next-line code-duplication
function CreateOrderDialog(props: {
  customers: () => readonly Customer[]
  reload: () => Promise<unknown>
}) {
  const scope = useContext(ApiRuntime)
  const navigate = useNavigate()
  const [open, setOpen] = createSignal(false)
  const [invalid, setInvalid] = createSignal(false)
  const mutation = createOrderMutation(scope, (order) => {
    setOpen(false)
    navigate(`/sales/orders/${encodeURIComponent(order.id)}`)
  })
  return (
    <Dialog
      open={open()}
      onOpenChange={createDialogOpenChange(mutation, setOpen, setInvalid)}
      trigger={<span>Create sales order</span>}
      triggerVariant="primary"
      title="Create sales order"
      description="Create a draft order. Inventory identity remains external; Sales derives the total from submitted lines."
    >
      <Show
        when={props.customers().length > 0}
        fallback={<p role="status">Create a customer before creating a sales order.</p>}
      >
        <Form
          class={layout.stack}
          onSubmit={
            // Fallow: this form intentionally keeps sales-order line validation at the UI boundary.
            // fallow-ignore-next-line complexity
            (value, event) => {
              if (mutation.isPending || mutation.error?.kind === "unknown-outcome") return
              const customerId = requiredText(value.customerId)
              const quotationId = requiredText(value.quotationId)
              const form = new FormData(event.currentTarget as HTMLFormElement)
              const itemId = requiredText(form.get("itemId"))
              const quantity = requiredText(form.get("quantity"))
              const unitPrice = requiredText(form.get("unitPrice"))
              const valid = customerId !== null && uuidPattern.test(customerId) &&
                (quotationId === null || uuidPattern.test(quotationId)) &&
                itemId !== null && uuidPattern.test(itemId) &&
                quantity !== null && quantityPattern.test(quantity) &&
                unitPrice !== null && moneyPattern.test(unitPrice)
              if (!valid) {
                setInvalid(true)
                return
              }
              setInvalid(false)
              mutation.mutate({
                customerId,
                ...(quotationId === null ? {} : { quotationId }),
                lines: [{ itemId, quantity, unitPrice }],
              })
            }
          }
        >
          <FormField
            label="Customer"
            required
            error={invalid() ? "Complete the customer and valid order line values." : undefined}
          >
            {(fieldProps) => (
              <Select
                {...fieldProps}
                name="customerId"
                options={props.customers().map((customer) => ({
                  value: customer.id,
                  label: `${customer.name} · ${customer.email}`,
                }))}
                placeholder="Choose customer"
                required
                disabled={mutation.isPending}
              />
            )}
          </FormField>
          <FormField
            label="Quotation ID"
            helperText="Optional. Sales verifies the quotation belongs to the selected customer."
          >
            {(fieldProps) => (
              <Input
                {...fieldProps}
                name="quotationId"
                autocomplete="off"
                spellcheck={false}
                disabled={mutation.isPending}
              />
            )}
          </FormField>
          <fieldset class={[surface(), layout.stack]}>
            <legend>Order line</legend>
            <p class={layout.muted}>
              Provide an Inventory item ID; Sales does not become the stock authority.
            </p>
            <FormField label="Item ID" required>
              {(fieldProps) => (
                <Input
                  {...fieldProps}
                  name="itemId"
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
                  name="quantity"
                  inputmode="numeric"
                  autocomplete="off"
                  required
                  disabled={mutation.isPending}
                />
              )}
            </FormField>
            <FormField label="Unit price" required>
              {(fieldProps) => (
                <Input
                  {...fieldProps}
                  name="unitPrice"
                  inputmode="decimal"
                  autocomplete="off"
                  required
                  disabled={mutation.isPending}
                />
              )}
            </FormField>
          </fieldset>
          <CommandFeedback
            error={mutation.error}
            pending={mutation.isPending}
            success={mutation.isSuccess}
            successMessage="Sales order created."
            reload={props.reload}
            reset={() => mutation.reset()}
          />
          <Button
            variant="primary"
            type="submit"
            loading={mutation.isPending}
            disabled={mutation.error?.kind === "unknown-outcome"}
          >
            Create sales order
          </Button>
        </Form>
      </Show>
    </Dialog>
  )
}

function ConfirmOrderDialog(props: { order: SalesOrder; reload: () => Promise<unknown> }) {
  const scope = useContext(ApiRuntime)
  const [open, setOpen] = createSignal(false)
  const mutation = createConfirmOrderMutation(scope, () => {
    setOpen(false)
    void props.reload()
  })
  const key = () => `sales-confirm:${props.order.id}`
  return (
    <Dialog
      open={open()}
      onOpenChange={createDialogOpenChange(mutation, setOpen)}
      trigger={<span>Confirm order</span>}
      triggerVariant="primary"
      title="Confirm sales order"
      description="Confirmation is idempotent and emits the backend-owned Sales event. Retry the same key only after reconciliation."
    >
      <div class={layout.stack}>
        <p>
          Confirm order <code>{props.order.id}</code> for total{" "}
          <strong>{props.order.total}</strong>?
        </p>
        <CommandFeedback
          error={mutation.error}
          pending={mutation.isPending}
          success={mutation.isSuccess}
          successMessage="Sales order confirmed."
          reload={props.reload}
          reset={() => mutation.reset()}
        />
        <Button
          variant="primary"
          type="button"
          loading={mutation.isPending}
          disabled={mutation.error?.kind === "unknown-outcome"}
          onClick={() =>
            mutation.mutate({
              id: props.order.id,
              input: {
                commandId: key(),
                correlationId: `sales-order:${props.order.id}`,
                causationId: null,
                idempotencyKey: key(),
              },
            })}
        >
          Confirm order
        </Button>
      </div>
    </Dialog>
  )
}

function CancelOrderDialog(props: { order: SalesOrder; reload: () => Promise<unknown> }) {
  const scope = useContext(ApiRuntime)
  const [open, setOpen] = createSignal(false)
  const mutation = createCancelOrderMutation(scope, () => {
    setOpen(false)
    void props.reload()
  })
  return (
    <Dialog
      open={open()}
      onOpenChange={createDialogOpenChange(mutation, setOpen)}
      trigger={<span>Cancel order</span>}
      title="Cancel confirmed sales order"
      description="Cancellation is backend-authorized and only applies to a confirmed order."
    >
      <div class={layout.stack}>
        <p>
          Cancel order <code>{props.order.id}</code>?
        </p>
        <CommandFeedback
          error={mutation.error}
          pending={mutation.isPending}
          success={mutation.isSuccess}
          successMessage="Sales order cancelled."
          reload={props.reload}
          reset={() => mutation.reset()}
        />
        <Button
          type="button"
          loading={mutation.isPending}
          disabled={mutation.error?.kind === "unknown-outcome"}
          onClick={() => mutation.mutate({ id: props.order.id })}
        >
          Cancel order
        </Button>
      </div>
    </Dialog>
  )
}

function CustomerTable(props: { customers: readonly Customer[] }) {
  return (
    <DataTable
      surface={false}
      class="table-scroll"
      caption="Sales customers"
      captionClass="sr-only"
      rows={props.customers}
      columns={[
        {
          id: "name",
          header: "Customer",
          rowHeader: true,
          cell: (customer) => (
            <a href={`/sales/customers/${encodeURIComponent(customer.id)}`}>
              {customer.name}
            </a>
          ),
        },
        { id: "email", header: "Email", cell: (customer) => customer.email },
        { id: "id", header: "ID", cell: (customer) => <code>{customer.id}</code> },
      ]}
    />
  )
}

function QuotationTable(props: { quotations: readonly Quotation[] }) {
  return (
    <DataTable
      surface={false}
      class="table-scroll"
      caption="Sales quotations"
      captionClass="sr-only"
      rows={props.quotations}
      columns={[
        {
          id: "id",
          header: "Quotation",
          rowHeader: true,
          cell: (quotation) => (
            <a href={`/sales/quotations/${encodeURIComponent(quotation.id)}`}>
              <code>{quotation.id}</code>
            </a>
          ),
        },
        {
          id: "customerId",
          header: "Customer",
          cell: (quotation) => <code>{quotation.customerId}</code>,
        },
        {
          id: "status",
          header: "Status",
          cell: (quotation) => (
            <Badge tone={quotationTone(quotation.status)}>{quotation.status}</Badge>
          ),
        },
        { id: "total", header: "Total", cell: (quotation) => quotation.total },
      ]}
    />
  )
}

function OrderTable(props: { orders: readonly SalesOrder[]; selectedOrderId?: string }) {
  return (
    <DataTable
      surface={false}
      class="table-scroll"
      caption="Sales orders"
      captionClass="sr-only"
      rows={props.orders}
      getRowClass={(order) =>
        order.id === props.selectedOrderId ? layout.tableRowSelected : undefined}
      columns={[
        {
          id: "id",
          header: "Order",
          rowHeader: true,
          cell: (order) => (
            <a href={`/sales/orders/${encodeURIComponent(order.id)}`}>
              <code>{order.id}</code>
            </a>
          ),
        },
        {
          id: "customerId",
          header: "Customer",
          cell: (order) => <code>{order.customerId}</code>,
        },
        {
          id: "status",
          header: "Status",
          cell: (order) => <Badge tone={orderTone(order.status)}>{order.status}</Badge>,
        },
        { id: "lines", header: "Lines", cell: (order) => order.lines.length },
        { id: "total", header: "Total", cell: (order) => order.total },
      ]}
    />
  )
}

function CustomerDetail(props: { id: string }) {
  const scope = useContext(ApiRuntime)
  const id = untrack(() => props.id)
  const query = createCustomerQuery(scope, id)
  return (
    <section class={layout.stack} aria-labelledby="sales-customer-detail-heading">
      <div class={layout.row}>
        <h2 id="sales-customer-detail-heading">Customer detail</h2>
        <Button type="button" onClick={() => void query.refetch()}>Reload customer</Button>
      </div>
      <QueryBoundary label="customer" retry={() => query.refetch()}>
        <Show when={query.data} keyed>
          {(customer) => (
            <dl class={layout.detailList}>
              <div>
                <dt>Name</dt>
                <dd>{customer.name}</dd>
              </div>
              <div>
                <dt>Email</dt>
                <dd>{customer.email}</dd>
              </div>
              <div>
                <dt>Tenant</dt>
                <dd>
                  <code>{customer.tenantId}</code>
                </dd>
              </div>
              <div>
                <dt>Customer ID</dt>
                <dd>
                  <code>{customer.id}</code>
                </dd>
              </div>
            </dl>
          )}
        </Show>
      </QueryBoundary>
    </section>
  )
}

function QuotationDetail(props: { id: string }) {
  const scope = useContext(ApiRuntime)
  const id = untrack(() => props.id)
  const query = createQuotationQuery(scope, id)
  return (
    <section class={layout.stack} aria-labelledby="sales-quotation-detail-heading">
      <div class={layout.row}>
        <h2 id="sales-quotation-detail-heading">Quotation detail</h2>
        <Button type="button" onClick={() => void query.refetch()}>Reload quotation</Button>
      </div>
      <QueryBoundary label="quotation" retry={() => query.refetch()}>
        <Show when={query.data} keyed>
          {(quotation) => (
            <dl class={layout.detailList}>
              <div>
                <dt>Quotation ID</dt>
                <dd>
                  <code>{quotation.id}</code>
                </dd>
              </div>
              <div>
                <dt>Customer</dt>
                <dd>
                  <a href={`/sales/customers/${encodeURIComponent(quotation.customerId)}`}>
                    <code>{quotation.customerId}</code>
                  </a>
                </dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>
                  <Badge tone={quotationTone(quotation.status)}>{quotation.status}</Badge>
                </dd>
              </div>
              <div>
                <dt>Total</dt>
                <dd>{quotation.total}</dd>
              </div>
            </dl>
          )}
        </Show>
      </QueryBoundary>
    </section>
  )
}

function OrderDetail(props: { id: string; reloadLists: () => Promise<unknown> }) {
  const scope = useContext(ApiRuntime)
  const id = untrack(() => props.id)
  const query = createOrderQuery(scope, id)
  const reload = () => Promise.all([query.refetch(), props.reloadLists()])
  return (
    <section class={layout.stack} aria-labelledby="sales-order-detail-heading">
      <div class={layout.row}>
        <h2 id="sales-order-detail-heading">Sales order detail</h2>
        <Button type="button" onClick={() => void reload()}>Reload order</Button>
      </div>
      <QueryBoundary label="sales order" retry={() => query.refetch()}>
        <Show when={query.data} keyed>
          {(order) => (
            <div class={layout.stack}>
              <dl class={layout.detailList}>
                <div>
                  <dt>Order ID</dt>
                  <dd>
                    <code>{order.id}</code>
                  </dd>
                </div>
                <div>
                  <dt>Customer</dt>
                  <dd>
                    <a href={`/sales/customers/${encodeURIComponent(order.customerId)}`}>
                      <code>{order.customerId}</code>
                    </a>
                  </dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>
                    <Badge tone={orderTone(order.status)}>{order.status}</Badge>
                  </dd>
                </div>
                <div>
                  <dt>Total</dt>
                  <dd>{order.total}</dd>
                </div>
                <div>
                  <dt>Confirmed at</dt>
                  <dd>{order.confirmedAt ?? "Not confirmed"}</dd>
                </div>
              </dl>
              <section
                class={[surface(), layout.stack]}
                aria-labelledby="sales-order-lines-heading"
              >
                <h3 id="sales-order-lines-heading">Order lines</h3>
                <div class="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">Item</th>
                        <th scope="col">Quantity</th>
                        <th scope="col">Unit price</th>
                      </tr>
                    </thead>
                    <tbody>
                      <For each={order.lines}>
                        {(line) => (
                          <tr>
                            <th scope="row">
                              <code>{line.itemId}</code>
                            </th>
                            <td>{line.quantity}</td>
                            <td>{line.unitPrice}</td>
                          </tr>
                        )}
                      </For>
                    </tbody>
                  </table>
                </div>
              </section>
              <section
                class={[surface(), layout.stack]}
                aria-labelledby="sales-order-commands-heading"
              >
                <h3 id="sales-order-commands-heading">Eligible commands</h3>
                <p>
                  Sales owns the order lifecycle. The backend rechecks state, tenant scope,
                  authorization, and event idempotency.
                </p>
                <div class={layout.row}>
                  <Show when={order.status === "draft"}>
                    <ConfirmOrderDialog order={order} reload={reload} />
                  </Show>
                  <Show when={order.status === "confirmed"}>
                    <CancelOrderDialog order={order} reload={reload} />
                  </Show>
                  <Show when={order.status === "cancelled"}>
                    <p class={layout.muted}>This order is terminal and immutable.</p>
                  </Show>
                </div>
              </section>
            </div>
          )}
        </Show>
      </QueryBoundary>
    </section>
  )
}

function SalesFilters(props: {
  customers: readonly Customer[]
  customerId?: string
  quotationStatus?: QuotationStatus
  orderStatus?: SalesOrderStatus
  search?: string
}) {
  const navigate = useNavigate()
  return (
    <Form
      class={layout.row}
      aria-label="Filter Sales workspaces"
      onSubmit={
        // Fallow: this filter form intentionally validates and serializes optional Sales fields together.
        // fallow-ignore-next-line complexity
        (value) => {
          const query = new URLSearchParams()
          const customerId = requiredText(value.customerId)
          const search = requiredText(value.search)
          const quotationStatus = value.quotationStatus
          const orderStatus = value.orderStatus
          if (customerId !== null && uuidPattern.test(customerId)) {
            query.set("customerId", customerId)
          }
          if (search !== null) query.set("search", search)
          if (quotationStatusOptions.some((option) => option.value === quotationStatus)) {
            query.set("quotationStatus", String(quotationStatus))
          }
          if (orderStatusOptions.some((option) => option.value === orderStatus)) {
            query.set("orderStatus", String(orderStatus))
          }
          navigate(query.size === 0 ? "/sales" : `/sales?${query}`)
        }
      }
    >
      <FormField label="Customer">
        {(fieldProps) => (
          <Select
            {...fieldProps}
            name="customerId"
            value={props.customerId}
            options={props.customers.map((customer) => ({
              value: customer.id,
              label: customer.name,
            }))}
            placeholder="All customers"
          />
        )}
      </FormField>
      <FormField label="Customer search">
        {(fieldProps) => (
          <Input {...fieldProps} name="search" value={props.search} autocomplete="off" />
        )}
      </FormField>
      <FormField label="Quotation status">
        {(fieldProps) => (
          <Select
            {...fieldProps}
            name="quotationStatus"
            value={props.quotationStatus}
            options={quotationStatusOptions}
            placeholder="All quotations"
          />
        )}
      </FormField>
      <FormField label="Order status">
        {(fieldProps) => (
          <Select
            {...fieldProps}
            name="orderStatus"
            value={props.orderStatus}
            options={orderStatusOptions}
            placeholder="All orders"
          />
        )}
      </FormField>
      <Button type="submit">Apply filters</Button>
      <a href="/sales">Clear</a>
    </Form>
  )
}

// Fallow: the Sales workspace intentionally composes customer, quotation, and order lifecycle views.
// fallow-ignore-next-line complexity
export function Sales(props: {
  selectedCustomerId?: string
  selectedQuotationId?: string
  selectedOrderId?: string
  customerId?: string
  quotationStatus?: QuotationStatus
  orderStatus?: SalesOrderStatus
  search?: string
}) {
  const scope = useContext(ApiRuntime)
  const customers = createCustomersQuery(scope, {
    ...(props.search === undefined ? {} : { search: props.search }),
    limit: 200,
  })
  const quotations = createQuotationsQuery(scope, {
    ...(props.customerId === undefined ? {} : { customerId: props.customerId }),
    ...(props.quotationStatus === undefined ? {} : { status: props.quotationStatus }),
    limit: 200,
  })
  const orders = createOrdersQuery(scope, {
    ...(props.customerId === undefined ? {} : { customerId: props.customerId }),
    ...(props.orderStatus === undefined ? {} : { status: props.orderStatus }),
    limit: 200,
  })
  const customerData = () => customers.data ?? []
  const quotationData = () => quotations.data ?? []
  const orderData = () => orders.data ?? []
  const reload = () => Promise.all([customers.refetch(), quotations.refetch(), orders.refetch()])
  return (
    <EntityWorkspace
      title="Sales"
      description={
        <p>
          Tenant-scoped customers, quotations, sales orders, lifecycle evidence, and
          backend-authorized commands.
        </p>
      }
      headerActions={
        <div class={layout.row}>
          <CreateCustomerDialog reload={() => customers.refetch()} />
          <CreateQuotationDialog customers={customerData} reload={() => quotations.refetch()} />
          <CreateOrderDialog customers={customerData} reload={() => orders.refetch()} />
          <Button type="button" onClick={() => void reload()}>Reload Sales</Button>
        </div>
      }
      toolbar={
        <SalesFilters
          customers={customerData()}
          customerId={props.customerId}
          quotationStatus={props.quotationStatus}
          orderStatus={props.orderStatus}
          search={props.search}
        />
      }
      aside={props.selectedOrderId
        ? <OrderDetail id={props.selectedOrderId} reloadLists={reload} />
        : props.selectedQuotationId
        ? <QuotationDetail id={props.selectedQuotationId} />
        : props.selectedCustomerId
        ? <CustomerDetail id={props.selectedCustomerId} />
        : undefined}
    >
      <QueryBoundary label="Sales" retry={reload}>
        <section class={[surface(), layout.stack]} aria-labelledby="sales-customers-heading">
          <div class={layout.row}>
            <div class={layout.stack}>
              <h2 id="sales-customers-heading">Customers</h2>
              <p>Sales customer master records are tenant-scoped and bounded to 200 rows.</p>
            </div>
          </div>
          <Show
            when={customerData().length > 0}
            fallback={<p role="status">No customers match the current search.</p>}
          >
            <CustomerTable customers={customerData()} />
          </Show>
        </section>
        <section class={[surface(), layout.stack]} aria-labelledby="sales-quotations-heading">
          <h2 id="sales-quotations-heading">Quotations</h2>
          <Show
            when={quotationData().length > 0}
            fallback={<p role="status">No quotations match the current filters.</p>}
          >
            <QuotationTable quotations={quotationData()} />
          </Show>
        </section>
        <section class={[surface(), layout.stack]} aria-labelledby="sales-orders-heading">
          <h2 id="sales-orders-heading">Sales orders</h2>
          <Show
            when={orderData().length > 0}
            fallback={<p role="status">No sales orders match the current filters.</p>}
          >
            <OrderTable orders={orderData()} selectedOrderId={props.selectedOrderId} />
          </Show>
        </section>
      </QueryBoundary>
    </EntityWorkspace>
  )
}

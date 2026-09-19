import { useNavigate } from "@solidjs/router"
import { createMemo, createSignal, For, Show, useContext } from "solid-js"
import type {
  AdjustStockInput,
  CreateItemInput,
  CreateStockTransferInput,
  CreateWarehouseInput,
  Item,
  ReceiveStockInput,
  ReserveStockInput,
  StockBalance,
  StockMovement,
  StockReservation,
  StockTransfer,
  Warehouse,
} from "../../shared/contracts/generated/inventory.ts"
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
  createAdjustStockMutation,
  createCompleteTransferMutation,
  createConfirmTransferMutation,
  createFulfillReservationMutation,
  createItemMutation,
  createItemsQuery,
  createReceiveStockMutation,
  createReleaseReservationMutation,
  createReserveStockMutation,
  createStockBalancesQuery,
  createStockMovementsQuery,
  createStockReservationsQuery,
  createStockTransfersQuery,
  createTransferMutation,
  createWarehouseMutation,
  createWarehousesQuery,
} from "./queries.ts"

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const quantityPattern = /^[1-9]\d*$/
const signedQuantityPattern = /^-?[1-9]\d*$/
const unitPattern = /^[A-Z][A-Z0-9_-]*$/

const requiredText = (value: FormDataEntryValue | null | undefined): string | null =>
  typeof value === "string" && /\S/.test(value) ? value.trim() : null

// Fallow: reservation and transfer statuses intentionally share one presentation mapping.
// fallow-ignore-next-line code-duplication
const statusTone = (status: StockReservation["status"] | StockTransfer["status"] | string) => {
  if (["completed", "fulfilled", "active"].includes(status)) return "success" as const
  if (["released", "confirmed"].includes(status)) return "warning" as const
  return "neutral" as const
}

const commandKey = (prefix: string) => `${prefix}:${Date.now()}`

type LookupOption = { readonly value: string; readonly label: string }
type InventoryLookupOptions = {
  readonly warehouses: readonly LookupOption[]
  readonly items: readonly LookupOption[]
}

function LookupOptions(props: {
  warehouses: readonly Warehouse[]
  items: readonly Item[]
}): InventoryLookupOptions {
  return {
    warehouses: props.warehouses.map((warehouse) => ({
      value: warehouse.id,
      label: `${warehouse.name} · ${warehouse.id}`,
    })),
    items: props.items.map((item) => ({
      value: item.id,
      label: `${item.sku} · ${item.name}`,
    })),
  }
}

function StockItemFields(props: {
  options: InventoryLookupOptions
  disabled: boolean
  quantityHelperText?: string
}) {
  return (
    <>
      <FormField label="Warehouse" required>
        {(fieldProps) => (
          <Select
            {...fieldProps}
            name="warehouseId"
            options={props.options.warehouses}
            placeholder="Choose warehouse"
            required
            disabled={props.disabled}
          />
        )}
      </FormField>
      <FormField label="Item" required>
        {(fieldProps) => (
          <Select
            {...fieldProps}
            name="itemId"
            options={props.options.items}
            placeholder="Choose item"
            required
            disabled={props.disabled}
          />
        )}
      </FormField>
      <FormField label="Quantity" required helperText={props.quantityHelperText}>
        {(fieldProps) => (
          <Input
            {...fieldProps}
            name="quantity"
            inputmode="numeric"
            required
            disabled={props.disabled}
          />
        )}
      </FormField>
    </>
  )
}

function ItemQuantityFields(props: {
  options: InventoryLookupOptions
  disabled: boolean
}) {
  return (
    <>
      <FormField label="Item" required>
        {(fieldProps) => (
          <Select
            {...fieldProps}
            name="itemId"
            options={props.options.items}
            placeholder="Choose item"
            required
            disabled={props.disabled}
          />
        )}
      </FormField>
      <FormField label="Quantity" required>
        {(fieldProps) => (
          <Input
            {...fieldProps}
            name="quantity"
            inputmode="numeric"
            required
            disabled={props.disabled}
          />
        )}
      </FormField>
    </>
  )
}

function CreateWarehouseDialog(props: { reload: () => Promise<unknown> }) {
  const scope = useContext(ApiRuntime)
  const [open, setOpen] = createSignal(false)
  const [invalid, setInvalid] = createSignal(false)
  const mutation = createWarehouseMutation(scope, () => {
    setOpen(false)
    void props.reload()
  })
  return (
    <Dialog
      open={open()}
      onOpenChange={createDialogOpenChange(mutation, setOpen, setInvalid)}
      trigger={<span>Create warehouse</span>}
      triggerVariant="primary"
      title="Create warehouse"
      description="Create a tenant-local warehouse. Stock remains authoritative in Inventory after creation."
    >
      <Form
        class={layout.stack}
        onSubmit={
          // Fallow: this form intentionally keeps warehouse identity validation at the UI boundary.
          // fallow-ignore-next-line complexity
          (value) => {
            if (mutation.isPending || mutation.error?.kind === "unknown-outcome") return
            const legalEntityId = requiredText(value.legalEntityId)
            const primaryBranchId = requiredText(value.primaryBranchId)
            const name = requiredText(value.name)
            const valid = legalEntityId !== null && uuidPattern.test(legalEntityId) &&
              (primaryBranchId === null || uuidPattern.test(primaryBranchId)) && name !== null
            if (!valid) {
              setInvalid(true)
              return
            }
            setInvalid(false)
            const input: CreateWarehouseInput = {
              legalEntityId,
              ...(primaryBranchId === null ? {} : { primaryBranchId }),
              name,
            }
            mutation.mutate(input)
          }
        }
      >
        <FormField label="Legal entity ID" required>
          {(fieldProps) => (
            <Input {...fieldProps} name="legalEntityId" required disabled={mutation.isPending} />
          )}
        </FormField>
        <FormField label="Primary branch ID" helperText="Optional tenant-local branch.">
          {(fieldProps) => (
            <Input {...fieldProps} name="primaryBranchId" disabled={mutation.isPending} />
          )}
        </FormField>
        <FormField label="Warehouse name" required>
          {(fieldProps) => (
            <Input {...fieldProps} name="name" required disabled={mutation.isPending} />
          )}
        </FormField>
        <Show when={invalid()}>
          <p role="alert">Enter a valid legal entity, optional branch, and warehouse name.</p>
        </Show>
        <CommandFeedback
          error={mutation.error}
          pending={mutation.isPending}
          success={mutation.isSuccess}
          successMessage="Warehouse created."
          reload={props.reload}
          reset={() => mutation.reset()}
        />
        <Button
          variant="primary"
          type="submit"
          loading={mutation.isPending}
          disabled={mutation.error?.kind === "unknown-outcome"}
        >
          Create warehouse
        </Button>
      </Form>
    </Dialog>
  )
}

function CreateItemDialog(props: { reload: () => Promise<unknown> }) {
  const scope = useContext(ApiRuntime)
  const [open, setOpen] = createSignal(false)
  const [invalid, setInvalid] = createSignal(false)
  const mutation = createItemMutation(scope, () => {
    setOpen(false)
    void props.reload()
  })
  return (
    <Dialog
      open={open()}
      onOpenChange={createDialogOpenChange(mutation, setOpen, setInvalid)}
      trigger={<span>Create item</span>}
      triggerVariant="primary"
      title="Create item"
      description="Create an immutable item identity and unit of measure for tenant-local stock operations."
    >
      <Form
        class={layout.stack}
        onSubmit={
          // Fallow: this form intentionally keeps item identity validation at the UI boundary.
          // fallow-ignore-next-line complexity
          (value) => {
            if (mutation.isPending || mutation.error?.kind === "unknown-outcome") return
            const sku = requiredText(value.sku)
            const name = requiredText(value.name)
            const unitOfMeasure = requiredText(value.unitOfMeasure) ?? "EA"
            if (sku === null || name === null || !unitPattern.test(unitOfMeasure.toUpperCase())) {
              setInvalid(true)
              return
            }
            setInvalid(false)
            const input: CreateItemInput = { sku, name, unitOfMeasure }
            mutation.mutate(input)
          }
        }
      >
        <FormField label="SKU" required helperText="Stored uppercase by Inventory.">
          {(fieldProps) => (
            <Input {...fieldProps} name="sku" required disabled={mutation.isPending} />
          )}
        </FormField>
        <FormField label="Item name" required>
          {(fieldProps) => (
            <Input {...fieldProps} name="name" required disabled={mutation.isPending} />
          )}
        </FormField>
        <FormField
          label="Unit of measure"
          required
          helperText="Immutable uppercase code, for example EA or KG."
        >
          {(fieldProps) => (
            <Input
              {...fieldProps}
              name="unitOfMeasure"
              value="EA"
              required
              disabled={mutation.isPending}
            />
          )}
        </FormField>
        <Show when={invalid()}>
          <p role="alert">Enter a SKU, item name, and uppercase unit code.</p>
        </Show>
        <CommandFeedback
          error={mutation.error}
          pending={mutation.isPending}
          success={mutation.isSuccess}
          successMessage="Item created."
          reload={props.reload}
          reset={() =>
            mutation.reset()}
        />
        <Button
          variant="primary"
          type="submit"
          loading={mutation.isPending}
          disabled={mutation.error?.kind === "unknown-outcome"}
        >
          Create item
        </Button>
      </Form>
    </Dialog>
  )
}

function ReceiveStockDialog(props: {
  warehouses: readonly Warehouse[]
  items: readonly Item[]
  reload: () => Promise<unknown>
}) {
  const scope = useContext(ApiRuntime)
  const options = {
    get warehouses() {
      return LookupOptions(props).warehouses
    },
    get items() {
      return LookupOptions(props).items
    },
  }
  const [open, setOpen] = createSignal(false)
  const [invalid, setInvalid] = createSignal(false)
  const mutation = createReceiveStockMutation(scope, () => {
    setOpen(false)
    void props.reload()
  })
  return (
    // Fallow: receipt, adjustment, and reservation commands intentionally share one accessible dialog shell.
    // fallow-ignore-next-line code-duplication
    <Dialog
      open={open()}
      onOpenChange={createDialogOpenChange(mutation, setOpen, setInvalid)}
      trigger={<span>Receive stock</span>}
      triggerVariant="primary"
      title="Receive stock"
      description="Record a positive receipt through Inventory. Do not edit stock positions locally."
    >
      <Form
        class={layout.stack}
        onSubmit={
          // Fallow: this form intentionally keeps receipt validation at the UI boundary.
          // fallow-ignore-next-line complexity
          (value) => {
            if (mutation.isPending || mutation.error?.kind === "unknown-outcome") return
            const warehouseId = requiredText(value.warehouseId)
            const itemId = requiredText(value.itemId)
            const quantity = requiredText(value.quantity)
            const valid = warehouseId !== null && uuidPattern.test(warehouseId) &&
              itemId !== null && uuidPattern.test(itemId) && quantity !== null &&
              quantityPattern.test(quantity)
            if (!valid) {
              setInvalid(true)
              return
            }
            setInvalid(false)
            const input: ReceiveStockInput = { warehouseId, itemId, quantity }
            mutation.mutate(input)
          }
        }
      >
        <StockItemFields
          options={options}
          disabled={mutation.isPending}
          quantityHelperText="Whole positive units only."
        />
        <Show when={invalid()}>
          <p role="alert">Choose a warehouse and item, then enter a positive whole quantity.</p>
        </Show>
        <CommandFeedback
          error={mutation.error}
          pending={mutation.isPending}
          success={mutation.isSuccess}
          successMessage="Stock received."
          reload={props.reload}
          reset={() => mutation.reset()}
        />
        <Button
          variant="primary"
          type="submit"
          loading={mutation.isPending}
          disabled={mutation.error?.kind === "unknown-outcome"}
        >
          Receive stock
        </Button>
      </Form>
    </Dialog>
  )
}

function AdjustStockDialog(props: {
  warehouses: readonly Warehouse[]
  items: readonly Item[]
  reload: () => Promise<unknown>
}) {
  const scope = useContext(ApiRuntime)
  const options = {
    get warehouses() {
      return LookupOptions(props).warehouses
    },
    get items() {
      return LookupOptions(props).items
    },
  }
  const [open, setOpen] = createSignal(false)
  const [invalid, setInvalid] = createSignal(false)
  const [key, setKey] = createSignal(commandKey("adjust"))
  const mutation = createAdjustStockMutation(scope, () => {
    setOpen(false)
    void props.reload()
  })
  return (
    // Fallow: receipt, adjustment, and reservation commands intentionally share one accessible dialog shell.
    // fallow-ignore-next-line code-duplication
    <Dialog
      open={open()}
      onOpenChange={createDialogOpenChange(
        mutation,
        setOpen,
        setInvalid,
        () => setKey(commandKey("adjust")),
      )}
      trigger={<span>Adjust stock</span>}
      triggerVariant="secondary"
      title="Adjust stock"
      description="Post a signed correction with an explicit reason and idempotency key. The backend owns availability and audit history."
    >
      <Form
        class={layout.stack}
        onSubmit={
          // Fallow: this form intentionally keeps signed-adjustment validation at the UI boundary.
          // fallow-ignore-next-line complexity
          (value) => {
            if (mutation.isPending || mutation.error?.kind === "unknown-outcome") return
            const warehouseId = requiredText(value.warehouseId)
            const itemId = requiredText(value.itemId)
            const adjustment = requiredText(value.adjustment)
            const unitOfMeasure = requiredText(value.unitOfMeasure)?.toUpperCase() ?? ""
            const reason = requiredText(value.reason)
            const idempotencyKey = requiredText(value.idempotencyKey)
            const commandId = requiredText(value.commandId)
            const correlationId = requiredText(value.correlationId)
            const valid = warehouseId !== null && uuidPattern.test(warehouseId) &&
              itemId !== null && uuidPattern.test(itemId) && adjustment !== null &&
              signedQuantityPattern.test(adjustment) && unitOfMeasure !== null &&
              unitPattern.test(unitOfMeasure) && reason !== null && idempotencyKey !== null &&
              commandId !== null && correlationId !== null
            if (!valid) {
              setInvalid(true)
              return
            }
            setInvalid(false)
            const input: AdjustStockInput = {
              warehouseId,
              itemId,
              adjustment,
              unitOfMeasure,
              reason,
              commandId,
              correlationId,
              idempotencyKey,
            }
            mutation.mutate(input)
          }
        }
      >
        <FormField label="Warehouse" required>
          {(fieldProps) => (
            <Select
              {...fieldProps}
              name="warehouseId"
              options={options.warehouses}
              placeholder="Choose warehouse"
              required
              disabled={mutation.isPending}
            />
          )}
        </FormField>
        <FormField label="Item" required>
          {(fieldProps) => (
            <Select
              {...fieldProps}
              name="itemId"
              options={options.items}
              placeholder="Choose item"
              required
              disabled={mutation.isPending}
            />
          )}
        </FormField>
        <FormField
          label="Signed adjustment"
          required
          helperText="Use a positive or negative whole number; zero is not a correction."
        >
          {(fieldProps) => (
            <Input
              {...fieldProps}
              name="adjustment"
              inputmode="numeric"
              required
              disabled={mutation.isPending}
            />
          )}
        </FormField>
        <FormField label="Unit of measure" required>
          {(fieldProps) => (
            <Input
              {...fieldProps}
              name="unitOfMeasure"
              value="EA"
              required
              disabled={mutation.isPending}
            />
          )}
        </FormField>
        <FormField label="Reason" required>
          {(fieldProps) => (
            <Input {...fieldProps} name="reason" required disabled={mutation.isPending} />
          )}
        </FormField>
        <FormField
          label="Idempotency key"
          required
          helperText="Reuse this key only when retrying the same correction."
        >
          {(fieldProps) => (
            <Input
              {...fieldProps}
              name="idempotencyKey"
              value={key()}
              required
              disabled={mutation.isPending}
            />
          )}
        </FormField>
        <FormField label="Command ID" required>
          {(fieldProps) => (
            <Input
              {...fieldProps}
              name="commandId"
              value={`${key()}:command`}
              required
              disabled={mutation.isPending}
            />
          )}
        </FormField>
        <FormField label="Correlation ID" required>
          {(fieldProps) => (
            <Input
              {...fieldProps}
              name="correlationId"
              value={`${key()}:correlation`}
              required
              disabled={mutation.isPending}
            />
          )}
        </FormField>
        <Show when={invalid()}>
          <p role="alert">
            Complete the correction with valid IDs, a signed quantity, unit, reason, and command
            metadata.
          </p>
        </Show>
        <CommandFeedback
          error={mutation.error}
          pending={mutation.isPending}
          success={mutation.isSuccess}
          successMessage="Stock correction posted."
          reload={props.reload}
          reset={() => mutation.reset()}
        />
        <Button
          variant="secondary"
          type="submit"
          loading={mutation.isPending}
          disabled={mutation.error?.kind === "unknown-outcome"}
        >
          Post correction
        </Button>
      </Form>
    </Dialog>
  )
}

function ReserveStockDialog(props: {
  warehouses: readonly Warehouse[]
  items: readonly Item[]
  reload: () => Promise<unknown>
}) {
  const scope = useContext(ApiRuntime)
  const options = {
    get warehouses() {
      return LookupOptions(props).warehouses
    },
    get items() {
      return LookupOptions(props).items
    },
  }
  const [open, setOpen] = createSignal(false)
  const [invalid, setInvalid] = createSignal(false)
  const [key, setKey] = createSignal(commandKey("reserve"))
  const mutation = createReserveStockMutation(scope, () => {
    setOpen(false)
    void props.reload()
  })
  return (
    // Fallow: receipt, adjustment, and reservation commands intentionally share one accessible dialog shell.
    // fallow-ignore-next-line code-duplication
    <Dialog
      open={open()}
      onOpenChange={createDialogOpenChange(
        mutation,
        setOpen,
        setInvalid,
        () => setKey(commandKey("reserve")),
      )}
      trigger={<span>Reserve stock</span>}
      triggerVariant="secondary"
      title="Reserve stock"
      description="Create an active reservation. Availability is checked atomically by the Inventory service."
    >
      <Form
        class={layout.stack}
        onSubmit={
          // Fallow: this form intentionally keeps reservation validation at the UI boundary.
          // fallow-ignore-next-line complexity
          (value) => {
            if (mutation.isPending || mutation.error?.kind === "unknown-outcome") return
            const warehouseId = requiredText(value.warehouseId)
            const itemId = requiredText(value.itemId)
            const quantity = requiredText(value.quantity)
            const idempotencyKey = requiredText(value.idempotencyKey)
            const valid = warehouseId !== null && uuidPattern.test(warehouseId) &&
              itemId !== null && uuidPattern.test(itemId) && quantity !== null &&
              quantityPattern.test(quantity) && idempotencyKey !== null
            if (!valid) {
              setInvalid(true)
              return
            }
            setInvalid(false)
            const input: ReserveStockInput = { warehouseId, itemId, quantity, idempotencyKey }
            mutation.mutate(input)
          }
        }
      >
        <StockItemFields options={options} disabled={mutation.isPending} />
        <FormField
          label="Idempotency key"
          required
          helperText="Reuse this key only to retry the same reservation."
        >
          {(fieldProps) => (
            <Input
              {...fieldProps}
              name="idempotencyKey"
              value={key()}
              required
              disabled={mutation.isPending}
            />
          )}
        </FormField>
        <Show when={invalid()}>
          <p role="alert">Choose a warehouse and item, then enter a positive quantity and key.</p>
        </Show>
        <CommandFeedback
          error={mutation.error}
          pending={mutation.isPending}
          success={mutation.isSuccess}
          successMessage="Stock reserved."
          reload={props.reload}
          reset={() => mutation.reset()}
        />
        <Button
          variant="secondary"
          type="submit"
          loading={mutation.isPending}
          disabled={mutation.error?.kind === "unknown-outcome"}
        >
          Reserve stock
        </Button>
      </Form>
    </Dialog>
  )
}

function CreateTransferDialog(props: {
  warehouses: readonly Warehouse[]
  items: readonly Item[]
  reload: () => Promise<unknown>
}) {
  const scope = useContext(ApiRuntime)
  const options = {
    get warehouses() {
      return LookupOptions(props).warehouses
    },
    get items() {
      return LookupOptions(props).items
    },
  }
  const [open, setOpen] = createSignal(false)
  const [invalid, setInvalid] = createSignal(false)
  const mutation = createTransferMutation(scope, () => {
    setOpen(false)
    void props.reload()
  })
  return (
    <Dialog
      open={open()}
      onOpenChange={createDialogOpenChange(mutation, setOpen, setInvalid)}
      trigger={<span>Create transfer</span>}
      triggerVariant="secondary"
      title="Create stock transfer"
      description="Create a draft transfer between distinct warehouses. Confirm and complete it through the backend lifecycle."
    >
      <Form
        class={layout.stack}
        onSubmit={
          // Fallow: this form intentionally keeps transfer identity validation at the UI boundary.
          // fallow-ignore-next-line complexity
          (value) => {
            if (mutation.isPending || mutation.error?.kind === "unknown-outcome") return
            const sourceWarehouseId = requiredText(value.sourceWarehouseId)
            const destinationWarehouseId = requiredText(value.destinationWarehouseId)
            const itemId = requiredText(value.itemId)
            const quantity = requiredText(value.quantity)
            const valid = sourceWarehouseId !== null && uuidPattern.test(sourceWarehouseId) &&
              destinationWarehouseId !== null && uuidPattern.test(destinationWarehouseId) &&
              sourceWarehouseId !== destinationWarehouseId && itemId !== null &&
              uuidPattern.test(itemId) && quantity !== null && quantityPattern.test(quantity)
            if (!valid) {
              setInvalid(true)
              return
            }
            setInvalid(false)
            const input: CreateStockTransferInput = {
              sourceWarehouseId,
              destinationWarehouseId,
              lines: [{ itemId, quantity }],
            }
            mutation.mutate(input)
          }
        }
      >
        <FormField label="Source warehouse" required>
          {(fieldProps) => (
            <Select
              {...fieldProps}
              name="sourceWarehouseId"
              options={options.warehouses}
              placeholder="Choose source"
              required
              disabled={mutation.isPending}
            />
          )}
        </FormField>
        <FormField label="Destination warehouse" required>
          {(fieldProps) => (
            <Select
              {...fieldProps}
              name="destinationWarehouseId"
              options={options.warehouses}
              placeholder="Choose destination"
              required
              disabled={mutation.isPending}
            />
          )}
        </FormField>
        <ItemQuantityFields options={options} disabled={mutation.isPending} />
        <Show when={invalid()}>
          <p role="alert">Choose distinct warehouses, an item, and a positive quantity.</p>
        </Show>
        <CommandFeedback
          error={mutation.error}
          pending={mutation.isPending}
          success={mutation.isSuccess}
          successMessage="Transfer draft created."
          reload={props.reload}
          reset={() => mutation.reset()}
        />
        <Button
          variant="secondary"
          type="submit"
          loading={mutation.isPending}
          disabled={mutation.error?.kind === "unknown-outcome"}
        >
          Create transfer
        </Button>
      </Form>
    </Dialog>
  )
}

// Fallow: this component intentionally owns the guarded reservation lifecycle form.
// fallow-ignore-next-line complexity
function ReservationCommand(props: {
  reservation: StockReservation
  kind: "release" | "fulfill"
  reload: () => Promise<unknown>
}) {
  const scope = useContext(ApiRuntime)
  const [open, setOpen] = createSignal(false)
  const mutation = props.kind === "release"
    ? createReleaseReservationMutation(scope, () => setOpen(false))
    : createFulfillReservationMutation(scope, () => setOpen(false))
  const label = props.kind === "release" ? "Release reservation" : "Fulfill reservation"
  return (
    <Dialog
      open={open()}
      onOpenChange={createDialogOpenChange(mutation, setOpen)}
      trigger={<span>{label}</span>}
      triggerVariant={props.kind === "release" ? "danger" : "secondary"}
      title={label}
      description="The command is validated against the current reservation state by Inventory."
    >
      <div class={layout.stack}>
        <p class={layout.code}>{props.reservation.id}</p>
        <CommandFeedback
          error={mutation.error}
          pending={mutation.isPending}
          success={mutation.isSuccess}
          successMessage={`${label} completed.`}
          reload={props.reload}
          reset={() => mutation.reset()}
        />
        <Button
          variant={props.kind === "release" ? "danger" : "secondary"}
          type="button"
          loading={mutation.isPending}
          disabled={mutation.error?.kind === "unknown-outcome"}
          onClick={() => mutation.mutate({ id: props.reservation.id })}
        >
          {label}
        </Button>
      </div>
    </Dialog>
  )
}

function TransferCommand(props: {
  transfer: StockTransfer
  kind: "confirm" | "complete"
  reload: () => Promise<unknown>
}) {
  const scope = useContext(ApiRuntime)
  const [open, setOpen] = createSignal(false)
  const mutation = props.kind === "confirm"
    ? createConfirmTransferMutation(scope, () => setOpen(false))
    : createCompleteTransferMutation(scope, () => setOpen(false))
  const label = props.kind === "confirm" ? "Confirm transfer" : "Complete transfer"
  return (
    <Dialog
      open={open()}
      onOpenChange={createDialogOpenChange(mutation, setOpen)}
      trigger={<span>{label}</span>}
      triggerVariant="secondary"
      title={label}
      description="The Inventory backend rechecks warehouse, line, availability, and lifecycle invariants before applying the command."
    >
      <div class={layout.stack}>
        <p class={layout.code}>{props.transfer.id}</p>
        <CommandFeedback
          error={mutation.error}
          pending={mutation.isPending}
          success={mutation.isSuccess}
          successMessage={`${label} completed.`}
          reload={props.reload}
          reset={() => mutation.reset()}
        />
        <Button
          type="button"
          variant="secondary"
          loading={mutation.isPending}
          disabled={mutation.error?.kind === "unknown-outcome"}
          onClick={() => mutation.mutate({ id: props.transfer.id })}
        >
          {label}
        </Button>
      </div>
    </Dialog>
  )
}

function WarehouseTable(props: { warehouses: readonly Warehouse[] }) {
  return (
    <DataTable
      surface={false}
      caption="Warehouses · first 200 tenant-local records"
      rows={props.warehouses}
      columns={[
        { id: "name", header: "Name", cell: (warehouse) => warehouse.name },
        {
          id: "id",
          header: "Warehouse ID",
          cell: (warehouse) => <span class={layout.code}>{warehouse.id}</span>,
        },
        {
          id: "legalEntityId",
          header: "Legal entity",
          cell: (warehouse) => <span class={layout.code}>{warehouse.legalEntityId}</span>,
        },
        {
          id: "primaryBranchId",
          header: "Primary branch",
          cell: (warehouse) => <span class={layout.code}>{warehouse.primaryBranchId ?? "—"}</span>,
        },
      ]}
    />
  )
}

function ItemTable(props: { items: readonly Item[] }) {
  return (
    <DataTable
      surface={false}
      caption="Items · first 200 tenant-local records"
      rows={props.items}
      columns={[
        {
          id: "sku",
          header: "SKU",
          cell: (item) => <span class={layout.code}>{item.sku}</span>,
        },
        { id: "name", header: "Name", cell: (item) => item.name },
        {
          id: "id",
          header: "Item ID",
          cell: (item) => <span class={layout.code}>{item.id}</span>,
        },
        {
          id: "unitOfMeasure",
          header: "UOM",
          cell: (item) => <span class={layout.code}>{item.unitOfMeasure}</span>,
        },
      ]}
    />
  )
}

function BalanceTable(props: { balances: readonly StockBalance[] }) {
  return (
    <DataTable
      surface={false}
      caption="Stock positions · backend-authoritative quantities"
      rows={props.balances}
      columns={[
        {
          id: "warehouseId",
          header: "Warehouse",
          cell: (balance) => <span class={layout.code}>{balance.warehouseId}</span>,
        },
        {
          id: "itemId",
          header: "Item",
          cell: (balance) => <span class={layout.code}>{balance.itemId}</span>,
        },
        {
          id: "onHand",
          header: "On hand",
          cell: (balance) => <span class={layout.code}>{balance.onHand}</span>,
        },
        {
          id: "reserved",
          header: "Reserved",
          cell: (balance) => <span class={layout.code}>{balance.reserved}</span>,
        },
        {
          id: "available",
          header: "Available",
          cell: (balance) => (
            <span class={layout.code}>
              {String(BigInt(balance.onHand) - BigInt(balance.reserved))}
            </span>
          ),
        },
        {
          id: "unitOfMeasure",
          header: "UOM",
          cell: (balance) => <span class={layout.code}>{balance.unitOfMeasure}</span>,
        },
      ]}
    />
  )
}

function ReservationTable(
  props: { reservations: readonly StockReservation[]; reload: () => Promise<unknown> },
) {
  return (
    <DataTable
      surface={false}
      caption="Reservations · current tenant projection"
      rows={props.reservations}
      columns={[
        {
          id: "id",
          header: "Reservation ID",
          cell: (reservation) => <span class={layout.code}>{reservation.id}</span>,
        },
        {
          id: "warehouseId",
          header: "Warehouse",
          cell: (reservation) => <span class={layout.code}>{reservation.warehouseId}</span>,
        },
        {
          id: "itemId",
          header: "Item",
          cell: (reservation) => <span class={layout.code}>{reservation.itemId}</span>,
        },
        {
          id: "quantity",
          header: "Quantity",
          cell: (reservation) => <span class={layout.code}>{reservation.quantity}</span>,
        },
        {
          id: "status",
          header: "Status",
          cell: (reservation) => (
            <Badge tone={statusTone(reservation.status)}>{reservation.status}</Badge>
          ),
        },
        {
          id: "commands",
          header: "Commands",
          cell: (reservation) => (
            <div class={layout.row}>
              <Show when={reservation.status === "active"}>
                <ReservationCommand
                  reservation={reservation}
                  kind="release"
                  reload={props.reload}
                />
                <ReservationCommand
                  reservation={reservation}
                  kind="fulfill"
                  reload={props.reload}
                />
              </Show>
            </div>
          ),
        },
      ]}
    />
  )
}

function TransferTable(
  props: {
    transfers: readonly StockTransfer[]
    selectedTransferId?: string
    reload: () => Promise<unknown>
  },
) {
  return (
    <DataTable
      surface={false}
      caption="Transfers · lifecycle-controlled warehouse movements"
      rows={props.transfers}
      getRowClass={(transfer) =>
        transfer.id === props.selectedTransferId ? layout.tableRowSelected : undefined}
      columns={[
        {
          id: "id",
          header: "Transfer ID",
          cell: (transfer) => (
            <a class={layout.code} href={`/inventory/${encodeURIComponent(transfer.id)}`}>
              {transfer.id}
            </a>
          ),
        },
        {
          id: "route",
          header: "Route",
          cell: (transfer) => (
            <span class={layout.code}>
              {transfer.sourceWarehouseId} → {transfer.destinationWarehouseId}
            </span>
          ),
        },
        {
          id: "status",
          header: "Status",
          cell: (transfer) => <Badge tone={statusTone(transfer.status)}>{transfer.status}</Badge>,
        },
        { id: "lines", header: "Lines", cell: (transfer) => transfer.lines.length },
        {
          id: "commands",
          header: "Commands",
          cell: (transfer) => (
            <div class={layout.row}>
              <Show when={transfer.status === "draft"}>
                <TransferCommand transfer={transfer} kind="confirm" reload={props.reload} />
              </Show>
              <Show when={transfer.status === "confirmed"}>
                <TransferCommand transfer={transfer} kind="complete" reload={props.reload} />
              </Show>
            </div>
          ),
        },
      ]}
    />
  )
}

function MovementTable(props: { movements: readonly StockMovement[] }) {
  return (
    <DataTable
      surface={false}
      caption="Movement history · append-oriented audit projection"
      rows={props.movements}
      columns={[
        {
          id: "id",
          header: "Movement ID",
          cell: (movement) => <span class={layout.code}>{movement.id}</span>,
        },
        {
          id: "kind",
          header: "Kind",
          cell: (movement) => (
            <Badge tone={movement.kind === "issue" ? "warning" : "info"}>
              {movement.kind}
            </Badge>
          ),
        },
        {
          id: "warehouseId",
          header: "Warehouse",
          cell: (movement) => <span class={layout.code}>{movement.warehouseId}</span>,
        },
        {
          id: "itemId",
          header: "Item",
          cell: (movement) => <span class={layout.code}>{movement.itemId}</span>,
        },
        {
          id: "quantity",
          header: "Quantity",
          cell: (movement) => (
            <span class={layout.code}>{movement.quantity} {movement.unitOfMeasure ?? ""}</span>
          ),
        },
        { id: "reason", header: "Reason", cell: (movement) => movement.reason ?? "—" },
      ]}
    />
  )
}

function InventoryFilters(props: {
  warehouses: readonly Warehouse[]
  items: readonly Item[]
  warehouseId?: string
  itemId?: string
  search?: string
  reservationStatus?: StockReservation["status"]
  transferStatus?: StockTransfer["status"]
  movementKind?: StockMovement["kind"]
}) {
  const navigate = useNavigate()
  return (
    <Form
      class={layout.row}
      aria-label="Filter inventory workspace"
      onSubmit={
        // Fallow: this filter form intentionally validates and serializes several optional fields together.
        // fallow-ignore-next-line complexity
        (value) => {
          const query = new URLSearchParams()
          const warehouseId = requiredText(value.warehouseId)
          const itemId = requiredText(value.itemId)
          const search = requiredText(value.search)
          const reservationStatus = value.reservationStatus
          const transferStatus = value.transferStatus
          const movementKind = value.movementKind
          if (warehouseId !== null) query.set("warehouseId", warehouseId)
          if (itemId !== null) query.set("itemId", itemId)
          if (search !== null) query.set("search", search)
          if (
            reservationStatus === "active" || reservationStatus === "released" ||
            reservationStatus === "fulfilled"
          ) query.set("reservationStatus", reservationStatus)
          if (
            transferStatus === "draft" || transferStatus === "confirmed" ||
            transferStatus === "completed"
          ) query.set("transferStatus", transferStatus)
          if (
            movementKind === "receipt" || movementKind === "issue" ||
            movementKind === "reservation" || movementKind === "release"
          ) query.set("movementKind", movementKind)
          navigate(query.size === 0 ? "/inventory" : `/inventory?${query}`)
        }
      }
    >
      <FormField label="Warehouse">
        {(fieldProps) => (
          <Select
            {...fieldProps}
            name="warehouseId"
            options={props.warehouses.map((warehouse) => ({
              value: warehouse.id,
              label: warehouse.name,
            }))}
            placeholder="All warehouses"
            value={props.warehouseId ?? ""}
          />
        )}
      </FormField>
      <FormField label="Item">
        {(fieldProps) => (
          <Select
            {...fieldProps}
            name="itemId"
            options={props.items.map((item) => ({
              value: item.id,
              label: `${item.sku} · ${item.name}`,
            }))}
            placeholder="All items"
            value={props.itemId ?? ""}
          />
        )}
      </FormField>
      <FormField label="Item search">
        {(fieldProps) => (
          <Input
            {...fieldProps}
            name="search"
            value={props.search ?? ""}
            placeholder="SKU or name"
          />
        )}
      </FormField>
      <FormField label="Reservation status">
        {(fieldProps) => (
          <Select
            {...fieldProps}
            name="reservationStatus"
            options={[{ value: "active", label: "Active" }, {
              value: "released",
              label: "Released",
            }, { value: "fulfilled", label: "Fulfilled" }]}
            placeholder="All reservations"
            value={props.reservationStatus ?? ""}
          />
        )}
      </FormField>
      <FormField label="Transfer status">
        {(fieldProps) => (
          <Select
            {...fieldProps}
            name="transferStatus"
            options={[{ value: "draft", label: "Draft" }, {
              value: "confirmed",
              label: "Confirmed",
            }, { value: "completed", label: "Completed" }]}
            placeholder="All transfers"
            value={props.transferStatus ?? ""}
          />
        )}
      </FormField>
      <FormField label="Movement kind">
        {(fieldProps) => (
          <Select
            {...fieldProps}
            name="movementKind"
            options={[{ value: "receipt", label: "Receipt" }, { value: "issue", label: "Issue" }, {
              value: "reservation",
              label: "Reservation",
            }, { value: "release", label: "Release" }]}
            placeholder="All movements"
            value={props.movementKind ?? ""}
          />
        )}
      </FormField>
      <Button variant="primary" type="submit">Apply filters</Button>
      <a href="/inventory">Clear filters</a>
    </Form>
  )
}

function TransferDetail(props: { transfer: StockTransfer; reload: () => Promise<unknown> }) {
  return (
    <section class={layout.stack} aria-labelledby="inventory-transfer-detail-heading">
      <div class={layout.row}>
        <h2 id="inventory-transfer-detail-heading">Transfer detail</h2>
        <Button type="button" onClick={() => void props.reload()}>Reload</Button>
      </div>
      <dl class={layout.detailList}>
        <div class={layout.detailItem}>
          <dt class={layout.detailTerm}>Transfer ID</dt>
          <dd class={[layout.detailValue, layout.code]}>{props.transfer.id}</dd>
        </div>
        <div class={layout.detailItem}>
          <dt class={layout.detailTerm}>Status</dt>
          <dd class={layout.detailValue}>
            <Badge tone={statusTone(props.transfer.status)}>{props.transfer.status}</Badge>
          </dd>
        </div>
        <div class={layout.detailItem}>
          <dt class={layout.detailTerm}>Source</dt>
          <dd class={[layout.detailValue, layout.code]}>{props.transfer.sourceWarehouseId}</dd>
        </div>
        <div class={layout.detailItem}>
          <dt class={layout.detailTerm}>Destination</dt>
          <dd class={[layout.detailValue, layout.code]}>{props.transfer.destinationWarehouseId}</dd>
        </div>
      </dl>
      <section class={[surface(), layout.stack]} aria-labelledby="inventory-transfer-lines-heading">
        <h3 id="inventory-transfer-lines-heading">Transfer lines</h3>
        <div class={layout.scroll}>
          <table>
            <thead>
              <tr>
                <th scope="col">Item</th>
                <th scope="col">Quantity</th>
              </tr>
            </thead>
            <tbody>
              <For each={props.transfer.lines}>
                {(line) => (
                  <tr>
                    <td class={layout.code}>{line.itemId}</td>
                    <td class={layout.code}>{line.quantity}</td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
      </section>
      <section
        class={[surface(), layout.stack]}
        aria-labelledby="inventory-transfer-actions-heading"
      >
        <h3 id="inventory-transfer-actions-heading">Eligible commands</h3>
        <p>
          Transfer state changes are revalidated by Inventory and refresh positions and movement
          history after success.
        </p>
        <div class={layout.row}>
          <Show when={props.transfer.status === "draft"}>
            <TransferCommand transfer={props.transfer} kind="confirm" reload={props.reload} />
          </Show>
          <Show when={props.transfer.status === "confirmed"}>
            <TransferCommand transfer={props.transfer} kind="complete" reload={props.reload} />
          </Show>
          <Show when={props.transfer.status === "completed"}>
            <p class={layout.muted}>This transfer is complete.</p>
          </Show>
        </div>
      </section>
    </section>
  )
}

// Fallow: the Inventory workspace intentionally composes tenant-scoped master data and stock workflows.
// fallow-ignore-next-line complexity
export function Inventory(props: {
  selectedTransferId?: string
  warehouseId?: string
  itemId?: string
  search?: string
  reservationStatus?: StockReservation["status"]
  transferStatus?: StockTransfer["status"]
  movementKind?: StockMovement["kind"]
}) {
  const scope = useContext(ApiRuntime)
  const warehouses = createWarehousesQuery(scope, { limit: 200 })
  const items = createItemsQuery(scope, {
    ...(props.search === undefined ? {} : { search: props.search }),
    limit: 200,
  })
  const balances = createStockBalancesQuery(scope, {
    ...(props.warehouseId === undefined ? {} : { warehouseId: props.warehouseId }),
    ...(props.itemId === undefined ? {} : { itemId: props.itemId }),
    limit: 200,
  })
  const reservations = createStockReservationsQuery(scope, {
    ...(props.warehouseId === undefined ? {} : { warehouseId: props.warehouseId }),
    ...(props.itemId === undefined ? {} : { itemId: props.itemId }),
    ...(props.reservationStatus === undefined ? {} : { status: props.reservationStatus }),
    limit: 200,
  })
  const transfers = createStockTransfersQuery(scope, {
    ...(props.warehouseId === undefined ? {} : { warehouseId: props.warehouseId }),
    ...(props.transferStatus === undefined ? {} : { status: props.transferStatus }),
    limit: 200,
  })
  const movements = createStockMovementsQuery(scope, {
    ...(props.warehouseId === undefined ? {} : { warehouseId: props.warehouseId }),
    ...(props.itemId === undefined ? {} : { itemId: props.itemId }),
    ...(props.movementKind === undefined ? {} : { kind: props.movementKind }),
    limit: 200,
  })
  const reload = () =>
    Promise.all([
      warehouses.refetch(),
      items.refetch(),
      balances.refetch(),
      reservations.refetch(),
      transfers.refetch(),
      movements.refetch(),
    ])
  const warehouseData = createMemo(() => warehouses.data ?? [])
  const itemData = createMemo(() => items.data ?? [])
  const balanceData = createMemo(() => balances.data ?? [])
  const reservationData = createMemo(() => reservations.data ?? [])
  const transferData = createMemo(() => transfers.data ?? [])
  const movementData = createMemo(() => movements.data ?? [])
  const selectedTransfer = createMemo(() =>
    transferData().find((transfer) => transfer.id === props.selectedTransferId)
  )
  return (
    <QueryBoundary label="Inventory" retry={reload}>
      <EntityWorkspace
        title="Inventory"
        description={
          <p>
            Tenant-local warehouses, items, stock positions, reservations, transfers, and movement
            history. All quantities and commands come from the Inventory service.
          </p>
        }
        headerActions={
          <div class={layout.row}>
            <CreateWarehouseDialog reload={reload} />
            <CreateItemDialog reload={reload} />
            <ReceiveStockDialog warehouses={warehouseData()} items={itemData()} reload={reload} />
            <AdjustStockDialog warehouses={warehouseData()} items={itemData()} reload={reload} />
            <ReserveStockDialog warehouses={warehouseData()} items={itemData()} reload={reload} />
            <CreateTransferDialog
              warehouses={warehouseData()}
              items={itemData()}
              reload={reload}
            />
            <Button type="button" onClick={() => void reload()}>Reload</Button>
          </div>
        }
        toolbar={
          <InventoryFilters
            warehouses={warehouseData()}
            items={itemData()}
            warehouseId={props.warehouseId}
            itemId={props.itemId}
            search={props.search}
            reservationStatus={props.reservationStatus}
            transferStatus={props.transferStatus}
            movementKind={props.movementKind}
          />
        }
        aside={selectedTransfer()
          ? <TransferDetail transfer={selectedTransfer()!} reload={reload} />
          : undefined}
      >
        <section class={[surface(), layout.stack]} aria-labelledby="inventory-lookups-heading">
          <div class={layout.row}>
            <div class={layout.stack}>
              <h2 id="inventory-lookups-heading">Warehouse and item master data</h2>
              <p>Administration records are tenant-scoped and bounded to 200 rows.</p>
            </div>
          </div>
          <Show
            when={warehouseData().length > 0}
            fallback={<p role="status">No warehouses registered.</p>}
          >
            <WarehouseTable warehouses={warehouseData()} />
          </Show>
          <Show
            when={itemData().length > 0}
            fallback={<p role="status">No items match the current search.</p>}
          >
            <ItemTable items={itemData()} />
          </Show>
        </section>
        <section class={[surface(), layout.stack]} aria-labelledby="inventory-position-heading">
          <div class={layout.row}>
            <div class={layout.stack}>
              <h2 id="inventory-position-heading">Stock positions</h2>
              <p>
                Available is displayed from the server-returned on-hand and reserved quantities; it
                is not a local authority.
              </p>
            </div>
          </div>
          <Show
            when={balanceData().length > 0}
            fallback={<p role="status">No stock positions match the current filters.</p>}
          >
            <BalanceTable balances={balanceData()} />
          </Show>
        </section>
        <section
          class={[surface(), layout.stack]}
          aria-labelledby="inventory-reservations-heading"
        >
          <h2 id="inventory-reservations-heading">Reservations</h2>
          <Show
            when={reservationData().length > 0}
            fallback={<p role="status">No reservations match the current filters.</p>}
          >
            <ReservationTable reservations={reservationData()} reload={reload} />
          </Show>
        </section>
        <section class={[surface(), layout.stack]} aria-labelledby="inventory-transfers-heading">
          <h2 id="inventory-transfers-heading">Transfers</h2>
          <Show
            when={transferData().length > 0}
            fallback={<p role="status">No transfers match the current filters.</p>}
          >
            <TransferTable
              transfers={transferData()}
              selectedTransferId={props.selectedTransferId}
              reload={reload}
            />
          </Show>
        </section>
        <section class={[surface(), layout.stack]} aria-labelledby="inventory-history-heading">
          <h2 id="inventory-history-heading">History and exceptions</h2>
          <p>
            Movement history is the append-oriented evidence projection. Rejected or unknown-outcome
            commands stay visible through the command feedback and require a reload before retry.
          </p>
          <Show
            when={movementData().length > 0}
            fallback={<p role="status">No movement history matches the current filters.</p>}
          >
            <MovementTable movements={movementData()} />
          </Show>
        </section>
      </EntityWorkspace>
    </QueryBoundary>
  )
}

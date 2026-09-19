import { Dialog as KobalteDialog, useDialogContext } from "@kobalte/core/dialog"
import type { JSX } from "@solidjs/web"
import { css } from "../generated/css/index.js"
import { Button } from "./button.tsx"

export const createDialogOpenChange = (
  mutation: { readonly isPending: boolean; readonly reset: () => void },
  setOpen: (open: boolean) => void,
  resetField?: (invalid: boolean) => void,
  afterReset?: () => void,
) =>
// Fallow: this helper intentionally centralizes pending guards and dialog reset branches.
// fallow-ignore-next-line complexity
(next: boolean) => {
  if (mutation.isPending) return
  if (next) {
    mutation.reset()
    resetField?.(false)
    afterReset?.()
  }
  setOpen(next)
}

export interface DialogProps {
  readonly trigger?: JSX.Element
  readonly triggerVariant?: "primary" | "secondary" | "danger"
  readonly title: string
  readonly description?: string
  readonly children?: JSX.Element
  readonly footer?: JSX.Element
  readonly open?: boolean
  readonly onOpenChange?: (open: boolean) => void
}

const styles = {
  overlay: css({ position: "fixed", inset: "0", zIndex: "modal", bg: "backdrop" }),
  content: css({
    position: "fixed",
    top: "[50%]",
    left: "[50%]",
    zIndex: "modal",
    width: "dialog",
    maxWidth: "[32rem]",
    maxHeight: "[calc(100vh - 2rem)]",
    overflow: "auto",
    transform: "translate(-50%, -50%)",
    bg: "content",
    color: "text",
    borderWidth: "1px",
    borderColor: "boundary",
    borderRadius: "md",
    p: "6",
    boxShadow: "lg",
  }),
  close: css({ position: "absolute", top: "3", right: "3" }),
  body: css({ display: "flex", flexDirection: "column", gap: "3" }),
  footer: css({ display: "flex", justifyContent: "flex-end", gap: "3", mt: "6" }),
}

function DialogBody(props: DialogProps) {
  const dialog = useDialogContext()
  return (
    <KobalteDialog.Content
      class={styles.content}
      onEscapeKeyDown={() => dialog.close()}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault()
          dialog.close()
        }
      }}
    >
      <KobalteDialog.CloseButton
        as={Button}
        class={styles.close}
        iconOnly
        aria-label="Close"
        type="button"
      >
        ×
      </KobalteDialog.CloseButton>
      <div class={styles.body}>
        <KobalteDialog.Title>{props.title}</KobalteDialog.Title>
        {props.description && (
          <KobalteDialog.Description>{props.description}</KobalteDialog.Description>
        )}
        {props.children}
      </div>
      {props.footer && <div class={styles.footer}>{props.footer}</div>}
    </KobalteDialog.Content>
  )
}

export function Dialog(props: DialogProps) {
  return (
    <KobalteDialog
      modal
      {...(props.open === undefined ? {} : { open: props.open, onOpenChange: props.onOpenChange })}
    >
      {props.trigger && (
        <KobalteDialog.Trigger as={Button} variant={props.triggerVariant} type="button">
          {props.trigger}
        </KobalteDialog.Trigger>
      )}
      <KobalteDialog.Portal>
        <KobalteDialog.Overlay class={styles.overlay} />
        <DialogBody {...props} />
      </KobalteDialog.Portal>
    </KobalteDialog>
  )
}

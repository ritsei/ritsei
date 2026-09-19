import { createUniqueId, untrack } from "solid-js"
import type { JSX } from "@solidjs/web"
import { css } from "../generated/css/index.js"

export interface FormFieldProps {
  readonly id?: string
  readonly label: string
  readonly helperText?: string
  readonly error?: string
  readonly required?: boolean
  readonly children:
    | JSX.Element
    | ((props: { id: string; "aria-describedby"?: string; "aria-invalid"?: "true" }) => JSX.Element)
}

const styles = {
  root: css({ display: "flex", flexDirection: "column", gap: "2" }),
  label: css({ textStyle: "label" }),
  help: css({ textStyle: "helper", color: "muted" }),
  error: css({ textStyle: "helper", color: "danger" }),
}

export function FormField(props: FormFieldProps) {
  const id = untrack(() => props.id) ?? createUniqueId()
  const children = untrack(() => props.children)
  const descriptionId = `${id}-help`
  const errorId = `${id}-error`
  const describedBy = () =>
    [props.helperText && descriptionId, props.error && errorId].filter(Boolean).join(" ") ||
    undefined
  const controlProps = () => ({
    id,
    "aria-describedby": describedBy(),
    "aria-invalid": props.error ? "true" as const : undefined,
  })
  return (
    <div class={styles.root}>
      <label class={styles.label} for={id}>
        {props.label}
        {props.required && <span aria-hidden="true">*</span>}
      </label>
      {typeof children === "function" ? children(controlProps()) : children}
      {props.helperText && <div class={styles.help} id={descriptionId}>{props.helperText}</div>}
      {props.error && <div class={styles.error} id={errorId} role="alert">{props.error}</div>}
    </div>
  )
}

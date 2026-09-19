import { omit } from "solid-js"
import type { JSX } from "@solidjs/web"
import { css } from "../generated/css/index.js"
import { control } from "../recipes/control.ts"

type ButtonBaseProps = Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, "class" | "aria-label"> & {
  variant?: "primary" | "secondary" | "danger"
  loading?: boolean
  class?: JSX.ClassValue
}

export type ButtonProps =
  & ButtonBaseProps
  & (
    | { iconOnly: true; "aria-label": string }
    | { iconOnly?: false | undefined; "aria-label"?: string }
  )

const styles = {
  danger: css({ bg: "danger", color: "onAction", cursor: "pointer" }),
  loading: css({ cursor: "wait" }),
  iconOnly: css({ px: "2", minWidth: "11" }),
}

export function Button(props: ButtonProps) {
  const buttonProps = omit(props, "variant", "loading", "iconOnly", "class", "children")
  const variant = () => props.variant ?? "secondary"
  return (
    <button
      {...buttonProps}
      aria-busy={props.loading ? "true" : undefined}
      disabled={props.disabled || props.loading}
      class={[
        control(variant() === "primary" ? { kind: "action" } : {}),
        variant() === "danger" && styles.danger,
        props.loading && styles.loading,
        props.iconOnly && styles.iconOnly,
        props.class,
      ]}
    >
      {props.loading ? "Loading…" : props.children}
    </button>
  )
}

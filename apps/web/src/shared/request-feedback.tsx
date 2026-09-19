import type { JSX } from "@solidjs/web"
import { Errored, Loading, Show } from "solid-js"
import { failureMessage, type RequestFailure } from "./api.ts"
import { layout } from "../ui/foundations/layout.ts"
import { Button } from "../ui/primitives/button.tsx"

export interface CommandFeedbackProps {
  readonly area?: string
  readonly error?: RequestFailure | null
  readonly pending: boolean
  readonly success: boolean
  readonly successMessage: string
  readonly reload: () => Promise<unknown>
  readonly reset: () => void
}

// Fallow: this shared boundary intentionally combines error, unknown-outcome, and status paths.
// fallow-ignore-next-line complexity
export function CommandFeedback(props: CommandFeedbackProps) {
  return (
    <>
      <Show when={props.error} keyed>
        {(error) => <p role="alert">{failureMessage(error)}</p>}
      </Show>
      <Show when={props.error?.kind === "unknown-outcome"}>
        <Button
          type="button"
          onClick={() => {
            void props.reload().then(props.reset)
          }}
        >
          Reload {props.area ?? "this workspace"} before retrying
        </Button>
      </Show>
      <p role="status">
        {props.pending ? "Saving…" : props.success ? props.successMessage : ""}
      </p>
    </>
  )
}

export interface QueryBoundaryProps {
  readonly label: string
  readonly retry: () => Promise<unknown>
  readonly retryLabel?: string
  readonly children: JSX.Element
  readonly errorPrefix?: string
  readonly retryPrefix?: string
  readonly variant?: "default" | "retry"
}

export function QueryBoundary(props: QueryBoundaryProps) {
  const errorPrefix = () =>
    props.variant === "retry"
      ? "Unable to load "
      : props.errorPrefix === undefined
      ? ""
      : `${props.errorPrefix} `
  const retryLabel = () =>
    props.retryLabel ??
      (props.variant === "retry"
        ? `Retry ${props.label}`
        : props.retryPrefix === undefined
        ? `Try loading ${props.label} again`
        : `${props.retryPrefix} ${props.label}`)
  return (
    <Errored
      fallback={(error, reset) => (
        <div class={layout.stack}>
          <p role="alert">
            {errorPrefix()}
            {props.variant === "retry" || props.errorPrefix ? `${props.label}: ` : ""}
            {failureMessage(error())}
          </p>
          <Button type="button" onClick={() => void props.retry().then(() => reset())}>
            {retryLabel()}
          </Button>
        </div>
      )}
    >
      <Loading fallback={<p role="status" aria-busy="true">Loading {props.label}…</p>}>
        {props.children}
      </Loading>
    </Errored>
  )
}

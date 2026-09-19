import type { JSX } from "@solidjs/web"
import { layout } from "../foundations/layout.ts"
import { surface } from "../recipes/surface.ts"

export interface EntityWorkspaceProps {
  readonly title: string
  readonly description?: JSX.Element
  readonly headerActions?: JSX.Element
  readonly toolbar?: JSX.Element
  readonly children: JSX.Element
  readonly aside?: JSX.Element
  readonly class?: JSX.ClassValue
}

export function EntityWorkspace(props: EntityWorkspaceProps) {
  return (
    <section class={[layout.stack, props.class]} aria-label={props.title}>
      <header class={layout.row}>
        <div class={layout.stack}>
          <h1>{props.title}</h1>
          {props.description}
        </div>
        {props.headerActions}
      </header>
      {props.toolbar && <div class={surface()}>{props.toolbar}</div>}
      <div class={layout.workspaceSplit}>
        <div class={layout.stack}>{props.children}</div>
        {props.aside && (
          <aside class={surface()} aria-label="Related information">{props.aside}</aside>
        )}
      </div>
    </section>
  )
}

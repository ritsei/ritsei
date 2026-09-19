import type { JSX } from "@solidjs/web"
import { For, Show } from "solid-js"
import { css } from "../generated/css/index.js"
import { layout } from "../foundations/layout.ts"
import { surface } from "../recipes/surface.ts"

export interface DataColumn<Row> {
  readonly id: string
  readonly header: JSX.Element
  readonly cell: (row: Row, index: number) => JSX.Element
  readonly rowHeader?: boolean
  readonly align?: "start" | "end"
}

export interface DataTableProps<Row> {
  readonly caption: string
  readonly columns: readonly DataColumn<Row>[]
  readonly rows: readonly Row[]
  readonly getRowId?: (row: Row, index: number) => string
  readonly getRowClass?: (row: Row, index: number) => JSX.ClassValue
  readonly loading?: boolean
  readonly error?: JSX.Element
  readonly empty?: JSX.Element
  readonly surface?: boolean
  readonly tableClass?: JSX.ClassValue
  readonly captionClass?: JSX.ClassValue
  readonly cellClass?: JSX.ClassValue
  readonly class?: JSX.ClassValue
}

const styles = {
  end: css({ textAlign: "end" }),
}

const cellClass = (align: DataColumn<unknown>["align"]) => align === "end" ? styles.end : undefined

/**
 * Semantic table markup. Sorting, pagination, and selection stay outside this renderer until the
 * approved TanStack Table adapter is activated.
 */
export function DataTable<Row>(props: DataTableProps<Row>) {
  return (
    <div class={[props.surface === false ? undefined : surface(), layout.scroll, props.class]}>
      <table class={props.tableClass} aria-busy={props.loading ? "true" : undefined}>
        <caption class={props.captionClass}>{props.caption}</caption>
        <thead>
          <tr>
            <For each={props.columns}>
              {(column) => (
                <th
                  scope="col"
                  class={[props.cellClass, cellClass(column.align)]}
                >
                  {column.header}
                </th>
              )}
            </For>
          </tr>
        </thead>
        <tbody>
          <Show
            when={!props.loading && props.error === undefined && props.rows.length > 0}
            fallback={
              <tr>
                <td colspan={props.columns.length}>
                  <Show when={props.loading} fallback={props.error ?? props.empty ?? "No records."}>
                    <span role="status">Loading…</span>
                  </Show>
                </td>
              </tr>
            }
          >
            <For each={props.rows}>
              {(row, index) => (
                <tr
                  class={props.getRowClass?.(row, index())}
                  data-row-id={props.getRowId?.(row, index())}
                >
                  <For each={props.columns}>
                    {(column) => (
                      <Show
                        when={column.rowHeader}
                        fallback={
                          <td class={[props.cellClass, cellClass(column.align)]}>
                            {column.cell(row, index())}
                          </td>
                        }
                      >
                        <th
                          scope="row"
                          class={[props.cellClass, cellClass(column.align)]}
                        >
                          {column.cell(row, index())}
                        </th>
                      </Show>
                    )}
                  </For>
                </tr>
              )}
            </For>
          </Show>
        </tbody>
      </table>
    </div>
  )
}

import { useLocation, useParams } from "@solidjs/router"
import { createMemo, Show } from "solid-js"
import * as Schema from "effect/Schema"
import { Sales } from "../features/sales/sales.tsx"
import { ConnectedSessionRoute } from "./connected-route.tsx"
import { decodeRouteInput } from "./route-input.ts"

const RouteInput = Schema.Struct({
  id: Schema.optionalKey(Schema.String.check(Schema.isUUID())),
  customerId: Schema.optionalKey(Schema.String.check(Schema.isUUID())),
  quotationStatus: Schema.optionalKey(
    Schema.Literals(["draft", "sent", "accepted", "rejected", "expired"]),
  ),
  orderStatus: Schema.optionalKey(Schema.Literals(["draft", "confirmed", "cancelled"])),
  search: Schema.optionalKey(Schema.Trim.pipe(
    Schema.check(Schema.isPattern(/\S/)),
    Schema.check(Schema.isMaxLength(256)),
  )),
})

type SalesDetail = "customer" | "quotation" | "order"

function detailKind(pathname: string): SalesDetail | undefined {
  if (pathname.startsWith("/sales/customers/")) return "customer"
  if (pathname.startsWith("/sales/quotations/")) return "quotation"
  if (pathname.startsWith("/sales/orders/")) return "order"
  return undefined
}

export default function SalesRoute() {
  const location = useLocation()
  const params = useParams<{ id?: string }>()
  const route = createMemo(() => decodeRouteInput(RouteInput, location.search, params.id))
  const detail = createMemo(() => detailKind(location.pathname))
  return (
    <Show
      when={route()}
      keyed
      fallback={
        <section>
          <h1>Invalid Sales route</h1>
          <p role="alert">Use a valid Sales record ID and supported filters.</p>
          <a href="/sales">Open Sales</a>
        </section>
      }
    >
      {(route) => (
        <ConnectedSessionRoute
          title="Sales"
          description="Connect a valid session to view Sales operations."
        >
          {() => (
            <Sales
              selectedCustomerId={detail() === "customer" ? route.id : undefined}
              selectedQuotationId={detail() === "quotation" ? route.id : undefined}
              selectedOrderId={detail() === "order" ? route.id : undefined}
              customerId={route.customerId}
              quotationStatus={route.quotationStatus}
              orderStatus={route.orderStatus}
              search={route.search}
            />
          )}
        </ConnectedSessionRoute>
      )}
    </Show>
  )
}

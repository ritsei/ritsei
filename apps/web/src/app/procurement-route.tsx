import { useLocation, useParams } from "@solidjs/router"
import { createMemo } from "solid-js"
import * as Schema from "effect/Schema"
import { Procurement } from "../features/procurement/procurement.tsx"
import { DecodedConnectedSessionRoute } from "./connected-route.tsx"
import { decodeRouteInput } from "./route-input.ts"

const RouteInput = Schema.Struct({
  id: Schema.optionalKey(Schema.String.check(Schema.isUUID())),
  supplierAccountId: Schema.optionalKey(Schema.String.check(Schema.isUUID())),
  status: Schema.optionalKey(Schema.Literals(["draft", "confirmed", "cancelled"])),
})

export default function ProcurementRoute() {
  const location = useLocation()
  const params = useParams<{ id?: string }>()
  const route = createMemo(() => decodeRouteInput(RouteInput, location.search, params.id))
  return (
    <DecodedConnectedSessionRoute
      route={route}
      invalidTitle="Invalid route"
      invalidDescription="Use a valid Purchase Order ID and supported filters."
      invalidHref="/procurement"
      invalidLink="Open Procurement"
      title="Procurement"
      description="Connect a valid session to view procurement operations."
    >
      {(route) => (
        <Procurement
          selectedPurchaseOrderId={route.id}
          supplierAccountId={route.supplierAccountId}
          status={route.status}
        />
      )}
    </DecodedConnectedSessionRoute>
  )
}

import { useLocation, useParams } from "@solidjs/router"
import { createMemo } from "solid-js"
import * as Schema from "effect/Schema"
import { Inventory } from "../features/inventory/inventory.tsx"
import { DecodedConnectedSessionRoute } from "./connected-route.tsx"
import { decodeRouteInput } from "./route-input.ts"

const RouteInput = Schema.Struct({
  id: Schema.optionalKey(Schema.String.check(Schema.isUUID())),
  warehouseId: Schema.optionalKey(Schema.String.check(Schema.isUUID())),
  itemId: Schema.optionalKey(Schema.String.check(Schema.isUUID())),
  search: Schema.optionalKey(Schema.String),
  reservationStatus: Schema.optionalKey(Schema.Literals(["active", "released", "fulfilled"])),
  transferStatus: Schema.optionalKey(Schema.Literals(["draft", "confirmed", "completed"])),
  movementKind: Schema.optionalKey(Schema.Literals(["receipt", "issue", "reservation", "release"])),
})

export default function InventoryRoute() {
  const location = useLocation()
  const params = useParams<{ id?: string }>()
  const route = createMemo(() => decodeRouteInput(RouteInput, location.search, params.id))
  return (
    <DecodedConnectedSessionRoute
      route={route}
      invalidTitle="Invalid route"
      invalidDescription="Use valid inventory IDs and supported filters."
      invalidHref="/inventory"
      invalidLink="Open Inventory"
      title="Inventory"
      description="Connect a valid session to view inventory operations."
    >
      {(route) => (
        <Inventory
          selectedTransferId={route.id}
          warehouseId={route.warehouseId}
          itemId={route.itemId}
          search={route.search}
          reservationStatus={route.reservationStatus}
          transferStatus={route.transferStatus}
          movementKind={route.movementKind}
        />
      )}
    </DecodedConnectedSessionRoute>
  )
}

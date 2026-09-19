import { useLocation, useParams } from "@solidjs/router"
import { createMemo } from "solid-js"
import * as Schema from "effect/Schema"
import { Parties } from "../features/party/parties.tsx"
import { DecodedConnectedSessionRoute } from "./connected-route.tsx"
import { decodeRouteInput } from "./route-input.ts"

const RouteInput = Schema.Struct({
  id: Schema.optionalKey(Schema.String.check(Schema.isUUID())),
  search: Schema.optionalKey(Schema.String.check(
    Schema.isPattern(/\S/),
    Schema.isTrimmed(),
    Schema.isMaxLength(160),
  )),
  kind: Schema.optionalKey(Schema.Literals(["person", "organization"])),
})

export default function PartiesRoute() {
  const location = useLocation()
  const params = useParams<{ id?: string }>()
  const route = createMemo(() => decodeRouteInput(RouteInput, location.search, params.id))
  return (
    <DecodedConnectedSessionRoute
      route={route}
      invalidTitle="Invalid route"
      invalidDescription="Use a valid Party ID and supported directory filters."
      invalidHref="/parties"
      invalidLink="Open Parties"
      title="Parties"
      description="Connect a valid session to view Party records."
    >
      {(route) => (
        <Parties
          selectedPartyId={route.id}
          search={route.search}
          kind={route.kind}
        />
      )}
    </DecodedConnectedSessionRoute>
  )
}

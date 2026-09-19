import { useLocation, useParams } from "@solidjs/router"
import { createMemo } from "solid-js"
import * as Schema from "effect/Schema"
import { Accounts } from "../features/identity/accounts.tsx"
import { DecodedConnectedSessionRoute } from "./connected-route.tsx"
import { decodeRouteInput } from "./route-input.ts"

const RouteInput = Schema.Struct({
  id: Schema.optionalKey(Schema.String.check(Schema.isUUID())),
})

export default function AccountsRoute() {
  const location = useLocation()
  const params = useParams<{ id?: string }>()
  const route = createMemo(() => decodeRouteInput(RouteInput, location.search, params.id))
  return (
    <DecodedConnectedSessionRoute
      route={route}
      invalidTitle="Invalid route"
      invalidDescription="This page does not accept URL parameters."
      invalidHref="/user-accounts"
      invalidLink="Open user accounts"
      title="User accounts"
      description="Connect a valid session to view accounts."
    >
      {(route) => <Accounts selectedAccountId={route.id} />}
    </DecodedConnectedSessionRoute>
  )
}

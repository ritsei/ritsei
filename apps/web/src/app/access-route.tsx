import { useLocation, useParams } from "@solidjs/router"
import { createMemo } from "solid-js"
import * as Schema from "effect/Schema"
import { Access } from "../features/authorization/access.tsx"
import { TenantMembershipStatus } from "../shared/contracts/generated/authorization.ts"
import { DecodedConnectedSessionRoute } from "./connected-route.tsx"
import { decodeRouteInput } from "./route-input.ts"

const RouteInput = Schema.Struct({
  id: Schema.optionalKey(Schema.String.check(Schema.isUUID())),
  search: Schema.optionalKey(
    Schema.String.check(Schema.isTrimmed()).check(Schema.isPattern(/\S/)),
  ),
  status: Schema.optionalKey(TenantMembershipStatus),
})

export default function AccessRoute() {
  const location = useLocation()
  const params = useParams<{ id?: string }>()
  const route = createMemo(() => decodeRouteInput(RouteInput, location.search, params.id))
  return (
    <DecodedConnectedSessionRoute
      route={route}
      invalidTitle="Invalid route"
      invalidDescription="Use only account-ID search and membership status filters."
      invalidHref="/access"
      invalidLink="Open Access"
      title="Access"
      description="Connect a valid session to administer tenant access."
    >
      {(route) => (
        <Access
          selectedUserAccountId={route.id}
          search={route.search}
          status={route.status}
        />
      )}
    </DecodedConnectedSessionRoute>
  )
}

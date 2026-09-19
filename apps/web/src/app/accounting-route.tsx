import { useLocation, useParams } from "@solidjs/router"
import { createMemo } from "solid-js"
import * as Schema from "effect/Schema"
import { Accounting } from "../features/accounting/accounting.tsx"
import { DecodedConnectedSessionRoute } from "./connected-route.tsx"
import { decodeRouteInput } from "./route-input.ts"

const RouteInput = Schema.Struct({
  id: Schema.optionalKey(Schema.String.check(Schema.isUUID())),
  legalEntityId: Schema.optionalKey(Schema.String.check(Schema.isUUID())),
  accountType: Schema.optionalKey(
    Schema.Literals(["asset", "liability", "equity", "revenue", "expense"]),
  ),
  periodStatus: Schema.optionalKey(Schema.Literals(["open", "closed"])),
  journalStatus: Schema.optionalKey(Schema.Literals(["posted", "reversed"])),
})

export default function AccountingRoute() {
  const location = useLocation()
  const params = useParams<{ id?: string }>()
  const route = createMemo(() => decodeRouteInput(RouteInput, location.search, params.id))
  return (
    <DecodedConnectedSessionRoute
      route={route}
      invalidTitle="Invalid Accounting route"
      invalidDescription="Use a valid journal ID and supported Accounting filters."
      invalidHref="/accounting"
      invalidLink="Open Accounting"
      title="Accounting"
      description="Connect a valid session to view Accounting operations."
    >
      {(route) => (
        <Accounting
          selectedJournalId={route.id}
          legalEntityId={route.legalEntityId}
          accountType={route.accountType}
          periodStatus={route.periodStatus}
          journalStatus={route.journalStatus}
        />
      )}
    </DecodedConnectedSessionRoute>
  )
}

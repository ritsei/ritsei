import { ConnectedSessionRoute } from "./connected-route.tsx"
import { ProcessStudio } from "../features/process-studio/process.tsx"

export default function ProcessRoute() {
  return (
    <ConnectedSessionRoute
      title="Process Studio"
      description="Connect a valid session to view governed process operations."
    >
      {() => <ProcessStudio />}
    </ConnectedSessionRoute>
  )
}

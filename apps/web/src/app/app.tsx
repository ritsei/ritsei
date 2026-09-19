import { createRouter, useNavigate } from "@solidjs/router"
import { createSignal, lazy, onSettled, Show, useContext } from "solid-js"
import { AuthClientFailure, getAuthSession } from "./auth-client.ts"
import type { AuthSession } from "../shared/contracts/generated/auth.ts"
import type { Session } from "../shared/session.ts"
import { layout } from "../ui/foundations/layout.ts"
import { OperationalWorkspace } from "../ui/patterns/operational-workspace.tsx"
import { surface } from "../ui/recipes/surface.ts"
import { AuthCallback } from "./auth-callback.tsx"
import { Connection } from "./connection.tsx"
import {
  type AuthenticatedUser,
  type Capability,
  SessionContext,
  type TenantOption,
} from "./session.ts"
import { ApplicationShell } from "./shell.tsx"

const AccessRoute = lazy(() => import("./access-route.tsx"))
const AccountsRoute = lazy(() => import("./accounts-route.tsx"))
const PartiesRoute = lazy(() => import("./parties-route.tsx"))
const ProcurementRoute = lazy(() => import("./procurement-route.tsx"))
const InventoryRoute = lazy(() => import("./inventory-route.tsx"))
const SalesRoute = lazy(() => import("./sales-route.tsx"))
const AccountingRoute = lazy(() => import("./accounting-route.tsx"))
const ProcessRoute = lazy(() => import("./process-route.tsx"))

function HomeRoute() {
  const session = useContext(SessionContext)
  return (
    <Show when={session.current()} keyed fallback={<Connection />}>
      {(current) => (
        <OperationalWorkspace
          title="My work"
          description={<p>Operational situations and assigned work for the active tenant.</p>}
          status={
            <span>
              Connected to tenant{" "}
              <code>{current.tenantId}</code>. Company, location, and fiscal context have not been
              selected.
            </span>
          }
        >
          <section class={[surface(), layout.stack]} aria-labelledby="available-workspace-heading">
            <h2 id="available-workspace-heading">Available workspace</h2>
            <p>
              User-account, Party, tenant Access administration, Sales, Procurement, Inventory, and
              Process Studio operations are connected through public contracts. Additional
              workspaces appear as their public read contracts and commands are connected.
            </p>
            <div class={layout.row}>
              <a href="/user-accounts">Open user accounts</a>
              <a href="/parties">Open Parties</a>
              <a href="/access">Open Access</a>
              <a href="/sales">Open Sales</a>
              <a href="/procurement">Open Procurement</a>
              <a href="/inventory">Open Inventory</a>
              <a href="/accounting">Open Accounting</a>
              <a href="/processes">Open Process Studio</a>
            </div>
          </section>
        </OperationalWorkspace>
      )}
    </Show>
  )
}

function NotFound() {
  return (
    <section class={layout.stack}>
      <h1>Page not found</h1>
      <p>The requested workspace is not registered in this application.</p>
      <a href="/">Return to My work</a>
    </section>
  )
}

function SessionRecovery() {
  const session = useContext(SessionContext)
  const navigate = useNavigate()
  onSettled(() => {
    const recover = () => {
      session.replace(null)
      navigate("/login", { replace: true })
    }
    globalThis.addEventListener("ritsei:unauthorized", recover)
    return () => globalThis.removeEventListener("ritsei:unauthorized", recover)
  })
  return null
}

const Router = createRouter({
  preloadLinks: false,
  routes: [
    { path: "/", component: HomeRoute },
    { path: "/login", component: Connection },
    { path: "/auth/callback", component: AuthCallback },
    { path: "/user-accounts", component: AccountsRoute },
    { path: "/user-accounts/:id", component: AccountsRoute },
    { path: "/parties", component: PartiesRoute },
    { path: "/parties/:id", component: PartiesRoute },
    { path: "/access", component: AccessRoute },
    { path: "/access/:id", component: AccessRoute },
    { path: "/procurement", component: ProcurementRoute },
    { path: "/procurement/:id", component: ProcurementRoute },
    { path: "/inventory", component: InventoryRoute },
    { path: "/inventory/:id", component: InventoryRoute },
    { path: "/sales", component: SalesRoute },
    { path: "/sales/customers/:id", component: SalesRoute },
    { path: "/sales/quotations/:id", component: SalesRoute },
    { path: "/sales/orders/:id", component: SalesRoute },
    { path: "/accounting", component: AccountingRoute },
    { path: "/accounting/:id", component: AccountingRoute },
    { path: "/processes", component: ProcessRoute },
    { path: "/processes/:id", component: ProcessRoute },
    { path: "*missing", component: NotFound },
  ],
})

export function App() {
  const [session, setSession] = createSignal<Session | null>(null)
  const [user, setUser] = createSignal<AuthenticatedUser | null>(null)
  const [tenants, setTenants] = createSignal<readonly TenantOption[]>([])
  const [capabilities, setCapabilities] = createSignal<readonly Capability[]>([])
  const replace = (next: Session | null, details?: AuthSession) => {
    setSession(next)
    if (next === null || details === undefined) {
      setUser(null)
      setTenants([])
      setCapabilities([])
    } else {
      setUser(details.user)
      setTenants(details.memberships)
      setCapabilities(details.capabilities)
    }
  }
  const selectTenant = async (tenantId: string) => {
    if (!tenants().some((tenant) => tenant.tenantId === tenantId)) return
    const current = session()
    if (current === null || current.tenantId === tenantId) return
    try {
      const details = await getAuthSession(current.token, tenantId)
      if (details.activeTenant?.tenantId !== tenantId) return
      setUser(details.user)
      setTenants(details.memberships)
      setCapabilities(details.capabilities)
      setSession({ ...current, tenantId })
    } catch (error) {
      if (error instanceof AuthClientFailure && error.kind === "unauthorized") {
        globalThis.dispatchEvent(new Event("ritsei:unauthorized"))
      }
    }
  }
  return (
    <SessionContext
      value={{ current: session, user, tenants, capabilities, replace, selectTenant }}
    >
      <Router>
        {(props) => (
          <>
            <SessionRecovery />
            <ApplicationShell>{props.children}</ApplicationShell>
          </>
        )}
      </Router>
    </SessionContext>
  )
}

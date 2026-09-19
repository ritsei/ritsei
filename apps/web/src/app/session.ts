import { createContext } from "solid-js"
import type { AuthSession } from "../shared/contracts/generated/auth.ts"
import type { Session } from "../shared/session.ts"

export type TenantOption = AuthSession["memberships"][number]
export type AuthenticatedUser = AuthSession["user"]
export type Capability = AuthSession["capabilities"][number]

type SessionContextValue = {
  readonly current: () => Session | null
  readonly user: () => AuthenticatedUser | null
  readonly tenants: () => readonly TenantOption[]
  readonly capabilities: () => readonly Capability[]
  readonly replace: (session: Session | null, details?: AuthSession) => void
  readonly selectTenant: (tenantId: string) => void
}

export const SessionContext = createContext<SessionContextValue>()

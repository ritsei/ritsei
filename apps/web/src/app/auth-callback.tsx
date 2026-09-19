import { createSignal, onSettled, Show, useContext } from "solid-js"
import { useNavigate } from "@solidjs/router"
import { finishOidcLogin, getAuthConfiguration, getAuthSession } from "./auth-client.ts"
import { SessionContext } from "./session.ts"
import { layout } from "../ui/foundations/layout.ts"
import { surface } from "../ui/recipes/surface.ts"

export function AuthCallback() {
  const session = useContext(SessionContext)
  const navigate = useNavigate()
  const [message, setMessage] = createSignal("Completing sign-in…")

  onSettled(() => {
    void (async () => {
      try {
        const configuration = await getAuthConfiguration()
        const token = await finishOidcLogin(configuration)
        const authenticated = await getAuthSession(token)
        const tenant = authenticated.activeTenant ?? authenticated.memberships[0]
        if (tenant === undefined) {
          setMessage("Sign-in succeeded, but this account has no active tenant membership.")
          return
        }
        session.replace({ token, tenantId: tenant.tenantId }, authenticated)
        navigate("/", { replace: true })
      } catch {
        setMessage("Sign-in could not be completed. Return to the sign-in page and try again.")
      }
    })()
  })

  return (
    <section class={[surface(), layout.stack]} aria-labelledby="callback-heading">
      <h1 id="callback-heading">Sign-in</h1>
      <p role="status" aria-live="polite">{message()}</p>
      <Show
        when={message().startsWith("Sign-in could") || message().startsWith("Sign-in succeeded")}
      >
        <a href="/">Return to sign in</a>
      </Show>
    </section>
  )
}

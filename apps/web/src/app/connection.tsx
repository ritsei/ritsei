import { createSignal, onSettled, Show, useContext } from "solid-js"
import type { AuthConfiguration } from "../shared/contracts/generated/auth.ts"
import { layout } from "../ui/foundations/layout.ts"
import { Button } from "../ui/primitives/button.tsx"
import { surface } from "../ui/recipes/surface.ts"
import {
  AuthClientFailure,
  beginOidcLogin,
  devLogin,
  getAuthConfiguration,
  getAuthSession,
} from "./auth-client.ts"
import { SessionContext } from "./session.ts"
import { useNavigate } from "@solidjs/router"

export function Connection() {
  const session = useContext(SessionContext)
  const navigate = useNavigate()
  const [configuration, setConfiguration] = createSignal<AuthConfiguration | null>(null)
  const [loading, setLoading] = createSignal(true)
  const [pending, setPending] = createSignal(false)
  const [message, setMessage] = createSignal("")

  onSettled(() => {
    void getAuthConfiguration().then(setConfiguration).catch(() => {
      setMessage("Authentication configuration is unavailable.")
    }).finally(() => setLoading(false))
  })

  const connect = async () => {
    setPending(true)
    setMessage("")
    try {
      const login = await devLogin()
      const authenticated = await getAuthSession(login.token)
      const tenant = authenticated.activeTenant ?? authenticated.memberships[0]
      if (tenant === undefined) {
        setMessage("Your account has no active tenant membership.")
        return
      }
      session.replace({ token: login.token, tenantId: tenant.tenantId }, authenticated)
      navigate("/")
    } catch (error) {
      setMessage(
        error instanceof AuthClientFailure && error.kind === "unavailable"
          ? "Authentication service is unavailable."
          : "Sign in could not be completed. Try again.",
      )
    } finally {
      setPending(false)
    }
  }

  const oidc = async () => {
    setPending(true)
    setMessage("")
    try {
      const current = configuration()
      if (current === null) throw new AuthClientFailure("invalid-response")
      await beginOidcLogin(current)
    } catch {
      setPending(false)
      setMessage("The external sign-in configuration is incomplete.")
    }
  }

  return (
    <section class={layout.stack} aria-labelledby="connection-heading">
      <h1 id="connection-heading">Sign in to RITSEI</h1>
      <p>
        Authentication is handled by the configured identity provider. Tenant access is resolved
        from your RITSEI memberships.
      </p>
      <section class={[surface(), layout.stack]} aria-live="polite">
        <Show
          when={!loading()}
          fallback={<p role="status">Loading authentication configuration…</p>}
        >
          <Show
            when={configuration()?.profile === "oidc"}
            fallback={
              <>
                <p>Local transitional authentication is enabled for development.</p>
                <Button
                  variant="primary"
                  type="button"
                  loading={pending()}
                  onClick={() => void connect()}
                >
                  Sign in locally
                </Button>
              </>
            }
          >
            <Button variant="primary" type="button" loading={pending()} onClick={() => void oidc()}>
              Sign in with identity provider
            </Button>
          </Show>
        </Show>
        <Show when={message()}>
          <p role="alert">{message()}</p>
        </Show>
      </section>
    </section>
  )
}

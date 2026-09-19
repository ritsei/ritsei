import { QueryClient, QueryClientProvider } from "@tanstack/solid-query"
import type { JSX } from "@solidjs/web"
import { onCleanup, Show, untrack, useContext } from "solid-js"
import * as Layer from "effect/Layer"
import { BrowserConnection } from "../shared/api.ts"
import { ApiRuntime } from "../shared/runtime.ts"
import type { Session } from "../shared/session.ts"
import { SessionContext } from "./session.ts"
import { createRuntime, RuntimeContext } from "../shared/solid-effect.ts"

export function DecodedConnectedSessionRoute<Route>(props: {
  route: () => Route | null
  invalidTitle: string
  invalidDescription: string
  invalidHref: string
  invalidLink: string
  title: string
  description: string
  children: (route: Route) => JSX.Element
}) {
  return (
    <Show
      when={props.route()}
      keyed
      fallback={
        <section>
          <h1>{props.invalidTitle}</h1>
          <p role="alert">{props.invalidDescription}</p>
          <a href={props.invalidHref}>{props.invalidLink}</a>
        </section>
      }
    >
      {(route) => (
        <ConnectedSessionRoute title={props.title} description={props.description}>
          {() => props.children(route)}
        </ConnectedSessionRoute>
      )}
    </Show>
  )
}

export function ConnectedSessionRoute(props: {
  title: string
  description: string
  children: () => JSX.Element
}) {
  const session = useContext(SessionContext)
  return (
    <Show
      when={session.current()}
      keyed
      fallback={
        <section>
          <h1>{props.title}</h1>
          <p>{props.description}</p>
          <a href="/login">Sign in</a>
        </section>
      }
    >
      {(session) => <SessionRouteBoundary session={session}>{props.children}</SessionRouteBoundary>}
    </Show>
  )
}

function SessionRouteBoundary(props: { session: Session; children: () => JSX.Element }) {
  // The keyed route boundary remounts this owner; credentials are immutable within it.
  const session = untrack(() => props.session)
  const runtime = createRuntime(Layer.succeed(BrowserConnection, session))
  const lifetime = new AbortController()
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: 0,
        gcTime: 0,
        refetchOnWindowFocus: false,
        networkMode: "always",
      },
      mutations: { retry: false, networkMode: "always" },
    },
  })
  const clearSessionState = () => {
    lifetime.abort()
    void client.cancelQueries()
    client.clear()
  }
  globalThis.addEventListener("ritsei:unauthorized", clearSessionState)
  onCleanup(() => {
    globalThis.removeEventListener("ritsei:unauthorized", clearSessionState)
    clearSessionState()
  })
  return (
    <ApiRuntime value={{ runtime, lifetime: lifetime.signal, tenantId: session.tenantId }}>
      <RuntimeContext value={runtime}>
        <QueryClientProvider client={client}>{props.children()}</QueryClientProvider>
      </RuntimeContext>
    </ApiRuntime>
  )
}

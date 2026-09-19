import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import {
  AuthConfiguration,
  AuthLoginResult,
  authRoutes,
  AuthSession,
} from "../shared/contracts/generated/auth.ts"

const OidcTokenResponse = Schema.Struct({
  access_token: Schema.String.check(Schema.isPattern(/\S/), Schema.isMaxLength(4_096)),
  token_type: Schema.String.check(Schema.isPattern(/^bearer$/i)),
  expires_in: Schema.optionalKey(
    Schema.Number.check(Schema.isInt(), Schema.isBetween({ minimum: 1, maximum: 86_400 })),
  ),
})
const MaxAuthResponseLength = 1_048_576

export class AuthClientFailure extends Error {
  constructor(readonly kind: "network" | "invalid-response" | "unauthorized" | "unavailable") {
    super(`Authentication request failed: ${kind}`)
  }
}

const decodeJson = async <S extends Schema.ConstraintDecoder<unknown, never>>(
  schema: S,
  response: Response,
): Promise<S["Type"]> => {
  if (response.status === 401) throw new AuthClientFailure("unauthorized")
  if (response.status >= 500) throw new AuthClientFailure("unavailable")
  if (!response.ok) throw new AuthClientFailure("invalid-response")
  const contentLength = Number(response.headers.get("content-length"))
  if (Number.isFinite(contentLength) && contentLength > MaxAuthResponseLength) {
    throw new AuthClientFailure("invalid-response")
  }
  const body = await response.text().catch(() => "")
  if (body.length > MaxAuthResponseLength) throw new AuthClientFailure("invalid-response")
  const decoded = await Effect.runPromiseExit(
    Schema.decodeUnknownEffect(Schema.fromJsonString(schema))(body),
  )
  if (decoded._tag === "Failure") throw new AuthClientFailure("invalid-response")
  return decoded.value
}

const request = async (path: string, init?: RequestInit): Promise<Response> => {
  try {
    return await fetch(`/api${path}`, {
      ...init,
      credentials: "omit",
      cache: "no-store",
      redirect: "error",
      headers: { Accept: "application/json", ...(init?.headers ?? {}) },
      signal: init?.signal ?? AbortSignal.timeout(10_000),
    })
  } catch {
    throw new AuthClientFailure("network")
  }
}

export const getAuthConfiguration = async () =>
  decodeJson(AuthConfiguration, await request(authRoutes.config))

export const devLogin = async () =>
  decodeJson(
    AuthLoginResult,
    await request(authRoutes.devLogin, { method: "POST" }),
  )

export const getAuthSession = async (token: string, tenantId?: string) =>
  decodeJson(
    AuthSession,
    await request(authRoutes.session, {
      headers: {
        Authorization: `Bearer ${token}`,
        ...(tenantId === undefined ? {} : { "x-tenant-id": tenantId }),
      },
    }),
  )

export const logout = async (token: string) => {
  await request(authRoutes.logout, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  })
}

const encodeBase64Url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "")

const randomBase64Url = (size: number) => {
  const bytes = new Uint8Array(size)
  crypto.getRandomValues(bytes)
  return encodeBase64Url(bytes)
}

const sha256Base64Url = async (value: string) =>
  encodeBase64Url(
    new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))),
  )

export const beginOidcLogin = async (configuration: AuthConfiguration) => {
  if (
    configuration.profile !== "oidc" || configuration.authorizationEndpoint === undefined ||
    configuration.clientId === undefined || configuration.redirectUri === undefined
  ) throw new AuthClientFailure("invalid-response")
  const state = randomBase64Url(24)
  const verifier = randomBase64Url(48)
  sessionStorage.setItem("ritsei.auth.state", state)
  sessionStorage.setItem("ritsei.auth.verifier", verifier)
  const challenge = await sha256Base64Url(verifier)
  const url = new URL(configuration.authorizationEndpoint)
  url.searchParams.set("client_id", configuration.clientId)
  url.searchParams.set("redirect_uri", configuration.redirectUri)
  url.searchParams.set("response_type", "code")
  url.searchParams.set("scope", configuration.scopes.join(" "))
  url.searchParams.set("state", state)
  url.searchParams.set("code_challenge", challenge)
  url.searchParams.set("code_challenge_method", "S256")
  globalThis.location.assign(url)
}

export const finishOidcLogin = async (configuration: AuthConfiguration) => {
  if (
    configuration.profile !== "oidc" || configuration.tokenEndpoint === undefined ||
    configuration.clientId === undefined || configuration.redirectUri === undefined
  ) throw new AuthClientFailure("invalid-response")
  const query = new URLSearchParams(globalThis.location.search)
  const code = query.get("code")
  const state = query.get("state")
  const expectedState = sessionStorage.getItem("ritsei.auth.state")
  const verifier = sessionStorage.getItem("ritsei.auth.verifier")
  sessionStorage.removeItem("ritsei.auth.state")
  sessionStorage.removeItem("ritsei.auth.verifier")
  if (
    code === null || state === null || expectedState === null || state !== expectedState ||
    verifier === null
  ) {
    throw new AuthClientFailure("invalid-response")
  }
  globalThis.history.replaceState(
    null,
    "",
    `${globalThis.location.pathname}${globalThis.location.hash}`,
  )
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: configuration.clientId,
    redirect_uri: configuration.redirectUri,
    code,
    code_verifier: verifier,
  })
  const response = await fetch(configuration.tokenEndpoint, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body,
    credentials: "omit",
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  }).catch(() => {
    throw new AuthClientFailure("network")
  })
  const token = await decodeJson(OidcTokenResponse, response)
  return token.access_token
}

import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"

import {
  ExternalIdentity,
  type ExternalIdentityType,
  IdentityProvider,
} from "../../modules/auth/mod.ts"
import { ExternalProviderUnavailable, InvalidExternalAssertion } from "../../modules/auth/mod.ts"
import type { OidcAuthenticationConfiguration, RitseiRuntimeConfiguration } from "../config.ts"

type JsonObject = Record<string, unknown>
type Jwk = JsonObject & { readonly kid?: string; readonly kty?: string; readonly alg?: string }

class InvalidTokenShape extends Error {}
class ProviderUnavailable extends Error {}

const isObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const decodeBase64Url = (value: string): Uint8Array => {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new InvalidTokenShape()
  const padded = value.replaceAll("-", "+").replaceAll("_", "/") +
    "=".repeat((4 - value.length % 4) % 4)
  const decoded = atob(padded)
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0))
}

const decodeJsonPart = (value: string): JsonObject => {
  const parsed: unknown = JSON.parse(new TextDecoder().decode(decodeBase64Url(value)))
  if (!isObject(parsed)) throw new InvalidTokenShape()
  return parsed
}

const readTextJson = async (response: Response): Promise<unknown> => {
  if (!response.ok) throw new ProviderUnavailable()
  const text = await response.text()
  if (text.length > 1_048_576) throw new ProviderUnavailable()
  try {
    return JSON.parse(text)
  } catch {
    throw new ProviderUnavailable()
  }
}

const hasAudience = (audience: unknown, expected: string): boolean =>
  typeof audience === "string"
    ? audience === expected
    : Array.isArray(audience) && audience.every((value) => typeof value === "string") &&
      audience.includes(expected)

export const makeOidcIdentityProvider = (
  configuration: OidcAuthenticationConfiguration,
): IdentityProvider => {
  let cachedKeys: readonly Jwk[] | undefined
  let cachedUntil = 0

  const loadKeys = async (force = false): Promise<readonly Jwk[]> => {
    if (!force && cachedKeys !== undefined && cachedUntil > Date.now()) return cachedKeys
    const response = await fetch(configuration.jwksUri, {
      headers: { Accept: "application/json" },
      credentials: "omit",
      redirect: "error",
      signal: AbortSignal.timeout(5_000),
    }).catch(() => {
      throw new ProviderUnavailable()
    })
    const document = await readTextJson(response)
    if (!isObject(document) || !Array.isArray(document.keys)) throw new ProviderUnavailable()
    const keys = document.keys.filter(isObject) as readonly Jwk[]
    if (keys.length === 0) throw new ProviderUnavailable()
    cachedKeys = keys
    cachedUntil = Date.now() + 300_000
    return keys
  }

  const verify = async (assertion: string): Promise<ExternalIdentityType> => {
    if (assertion.length > 16_384) throw new InvalidTokenShape()
    const parts = assertion.split(".")
    if (parts.length !== 3 || parts.some((part) => part.length === 0)) {
      throw new InvalidTokenShape()
    }
    const [encodedHeader, encodedPayload, encodedSignature] = parts as [string, string, string]
    const header = decodeJsonPart(encodedHeader)
    const payload = decodeJsonPart(encodedPayload)
    if (header.alg !== "RS256" || typeof header.kid !== "string") throw new InvalidTokenShape()
    if (
      payload.iss !== configuration.issuerUrl || typeof payload.sub !== "string" ||
      payload.sub.trim().length === 0 || payload.sub.length > 1_024 ||
      !hasAudience(payload.aud, configuration.audience) ||
      typeof payload.exp !== "number" || !Number.isInteger(payload.exp) ||
      typeof payload.iat !== "number" || !Number.isInteger(payload.iat)
    ) throw new InvalidTokenShape()
    const now = Math.floor(Date.now() / 1_000)
    const nbf = payload.nbf
    if (
      payload.exp <= now || payload.exp <= payload.iat ||
      (nbf !== undefined &&
        (typeof nbf !== "number" || !Number.isInteger(nbf) || nbf > now + 60))
    ) {
      throw new InvalidTokenShape()
    }
    if (payload.iat > now + 60) throw new InvalidTokenShape()

    let keys = await loadKeys()
    let jwk = keys.find((key) => key.kid === header.kid && key.kty === "RSA")
    if (jwk === undefined) {
      keys = await loadKeys(true)
      jwk = keys.find((key) => key.kid === header.kid && key.kty === "RSA")
    }
    if (jwk === undefined) throw new ProviderUnavailable()
    const key = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    ).catch(() => {
      throw new ProviderUnavailable()
    })
    const valid = await crypto.subtle.verify(
      { name: "RSASSA-PKCS1-v1_5" },
      key,
      new Uint8Array(decodeBase64Url(encodedSignature)).buffer as ArrayBuffer,
      new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
    ).catch(() => false)
    if (!valid) throw new InvalidTokenShape()
    return {
      issuer: payload.iss,
      subject: payload.sub,
      issuedAt: payload.iat,
    }
  }

  return {
    authenticate: (assertion) =>
      Effect.tryPromise({
        try: () => verify(assertion),
        catch: (error) =>
          error instanceof ProviderUnavailable
            ? new ExternalProviderUnavailable({})
            : new InvalidExternalAssertion({}),
      }).pipe(
        Effect.flatMap((identity) =>
          Schema.decodeUnknownEffect(ExternalIdentity)(identity).pipe(
            Effect.mapError(() => new InvalidExternalAssertion({})),
          )
        ),
      ),
  }
}

export const makeIdentityProviderLayer = (configuration: RitseiRuntimeConfiguration) => {
  const authentication = configuration.authentication
  return authentication?.profile === "oidc"
    ? Layer.succeed(IdentityProvider, makeOidcIdentityProvider(authentication))
    : Layer.empty
}

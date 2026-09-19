import { assert, it } from "@effect/vitest"
import * as Effect from "effect/Effect"

import { ExternalProviderUnavailable, InvalidExternalAssertion } from "../../modules/auth/mod.ts"
import type { OidcAuthenticationConfiguration } from "../config.ts"
import { makeOidcIdentityProvider } from "./oidc.ts"

const encode = (value: unknown) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(value))))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "")

const encodeBytes = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "")

const oidcConfiguration = {
  profile: "oidc" as const,
  issuerUrl: "https://issuer.example.test",
  audience: "ritsei-api",
  clientId: "ritsei-web",
  authorizationEndpoint: "https://issuer.example.test/authorize",
  tokenEndpoint: "https://issuer.example.test/token",
  jwksUri: "https://issuer.example.test/jwks",
  redirectUri: "http://127.0.0.1:5173/auth/callback",
  scopes: ["openid"],
} satisfies OidcAuthenticationConfiguration

const provider = makeOidcIdentityProvider(oidcConfiguration)
const withProvider = (token: string) => provider.authenticate(token)

it.effect("accepts a valid OIDC assertion and rejects invalid claims", () =>
  Effect.gen(function* () {
    const keys = yield* Effect.promise(() =>
      crypto.subtle.generateKey(
        {
          name: "RSASSA-PKCS1-v1_5",
          modulusLength: 2048,
          publicExponent: new Uint8Array([1, 0, 1]),
          hash: "SHA-256",
        },
        true,
        ["sign", "verify"],
      )
    )
    const publicJwk = yield* Effect.promise(() => crypto.subtle.exportKey("jwk", keys.publicKey))
    const jwk = { ...publicJwk, kid: "test-key", alg: "RS256", use: "sig" }
    const originalFetch = globalThis.fetch
    globalThis.fetch = (() =>
      Promise.resolve(
        new Response(JSON.stringify({ keys: [jwk] }), {
          headers: { "content-type": "application/json" },
        }),
      )) as typeof fetch

    const now = Math.floor(Date.now() / 1_000)
    const header = encode({ alg: "RS256", kid: "test-key", typ: "JWT" })
    const payload = encode({
      iss: oidcConfiguration.issuerUrl,
      sub: "subject-123",
      aud: oidcConfiguration.audience,
      iat: now,
      exp: now + 300,
      email: "claim@example.com",
      roles: ["administrator"],
      tenantId: "attacker-tenant",
      capabilities: ["accounting.post"],
    })
    const signingInput = `${header}.${payload}`
    const signature = yield* Effect.promise(() =>
      crypto.subtle.sign(
        { name: "RSASSA-PKCS1-v1_5" },
        keys.privateKey,
        new TextEncoder().encode(signingInput),
      )
    )
    const signaturePart = encodeBytes(new Uint8Array(signature))
    const token = `${signingInput}.${signaturePart}`
    const identity = yield* withProvider(token)
    assert.deepStrictEqual(identity, {
      issuer: oidcConfiguration.issuerUrl,
      subject: "subject-123",
      issuedAt: now,
    })

    const expiredPayload = encode({
      iss: oidcConfiguration.issuerUrl,
      sub: "subject-123",
      aud: oidcConfiguration.audience,
      iat: 1,
      exp: 1,
    })
    assert.instanceOf(
      yield* Effect.flip(withProvider(`${header}.${expiredPayload}.${signaturePart}`)),
      InvalidExternalAssertion,
    )

    const malformedNbfPayload = encode({
      iss: oidcConfiguration.issuerUrl,
      sub: "subject-123",
      aud: oidcConfiguration.audience,
      iat: now,
      exp: now + 300,
      nbf: "now",
    })
    assert.instanceOf(
      yield* Effect.flip(withProvider(`${header}.${malformedNbfPayload}.${signaturePart}`)),
      InvalidExternalAssertion,
    )

    const unknownKid = encode({ alg: "RS256", kid: "unknown-key", typ: "JWT" })
    assert.instanceOf(
      yield* Effect.flip(withProvider(`${unknownKid}.${payload}.${signaturePart}`)),
      ExternalProviderUnavailable,
    )
    yield* Effect.sync(() => globalThis.fetch = originalFetch)
  }))

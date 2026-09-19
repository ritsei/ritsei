import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import { ApiError } from "./contracts/generated/identity.ts"
import type { Session } from "./session.ts"

export class BrowserConnection extends Context.Service<BrowserConnection, Session>()(
  "RITSEI/BrowserConnection",
) {}
export class RequestFailure extends Schema.TaggedError<RequestFailure>()("FrontendRequestFailure", {
  kind: Schema.Literals([
    "validation",
    "unauthorized",
    "forbidden",
    "not-found",
    "conflict",
    "unavailable",
    "network",
    "invalid-response",
    "unknown-outcome",
  ]),
}) {}

export const connectionTenant = Effect.gen(function* () {
  return yield* BrowserConnection
})

const failureMessages = {
  validation: "Review the required fields before saving.",
  unauthorized: "Your session is no longer valid. Disconnect and connect a valid session.",
  forbidden: "You do not have permission to perform this action.",
  "not-found": "This record is not available in the selected tenant. Reload the workspace.",
  conflict:
    "The change conflicts with existing data or invalid input. Review the fields and try again.",
  unavailable: "The service is unavailable. Reload the workspace before trying again.",
  network: "The service could not be reached. Check your connection and reload the workspace.",
  "invalid-response":
    "The server returned an invalid or oversized response. No server data was accepted.",
  "unknown-outcome":
    "The server may have saved this change. Reload the workspace before trying again.",
} as const

export const failureMessage = (error: unknown): string =>
  error instanceof RequestFailure
    ? failureMessages[error.kind]
    : "The request could not be completed. Reload the page to try again."

// The existing list endpoint has no pagination. Refuse oversized payloads instead of silently
// truncating or pretending a client-side rendering window bounds the backend query.
const maxResponseBytes = 131_072
const readBounded = async (response: Response): Promise<string> => {
  const reader = response.body?.getReader()
  if (!reader) return ""
  const decoder = new TextDecoder()
  let bytes = 0
  let text = ""
  try {
    for (;;) {
      const next = await reader.read()
      if (next.done) return text + decoder.decode()
      bytes += next.value.byteLength
      if (bytes > maxResponseBytes) {
        throw new RequestFailure({ kind: "invalid-response" })
      }
      text += decoder.decode(next.value, { stream: true })
    }
  } finally {
    await reader.cancel()
    reader.releaseLock()
  }
}

export type ResponseFailureKind = "invalid-response" | "unknown-outcome"

export const decodeInput = <S extends Schema.Constraint>(schema: S, input: unknown) =>
  Schema.decodeUnknownEffect(schema)(input).pipe(
    Effect.mapError(() => new RequestFailure({ kind: "validation" })),
  )

export const decodeResponse = <S extends Schema.Constraint>(
  schema: S,
  body: string,
  kind: ResponseFailureKind = "invalid-response",
) =>
  Schema.decodeUnknownEffect(Schema.fromJsonString(schema))(body).pipe(
    Effect.mapError(() => new RequestFailure({ kind })),
  )

type MutationMethod = "POST" | "PATCH" | "DELETE"

const isMutationMethod = (value: unknown): value is MutationMethod =>
  value === "POST" || value === "PATCH" || value === "DELETE"

export function mutationRequest(path: string, payload?: unknown): ReturnType<typeof requestJson>
export function mutationRequest(
  path: string,
  method: MutationMethod,
  payload?: unknown,
): ReturnType<typeof requestJson>
export function mutationRequest(
  path: string,
  methodOrPayload: MutationMethod | unknown = "POST",
  payload?: unknown,
) {
  const method = isMutationMethod(methodOrPayload) ? methodOrPayload : "POST"
  const requestPayload = isMutationMethod(methodOrPayload) ? payload : methodOrPayload
  return requestJson(path, method, requestPayload).pipe(
    Effect.mapError((error) =>
      error.kind === "invalid-response" || error.kind === "network"
        ? new RequestFailure({ kind: "unknown-outcome" })
        : error
    ),
  )
}

export const querySuffix = (
  values: Readonly<Record<string, string | number | undefined>>,
) => {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) query.set(key, String(value))
  }
  return query.size === 0 ? "" : `?${query}`
}

export const routeWithId = (route: string, id: string) =>
  route.replace(":id", encodeURIComponent(id))

export const definedFields = (fields: Readonly<Record<string, unknown>>) =>
  Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined))

export const responseMatches = (
  value: object,
  expected: Readonly<Record<string, unknown>>,
) =>
  Object.entries(expected).every(([key, expectedValue]) =>
    (value as Record<string, unknown>)[key] === expectedValue
  )

export const responseListMatches = <A extends object>(
  values: readonly A[],
  expected: Readonly<Record<string, unknown>>,
) => values.every((value) => responseMatches(value, expected))

export const requestJson = Effect.fn("Frontend.requestJson")(function* (
  path: string,
  method: "GET" | "POST" | "PATCH" | "DELETE" = "GET",
  payload?: unknown,
) {
  const connection = yield* BrowserConnection
  const mutatesState = method !== "GET"
  const response = yield* Effect.tryPromise({
    try: async (signal) => {
      const response = await fetch(`/api${path}`, {
        method,
        headers: {
          "Authorization": `Bearer ${connection.token}`,
          "x-tenant-id": connection.tenantId,
          "Content-Type": "application/json",
        },
        ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
        credentials: "omit",
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
      })
      return { status: response.status, body: await readBounded(response) }
    },
    catch: (cause) =>
      cause instanceof RequestFailure ? cause : new RequestFailure({
        kind: mutatesState ? "unknown-outcome" : "network",
      }),
  })
  if (response.status >= 200 && response.status < 300) return response.body
  if (response.status === 401) globalThis.dispatchEvent(new Event("ritsei:unauthorized"))
  const error = yield* Schema.decodeUnknownEffect(
    Schema.fromJsonString(ApiError),
  )(response.body).pipe(
    Effect.mapError(() =>
      new RequestFailure({
        kind: mutatesState ? "unknown-outcome" : "invalid-response",
      })
    ),
  )
  const kinds = {
    ApiUnauthorized: [401, "unauthorized"],
    ApiForbidden: [403, "forbidden"],
    ApiNotFound: [404, "not-found"],
    ApiConflict: [409, "conflict"],
    ApiServiceUnavailable: [503, "unavailable"],
  } as const
  const [status, kind] = kinds[error._tag]
  return yield* Effect.fail(
    new RequestFailure({
      kind: status === response.status ? kind : "invalid-response",
    }),
  )
})

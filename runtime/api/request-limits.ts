import * as Effect from "effect/Effect"
import * as Result from "effect/Result"
import * as Stream from "effect/Stream"
import * as HttpMethod from "effect/http/HttpMethod"
import * as HttpRouter from "effect/http/HttpRouter"
import * as HttpServerRequest from "effect/http/HttpServerRequest"
import * as HttpServerResponse from "effect/http/HttpServerResponse"
import type * as Types from "effect/Types"

export const MAX_REQUEST_BODY_BYTES = 1_048_576

class RequestBodyTooLarge extends Error {}
class InvalidUtf8 extends Error {}

type ContentLength = number | "invalid" | undefined

export const parseContentLength = (value: string | undefined): ContentLength => {
  if (value === undefined) return undefined
  const normalized = value.trim()
  if (!/^\d+$/.test(normalized)) return "invalid"
  const length = Number(normalized)
  return Number.isSafeInteger(length) ? length : MAX_REQUEST_BODY_BYTES + 1
}

const concatenate = (chunks: ReadonlyArray<Uint8Array>): Uint8Array => {
  const length = chunks.reduce((total, chunk) => total + chunk.byteLength, 0)
  const bytes = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

const bufferedRequest = (
  request: HttpServerRequest.HttpServerRequest,
  bytes: Uint8Array,
  text: string,
): HttpServerRequest.HttpServerRequest => {
  return new Proxy(request, {
    get(target, property, receiver) {
      switch (property) {
        case "stream":
          return Stream.succeed(bytes)
        case "text":
          return Effect.succeed(text)
        case "arrayBuffer":
          return Effect.succeed(bytes.slice().buffer)
        case "modify":
          return (options: Parameters<typeof request.modify>[0]) =>
            bufferedRequest(
              target.modify(options),
              bytes,
              text,
            )
        default:
          return Reflect.get(target, property, receiver)
      }
    },
  })
}

const response = (code: string, status: 400 | 413) =>
  HttpServerResponse.jsonUnsafe({ code }, { status })

const declaredBodyResponse = (value: string | undefined) => {
  const contentLength = parseContentLength(value)
  if (contentLength === "invalid") return response("invalid_content_length", 400)
  if (contentLength !== undefined && contentLength > MAX_REQUEST_BODY_BYTES) {
    return response("request_body_too_large", 413)
  }
  return undefined
}

const readBoundedBody = (request: HttpServerRequest.HttpServerRequest) =>
  request.stream.pipe(
    Stream.limitBytes(MAX_REQUEST_BODY_BYTES, () => Stream.fail(new RequestBodyTooLarge())),
    Stream.runCollect,
    Effect.map((chunks) => concatenate(Array.from(chunks))),
  )

const decodeUtf8 = (bytes: Uint8Array) =>
  Effect.try({
    try: () => new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    catch: () => new InvalidUtf8(),
  })

const requestBodyLimitMiddleware = (
  effect: Effect.Effect<HttpServerResponse.HttpServerResponse, Types.unhandled>,
): Effect.Effect<
  HttpServerResponse.HttpServerResponse,
  Types.unhandled,
  HttpServerRequest.HttpServerRequest
> =>
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest
    if (!HttpMethod.hasBody(request.method)) return yield* effect

    const declaredResponse = declaredBodyResponse(request.headers["content-length"])
    if (declaredResponse !== undefined) return declaredResponse

    const source = request.source as { readonly body?: ReadableStream<Uint8Array> | null }
    if ("body" in source && source.body === null) return yield* effect

    const result = yield* Effect.result(readBoundedBody(request))
    if (Result.isFailure(result)) {
      if (result.failure instanceof RequestBodyTooLarge) {
        return response("request_body_too_large", 413)
      }
      return yield* Effect.fail(result.failure)
    }

    const decoded = yield* Effect.result(decodeUtf8(result.success))
    if (Result.isFailure(decoded)) return response("invalid_utf8", 400)

    return yield* Effect.provideService(
      effect,
      HttpServerRequest.HttpServerRequest,
      bufferedRequest(request, result.success, decoded.success),
    )
  })

export const requestBodyLimitLayer = HttpRouter.middleware(requestBodyLimitMiddleware, {
  global: true,
})

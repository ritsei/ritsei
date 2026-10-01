import { assert, it } from "@effect/vitest"
import * as Effect from "effect/Effect"

const apiFiles = ["runtime/api/api.ts", "runtime/api/handlers.ts", "runtime/api/mod.ts"]

it.effect("keeps HTTP routing Effect-native", () =>
  Effect.gen(function* () {
    const source = yield* Effect.promise(async () =>
      (await Promise.all(apiFiles.map((path) => Deno.readTextFile(path)))).join("\n")
    )

    for (
      const forbidden of [
        "Deno.serve",
        'from "node:http"',
        'from "hono"',
        'from "express"',
        'from "fastify"',
        'from "@nestjs/',
      ]
    ) {
      assert.notInclude(source, forbidden)
    }
    assert.include(source, "effect/http/HttpRouter")
    assert.include(source, "effect/http-api/HttpApiEndpoint")
    assert.include(source, "@effect/platform-deno/DenoHttpServer")
    assert.include(source, "@effect/platform-deno/DenoRuntime")
  }))

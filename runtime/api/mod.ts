import "../../tooling/load-env.ts"
import * as DenoHttpServer from "@effect/platform-deno/DenoHttpServer"
import * as DenoRuntime from "@effect/platform-deno/DenoRuntime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as HttpRouter from "effect/unstable/http/HttpRouter"
import * as HttpApiBuilder from "effect/unstable/httpapi/HttpApiBuilder"
import * as HttpApiScalar from "effect/unstable/httpapi/HttpApiScalar"
import postgres, { type Sql } from "postgres"

import type { PostgresClient } from "../../foundation/mod.ts"
import { validatePostgresVersion } from "../../platform/mod.ts"
import { RitseiApi } from "./api.ts"
import { ApiHandlers, BearerAuthLive } from "./handlers.ts"
import { CurrentRuntimeConfiguration } from "./api.ts"
import { requestBodyLimitLayer } from "./request-limits.ts"
import { serviceLayers } from "../layers.ts"
import { readRuntimeConfiguration, type RitseiRuntimeConfiguration } from "../config.ts"

export { serviceLayers } from "../layers.ts"

export const makeApiLayer = (
  client: Sql,
  configuration: RitseiRuntimeConfiguration,
  port = 8000,
  replicaClient?: Sql,
) => {
  if (configuration.postgresReadYourWrites !== undefined && replicaClient === undefined) {
    throw new Error("PostgreSQL read-your-writes requires a replica client")
  }
  const services = serviceLayers(client, configuration, undefined, replicaClient)
  const authMiddleware = BearerAuthLive.pipe(Layer.provide(services))
  const handlers = ApiHandlers.pipe(
    Layer.provide(Layer.succeed(CurrentRuntimeConfiguration)(configuration)),
    Layer.provide(authMiddleware),
    Layer.provide(services),
  )

  const apiLayer = HttpApiBuilder.layer(RitseiApi).pipe(
    Layer.provide(handlers),
    Layer.provide(HttpApiScalar.layer(RitseiApi)),
  )

  return Layer.mergeAll(apiLayer, requestBodyLimitLayer).pipe(
    HttpRouter.serve,
    Layer.provide(DenoHttpServer.layer({ port })),
    Layer.provide(services),
  )
}

export const startApi = (url: string, port = 8000) =>
  Effect.scoped(
    Effect.gen(function* () {
      const configuration = yield* readRuntimeConfiguration()
      const client = postgres(url)
      yield* Effect.addFinalizer(() => Effect.promise(() => client.end()))
      yield* validatePostgresVersion(client as unknown as PostgresClient)
      const replicaClient = configuration.postgresReadYourWrites === undefined
        ? undefined
        : postgres(configuration.postgresReadYourWrites.replicaUrl)
      if (replicaClient !== undefined) {
        yield* Effect.addFinalizer(() => Effect.promise(() => replicaClient.end()))
        yield* validatePostgresVersion(replicaClient as unknown as PostgresClient)
      }
      yield* Layer.launch(makeApiLayer(client, configuration, port, replicaClient))
    }),
  )

if (import.meta.main) {
  const url = Deno.env.get("DATABASE_URL")
  if (url === undefined || url.trim() === "") {
    console.error("DATABASE_URL is required")
    Deno.exit(1)
  }
  const port = Number.parseInt(Deno.env.get("PORT") ?? "8000", 10)
  startApi(url, port).pipe(DenoRuntime.runMain)
}

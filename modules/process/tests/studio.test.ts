import { assert, describe, it } from "@effect/vitest"
import * as Clock from "effect/Clock"
import * as Effect from "effect/Effect"

import {
  AuthorizationDenied,
  AuthorizationService,
  type AuthorizationService as AuthorizationServiceShape,
  type CapabilityType,
} from "../../authorization/mod.ts"
import { Database, type DatabaseService } from "../../../foundation/mod.ts"
import { makeProcessStudioService, ProcessCapabilities } from "../mod.ts"

const tenantId = "01930000-0000-7000-8000-000000000001"
const principal = { userAccountId: "process-studio-test", sessionId: "process-studio-session" }

const clock: Clock.Clock = {
  currentTimeMillisUnsafe: () => Date.parse("2026-09-13T12:00:00.000Z"),
  currentTimeMillis: Effect.succeed(Date.parse("2026-09-13T12:00:00.000Z")),
  currentTimeNanosUnsafe: () => 0n,
  currentTimeNanos: Effect.succeed(0n),
  monotonicTimeNanosUnsafe: () => 0n,
  monotonicTimeNanos: Effect.succeed(0n),
  sleep: () => Effect.void,
}

const database: DatabaseService = {
  query: () => Effect.die(new Error("database is not used by this Process Studio test")),
  transaction: () => Effect.die(new Error("database is not used by this Process Studio test")),
  withTransaction: (effect) => effect,
}

const unused = () => Effect.die(new Error("unused authorization operation in Process Studio test"))

const makeAuthorization = (allow: boolean): AuthorizationServiceShape => ({
  authorize: (input) => {
    const request = input as { readonly tenantId: string; readonly capability: string }
    return allow
      ? Effect.succeed({
        allowed: true as const,
        tenantId: request.tenantId,
        capability: request.capability as CapabilityType,
        grant: "membership" as const,
      })
      : Effect.fail(
        new AuthorizationDenied({
          tenantId: request.tenantId,
          capability: request.capability as CapabilityType,
        }),
      )
  },
  addMember: unused,
  getMember: unused,
  listMembers: unused,
  listAccessibleTenants: unused,
  listDirectGrants: unused,
  suspendMember: unused,
  activateMember: unused,
  removeMember: unused,
  grant: unused,
})

const provideStudio = (allow: boolean) =>
  makeProcessStudioService.pipe(
    Effect.provideService(AuthorizationService, makeAuthorization(allow)),
    Effect.provideService(Database, database),
    Effect.provideService(Clock.Clock, clock),
  )

describe("Process Studio service", () => {
  it.effect("discovers public catalog entries and validates exact references", () =>
    Effect.gen(function* () {
      const service = yield* provideStudio(true)
      const catalog = yield* service.listCatalog({
        principal,
        tenantId,
        limit: 200,
      })
      assert.isTrue(catalog.length > 0)
      assert.isTrue(catalog.every((entry) => entry.stability === "PUBLIC"))
      assert.isTrue(catalog.some((entry) => entry.id === "sales.order.confirm"))

      const validation = yield* service.validateDefinition({
        principal,
        tenantId,
        definitionId: "01930000-0000-7000-8000-000000000002",
        definitionVersion: 1,
        catalogVersion: 1,
        references: [{ kind: "DomainAction", id: "sales.order.confirm", version: 1 }],
      })
      assert.strictEqual(validation.status, "VALIDATED")
      assert.deepStrictEqual(validation.references, [
        { kind: "DomainAction", id: "sales.order.confirm", version: 1 },
      ])
    }))

  it.effect("denies Process Studio reads before touching persistence", () =>
    Effect.gen(function* () {
      const service = yield* provideStudio(false)
      const error = yield* Effect.flip(service.listCatalog({
        principal,
        tenantId,
        limit: 1,
      }))
      assert.instanceOf(error, AuthorizationDenied)
      assert.strictEqual(error.capability, ProcessCapabilities.catalogRead)
    }))
})

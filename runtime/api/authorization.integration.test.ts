import { assert, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest"
import * as Path from "effect/Path"
import { Etag, HttpPlatform } from "effect/unstable/http"
import * as HttpApiMiddleware from "effect/unstable/httpapi/HttpApiMiddleware"
import * as HttpApiTest from "effect/unstable/httpapi/HttpApiTest"

import {
  AuthorizationCapabilities,
  AuthorizationDenied,
  AuthorizationService,
  type AuthorizationServiceShape,
  CapabilityDefinitions,
  type CapabilityType,
} from "../../modules/authorization/mod.ts"
import { IdentityCapabilities } from "../../modules/identity/mod.ts"
import { BearerAuth, CurrentPrincipal, RitseiApi } from "./api.ts"
import { AuthorizationHandlers } from "./handlers.ts"

const tenantId = "018f0000-0000-7000-8000-000000000001"
const otherTenantId = "018f0000-0000-7000-8000-000000000002"
const userAccountId = "018f0000-0000-7000-8000-000000000003"
const principal = { userAccountId: "authorization-api-admin", sessionId: "api-session" }
const unused = () => Effect.die(new Error("unused authorization endpoint in API integration test"))

const TestHttpServices = Layer.mergeAll(
  Path.layer,
  Etag.layerWeak,
  HttpPlatform.layer,
).pipe(Layer.provideMerge(FileSystem.layerNoop({})))

it.layer(TestHttpServices)("Authorization API", (it) => {
  it.effect("enforces tenant scope and the exact read capabilities", () =>
    Effect.gen(function* () {
      const allowed = new Set<CapabilityType>([
        AuthorizationCapabilities.tenantMembershipRead,
        AuthorizationCapabilities.capabilityGrant,
      ])
      const observed: Array<{ tenantId: string; capability: CapabilityType }> = []
      const listInputs: unknown[] = []
      const membership = { userAccountId, tenantId, status: "suspended" as const }
      const directGrant = {
        userAccountId,
        tenantId,
        capability: IdentityCapabilities.userAccountRead,
        scope: "tenant" as const,
      }
      const authorization: AuthorizationServiceShape = {
        authorize: (input) => {
          const request = input as {
            readonly tenantId: string
            readonly capability: CapabilityType
          }
          observed.push(request)
          return request.tenantId === tenantId && allowed.has(request.capability)
            ? Effect.succeed({
              allowed: true as const,
              tenantId: request.tenantId,
              capability: request.capability,
              grant: "membership" as const,
            })
            : Effect.fail(new AuthorizationDenied(request))
        },
        getMember: () => Effect.succeed(membership),
        listDirectGrants: () => Effect.succeed([directGrant]),
        addMember: unused,
        listAccessibleTenants: () => Effect.succeed([membership]),
        listMembers: (input) => {
          listInputs.push(input)
          return Effect.succeed([membership])
        },
        suspendMember: unused,
        activateMember: unused,
        removeMember: unused,
        grant: unused,
      }
      const bearer = Layer.succeed(BearerAuth, {
        bearer: (effect) => Effect.provideService(effect, CurrentPrincipal, principal),
      })
      const bearerClient = HttpApiMiddleware.layerClient(
        BearerAuth,
        ({ request, next }) => next(HttpClientRequest.bearerToken(request, "test-token")),
      )
      const handlers = AuthorizationHandlers.pipe(
        Layer.provide(bearer),
        Layer.provide(Layer.succeed(AuthorizationService, authorization)),
      )
      const client = yield* HttpApiTest.groups(RitseiApi, ["Authorization"]).pipe(
        Effect.provide(Layer.mergeAll(handlers, bearerClient, bearer)),
      )

      assert.deepStrictEqual(
        yield* client.Authorization.getMember({
          params: { userAccountId },
          headers: { "x-tenant-id": tenantId },
        }),
        membership,
      )
      assert.deepStrictEqual(
        yield* client.Authorization.listMembers({
          headers: { "x-tenant-id": tenantId },
          query: {},
        }),
        [membership],
      )
      assert.deepStrictEqual(
        yield* client.Authorization.listMembers({
          headers: { "x-tenant-id": tenantId },
          query: { search: userAccountId.slice(0, 8), status: "suspended", limit: 1 },
        }),
        [membership],
      )
      assert.deepStrictEqual(listInputs, [
        { tenantId },
        { tenantId, search: userAccountId.slice(0, 8), status: "suspended", limit: 1 },
      ])
      assert.deepStrictEqual(
        yield* client.Authorization.listDirectGrants({
          params: { userAccountId },
          headers: { "x-tenant-id": tenantId },
        }),
        [directGrant],
      )
      assert.deepStrictEqual(
        yield* client.Authorization.listCapabilityDefinitions({
          headers: { "x-tenant-id": tenantId },
        }),
        CapabilityDefinitions,
      )
      assert.deepStrictEqual(observed.map(({ capability }) => capability), [
        AuthorizationCapabilities.tenantMembershipRead,
        AuthorizationCapabilities.tenantMembershipRead,
        AuthorizationCapabilities.tenantMembershipRead,
        AuthorizationCapabilities.tenantMembershipRead,
        AuthorizationCapabilities.capabilityGrant,
        AuthorizationCapabilities.capabilityGrant,
      ])

      allowed.delete(AuthorizationCapabilities.capabilityGrant)
      const missingGrant = yield* Effect.flip(client.Authorization.listDirectGrants({
        params: { userAccountId },
        headers: { "x-tenant-id": tenantId },
      }))
      assert.strictEqual(missingGrant._tag, "ApiForbidden")

      allowed.clear()
      allowed.add(AuthorizationCapabilities.capabilityGrant)
      const missingRead = yield* Effect.flip(client.Authorization.listDirectGrants({
        params: { userAccountId },
        headers: { "x-tenant-id": tenantId },
      }))
      assert.strictEqual(missingRead._tag, "ApiForbidden")

      allowed.clear()
      const defaultDenied = yield* Effect.flip(client.Authorization.listCapabilityDefinitions({
        headers: { "x-tenant-id": tenantId },
      }))
      assert.strictEqual(defaultDenied._tag, "ApiForbidden")

      allowed.add(AuthorizationCapabilities.tenantMembershipRead)
      const crossTenant = yield* Effect.flip(client.Authorization.getMember({
        params: { userAccountId },
        headers: { "x-tenant-id": otherTenantId },
      }))
      assert.strictEqual(crossTenant._tag, "ApiForbidden")
    }))
})

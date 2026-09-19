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
  AuthorizationDenied,
  AuthorizationService,
  type AuthorizationServiceShape,
  type CapabilityType,
} from "../../modules/authorization/mod.ts"
import {
  IdentityCapabilities,
  UserAccountService,
  type UserAccountServiceShape,
} from "../../modules/identity/mod.ts"
import { BearerAuth, CurrentPrincipal, RitseiApi } from "./api.ts"
import { UserAccountHandlers } from "./handlers.ts"

const tenantId = "018f0000-0000-7000-8000-000000000001"
const otherTenantId = "018f0000-0000-7000-8000-000000000002"
const accountId = "018f0000-0000-7000-8000-000000000003"
const principal = { userAccountId: "api-test-user", sessionId: "api-test-session" }
const originalEmail = "operator@example.com"
const updatedEmail = "operator.renamed@example.com"

const unused = () => Effect.die(new Error("unused identity endpoint in API integration test"))
const account = (email = originalEmail) => ({ id: accountId, email, status: "active" as const })

const userAccounts: UserAccountServiceShape = {
  create: unused,
  createForTenant: unused,
  getById: () => Effect.succeed(account()),
  getByIds: () => Effect.succeed([account()]),
  getAuthenticationState: unused,
  resolveExternalSubject: unused,
  bindExternalSubject: unused,
  list: unused,
  update: () => Effect.succeed(account(updatedEmail)),
  disable: unused,
  enable: unused,
  remove: unused,
}

const TestHttpServices = Layer.mergeAll(
  Path.layer,
  Etag.layerWeak,
  HttpPlatform.layer,
).pipe(Layer.provideMerge(FileSystem.layerNoop({})))

it.layer(TestHttpServices)("identity tenant API authorization", (it) => {
  it.effect("allows, denies, and tenant-scopes account reads and updates", () =>
    Effect.gen(function* () {
      let allowedCapability: CapabilityType | null = IdentityCapabilities.userAccountRead
      const observed: CapabilityType[] = []
      const authorization: AuthorizationServiceShape = {
        authorize: (input) => {
          const request = input as {
            readonly tenantId: string
            readonly capability: CapabilityType
          }
          observed.push(request.capability)
          return request.tenantId === tenantId && request.capability === allowedCapability
            ? Effect.succeed({
              allowed: true as const,
              tenantId: request.tenantId,
              capability: request.capability,
              grant: "membership" as const,
            })
            : Effect.fail(
              new AuthorizationDenied({
                tenantId: request.tenantId,
                capability: request.capability,
              }),
            )
        },
        getMember: () =>
          Effect.succeed({ userAccountId: accountId, tenantId, status: "active" as const }),
        addMember: unused,
        listAccessibleTenants: () =>
          Effect.succeed([{ userAccountId: accountId, tenantId, status: "active" as const }]),
        listMembers: () =>
          Effect.succeed([{ userAccountId: accountId, tenantId, status: "active" as const }]),
        listDirectGrants: unused,
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
      const handlers = UserAccountHandlers.pipe(
        Layer.provide(bearer),
        Layer.provide(Layer.succeed(AuthorizationService, authorization)),
        Layer.provide(Layer.succeed(UserAccountService, userAccounts)),
      )
      const client = yield* HttpApiTest.groups(RitseiApi, ["UserAccounts"]).pipe(
        Effect.provide(Layer.mergeAll(handlers, bearerClient, bearer)),
      )

      const listed = yield* client.UserAccounts.list({
        headers: { "x-tenant-id": tenantId },
      })
      assert.deepStrictEqual(listed, [account()])

      const detail = yield* client.UserAccounts.get({
        params: { id: accountId },
        headers: { "x-tenant-id": tenantId },
      })
      assert.deepStrictEqual(detail, account())

      allowedCapability = IdentityCapabilities.userAccountUpdate
      const updated = yield* client.UserAccounts.update({
        params: { id: accountId },
        headers: { "x-tenant-id": tenantId },
        payload: { email: updatedEmail },
      })
      assert.deepStrictEqual(updated, account(updatedEmail))

      allowedCapability = null
      const denied = yield* Effect.flip(client.UserAccounts.update({
        params: { id: accountId },
        headers: { "x-tenant-id": tenantId },
        payload: { email: updatedEmail },
      }))
      assert.strictEqual(denied._tag, "ApiForbidden")

      allowedCapability = IdentityCapabilities.userAccountRead
      const wrongTenant = yield* Effect.flip(client.UserAccounts.get({
        params: { id: accountId },
        headers: { "x-tenant-id": otherTenantId },
      }))
      assert.strictEqual(wrongTenant._tag, "ApiForbidden")
      assert.deepStrictEqual(observed, [
        IdentityCapabilities.userAccountRead,
        IdentityCapabilities.userAccountRead,
        IdentityCapabilities.userAccountUpdate,
        IdentityCapabilities.userAccountUpdate,
        IdentityCapabilities.userAccountRead,
      ])
    }))
})

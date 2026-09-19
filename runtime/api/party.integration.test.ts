import { assert, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest"
import * as Path from "effect/Path"
import { Etag, HttpPlatform } from "effect/unstable/http"
import * as HttpApiMiddleware from "effect/unstable/httpapi/HttpApiMiddleware"
import * as HttpApiTest from "effect/unstable/httpapi/HttpApiTest"

import { makeAuthorizationTestLayer } from "../../modules/authorization/mod.ts"
import { makePartyTestLayer, PartyCapabilities } from "../../modules/party/mod.ts"
import { BearerAuth, CurrentPrincipal, RitseiApi } from "./api.ts"
import { PartyHandlers } from "./handlers.ts"

const tenantId = "018f0000-0000-7000-8000-000000000001"
const otherTenantId = "018f0000-0000-7000-8000-000000000002"
const userAccountId = "018f0000-0000-7000-8000-000000000003"
const principal = { userAccountId: "party-api-admin", sessionId: "party-api-session" }

const TestHttpServices = Layer.mergeAll(
  Path.layer,
  Etag.layerWeak,
  HttpPlatform.layer,
).pipe(Layer.provideMerge(FileSystem.layerNoop({})))

const capabilities = [
  PartyCapabilities.partyRead,
  PartyCapabilities.partyCreate,
  PartyCapabilities.legalEntityCreate,
  PartyCapabilities.branchCreate,
  PartyCapabilities.partyRoleAssign,
  PartyCapabilities.partyIdentifierAttach,
  PartyCapabilities.partyRelationshipCreate,
  PartyCapabilities.partyRelationshipRead,
  PartyCapabilities.partyRepresentationCreate,
  PartyCapabilities.partyRepresentationActivate,
  PartyCapabilities.partyRepresentationDeactivate,
] as const

it.layer(TestHttpServices)("Party API", (it) => {
  it.effect("serves the complete active tenant administration surface", () =>
    Effect.gen(function* () {
      const authorization = makeAuthorizationTestLayer(capabilities.map((capability) => ({
        userAccountId: principal.userAccountId,
        tenantId,
        capability,
      })))
      const party = makePartyTestLayer(new Set([userAccountId])).pipe(
        Layer.provide(authorization),
      )
      const bearer = Layer.succeed(BearerAuth, {
        bearer: (effect) => Effect.provideService(effect, CurrentPrincipal, principal),
      })
      const bearerClient = HttpApiMiddleware.layerClient(
        BearerAuth,
        ({ request, next }) => next(HttpClientRequest.bearerToken(request, "test-token")),
      )
      const handlers = PartyHandlers.pipe(
        Layer.provide(bearer),
        Layer.provide(party),
      )
      const client = yield* HttpApiTest.groups(RitseiApi, ["Parties"]).pipe(
        Effect.provide(Layer.mergeAll(handlers, bearerClient, bearer)),
      )

      const organization = yield* client.Parties.create({
        headers: { "x-tenant-id": tenantId },
        payload: { kind: "organization", name: "Northwind Holdings" },
      })
      const person = yield* client.Parties.create({
        headers: { "x-tenant-id": tenantId },
        payload: { kind: "person", name: "Ada Lovelace" },
      })
      const legalEntity = yield* client.Parties.createLegalEntity({
        params: { id: organization.id },
        headers: { "x-tenant-id": tenantId },
      })
      const branch = yield* client.Parties.createBranch({
        params: { id: legalEntity.id },
        headers: { "x-tenant-id": tenantId },
        payload: {
          name: "London",
          timezone: "Europe/London",
          localTaxRegistration: "GB-001",
          dedicatedJournalCode: "LON",
        },
      })
      yield* client.Parties.assignRole({
        params: { id: person.id },
        headers: { "x-tenant-id": tenantId },
        payload: { role: "customer" },
      })
      const identifier = yield* client.Parties.attachIdentifier({
        params: { id: person.id },
        headers: { "x-tenant-id": tenantId },
        payload: {
          provider: "CRM",
          scheme: "CUSTOMER-ID",
          scope: "tenant",
          value: "C-001",
        },
      })
      const relationship = yield* client.Parties.createRelationship({
        params: { id: person.id },
        headers: { "x-tenant-id": tenantId },
        payload: { legalEntityId: legalEntity.id, kind: "customer" },
      })
      const representation = yield* client.Parties.createRepresentation({
        params: { id: person.id },
        headers: { "x-tenant-id": tenantId },
        payload: { userAccountId, kind: "self" },
      })
      const deactivated = yield* client.Parties.setRepresentationActive({
        params: { id: representation.id },
        headers: { "x-tenant-id": tenantId },
        payload: { active: false },
      })
      assert.isFalse(deactivated.active)
      const activated = yield* client.Parties.setRepresentationActive({
        params: { id: representation.id },
        headers: { "x-tenant-id": tenantId },
        payload: { active: true },
      })
      assert.isTrue(activated.active)

      const directory = yield* client.Parties.list({
        headers: { "x-tenant-id": tenantId },
        query: { search: "wind", kind: "organization", limit: 10 },
      })
      assert.deepStrictEqual(directory.map(({ party }) => party.id), [organization.id])
      assert.strictEqual(directory[0]?.legalEntityId, legalEntity.id)

      const detail = yield* client.Parties.get({
        params: { id: person.id },
        headers: { "x-tenant-id": tenantId },
      })
      assert.deepStrictEqual(detail.roles, ["customer"])
      assert.deepStrictEqual(detail.identifiers, [identifier])
      assert.deepStrictEqual(detail.relationships, [relationship])
      assert.strictEqual(detail.representations[0]?.active, true)

      const organizationDetail = yield* client.Parties.get({
        params: { id: organization.id },
        headers: { "x-tenant-id": tenantId },
      })
      assert.deepStrictEqual(organizationDetail.legalEntity, legalEntity)
      assert.deepStrictEqual(organizationDetail.branches, [branch])

      const related = yield* client.Parties.findRelatedPartyPaths({
        params: { id: person.id },
        headers: { "x-tenant-id": tenantId },
        query: { limit: 10 },
      })
      assert.deepStrictEqual(related.map(({ targetPartyId }) => targetPartyId), [organization.id])

      const denied = yield* Effect.flip(client.Parties.list({
        headers: { "x-tenant-id": otherTenantId },
        query: {},
      }))
      assert.strictEqual(denied._tag, "ApiForbidden")
    }))
})

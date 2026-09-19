import { assert, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"

import { AuthorizationDenied, makeAuthorizationTestLayer } from "../../authorization/mod.ts"
import {
  makePartyTestLayer,
  PartyCapabilities,
  PartyDetail,
  PartyDirectoryEntry,
  PartyNotFound,
  PartyService,
} from "../mod.ts"

const principal = { userAccountId: "party-reader", sessionId: "session" }
const tenantId = "00000000-0000-4000-8000-000000000001"
const otherTenantId = "00000000-0000-4000-8000-000000000002"
const userAccountId = "00000000-0000-4000-8000-000000000010"

const capabilities = [
  PartyCapabilities.partyRead,
  PartyCapabilities.partyCreate,
  PartyCapabilities.legalEntityCreate,
  PartyCapabilities.branchCreate,
  PartyCapabilities.partyRoleAssign,
  PartyCapabilities.partyRelationshipCreate,
  PartyCapabilities.partyIdentifierAttach,
  PartyCapabilities.partyRepresentationCreate,
] as const

const PartyTest = makePartyTestLayer().pipe(
  Layer.provide(makeAuthorizationTestLayer(capabilities.map((capability) => ({
    userAccountId: principal.userAccountId,
    tenantId,
    capability,
  })))),
)

it.effect("lists and composes tenant-scoped Party administration facts", () =>
  Effect.gen(function* () {
    const service = yield* PartyService
    const organization = yield* service.create({
      principal,
      tenantId,
      kind: "organization",
      name: "Northwind Holdings",
    })
    const person = yield* service.create({
      principal,
      tenantId,
      kind: "person",
      name: "Ada Lovelace",
    })
    const legalEntity = yield* service.createLegalEntity({
      principal,
      tenantId,
      organizationId: organization.id,
    })
    const branch = yield* service.createBranch({
      principal,
      tenantId,
      legalEntityId: legalEntity.id,
      name: "London",
      timezone: "Europe/London",
    })
    yield* service.assignRole({
      principal,
      tenantId,
      partyId: person.id,
      role: "customer",
    })
    const identifier = yield* service.attachIdentifier({
      principal,
      tenantId,
      partyId: person.id,
      provider: "crm",
      scheme: "customer-id",
      scope: "tenant",
      value: "C-001",
    })
    const relationship = yield* service.createRelationship({
      principal,
      tenantId,
      partyId: person.id,
      legalEntityId: legalEntity.id,
      kind: "customer",
    })
    const representation = yield* service.createPartyRepresentation({
      principal,
      tenantId,
      userAccountId,
      partyId: person.id,
      kind: "self",
    })

    const directory = yield* service.list({ principal, tenantId })
    assert.strictEqual(directory.length, 2)
    assert.strictEqual(directory[0]?.party.name, "Ada Lovelace")
    assert.strictEqual(directory[1]?.legalEntityId, legalEntity.id)
    yield* Effect.forEach(
      directory,
      (entry) => Schema.decodeUnknownEffect(PartyDirectoryEntry)(entry),
    )

    assert.deepStrictEqual(
      (yield* service.list({ principal, tenantId, search: "wind", kind: "organization" }))
        .map(({ party }) => party.id),
      [organization.id],
    )
    assert.strictEqual(
      (yield* service.list({ principal, tenantId, limit: 1 })).length,
      1,
    )

    const detail = yield* service.getDetail({ principal, tenantId, partyId: person.id })
    yield* Schema.decodeUnknownEffect(PartyDetail)(detail)
    assert.deepStrictEqual(detail.roles, ["customer"])
    assert.deepStrictEqual(detail.identifiers, [identifier])
    assert.strictEqual(detail.legalEntity, null)
    assert.deepStrictEqual(detail.branches, [])
    assert.deepStrictEqual(detail.relationships, [relationship])
    assert.deepStrictEqual(detail.representations, [representation])

    const organizationDetail = yield* service.getDetail({
      principal,
      tenantId,
      partyId: organization.id,
    })
    assert.deepStrictEqual(organizationDetail.legalEntity, legalEntity)
    assert.deepStrictEqual(organizationDetail.branches, [branch])

    assert.instanceOf(
      yield* Effect.flip(service.list({ principal, tenantId: otherTenantId })),
      AuthorizationDenied,
    )
    assert.instanceOf(
      yield* Effect.flip(service.getDetail({
        principal,
        tenantId,
        partyId: "00000000-0000-4000-8000-000000000099",
      })),
      PartyNotFound,
    )
  }).pipe(Effect.provide(PartyTest)))

import { readFileSync } from "node:fs"
import { assert, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"

import {
  AddTenantMembershipInput as BrowserAddTenantMembershipInput,
  authorizationRoutes,
  CapabilityDefinition as BrowserCapabilityDefinition,
  DirectCapabilityGrant as BrowserDirectCapabilityGrant,
  GrantCapabilityInput as BrowserGrantCapabilityInput,
  ListTenantMembershipsInput as BrowserListTenantMembershipsInput,
  TenantMembership as BrowserTenantMembership,
} from "../../apps/web/src/shared/contracts/generated/authorization.ts"
import {
  AuthConfiguration as BrowserAuthConfiguration,
  authRoutes,
  AuthSession as BrowserAuthSession,
} from "../../apps/web/src/shared/contracts/generated/auth.ts"
import {
  ApiError,
  CreateUserAccountInput as BrowserCreateUserAccountInput,
  UpdateUserAccountInput as BrowserUpdateUserAccountInput,
  UserAccount as BrowserUserAccount,
  userAccountRoutes,
} from "../../apps/web/src/shared/contracts/generated/identity.ts"
import {
  CapabilityCatalog,
  CapabilityDefinitions,
  DirectCapabilityGrant,
  TenantMembership,
} from "../../modules/authorization/mod.ts"
import {
  CreateUserAccountInput,
  UpdateUserAccountInput,
  UserAccount,
} from "../../modules/identity/mod.ts"
import { Party, PartyDetail, PartyDirectoryEntry } from "../../modules/party/mod.ts"
import {
  ApiConflict,
  ApiForbidden,
  ApiNotFound,
  ApiServiceUnavailable,
  ApiUnauthorized,
  RitseiApi,
} from "../../runtime/api/api.ts"
import {
  ListPartiesInput as BrowserListPartiesInput,
  Party as BrowserParty,
  PartyDetail as BrowserPartyDetail,
  PartyDirectoryEntry as BrowserPartyDirectoryEntry,
  partyRoutes,
} from "../../apps/web/src/shared/contracts/generated/party.ts"
import {
  accountingSource,
  authorizationSource,
  authSource,
  inventorySource,
  partySource,
  processSource,
  salesSource,
  source,
} from "../../tooling/frontend/contracts.ts"
import {
  inventoryRoutes,
  Item as BrowserInventoryItem,
  StockBalance as BrowserInventoryStockBalance,
  Warehouse as BrowserInventoryWarehouse,
} from "../../apps/web/src/shared/contracts/generated/inventory.ts"
import {
  Customer as BrowserSalesCustomer,
  SalesOrder as BrowserSalesOrder,
  salesRoutes,
} from "../../apps/web/src/shared/contracts/generated/sales.ts"
import {
  Account as BrowserAccountingAccount,
  AccountingConfiguration as BrowserAccountingConfiguration,
  accountingRoutes,
  JournalEntry as BrowserAccountingJournalEntry,
} from "../../apps/web/src/shared/contracts/generated/accounting.ts"
import { processRoutes } from "../../apps/web/src/shared/contracts/generated/process.ts"

const id = "01900000-0000-7000-8000-000000000001"
const emails = [
  "user@example.com",
  "élève@example.com",
  "σ@example.com",
  "i\u0307@example.com",
  "用户@example.com",
  "a b@example.com",
  "\u200b@example.com",
  "",
  " \t\n",
  "\u00a0\u2003\ufeff",
  " user@example.com",
  "user@example.com\n",
  "\u00a0user@example.com",
  "user@example.com\ufeff",
  "USER@example.com",
  "Élève@example.com",
  "Σ@example.com",
  "İ@example.com",
]
const unknownInputs: readonly unknown[] = [
  undefined,
  null,
  false,
  42,
  "user@example.com",
  [],
  {},
  { id },
  { id, email: null, status: "active" },
  { id, email: 42, status: "active" },
  { id: "invalid", email: "user@example.com", status: "active" },
  { id, email: "user@example.com", status: "unknown" },
  { id, email: "user@example.com", status: "disabled", extra: true },
]

it("generates deterministic browser-only contracts and canonical endpoint paths", () => {
  assert.equal(source(), source())
  assert.equal(
    readFileSync(
      new URL("../../apps/web/src/shared/contracts/generated/auth.ts", import.meta.url),
      "utf8",
    ),
    authSource(),
  )
  assert.notInclude(authSource(), "runtime/")
  assert.equal(
    readFileSync(
      new URL("../../apps/web/src/shared/contracts/generated/identity.ts", import.meta.url),
      "utf8",
    ),
    source(),
  )
  assert.notInclude(source(), "modules/")
  assert.notInclude(source(), "runtime/")
  assert.equal(
    readFileSync(
      new URL(
        "../../apps/web/src/shared/contracts/generated/authorization.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    authorizationSource(),
  )
  assert.notInclude(authorizationSource(), "modules/")
  assert.notInclude(authorizationSource(), "runtime/")
  assert.equal(
    readFileSync(
      new URL("../../apps/web/src/shared/contracts/generated/party.ts", import.meta.url),
      "utf8",
    ),
    partySource(),
  )
  assert.notInclude(partySource(), "modules/")
  assert.notInclude(partySource(), "runtime/")
  assert.equal(
    readFileSync(
      new URL("../../apps/web/src/shared/contracts/generated/inventory.ts", import.meta.url),
      "utf8",
    ),
    inventorySource(),
  )
  assert.notInclude(inventorySource(), "modules/")
  assert.notInclude(inventorySource(), "runtime/")
  assert.equal(
    readFileSync(
      new URL("../../apps/web/src/shared/contracts/generated/sales.ts", import.meta.url),
      "utf8",
    ),
    salesSource(),
  )
  assert.notInclude(salesSource(), "modules/")
  assert.notInclude(salesSource(), "runtime/")
  assert.equal(
    readFileSync(
      new URL("../../apps/web/src/shared/contracts/generated/accounting.ts", import.meta.url),
      "utf8",
    ),
    accountingSource(),
  )
  assert.notInclude(accountingSource(), "modules/")
  assert.notInclude(accountingSource(), "runtime/")
  assert.equal(
    readFileSync(
      new URL("../../apps/web/src/shared/contracts/generated/process.ts", import.meta.url),
      "utf8",
    ),
    processSource(),
  )
  assert.notInclude(processSource(), "modules/")
  assert.notInclude(processSource(), 'from "../../runtime/')
  assert.deepEqual(authRoutes, {
    config: RitseiApi.groups.Authentication.endpoints.config.path,
    devLogin: RitseiApi.groups.Authentication.endpoints.devLogin.path,
    session: RitseiApi.groups.Authentication.endpoints.session.path,
    logout: RitseiApi.groups.Authentication.endpoints.logout.path,
  })
  assert.deepStrictEqual(
    Schema.decodeUnknownSync(BrowserAuthConfiguration)({
      profile: "transitional-local",
      scopes: [],
    }),
    { profile: "transitional-local", scopes: [] },
  )
  assert.isTrue(
    Schema.is(BrowserAuthSession)({
      user: { id, email: "user@example.com", status: "active" },
      memberships: [],
      activeTenant: null,
      capabilities: [],
    }),
  )
  assert.deepEqual(userAccountRoutes, {
    create: RitseiApi.groups.UserAccounts.endpoints.create.path,
    list: RitseiApi.groups.UserAccounts.endpoints.list.path,
    get: RitseiApi.groups.UserAccounts.endpoints.get.path,
    update: RitseiApi.groups.UserAccounts.endpoints.update.path,
  })
  assert.deepEqual(authorizationRoutes, {
    list: RitseiApi.groups.Authorization.endpoints.listMembers.path,
    get: RitseiApi.groups.Authorization.endpoints.getMember.path,
    add: RitseiApi.groups.Authorization.endpoints.addMember.path,
    listDirectGrants: RitseiApi.groups.Authorization.endpoints.listDirectGrants.path,
    listCapabilityDefinitions:
      RitseiApi.groups.Authorization.endpoints.listCapabilityDefinitions.path,
    suspend: RitseiApi.groups.Authorization.endpoints.suspendMember.path,
    activate: RitseiApi.groups.Authorization.endpoints.activateMember.path,
    remove: RitseiApi.groups.Authorization.endpoints.removeMember.path,
    grant: RitseiApi.groups.Authorization.endpoints.grant.path,
  })
  assert.deepEqual(partyRoutes, {
    list: RitseiApi.groups.Parties.endpoints.list.path,
    get: RitseiApi.groups.Parties.endpoints.get.path,
    create: RitseiApi.groups.Parties.endpoints.create.path,
    createLegalEntity: RitseiApi.groups.Parties.endpoints.createLegalEntity.path,
    createBranch: RitseiApi.groups.Parties.endpoints.createBranch.path,
    assignRole: RitseiApi.groups.Parties.endpoints.assignRole.path,
    attachIdentifier: RitseiApi.groups.Parties.endpoints.attachIdentifier.path,
    createRelationship: RitseiApi.groups.Parties.endpoints.createRelationship.path,
    createRepresentation: RitseiApi.groups.Parties.endpoints.createRepresentation.path,
    setRepresentationActive: RitseiApi.groups.Parties.endpoints.setRepresentationActive.path,
    findRelatedPartyPaths: RitseiApi.groups.Parties.endpoints.findRelatedPartyPaths.path,
  })
  assert.deepEqual(inventoryRoutes, {
    listWarehouses: RitseiApi.groups.Inventory.endpoints.listWarehouses.path,
    createWarehouse: RitseiApi.groups.Inventory.endpoints.createWarehouse.path,
    listItems: RitseiApi.groups.Inventory.endpoints.listItems.path,
    createItem: RitseiApi.groups.Inventory.endpoints.createItem.path,
    listStockBalances: RitseiApi.groups.Inventory.endpoints.listStockBalances.path,
    adjustStock: RitseiApi.groups.Inventory.endpoints.adjustStock.path,
    receiveStock: RitseiApi.groups.Inventory.endpoints.receiveStock.path,
    listStockReservations: RitseiApi.groups.Inventory.endpoints.listStockReservations.path,
    reserveStock: RitseiApi.groups.Inventory.endpoints.reserveStock.path,
    releaseReservation: RitseiApi.groups.Inventory.endpoints.releaseReservation.path,
    fulfillReservation: RitseiApi.groups.Inventory.endpoints.fulfillReservation.path,
    listStockTransfers: RitseiApi.groups.Inventory.endpoints.listStockTransfers.path,
    createTransfer: RitseiApi.groups.Inventory.endpoints.createTransfer.path,
    confirmTransfer: RitseiApi.groups.Inventory.endpoints.confirmTransfer.path,
    completeTransfer: RitseiApi.groups.Inventory.endpoints.completeTransfer.path,
    listStockMovements: RitseiApi.groups.Inventory.endpoints.listStockMovements.path,
  })
  assert.deepEqual(salesRoutes, {
    listCustomers: RitseiApi.groups.Sales.endpoints.listCustomers.path,
    getCustomer: RitseiApi.groups.Sales.endpoints.getCustomer.path,
    createCustomer: RitseiApi.groups.Sales.endpoints.createCustomer.path,
    listQuotations: RitseiApi.groups.Sales.endpoints.listQuotations.path,
    getQuotation: RitseiApi.groups.Sales.endpoints.getQuotation.path,
    createQuotation: RitseiApi.groups.Sales.endpoints.createQuotation.path,
    listOrders: RitseiApi.groups.Sales.endpoints.listOrders.path,
    getOrder: RitseiApi.groups.Sales.endpoints.getOrder.path,
    createOrder: RitseiApi.groups.Sales.endpoints.createOrder.path,
    confirmOrder: RitseiApi.groups.Sales.endpoints.confirmOrder.path,
    cancelOrder: RitseiApi.groups.Sales.endpoints.cancelOrder.path,
  })
  assert.deepEqual(accountingRoutes, {
    listConfigurations: RitseiApi.groups.Accounting.endpoints.listConfigurations.path,
    listAccounts: RitseiApi.groups.Accounting.endpoints.listAccounts.path,
    listPeriods: RitseiApi.groups.Accounting.endpoints.listPeriods.path,
    listRevenuePostingProfiles:
      RitseiApi.groups.Accounting.endpoints.listRevenuePostingProfiles.path,
    listJournals: RitseiApi.groups.Accounting.endpoints.listJournals.path,
    configureLegalEntity: RitseiApi.groups.Accounting.endpoints.configureLegalEntity.path,
    createAccount: RitseiApi.groups.Accounting.endpoints.createAccount.path,
    configureRevenuePosting: RitseiApi.groups.Accounting.endpoints.configureRevenuePosting.path,
    openPeriod: RitseiApi.groups.Accounting.endpoints.openPeriod.path,
    closePeriod: RitseiApi.groups.Accounting.endpoints.closePeriod.path,
    postJournal: RitseiApi.groups.Accounting.endpoints.postJournal.path,
  })
  assert.deepEqual(processRoutes, {
    listCatalog: RitseiApi.groups.Process.endpoints.listCatalog.path,
    validateDefinition: RitseiApi.groups.Process.endpoints.validateDefinition.path,
    listRuntimeInstances: RitseiApi.groups.Process.endpoints.listRuntimeInstances.path,
    listWorkflowRuns: RitseiApi.groups.Process.endpoints.listWorkflowRuns.path,
    listOperatorInbox: RitseiApi.groups.Process.endpoints.listOperatorInbox.path,
    listOperatorControls: RitseiApi.groups.Process.endpoints.listOperatorControls.path,
    operateRuntime: RitseiApi.groups.Process.endpoints.operateRuntime.path,
  })
})

// Fallow: this contract test intentionally iterates the complete canonical decoder matrix.
// fallow-ignore-next-line complexity
it.effect("preserves canonical whitespace, Unicode and case validation in browser decoders", () =>
  // Fallow: this contract test intentionally iterates the complete canonical decoder matrix.
  // fallow-ignore-next-line complexity
  Effect.gen(function* () {
    for (const email of emails) {
      const input = { id, email, status: "active" }
      const account = yield* Effect.result(Schema.decodeUnknownEffect(UserAccount)(input))
      assert.equal(
        account._tag === "Success",
        /\S/.test(email) && email === email.trim() && email === email.toLowerCase(),
        JSON.stringify(email),
      )
      const update = yield* Effect.result(Schema.decodeUnknownEffect(UpdateUserAccountInput)(input))
      assert.equal(update._tag === "Success", /\S/.test(email), JSON.stringify(email))
      const create = yield* Effect.result(
        Schema.decodeUnknownEffect(CreateUserAccountInput)({ email }),
      )
      assert.equal(create._tag === "Success", /\S/.test(email), JSON.stringify(email))
    }
    for (
      const [canonical, browser] of [
        [UserAccount, BrowserUserAccount],
        [UpdateUserAccountInput, BrowserUpdateUserAccountInput],
      ] as const
    ) {
      for (
        const input of [
          ...unknownInputs,
          ...emails.map((email) => ({ id, email, status: "active" })),
        ]
      ) {
        const expected = yield* Effect.result(Schema.decodeUnknownEffect(canonical)(input))
        const actual = yield* Effect.result(Schema.decodeUnknownEffect(browser)(input))
        assert.equal(actual._tag, expected._tag)
        if (actual._tag === "Success" && expected._tag === "Success") {
          assert.deepEqual(actual.success, expected.success)
        }
      }
    }
    for (const input of [...unknownInputs, ...emails.map((email) => ({ email }))]) {
      const expected = yield* Effect.result(
        Schema.decodeUnknownEffect(CreateUserAccountInput)(input),
      )
      const actual = yield* Effect.result(
        Schema.decodeUnknownEffect(BrowserCreateUserAccountInput)(input),
      )
      assert.equal(actual._tag, expected._tag)
      if (actual._tag === "Success" && expected._tag === "Success") {
        assert.deepEqual(actual.success, expected.success)
      }
    }
  }))

it.effect("preserves Party projection validation in browser decoders", () =>
  Effect.gen(function* () {
    const party = {
      id,
      tenantId: "01900000-0000-7000-8000-000000000002",
      kind: "organization",
      name: "Northwind Holdings",
    }
    const directory = { party, legalEntityId: null }
    const detail = {
      party,
      roles: ["supplier"],
      identifiers: [],
      legalEntity: null,
      branches: [],
      relationships: [],
      representations: [],
    }
    for (
      const [canonical, browser, value] of [
        [Party, BrowserParty, party],
        [PartyDirectoryEntry, BrowserPartyDirectoryEntry, directory],
        [PartyDetail, BrowserPartyDetail, detail],
      ] as const
    ) {
      assert.deepEqual(
        yield* Schema.decodeUnknownEffect(browser)(value),
        yield* Schema.decodeUnknownEffect(canonical)(value),
      )
    }
    assert.deepEqual(
      yield* Schema.decodeUnknownEffect(BrowserListPartiesInput)({
        search: "Northwind",
        kind: "organization",
        limit: 200,
      }),
      { search: "Northwind", kind: "organization", limit: 200 },
    )
    assert.isTrue(
      (yield* Effect.result(
        Schema.decodeUnknownEffect(BrowserPartyDetail)({
          ...detail,
          roles: ["unknown"],
        }),
      ))._tag === "Failure",
    )
  }))

it.effect("preserves Inventory projection validation and tenant-shaped values", () =>
  Effect.gen(function* () {
    const tenantId = "01900000-0000-7000-8000-000000000002"
    const warehouse = {
      id,
      tenantId,
      legalEntityId: "01900000-0000-7000-8000-000000000003",
      primaryBranchId: null,
      name: "Main warehouse",
    }
    const item = {
      id: "01900000-0000-7000-8000-000000000004",
      tenantId,
      sku: "SKU-1",
      name: "Widget",
      unitOfMeasure: "EA",
    }
    const balance = {
      tenantId,
      warehouseId: warehouse.id,
      itemId: item.id,
      onHand: "10",
      reserved: "2",
      unitOfMeasure: "EA",
    }
    assert.deepEqual(
      yield* Schema.decodeUnknownEffect(BrowserInventoryWarehouse)(warehouse),
      warehouse,
    )
    assert.deepEqual(yield* Schema.decodeUnknownEffect(BrowserInventoryItem)(item), item)
    assert.deepEqual(
      yield* Schema.decodeUnknownEffect(BrowserInventoryStockBalance)(balance),
      balance,
    )
    assert.isTrue(
      (yield* Effect.result(
        Schema.decodeUnknownEffect(BrowserInventoryStockBalance)({ ...balance, onHand: "02" }),
      ))._tag === "Failure",
    )
  }))

it.effect("preserves Sales projection validation and tenant-shaped values", () =>
  Effect.gen(function* () {
    const tenantId = "01900000-0000-7000-8000-000000000002"
    const customer = { id, tenantId, name: "Sales Customer", email: "sales@example.test" }
    const order = {
      id: "01900000-0000-7000-8000-000000000004",
      tenantId,
      customerId: customer.id,
      quotationId: null,
      status: "draft" as const,
      confirmedAt: null,
      total: "10.00",
      lines: [{
        itemId: "01900000-0000-7000-8000-000000000005",
        quantity: "1",
        unitPrice: "10.00",
      }],
    }
    assert.deepStrictEqual(
      yield* Schema.decodeUnknownEffect(BrowserSalesCustomer)(customer),
      customer,
    )
    assert.deepStrictEqual(yield* Schema.decodeUnknownEffect(BrowserSalesOrder)(order), order)
    assert.isTrue(
      (yield* Effect.result(
        Schema.decodeUnknownEffect(BrowserSalesOrder)({ ...order, status: "unknown" }),
      ))._tag === "Failure",
    )
  }))

it.effect("preserves Accounting projection and exact-money validation", () =>
  Effect.gen(function* () {
    const tenantId = "01900000-0000-7000-8000-000000000002"
    const legalEntityId = "01900000-0000-7000-8000-000000000003"
    const accountId = "01900000-0000-7000-8000-000000000004"
    const configuration = {
      tenantId,
      legalEntityId,
      baseCurrency: "USD",
      precision: 2 as const,
      fiscalYearStartMonth: 1,
      postingEnabled: true,
      financialEngine: "postgresql" as const,
    }
    const account = {
      id: accountId,
      tenantId,
      code: "1000",
      name: "Cash",
      type: "asset" as const,
    }
    const journal = {
      id: "01900000-0000-7000-8000-000000000005",
      tenantId,
      reference: "opening-entry",
      status: "posted" as const,
      postedAt: "2026-09-13T00:00:00.000Z",
      lines: [
        { accountId, debit: "125.00", credit: "0.00" },
        {
          accountId: "01900000-0000-7000-8000-000000000006",
          debit: "0.00",
          credit: "125.00",
        },
      ],
    }
    assert.deepStrictEqual(
      yield* Schema.decodeUnknownEffect(BrowserAccountingConfiguration)(configuration),
      configuration,
    )
    assert.deepStrictEqual(
      yield* Schema.decodeUnknownEffect(BrowserAccountingAccount)(account),
      account,
    )
    assert.deepStrictEqual(
      yield* Schema.decodeUnknownEffect(BrowserAccountingJournalEntry)(journal),
      journal,
    )
    assert.isTrue(
      (yield* Effect.result(
        Schema.decodeUnknownEffect(BrowserAccountingJournalEntry)({
          ...journal,
          lines: [{ ...journal.lines[0], debit: "125.000" }, journal.lines[1]],
        }),
      ))._tag === "Failure",
    )
  }))

it.effect("preserves Authorization membership, grant, and catalog validation", () =>
  Effect.gen(function* () {
    const tenantId = "01900000-0000-7000-8000-000000000002"
    const membership = { userAccountId: id, tenantId, status: "active" }
    const grant = {
      userAccountId: id,
      tenantId,
      capability: "authorization.tenant_membership.read",
      scope: "tenant",
    }
    for (
      const [canonical, browser, value] of [
        [TenantMembership, BrowserTenantMembership, membership],
        [DirectCapabilityGrant, BrowserDirectCapabilityGrant, grant],
      ] as const
    ) {
      assert.deepEqual(
        yield* Schema.decodeUnknownEffect(browser)(value),
        yield* Schema.decodeUnknownEffect(canonical)(value),
      )
    }
    const catalog = CapabilityDefinitions.slice(0, 2)
    assert.deepEqual(
      yield* Schema.decodeUnknownEffect(Schema.Array(BrowserCapabilityDefinition))(catalog),
      yield* Schema.decodeUnknownEffect(CapabilityCatalog)(catalog),
    )
    assert.deepEqual(
      yield* Schema.decodeUnknownEffect(BrowserListTenantMembershipsInput)({
        search: "01900000",
        status: "suspended",
        limit: 200,
      }),
      { search: "01900000", status: "suspended", limit: 200 },
    )
    assert.deepEqual(
      yield* Schema.decodeUnknownEffect(BrowserAddTenantMembershipInput)({
        userAccountId: id,
      }),
      { userAccountId: id },
    )
    assert.deepEqual(
      yield* Schema.decodeUnknownEffect(BrowserGrantCapabilityInput)({
        userAccountId: id,
        capability: grant.capability,
      }),
      { userAccountId: id, capability: grant.capability },
    )
  }))

it.effect("generates the canonical HTTP error wire union without backend error classes", () =>
  Effect.gen(function* () {
    const canonical = Schema.Union([
      ApiUnauthorized,
      ApiForbidden,
      ApiNotFound,
      ApiConflict,
      ApiServiceUnavailable,
    ])
    for (
      const input of [
        { _tag: "ApiUnauthorized", code: "unauthorized" },
        { _tag: "ApiForbidden", code: "forbidden" },
        { _tag: "ApiNotFound", code: "user_account_not_found" },
        { _tag: "ApiConflict", code: "user_account_already_exists" },
        { _tag: "ApiServiceUnavailable", code: "service_unavailable" },
        { _tag: "ApiUnauthorized", code: "wrong" },
        { _tag: "Unknown", code: "unknown" },
        ...unknownInputs,
      ]
    ) {
      const expected = yield* Effect.result(Schema.decodeUnknownEffect(canonical)(input))
      const actual = yield* Effect.result(Schema.decodeUnknownEffect(ApiError)(input))
      assert.equal(actual._tag, expected._tag)
      if (actual._tag === "Success" && expected._tag === "Success") {
        assert.equal(actual.success._tag, expected.success._tag)
        assert.equal(actual.success.code, expected.success.code)
      }
    }
  }))

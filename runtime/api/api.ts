import * as Context from "effect/Context"
import * as Schema from "effect/Schema"
import * as HttpApi from "effect/unstable/httpapi/HttpApi"
import * as HttpApiEndpoint from "effect/unstable/httpapi/HttpApiEndpoint"
import * as HttpApiGroup from "effect/unstable/httpapi/HttpApiGroup"
import * as HttpApiMiddleware from "effect/unstable/httpapi/HttpApiMiddleware"
import * as HttpApiSchema from "effect/unstable/httpapi/HttpApiSchema"
import * as HttpApiSecurity from "effect/unstable/httpapi/HttpApiSecurity"
import * as OpenApi from "effect/unstable/httpapi/OpenApi"

import { Principal } from "../../modules/auth/mod.ts"
import { ConsistencyToken, FinancialMajorAmount } from "../../foundation/mod.ts"
import type { RitseiRuntimeConfiguration } from "../config.ts"
import {
  FINANCIAL_STAGING_EVIDENCE_CANONICALIZATION_VERSION,
  FinancialStagingEvidence,
} from "../../modules/accounting/mod.ts"
import {
  Capability,
  CapabilityCatalog,
  DirectCapabilityGrant,
  TenantMembership,
  TenantMembershipStatus,
} from "../../modules/authorization/mod.ts"
import { UserAccount } from "../../modules/identity/mod.ts"
import {
  Branch,
  ExternalIdentifier,
  LegalEntity,
  Party,
  PartyDetail,
  PartyDirectoryEntry,
  PartyKind,
  PartyRelationship,
  PartyRelationshipKind,
  PartyRepresentation,
  PartyRepresentationKind,
  PartyRole,
  RelatedPartyPath,
} from "../../modules/party/mod.ts"
import {
  Customer,
  Quotation,
  QuotationStatus,
  SalesOrder,
  SalesOrderLine,
  SalesOrderStatus,
} from "../../modules/sales/mod.ts"
import {
  OrderCancellationPayload,
  OrderCancellationResult,
  OrderConfirmationPayload,
  OrderConfirmationResult,
  OrderFulfillmentPayload,
  OrderFulfillmentResult,
  ProcessCatalogCapabilityKind,
  ProcessCatalogDescriptor,
  ProcessJobInboxItem,
  ProcessOperatorAction,
  ProcessOperatorControl,
  ProcessRuntimeInstance,
  ProcessStaticValidation,
  ProcessWorkflowRun,
  ResolveProcessCatalogInput,
  WorkflowRun,
} from "../../modules/process/mod.ts"
import {
  Item,
  StockBalance,
  StockCorrection,
  StockMovement,
  StockMovementKind,
  StockReservation,
  StockReservationStatus,
  StockTransfer,
  StockTransferLine,
  StockTransferStatus,
  Warehouse,
} from "../../modules/inventory/mod.ts"
import {
  GoodsReceipt,
  PurchaseOrder,
  PurchaseOrderLine,
  PurchaseOrderStatus,
  PurchaseReceiptLineInput,
  SupplierAccount,
} from "../../modules/procurement/mod.ts"
import {
  Account,
  AccountingConfiguration,
  AccountingPeriod,
  FinancialCutoverControl,
  FinancialOperation,
  FinancialProjectionRebuildResult,
  FinancialReconciliationCheckpoint,
  FinancialStagingEvidenceRecord,
  FinancialVerificationArtifact,
  FinancialVerificationEvidence,
  JournalEntry,
  JournalLine,
  RevenuePostingProfile,
} from "../../modules/accounting/mod.ts"

export class CurrentPrincipal extends Context.Service<CurrentPrincipal, Principal>()(
  "RITSEI/Http/CurrentPrincipal",
) {}

export class CurrentRuntimeConfiguration
  extends Context.Service<CurrentRuntimeConfiguration, RitseiRuntimeConfiguration>()(
    "RITSEI/Http/CurrentRuntimeConfiguration",
  ) {}

export class ApiUnauthorized extends Schema.TaggedError<ApiUnauthorized>()("ApiUnauthorized", {
  code: Schema.Literal("unauthorized"),
}, { httpApiStatus: 401 }) {}
export class ApiForbidden extends Schema.TaggedError<ApiForbidden>()("ApiForbidden", {
  code: Schema.Literal("forbidden"),
}, { httpApiStatus: 403 }) {}
export class ApiNotFound extends Schema.TaggedError<ApiNotFound>()("ApiNotFound", {
  code: Schema.String,
}, { httpApiStatus: 404 }) {}
export class ApiConflict extends Schema.TaggedError<ApiConflict>()("ApiConflict", {
  code: Schema.String,
}, { httpApiStatus: 409 }) {}
export class ApiServiceUnavailable
  extends Schema.TaggedError<ApiServiceUnavailable>()("ApiServiceUnavailable", {
    code: Schema.Literal("service_unavailable"),
  }, { httpApiStatus: 503 }) {}

export class BearerAuth extends HttpApiMiddleware.Service<BearerAuth, {
  provides: CurrentPrincipal
}>()("RITSEI/Http/BearerAuth", {
  error: [ApiUnauthorized, ApiServiceUnavailable],
  security: { bearer: HttpApiSecurity.bearer },
}) {}

const errors = [ApiUnauthorized, ApiForbidden, ApiNotFound, ApiConflict, ApiServiceUnavailable]
const MaxApiTextLength = 4_096
const MaxApiIdentifierLength = 256
const MaxApiCollectionItems = 1_000
const Uuid = Schema.String.check(Schema.isUUID())
const NonEmptyString = Schema.String.check(
  Schema.isPattern(/\S/),
  Schema.isMaxLength(MaxApiTextLength),
)
const ShortString = Schema.String.check(
  Schema.isPattern(/\S/),
  Schema.isMaxLength(MaxApiIdentifierLength),
)
const BoundedAuthArray = <S extends Schema.Constraint>(schema: S) =>
  Schema.Array(schema).check(Schema.isMaxLength(32))
const Email = Schema.String.check(
  Schema.isPattern(/^[^\s@]+@[^\s@]+$/),
  Schema.isMaxLength(320),
)
const CurrencyCode = Schema.String.check(Schema.isPattern(/^[A-Za-z]{3}$/))
const PositiveInt = Schema.Int.check(
  Schema.isBetween({ minimum: 1, maximum: 2_147_483_647 }),
)
const FiscalYearStartMonth = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 12 }))
const BoundedArray = <S extends Schema.Constraint>(schema: S) =>
  Schema.Array(schema).check(Schema.isMaxLength(MaxApiCollectionItems))
const tenantHeaders = { "x-tenant-id": Uuid }
const authSessionHeaders = { "x-tenant-id": Schema.optionalKey(Uuid) }
const consistencyHeaders = {
  ...tenantHeaders,
  "x-ritsei-consistency-token": Schema.optionalKey(ConsistencyToken),
}
const CreatedSupplierAccount = SupplierAccount.pipe(HttpApiSchema.status(201))
const CreatedPurchaseOrder = HttpApiSchema.WithHeaders(
  PurchaseOrder.pipe(HttpApiSchema.status(201)),
  { "x-ritsei-consistency-token": Schema.optionalKey(ConsistencyToken) },
)
const CreatedGoodsReceipt = GoodsReceipt.pipe(HttpApiSchema.status(201))
const CreatedUserAccount = UserAccount.pipe(HttpApiSchema.status(201))
const CreatedParty = Party.pipe(HttpApiSchema.status(201))
const CreatedExternalIdentifier = ExternalIdentifier.pipe(HttpApiSchema.status(201))
const CreatedLegalEntity = LegalEntity.pipe(HttpApiSchema.status(201))
const CreatedBranch = Branch.pipe(HttpApiSchema.status(201))
const CreatedPartyRelationship = PartyRelationship.pipe(HttpApiSchema.status(201))
const CreatedPartyRepresentation = PartyRepresentation.pipe(HttpApiSchema.status(201))
const CreatedCustomer = Customer.pipe(HttpApiSchema.status(201))
const CreatedQuotation = Quotation.pipe(HttpApiSchema.status(201))
const CreatedOrder = SalesOrder.pipe(HttpApiSchema.status(201))
const CreatedWarehouse = Warehouse.pipe(HttpApiSchema.status(201))
const CreatedItem = Item.pipe(HttpApiSchema.status(201))
const CreatedReservation = StockReservation.pipe(HttpApiSchema.status(201))
const CreatedTransfer = StockTransfer.pipe(HttpApiSchema.status(201))
const CreatedAccountingConfiguration = AccountingConfiguration.pipe(HttpApiSchema.status(201))
const CreatedAccount = Account.pipe(HttpApiSchema.status(201))
const CreatedAccountingPeriod = AccountingPeriod.pipe(HttpApiSchema.status(201))
const CreatedRevenuePostingProfile = RevenuePostingProfile.pipe(HttpApiSchema.status(201))
const CreatedJournal = JournalEntry.pipe(HttpApiSchema.status(201))
const CreatedFinancialOperation = FinancialOperation.pipe(HttpApiSchema.status(201))
const CreatedFinancialVerificationArtifact = FinancialVerificationArtifact.pipe(
  HttpApiSchema.status(201),
)
const FinancialStagingEvidenceList = BoundedArray(FinancialStagingEvidenceRecord)
const FinancialStagingEvidenceAppendPayload = Schema.Struct({
  evidence: FinancialStagingEvidence,
  canonicalizationVersion: Schema.Literal(
    FINANCIAL_STAGING_EVIDENCE_CANONICALIZATION_VERSION,
  ),
  evidenceHash: Schema.String.check(
    Schema.isPattern(/^[0-9a-f]{64}$/),
    Schema.isMaxLength(64),
  ),
})
const FinancialStagingEvidenceLookupQuery = Schema.Struct({
  legalEntityId: Schema.optionalKey(Uuid),
  gateId: Schema.optionalKey(ShortString),
  cohortId: Schema.optionalKey(ShortString),
  deploymentRevision: Schema.optionalKey(ShortString),
  limit: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: MaxApiCollectionItems })),
}).check(Schema.makeFilter(
  (query) =>
    query.gateId !== undefined || query.cohortId !== undefined ||
    query.deploymentRevision !== undefined,
  { expected: "staging evidence lookup requires gate, cohort, or deployment scope" },
))
const CreatedTenantMembership = TenantMembership.pipe(HttpApiSchema.status(201))
export const AuthProfile = Schema.Literals(["transitional-local", "oidc"])
const LocalAuthConfiguration = Schema.Struct({
  profile: Schema.Literal("transitional-local"),
  scopes: BoundedAuthArray(ShortString),
})
const OidcAuthConfiguration = Schema.Struct({
  profile: Schema.Literal("oidc"),
  issuerUrl: NonEmptyString,
  clientId: NonEmptyString,
  authorizationEndpoint: NonEmptyString,
  tokenEndpoint: NonEmptyString,
  redirectUri: NonEmptyString,
  scopes: BoundedAuthArray(ShortString),
})
export const AuthConfiguration = Schema.Union([LocalAuthConfiguration, OidcAuthConfiguration])
const AuthToken = Schema.String.check(Schema.isPattern(/\S/), Schema.isMaxLength(4_096))
export const AuthLoginResult = Schema.Struct({
  token: AuthToken,
  expiresAt: NonEmptyString,
})
export const AuthSession = Schema.Struct({
  user: UserAccount,
  memberships: BoundedArray(TenantMembership),
  activeTenant: Schema.NullOr(TenantMembership),
  capabilities: BoundedArray(Capability),
})
const CreatedOrderConfirmation = OrderConfirmationResult.pipe(HttpApiSchema.status(201))
const CreatedOrderCancellation = OrderCancellationResult.pipe(HttpApiSchema.status(201))
const CreatedOrderFulfillment = OrderFulfillmentResult.pipe(HttpApiSchema.status(201))
const AccountingReadLimit = Schema.optionalKey(Schema.NumberFromString.pipe(
  Schema.check(Schema.isInt()),
  Schema.check(Schema.isBetween({ minimum: 1, maximum: 200 })),
))
const ProcessReadLimit = AccountingReadLimit
const ProcessInboxResponse = Schema.Struct({
  runtimeInstances: BoundedArray(ProcessRuntimeInstance),
  jobs: BoundedArray(ProcessJobInboxItem),
})

const Authentication = HttpApiGroup.make("Authentication").add(
  HttpApiEndpoint.get("config", "/auth/config", {
    success: AuthConfiguration,
    error: [ApiServiceUnavailable],
  }),
  HttpApiEndpoint.post("devLogin", "/auth/dev/login", {
    success: AuthLoginResult,
    error: [ApiForbidden, ApiServiceUnavailable],
  }),
  HttpApiEndpoint.get("session", "/auth/session", {
    headers: authSessionHeaders,
    success: AuthSession,
    error: errors,
  }).middleware(BearerAuth),
  HttpApiEndpoint.post("logout", "/auth/logout", {
    error: errors,
  }).middleware(BearerAuth),
)

const Health = HttpApiGroup.make("Health").add(
  HttpApiEndpoint.get("health", "/health", {
    success: Schema.Struct({ status: Schema.Literal("ok") }),
  }),
)

const UserAccounts = HttpApiGroup.make("UserAccounts").add(
  HttpApiEndpoint.post("create", "/user-accounts", {
    headers: tenantHeaders,
    payload: Schema.Struct({ email: Email }),
    success: CreatedUserAccount,
    error: errors,
  }).middleware(BearerAuth),
  HttpApiEndpoint.get("list", "/user-accounts", {
    headers: tenantHeaders,
    success: Schema.Array(UserAccount),
    error: errors,
  }).middleware(BearerAuth),
  HttpApiEndpoint.get("get", "/user-accounts/:id", {
    params: { id: Uuid },
    headers: tenantHeaders,
    success: UserAccount,
    error: errors,
  }).middleware(BearerAuth),
  HttpApiEndpoint.patch("update", "/user-accounts/:id", {
    params: { id: Uuid },
    headers: tenantHeaders,
    payload: Schema.Struct({ email: Email }),
    success: UserAccount,
    error: errors,
  }).middleware(BearerAuth),
)

const Parties = HttpApiGroup.make("Parties").add(
  HttpApiEndpoint.get("list", "/parties", {
    headers: tenantHeaders,
    query: {
      search: Schema.optionalKey(ShortString),
      kind: Schema.optionalKey(PartyKind),
      limit: Schema.optionalKey(Schema.NumberFromString.pipe(
        Schema.check(Schema.isInt()),
        Schema.check(Schema.isBetween({ minimum: 1, maximum: 200 })),
      )),
    },
    success: Schema.Array(PartyDirectoryEntry),
    error: errors,
  }).middleware(BearerAuth),
  HttpApiEndpoint.get("get", "/parties/:id", {
    params: { id: Uuid },
    headers: tenantHeaders,
    success: PartyDetail,
    error: errors,
  }).middleware(BearerAuth),
  HttpApiEndpoint.post("create", "/parties", {
    headers: tenantHeaders,
    payload: Schema.Struct({ kind: PartyKind, name: ShortString }),
    success: CreatedParty,
    error: errors,
  }).middleware(BearerAuth),
  HttpApiEndpoint.post("createLegalEntity", "/parties/:id/legal-entity", {
    params: { id: Uuid },
    headers: tenantHeaders,
    success: CreatedLegalEntity,
    error: errors,
  }).middleware(BearerAuth),
  HttpApiEndpoint.post("createBranch", "/legal-entities/:id/branches", {
    params: { id: Uuid },
    headers: tenantHeaders,
    payload: Schema.Struct({
      name: ShortString,
      timezone: Schema.optionalKey(ShortString),
      localTaxRegistration: Schema.optionalKey(ShortString),
      dedicatedJournalCode: Schema.optionalKey(ShortString),
    }),
    success: CreatedBranch,
    error: errors,
  }).middleware(BearerAuth),
  HttpApiEndpoint.post("assignRole", "/parties/:id/roles", {
    params: { id: Uuid },
    headers: tenantHeaders,
    payload: Schema.Struct({ role: PartyRole }),
    error: errors,
  }).middleware(BearerAuth),
  HttpApiEndpoint.post("attachIdentifier", "/parties/:id/identifiers", {
    params: { id: Uuid },
    headers: tenantHeaders,
    payload: Schema.Struct({
      provider: ShortString,
      scheme: ShortString,
      scope: ShortString,
      legalEntityId: Schema.optionalKey(Uuid),
      value: NonEmptyString,
    }),
    success: CreatedExternalIdentifier,
    error: errors,
  }).middleware(BearerAuth),
  HttpApiEndpoint.post("createRelationship", "/parties/:id/relationships", {
    params: { id: Uuid },
    headers: tenantHeaders,
    payload: Schema.Struct({
      legalEntityId: Uuid,
      kind: PartyRelationshipKind,
    }),
    success: CreatedPartyRelationship,
    error: errors,
  }).middleware(BearerAuth),
  HttpApiEndpoint.post("createRepresentation", "/parties/:id/representations", {
    params: { id: Uuid },
    headers: tenantHeaders,
    payload: Schema.Struct({
      userAccountId: Uuid,
      kind: PartyRepresentationKind,
    }),
    success: CreatedPartyRepresentation,
    error: errors,
  }).middleware(BearerAuth),
  HttpApiEndpoint.patch("setRepresentationActive", "/party-representations/:id", {
    params: { id: Uuid },
    headers: tenantHeaders,
    payload: Schema.Struct({ active: Schema.Boolean }),
    success: PartyRepresentation,
    error: errors,
  }).middleware(BearerAuth),
  HttpApiEndpoint.get("findRelatedPartyPaths", "/parties/:id/related-paths", {
    params: { id: Uuid },
    headers: tenantHeaders,
    query: {
      limit: Schema.optionalKey(Schema.NumberFromString.pipe(
        Schema.check(Schema.isInt()),
        Schema.check(Schema.isBetween({ minimum: 1, maximum: 100 })),
      )),
    },
    success: Schema.Array(RelatedPartyPath),
    error: errors,
  }).middleware(BearerAuth),
)

const Authorization = HttpApiGroup.make("Authorization").add(
  HttpApiEndpoint.post("addMember", "/tenant-memberships", {
    headers: tenantHeaders,
    payload: Schema.Struct({ userAccountId: Uuid }),
    success: CreatedTenantMembership,
    error: errors,
  }).middleware(BearerAuth),
  HttpApiEndpoint.get("listMembers", "/tenant-memberships", {
    headers: tenantHeaders,
    query: {
      search: Schema.optionalKey(Schema.Trim.pipe(
        Schema.check(Schema.isPattern(/\S/)),
        Schema.check(Schema.isMaxLength(256)),
      )),
      status: Schema.optionalKey(TenantMembershipStatus),
      limit: Schema.optionalKey(Schema.NumberFromString.pipe(
        Schema.check(Schema.isInt()),
        Schema.check(Schema.isBetween({ minimum: 1, maximum: 200 })),
      )),
    },
    success: Schema.Array(TenantMembership),
    error: errors,
  }).middleware(BearerAuth),
  HttpApiEndpoint.get("getMember", "/tenant-memberships/:userAccountId", {
    params: { userAccountId: Uuid },
    headers: tenantHeaders,
    success: TenantMembership,
    error: errors,
  }).middleware(BearerAuth),
  HttpApiEndpoint.get("listDirectGrants", "/tenant-memberships/:userAccountId/capabilities", {
    params: { userAccountId: Uuid },
    headers: tenantHeaders,
    success: Schema.Array(DirectCapabilityGrant),
    error: errors,
  }).middleware(BearerAuth),
  HttpApiEndpoint.get("listCapabilityDefinitions", "/capability-definitions", {
    headers: tenantHeaders,
    success: CapabilityCatalog,
    error: errors,
  }).middleware(BearerAuth),
  HttpApiEndpoint.post("suspendMember", "/tenant-memberships/:userAccountId/suspend", {
    params: { userAccountId: Uuid },
    headers: tenantHeaders,
    success: TenantMembership,
    error: errors,
  }).middleware(BearerAuth),
  HttpApiEndpoint.post("activateMember", "/tenant-memberships/:userAccountId/activate", {
    params: { userAccountId: Uuid },
    headers: tenantHeaders,
    success: TenantMembership,
    error: errors,
  }).middleware(BearerAuth),
  HttpApiEndpoint.delete("removeMember", "/tenant-memberships/:userAccountId", {
    params: { userAccountId: Uuid },
    headers: tenantHeaders,
    error: errors,
  }).middleware(BearerAuth),
  HttpApiEndpoint.post("grant", "/capabilities", {
    headers: tenantHeaders,
    payload: Schema.Struct({ userAccountId: Uuid, capability: Capability }),
    error: errors,
  }).middleware(BearerAuth),
)

const Sales = HttpApiGroup.make("Sales").add(
  HttpApiEndpoint.get("listCustomers", "/sales/customers", {
    headers: tenantHeaders,
    query: {
      search: Schema.optionalKey(ShortString),
      limit: Schema.optionalKey(Schema.NumberFromString.pipe(
        Schema.check(Schema.isInt()),
        Schema.check(Schema.isBetween({ minimum: 1, maximum: 200 })),
      )),
    },
    success: Schema.Array(Customer),
    error: errors,
  }).middleware(BearerAuth),
  HttpApiEndpoint.get("getCustomer", "/sales/customers/:id", {
    params: { id: Uuid },
    headers: tenantHeaders,
    success: Customer,
    error: errors,
  }).middleware(BearerAuth),
  HttpApiEndpoint.post("createCustomer", "/sales/customers", {
    headers: tenantHeaders,
    payload: Schema.Struct({ name: ShortString, email: Email }),
    success: CreatedCustomer,
    error: errors,
  }).middleware(BearerAuth),
  HttpApiEndpoint.get("listQuotations", "/sales/quotations", {
    headers: tenantHeaders,
    query: {
      customerId: Schema.optionalKey(Uuid),
      status: Schema.optionalKey(QuotationStatus),
      limit: Schema.optionalKey(Schema.NumberFromString.pipe(
        Schema.check(Schema.isInt()),
        Schema.check(Schema.isBetween({ minimum: 1, maximum: 200 })),
      )),
    },
    success: Schema.Array(Quotation),
    error: errors,
  }).middleware(BearerAuth),
  HttpApiEndpoint.get("getQuotation", "/sales/quotations/:id", {
    params: { id: Uuid },
    headers: tenantHeaders,
    success: Quotation,
    error: errors,
  }).middleware(BearerAuth),
  HttpApiEndpoint.post("createQuotation", "/sales/quotations", {
    headers: tenantHeaders,
    payload: Schema.Struct({ customerId: Uuid, total: FinancialMajorAmount }),
    success: CreatedQuotation,
    error: errors,
  }).middleware(BearerAuth),
  HttpApiEndpoint.get("listOrders", "/sales/orders", {
    headers: tenantHeaders,
    query: {
      customerId: Schema.optionalKey(Uuid),
      status: Schema.optionalKey(SalesOrderStatus),
      limit: Schema.optionalKey(Schema.NumberFromString.pipe(
        Schema.check(Schema.isInt()),
        Schema.check(Schema.isBetween({ minimum: 1, maximum: 200 })),
      )),
    },
    success: Schema.Array(SalesOrder),
    error: errors,
  }).middleware(BearerAuth),
  HttpApiEndpoint.get("getOrder", "/sales/orders/:id", {
    params: { id: Uuid },
    headers: tenantHeaders,
    success: SalesOrder,
    error: errors,
  }).middleware(BearerAuth),
  HttpApiEndpoint.post("createOrder", "/sales/orders", {
    headers: tenantHeaders,
    payload: Schema.Struct({
      customerId: Uuid,
      quotationId: Schema.optionalKey(Uuid),
      lines: BoundedArray(SalesOrderLine).check(Schema.isMinLength(1)),
    }),
    success: CreatedOrder,
    error: errors,
  }).middleware(BearerAuth),
  HttpApiEndpoint.post("confirmOrder", "/sales/orders/:id/confirm", {
    params: { id: Uuid },
    headers: tenantHeaders,
    payload: Schema.Struct({
      commandId: ShortString,
      correlationId: ShortString,
      causationId: Schema.optionalKey(Schema.NullOr(ShortString)),
      idempotencyKey: ShortString,
    }),
    success: SalesOrder,
    error: errors,
  }).middleware(BearerAuth),
  HttpApiEndpoint.post("cancelOrder", "/sales/orders/:id/cancel", {
    params: { id: Uuid },
    headers: tenantHeaders,
    success: SalesOrder,
    error: errors,
  }).middleware(BearerAuth),
)

const Inventory = HttpApiGroup.make("Inventory").add(
  HttpApiEndpoint.get("listWarehouses", "/inventory/warehouses", {
    headers: tenantHeaders,
    query: {
      legalEntityId: Schema.optionalKey(Uuid),
      limit: Schema.optionalKey(Schema.NumberFromString.pipe(
        Schema.check(Schema.isInt()),
        Schema.check(Schema.isBetween({ minimum: 1, maximum: 200 })),
      )),
    },
    success: Schema.Array(Warehouse),
    error: errors,
  }).middleware(BearerAuth),
  HttpApiEndpoint.get("listItems", "/inventory/items", {
    headers: tenantHeaders,
    query: {
      search: Schema.optionalKey(ShortString),
      limit: Schema.optionalKey(Schema.NumberFromString.pipe(
        Schema.check(Schema.isInt()),
        Schema.check(Schema.isBetween({ minimum: 1, maximum: 200 })),
      )),
    },
    success: Schema.Array(Item),
    error: errors,
  }).middleware(BearerAuth),
  HttpApiEndpoint.get("listStockBalances", "/inventory/stock-balances", {
    headers: tenantHeaders,
    query: {
      warehouseId: Schema.optionalKey(Uuid),
      itemId: Schema.optionalKey(Uuid),
      limit: Schema.optionalKey(Schema.NumberFromString.pipe(
        Schema.check(Schema.isInt()),
        Schema.check(Schema.isBetween({ minimum: 1, maximum: 200 })),
      )),
    },
    success: Schema.Array(StockBalance),
    error: errors,
  }).middleware(BearerAuth),
  HttpApiEndpoint.get("listStockReservations", "/inventory/reservations", {
    headers: tenantHeaders,
    query: {
      warehouseId: Schema.optionalKey(Uuid),
      itemId: Schema.optionalKey(Uuid),
      status: Schema.optionalKey(StockReservationStatus),
      limit: Schema.optionalKey(Schema.NumberFromString.pipe(
        Schema.check(Schema.isInt()),
        Schema.check(Schema.isBetween({ minimum: 1, maximum: 200 })),
      )),
    },
    success: Schema.Array(StockReservation),
    error: errors,
  }).middleware(BearerAuth),
  HttpApiEndpoint.get("listStockTransfers", "/inventory/transfers", {
    headers: tenantHeaders,
    query: {
      warehouseId: Schema.optionalKey(Uuid),
      status: Schema.optionalKey(StockTransferStatus),
      limit: Schema.optionalKey(Schema.NumberFromString.pipe(
        Schema.check(Schema.isInt()),
        Schema.check(Schema.isBetween({ minimum: 1, maximum: 200 })),
      )),
    },
    success: Schema.Array(StockTransfer),
    error: errors,
  }).middleware(BearerAuth),
  HttpApiEndpoint.get("listStockMovements", "/inventory/movements", {
    headers: tenantHeaders,
    query: {
      warehouseId: Schema.optionalKey(Uuid),
      itemId: Schema.optionalKey(Uuid),
      kind: Schema.optionalKey(StockMovementKind),
      limit: Schema.optionalKey(Schema.NumberFromString.pipe(
        Schema.check(Schema.isInt()),
        Schema.check(Schema.isBetween({ minimum: 1, maximum: 200 })),
      )),
    },
    success: Schema.Array(StockMovement),
    error: errors,
  }).middleware(BearerAuth),
  HttpApiEndpoint.post("createWarehouse", "/inventory/warehouses", {
    headers: tenantHeaders,
    payload: Schema.Struct({
      legalEntityId: Uuid,
      primaryBranchId: Schema.optionalKey(Uuid),
      name: ShortString,
    }),
    success: CreatedWarehouse,
    error: errors,
  }).middleware(BearerAuth),
  HttpApiEndpoint.post("createItem", "/inventory/items", {
    headers: tenantHeaders,
    payload: Schema.Struct({
      sku: ShortString,
      name: ShortString,
      unitOfMeasure: Schema.optionalKey(ShortString),
    }),
    success: CreatedItem,
    error: errors,
  }).middleware(BearerAuth),
  HttpApiEndpoint.post("adjustStock", "/inventory/adjustments", {
    headers: tenantHeaders,
    payload: Schema.Struct({
      warehouseId: Uuid,
      itemId: Uuid,
      adjustment: NonEmptyString,
      unitOfMeasure: ShortString,
      reason: ShortString,
      commandId: ShortString,
      correlationId: ShortString,
      causationId: Schema.optionalKey(Schema.NullOr(ShortString)),
      idempotencyKey: ShortString,
    }),
    success: StockCorrection,
    error: errors,
  }).middleware(BearerAuth),
  HttpApiEndpoint.post("receiveStock", "/inventory/receipts", {
    headers: tenantHeaders,
    payload: Schema.Struct({
      warehouseId: Uuid,
      itemId: Uuid,
      quantity: NonEmptyString,
      legalEntityId: Schema.optionalKey(Uuid),
      referenceId: Schema.optionalKey(Uuid),
    }),
    success: StockBalance,
    error: errors,
  }).middleware(BearerAuth),
  HttpApiEndpoint.post("reserveStock", "/inventory/reservations", {
    headers: tenantHeaders,
    payload: Schema.Struct({
      warehouseId: Uuid,
      itemId: Uuid,
      quantity: NonEmptyString,
      legalEntityId: Schema.optionalKey(Uuid),
      idempotencyKey: Schema.optionalKey(ShortString),
    }),
    success: CreatedReservation,
    error: errors,
  }).middleware(BearerAuth),
  HttpApiEndpoint.post("releaseReservation", "/inventory/reservations/:id/release", {
    params: { id: Uuid },
    headers: tenantHeaders,
    success: StockReservation,
    error: errors,
  }).middleware(BearerAuth),
  HttpApiEndpoint.post("fulfillReservation", "/inventory/reservations/:id/fulfill", {
    params: { id: Uuid },
    headers: tenantHeaders,
    success: StockReservation,
    error: errors,
  }).middleware(BearerAuth),
  HttpApiEndpoint.post("createTransfer", "/inventory/transfers", {
    headers: tenantHeaders,
    payload: Schema.Struct({
      sourceWarehouseId: Uuid,
      destinationWarehouseId: Uuid,
      lines: BoundedArray(StockTransferLine).check(Schema.isMinLength(1)),
    }),
    success: CreatedTransfer,
    error: errors,
  }).middleware(BearerAuth),
  HttpApiEndpoint.post("confirmTransfer", "/inventory/transfers/:id/confirm", {
    params: { id: Uuid },
    headers: tenantHeaders,
    success: StockTransfer,
    error: errors,
  }).middleware(BearerAuth),
  HttpApiEndpoint.post("completeTransfer", "/inventory/transfers/:id/complete", {
    params: { id: Uuid },
    headers: tenantHeaders,
    success: StockTransfer,
    error: errors,
  }).middleware(BearerAuth),
)

const Procurement = HttpApiGroup.make("Procurement").add(
  HttpApiEndpoint.get("listSupplierAccounts", "/procurement/supplier-accounts", {
    headers: tenantHeaders,
    query: {
      limit: Schema.optionalKey(Schema.NumberFromString.pipe(
        Schema.check(Schema.isInt()),
        Schema.check(Schema.isBetween({ minimum: 1, maximum: 200 })),
      )),
    },
    success: Schema.Array(SupplierAccount),
    error: errors,
  }).middleware(BearerAuth),
  HttpApiEndpoint.post("createSupplierAccount", "/procurement/supplier-accounts", {
    headers: tenantHeaders,
    payload: Schema.Struct({ supplierRelationshipId: Uuid }),
    success: CreatedSupplierAccount,
    error: errors,
  }).middleware(BearerAuth),
  HttpApiEndpoint.get("listPurchaseOrders", "/procurement/purchase-orders", {
    headers: tenantHeaders,
    query: {
      supplierAccountId: Schema.optionalKey(Uuid),
      status: Schema.optionalKey(PurchaseOrderStatus),
      limit: Schema.optionalKey(Schema.NumberFromString.pipe(
        Schema.check(Schema.isInt()),
        Schema.check(Schema.isBetween({ minimum: 1, maximum: 200 })),
      )),
    },
    success: Schema.Array(PurchaseOrder),
    error: errors,
  }).middleware(BearerAuth),
  HttpApiEndpoint.post("createPurchaseOrder", "/procurement/purchase-orders", {
    headers: tenantHeaders,
    payload: Schema.Struct({
      supplierAccountId: Uuid,
      lines: BoundedArray(PurchaseOrderLine).check(Schema.isMinLength(1)),
    }),
    success: CreatedPurchaseOrder,
    error: errors,
  }).middleware(BearerAuth),
  HttpApiEndpoint.get("getPurchaseOrder", "/procurement/purchase-orders/:id", {
    params: { id: Uuid },
    headers: consistencyHeaders,
    success: PurchaseOrder,
    error: errors,
  }).middleware(BearerAuth),
  HttpApiEndpoint.post("confirmPurchaseOrder", "/procurement/purchase-orders/:id/confirm", {
    params: { id: Uuid },
    headers: tenantHeaders,
    payload: Schema.Struct({ idempotencyKey: ShortString }),
    success: PurchaseOrder,
    error: errors,
  }).middleware(BearerAuth),
  HttpApiEndpoint.post("cancelPurchaseOrder", "/procurement/purchase-orders/:id/cancel", {
    params: { id: Uuid },
    headers: tenantHeaders,
    success: PurchaseOrder,
    error: errors,
  }).middleware(BearerAuth),
  HttpApiEndpoint.get("listPurchaseReceipts", "/procurement/purchase-orders/:id/receipts", {
    params: { id: Uuid },
    headers: tenantHeaders,
    query: {
      limit: Schema.optionalKey(Schema.NumberFromString.pipe(
        Schema.check(Schema.isInt()),
        Schema.check(Schema.isBetween({ minimum: 1, maximum: 200 })),
      )),
    },
    success: Schema.Array(GoodsReceipt),
    error: errors,
  }).middleware(BearerAuth),
  HttpApiEndpoint.post("receivePurchaseOrder", "/procurement/purchase-orders/:id/receipts", {
    params: { id: Uuid },
    headers: tenantHeaders,
    payload: Schema.Struct({
      warehouseId: Uuid,
      idempotencyKey: ShortString,
      lines: BoundedArray(PurchaseReceiptLineInput).check(Schema.isMinLength(1)),
    }),
    success: CreatedGoodsReceipt,
    error: errors,
  }).middleware(BearerAuth),
)

const Process = HttpApiGroup.make("Process").add(
  HttpApiEndpoint.post("confirmOrder", "/process/order-confirmations", {
    headers: tenantHeaders,
    payload: OrderConfirmationPayload,
    success: CreatedOrderConfirmation,
    error: errors,
  }).middleware(BearerAuth),
  HttpApiEndpoint.post("cancelOrder", "/process/order-cancellations", {
    headers: tenantHeaders,
    payload: OrderCancellationPayload,
    success: CreatedOrderCancellation,
    error: errors,
  }).middleware(BearerAuth),
  HttpApiEndpoint.post("fulfillOrder", "/process/order-fulfillments", {
    headers: tenantHeaders,
    payload: OrderFulfillmentPayload,
    success: CreatedOrderFulfillment,
    error: errors,
  }).middleware(BearerAuth),
  HttpApiEndpoint.post("recoverOrder", "/process/order-confirmations/recover", {
    headers: tenantHeaders,
    payload: OrderConfirmationPayload,
    success: OrderConfirmationResult,
    error: errors,
  }).middleware(BearerAuth),
  HttpApiEndpoint.post("manualRecovery", "/process/order-confirmations/manual-recovery", {
    headers: tenantHeaders,
    payload: Schema.Struct({ idempotencyKey: ShortString, reason: NonEmptyString }),
    success: WorkflowRun,
    error: errors,
  }).middleware(BearerAuth),
  HttpApiEndpoint.get("listCatalog", "/process/catalog", {
    headers: tenantHeaders,
    query: {
      kind: Schema.optionalKey(ProcessCatalogCapabilityKind),
      limit: ProcessReadLimit,
    },
    success: BoundedArray(ProcessCatalogDescriptor),
    error: errors,
  }).middleware(BearerAuth),
  HttpApiEndpoint.post("validateDefinition", "/process/definitions/validate", {
    headers: tenantHeaders,
    payload: Schema.Struct({
      definitionId: Uuid,
      definitionVersion: PositiveInt,
      catalogVersion: PositiveInt,
      references: BoundedArray(ResolveProcessCatalogInput),
    }),
    success: ProcessStaticValidation,
    error: errors,
  }).middleware(BearerAuth),
  HttpApiEndpoint.get("listRuntimeInstances", "/process/runtime", {
    headers: tenantHeaders,
    query: {
      status: Schema.optionalKey(ProcessRuntimeInstance.fields.status),
      environment: Schema.optionalKey(Schema.Literals(["DEV", "TEST", "PROD"])),
      limit: ProcessReadLimit,
    },
    success: BoundedArray(ProcessRuntimeInstance),
    error: errors,
  }).middleware(BearerAuth),
  HttpApiEndpoint.get("listWorkflowRuns", "/process/workflow-runs", {
    headers: tenantHeaders,
    query: {
      workflowType: Schema.optionalKey(ProcessWorkflowRun.fields.workflowType),
      status: Schema.optionalKey(ProcessWorkflowRun.fields.status),
      limit: ProcessReadLimit,
    },
    success: BoundedArray(ProcessWorkflowRun),
    error: errors,
  }).middleware(BearerAuth),
  HttpApiEndpoint.get("listOperatorInbox", "/process/inbox", {
    headers: tenantHeaders,
    query: { limit: ProcessReadLimit },
    success: ProcessInboxResponse,
    error: errors,
  }).middleware(BearerAuth),
  HttpApiEndpoint.get("listOperatorControls", "/process/operator-controls", {
    headers: tenantHeaders,
    query: { instanceId: Schema.optionalKey(Uuid), limit: ProcessReadLimit },
    success: BoundedArray(ProcessOperatorControl),
    error: errors,
  }).middleware(BearerAuth),
  HttpApiEndpoint.post("operateRuntime", "/process/runtime/:id/operator-controls", {
    params: { id: Uuid },
    headers: tenantHeaders,
    payload: Schema.Struct({
      action: ProcessOperatorAction,
      idempotencyKey: ShortString,
      reason: NonEmptyString,
    }),
    success: ProcessRuntimeInstance,
    error: errors,
  }).middleware(BearerAuth),
)

const Accounting = HttpApiGroup.make("Accounting").add(
  HttpApiEndpoint.get("listConfigurations", "/accounting/configurations", {
    headers: tenantHeaders,
    query: {
      legalEntityId: Schema.optionalKey(Uuid),
      limit: AccountingReadLimit,
    },
    success: BoundedArray(AccountingConfiguration),
    error: errors,
  }).middleware(BearerAuth),
  HttpApiEndpoint.get("listAccounts", "/accounting/accounts", {
    headers: tenantHeaders,
    query: {
      type: Schema.optionalKey(Account.fields.type),
      limit: AccountingReadLimit,
    },
    success: BoundedArray(Account),
    error: errors,
  }).middleware(BearerAuth),
  HttpApiEndpoint.get("listPeriods", "/accounting/periods", {
    headers: tenantHeaders,
    query: {
      legalEntityId: Schema.optionalKey(Uuid),
      status: Schema.optionalKey(AccountingPeriod.fields.status),
      limit: AccountingReadLimit,
    },
    success: BoundedArray(AccountingPeriod),
    error: errors,
  }).middleware(BearerAuth),
  HttpApiEndpoint.get("listRevenuePostingProfiles", "/accounting/revenue-posting-profiles", {
    headers: tenantHeaders,
    query: {
      legalEntityId: Schema.optionalKey(Uuid),
      limit: AccountingReadLimit,
    },
    success: BoundedArray(RevenuePostingProfile),
    error: errors,
  }).middleware(BearerAuth),
  HttpApiEndpoint.get("listJournals", "/accounting/journals", {
    headers: tenantHeaders,
    query: {
      status: Schema.optionalKey(Schema.Literals(["posted", "reversed"])),
      limit: AccountingReadLimit,
    },
    success: BoundedArray(JournalEntry),
    error: errors,
  }).middleware(BearerAuth),
  HttpApiEndpoint.post(
    "prepareTigerBeetleCutover",
    "/accounting/legal-entities/:id/tigerbeetle/prepare",
    {
      params: { id: Uuid },
      headers: tenantHeaders,
      success: FinancialCutoverControl,
      error: errors,
    },
  ).middleware(BearerAuth),
  HttpApiEndpoint.post(
    "recordFinancialVerificationArtifact",
    "/accounting/financial-verification-artifacts",
    {
      headers: tenantHeaders,
      payload: FinancialVerificationEvidence,
      success: CreatedFinancialVerificationArtifact,
      error: errors,
    },
  ).middleware(BearerAuth),
  HttpApiEndpoint.post(
    "recordFinancialStagingEvidence",
    "/accounting/financial-staging-evidence",
    {
      headers: tenantHeaders,
      payload: FinancialStagingEvidenceAppendPayload,
      success: FinancialStagingEvidenceRecord.pipe(HttpApiSchema.status(201)),
      error: errors,
    },
  ).middleware(BearerAuth),
  HttpApiEndpoint.get(
    "listFinancialStagingEvidence",
    "/accounting/financial-staging-evidence",
    {
      headers: tenantHeaders,
      query: FinancialStagingEvidenceLookupQuery,
      success: FinancialStagingEvidenceList,
      error: errors,
    },
  ).middleware(BearerAuth),
  HttpApiEndpoint.post(
    "approveTigerBeetleCutover",
    "/accounting/legal-entities/:id/tigerbeetle/approve",
    {
      params: { id: Uuid },
      headers: tenantHeaders,
      payload: Schema.Struct({ evidenceArtifactId: Uuid }),
      success: FinancialCutoverControl,
      error: errors,
    },
  ).middleware(BearerAuth),
  HttpApiEndpoint.post(
    "activateTigerBeetleCutover",
    "/accounting/legal-entities/:id/tigerbeetle/activate",
    {
      params: { id: Uuid },
      headers: tenantHeaders,
      success: FinancialCutoverControl,
      error: errors,
    },
  ).middleware(BearerAuth),
  HttpApiEndpoint.post("configureLegalEntity", "/accounting/legal-entities/:id/configuration", {
    params: { id: Uuid },
    headers: tenantHeaders,
    payload: Schema.Struct({
      baseCurrency: CurrencyCode,
      precision: Schema.Literal(2),
      fiscalYearStartMonth: FiscalYearStartMonth,
      postingEnabled: Schema.Boolean,
      financialEngine: Schema.optionalKey(Schema.Literals(["postgresql", "tigerbeetle"])),
    }),
    success: CreatedAccountingConfiguration,
    error: errors,
  }).middleware(BearerAuth),
  HttpApiEndpoint.post("createAccount", "/accounting/accounts", {
    headers: tenantHeaders,
    payload: Schema.Struct({
      code: ShortString,
      name: ShortString,
      type: Account.fields.type,
    }),
    success: CreatedAccount,
    error: errors,
  }).middleware(BearerAuth),
  HttpApiEndpoint.post("postJournal", "/accounting/journals", {
    headers: tenantHeaders,
    payload: Schema.Struct({
      reference: ShortString,
      lines: BoundedArray(JournalLine),
    }),
    success: CreatedJournal,
    error: errors,
  }).middleware(BearerAuth),
  HttpApiEndpoint.post("configureRevenuePosting", "/accounting/revenue-posting-profiles", {
    headers: tenantHeaders,
    payload: Schema.Struct({
      legalEntityId: Uuid,
      receivableAccountId: Uuid,
      revenueAccountId: Uuid,
    }),
    success: CreatedRevenuePostingProfile,
    error: errors,
  }).middleware(BearerAuth),
  HttpApiEndpoint.post("openPeriod", "/accounting/periods", {
    headers: tenantHeaders,
    payload: Schema.Struct({
      legalEntityId: Uuid,
      startsOn: Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/)),
      endsOn: Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/)),
    }),
    success: CreatedAccountingPeriod,
    error: errors,
  }).middleware(BearerAuth),
  HttpApiEndpoint.post("closePeriod", "/accounting/periods/:id/close", {
    params: { id: Uuid },
    headers: tenantHeaders,
    payload: Schema.Struct({ legalEntityId: Uuid }),
    success: AccountingPeriod,
    error: errors,
  }).middleware(BearerAuth),
  HttpApiEndpoint.post("rebuildFinancialProjections", "/accounting/financial-projections/rebuild", {
    headers: tenantHeaders,
    payload: Schema.Struct({ legalEntityId: Uuid }),
    success: FinancialProjectionRebuildResult,
    error: errors,
  }).middleware(BearerAuth),
  HttpApiEndpoint.post(
    "reconcileFinancialCheckpoint",
    "/accounting/financial-reconciliation/checkpoints",
    {
      headers: tenantHeaders,
      payload: Schema.Struct({
        legalEntityId: Uuid,
        evidenceArtifactId: Schema.NullOr(Uuid),
      }),
      success: FinancialReconciliationCheckpoint,
      error: errors,
    },
  ).middleware(BearerAuth),
  HttpApiEndpoint.post("createFinancialJournalIntent", "/accounting/financial-operations", {
    headers: tenantHeaders,
    payload: Schema.Struct({
      legalEntityId: Uuid,
      operationId: ShortString,
      reference: ShortString,
      currency: CurrencyCode,
      mappingVersion: PositiveInt,
      lines: BoundedArray(JournalLine),
      correlationId: ShortString,
    }),
    success: CreatedFinancialOperation,
    error: errors,
  }).middleware(BearerAuth),
  HttpApiEndpoint.post("createFinancialRevenueIntent", "/accounting/financial-operations/revenue", {
    headers: tenantHeaders,
    payload: Schema.Struct({
      legalEntityId: Uuid,
      orderId: Uuid,
      commandId: ShortString,
      correlationId: ShortString,
      currency: CurrencyCode,
      mappingVersion: PositiveInt,
      amount: Schema.optionalKey(FinancialMajorAmount),
    }),
    success: CreatedFinancialOperation,
    error: errors,
  }).middleware(BearerAuth),
  HttpApiEndpoint.post(
    "createFinancialReversalIntent",
    "/accounting/financial-operations/reversals",
    {
      headers: tenantHeaders,
      payload: Schema.Struct({
        legalEntityId: Uuid,
        sourceJournalId: Uuid,
        operationId: ShortString,
        reference: ShortString,
        currency: CurrencyCode,
        mappingVersion: PositiveInt,
        correlationId: ShortString,
      }),
      success: CreatedFinancialOperation,
      error: errors,
    },
  ).middleware(BearerAuth),
)

export const RitseiApi = HttpApi.make("RITSEI")
  .add(
    Authentication,
    Health,
    UserAccounts,
    Parties,
    Authorization,
    Sales,
    Inventory,
    Procurement,
    Accounting,
    Process,
  )
  .annotate(OpenApi.Title, "RITSEI API")
  .annotate(OpenApi.Version, "0.1.0")
  .annotate(OpenApi.Description, "Typed modular-monolith ERP API")

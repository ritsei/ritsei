import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Redacted from "effect/Redacted"
import * as HttpApiBuilder from "effect/unstable/httpapi/HttpApiBuilder"
import * as HttpApiSchema from "effect/unstable/httpapi/HttpApiSchema"

import {
  AuthService,
  ExternalProviderUnavailable,
  InvalidSessionToken,
} from "../../modules/auth/mod.ts"
import {
  AuthorizationCapabilities,
  AuthorizationService,
  CapabilityDefinitions,
} from "../../modules/authorization/mod.ts"
import {
  IdentityCapabilities,
  UserAccountNotFound,
  UserAccountService,
} from "../../modules/identity/mod.ts"
import {
  CurrentConsistencyToken,
  DatabaseFailure,
  PostgresReadYourWrites,
  ReplicaConsistencyFailure,
} from "../../foundation/mod.ts"
import { PartyService } from "../../modules/party/mod.ts"
import { SalesService } from "../../modules/sales/mod.ts"
import { InventoryService } from "../../modules/inventory/mod.ts"
import { AccountingService, FinancialOperationService } from "../../modules/accounting/mod.ts"
import { ProcessService, ProcessStudioService } from "../../modules/process/mod.ts"
import { ProcurementService } from "../../modules/procurement/mod.ts"
import {
  ApiConflict,
  ApiForbidden,
  ApiNotFound,
  ApiServiceUnavailable,
  ApiUnauthorized,
  BearerAuth,
  CurrentPrincipal,
  CurrentRuntimeConfiguration,
  RitseiApi,
} from "./api.ts"

type ApiErrorKind =
  | "forbidden"
  | "not_found"
  | "conflict"
  | "invalid_request"
  | "service_unavailable"

// Closed-world transport policy for routes compiled into RitseiApi. Plugin, connector,
// and Process Studio failures are normalized by their own versioned contribution boundary.
const coreApiErrorPolicy = {
  AccountAlreadyExists: "conflict",
  AccountNotFound: "not_found",
  AccountingConfigurationAlreadyExists: "conflict",
  AccountingLegalEntityNotFound: "not_found",
  AccountingPeriodNotFound: "not_found",
  AccountingPeriodNotOpen: "conflict",
  AccountingPeriodOverlap: "conflict",
  AuthorizationDenied: "forbidden",
  BranchAlreadyExists: "conflict",
  CapabilityAlreadyGranted: "conflict",
  CustomerAlreadyExists: "conflict",
  CustomerNotFound: "not_found",
  DatabaseFailure: "service_unavailable",
  EventIdempotencyConflict: "conflict",
  ExternalIdentifierAlreadyAssigned: "conflict",
  FinancialCurrencyMismatch: "conflict",
  IdentityAuthorizationDenied: "forbidden",
  FinancialEngineActivated: "conflict",
  FinancialEngineCutoverBlocked: "conflict",
  FinancialLedgerNotActivated: "conflict",
  FinancialLedgerNotConfigured: "service_unavailable",
  FinancialOperationConflict: "conflict",
  FinancialOperationInjectedFailure: "conflict",
  FinancialOperationNotFound: "not_found",
  FinancialOperationReconciliationConflict: "conflict",
  FinancialOperationsPending: "conflict",
  FinancialProjectionRebuildBlocked: "conflict",
  FinancialReconciliationCheckpointConflict: "conflict",
  FinancialReconciliationCheckpointEvidenceInvalid: "conflict",
  FinancialStoreObservationFailure: "service_unavailable",
  FinancialRevenueAmountMismatch: "conflict",
  FinancialReversalAlreadyExists: "conflict",
  FinancialReversalSourceNotFound: "not_found",
  FinancialReversalSourceNotPosted: "conflict",
  FinancialReversalSourceNotReady: "conflict",
  FinancialReversalSourceRequired: "conflict",
  FinancialSalesNotConfigured: "service_unavailable",
  FinancialStagingEvidenceConflict: "conflict",
  FinancialStagingEvidenceInvalid: "conflict",
  FinancialVerificationArtifactInvalid: "conflict",
  FinancialVerificationArtifactNotFound: "not_found",
  FinancialVerificationKeyGenerationFailure: "conflict",
  FinancialVerificationKeyNotFound: "not_found",
  FinancialVerificationSigningFailure: "conflict",
  FinancialVerificationVerificationFailure: "conflict",
  InvalidJournalLine: "conflict",
  InvalidRevenuePostingProfile: "conflict",
  InventoryReferenceNotFound: "not_found",
  InventoryUnitOfMeasureMismatch: "conflict",
  InventoryWarehouseLegalEntityMismatch: "conflict",
  ItemAlreadyExists: "conflict",
  JournalIdempotencyConflict: "conflict",
  JournalReferenceAlreadyExists: "conflict",
  LegalEntityAlreadyExists: "conflict",
  LegalEntityNotFound: "not_found",
  OrderConfirmationCorrupt: "conflict",
  OrderConfirmationNotFound: "not_found",
  ProcessCheckpointInvalid: "service_unavailable",
  ProcessCheckpointRevisionConflict: "conflict",
  ProcessOperatorActionUnavailable: "conflict",
  ProcessOperatorConflict: "conflict",
  ProcessRuntimeInstanceNotFound: "not_found",
  ProcessReleaseValidationFailed: "conflict",
  ProcessStudioRecordCorrupt: "service_unavailable",
  OrganizationRequired: "conflict",
  PartyNotFound: "not_found",
  PartyRelationshipAlreadyExists: "conflict",
  PartyRelationshipRoleNotAssigned: "conflict",
  PartyRepresentationAlreadyExists: "conflict",
  PartyRepresentationNotFound: "not_found",
  PartyRepresentationUserAccountNotFound: "not_found",
  PartyRoleAlreadyAssigned: "conflict",
  QuotationCustomerMismatch: "conflict",
  QuotationNotFound: "not_found",
  ReplicaConsistencyFailure: "service_unavailable",
  PurchaseOrderConfirmationIdempotencyConflict: "conflict",
  PurchaseOrderHasReceipts: "conflict",
  PurchaseOrderInvalidState: "conflict",
  PurchaseOrderNotFound: "not_found",
  PurchaseReceiptIdempotencyConflict: "conflict",
  PurchaseReceiptInventoryReferenceNotFound: "not_found",
  PurchaseReceiptLineDuplicate: "conflict",
  PurchaseReceiptLineNotFound: "not_found",
  PurchaseReceiptQuantityExceeded: "conflict",
  PurchaseReceiptWarehouseLegalEntityMismatch: "conflict",
  SupplierAccountAlreadyExists: "conflict",
  SupplierAccountNotFound: "not_found",
  SupplierRelationshipNotEligible: "conflict",
  RevenueJournalNotFound: "not_found",
  RevenuePostingProfileAlreadyExists: "conflict",
  RevenuePostingProfileNotFound: "not_found",
  SalesOrderConfirmationIdempotencyConflict: "conflict",
  SalesOrderInvalidState: "conflict",
  SalesOrderNotFound: "not_found",
  SchemaError: "invalid_request",
  StockCorrectionIdempotencyConflict: "conflict",
  StockReservationIdempotencyConflict: "conflict",
  StockReservationInvalidState: "conflict",
  StockReservationLegalEntityMismatch: "conflict",
  StockReservationNotFound: "not_found",
  StockTransferDifferentLegalEntity: "conflict",
  StockTransferDuplicateItem: "conflict",
  StockTransferInvalidState: "conflict",
  StockTransferItemNotFound: "not_found",
  StockTransferNotFound: "not_found",
  StockTransferSameWarehouse: "conflict",
  StockTransferWarehouseNotFound: "not_found",
  StockUnavailable: "conflict",
  TenantMembershipAlreadyExists: "conflict",
  TenantMembershipNotActive: "conflict",
  TenantMembershipNotFound: "not_found",
  TenantMembershipUserAccountNotFound: "not_found",
  TigerBeetleConfigurationFailure: "conflict",
  UnbalancedJournal: "conflict",
  UserAccountAlreadyExists: "conflict",
  UserAccountNotFound: "not_found",
  WarehouseAlreadyExists: "conflict",
  WarehouseBranchNotFound: "not_found",
  WarehouseLegalEntityNotFound: "not_found",
  WorkflowAlreadyCompleted: "conflict",
  WorkflowAlreadyInProgress: "conflict",
  WorkflowIdempotencyConflict: "conflict",
  WorkflowManualRecoveryRequired: "conflict",
  WorkflowOutcomeUnknown: "service_unavailable",
  WorkflowResultCorrupt: "conflict",
  WorkflowRunNotFound: "not_found",
} as const satisfies Record<string, ApiErrorKind>

export type CoreApiFailure =
  | ReplicaConsistencyFailure
  | { readonly _tag: Exclude<keyof typeof coreApiErrorPolicy, "ReplicaConsistencyFailure"> }

export const toCoreApiError = (error: CoreApiFailure) => {
  if (error instanceof ReplicaConsistencyFailure) {
    switch (error.reason) {
      case "invalid_token":
      case "expired_token":
      case "tenant_mismatch":
      case "placement_mismatch":
        return new ApiConflict({ code: "invalid_consistency_token" })
      default:
        return new ApiServiceUnavailable({ code: "service_unavailable" })
    }
  }
  const tag = error._tag
  switch (coreApiErrorPolicy[tag]) {
    case "forbidden":
      return new ApiForbidden({ code: "forbidden" })
    case "not_found":
      return new ApiNotFound({ code: tag })
    case "invalid_request":
      return new ApiConflict({ code: "invalid_request" })
    case "service_unavailable":
      return new ApiServiceUnavailable({ code: "service_unavailable" })
    case "conflict":
      return new ApiConflict({ code: tag })
  }
}

const coreApiEffect = <A, E extends CoreApiFailure, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(Effect.mapError(toCoreApiError))

const AuthenticationHandlers = HttpApiBuilder.group(
  RitseiApi,
  "Authentication",
  (handlers) =>
    Effect.gen(function* () {
      const auth = yield* AuthService
      const userAccounts = yield* UserAccountService
      const authorization = yield* AuthorizationService
      const configuration = yield* CurrentRuntimeConfiguration
      return handlers
        .handle("config", () => {
          const authentication = configuration.authentication
          if (authentication?.profile === "oidc") {
            return Effect.succeed({
              profile: "oidc" as const,
              issuerUrl: authentication.issuerUrl,
              clientId: authentication.clientId,
              authorizationEndpoint: authentication.authorizationEndpoint,
              tokenEndpoint: authentication.tokenEndpoint,
              redirectUri: authentication.redirectUri,
              scopes: authentication.scopes,
            })
          }
          if (authentication?.profile === "transitional-local") {
            return Effect.succeed({ profile: "transitional-local" as const, scopes: [] as const })
          }
          return Effect.fail(new ApiServiceUnavailable({ code: "service_unavailable" }))
        })
        .handle("devLogin", () => {
          const authentication = configuration.authentication
          if (authentication?.profile !== "transitional-local") {
            return Effect.fail(new ApiForbidden({ code: "forbidden" }))
          }
          const account = authentication.userAccountId === undefined &&
              authentication.userAccountEmail !== undefined
            ? Effect.map(
              userAccounts.list(),
              (accounts) =>
                accounts.find((candidate) => candidate.email === authentication.userAccountEmail),
            )
            : Effect.succeed(undefined)
          return Effect.gen(function* () {
            const resolved = yield* account
            const userAccountId = authentication.userAccountId ?? resolved?.id
            if (userAccountId === undefined) {
              return yield* Effect.fail(new ApiForbidden({ code: "forbidden" }))
            }
            return yield* auth.issueSession({ userAccountId, ttlSeconds: 3_600 })
          }).pipe(
            Effect.map(({ token, session }) => ({ token, expiresAt: session.expiresAt })),
            Effect.mapError((error) =>
              error instanceof ApiForbidden
                ? error
                : new ApiServiceUnavailable({ code: "service_unavailable" })
            ),
          )
        })
        .handle("session", (request) =>
          Effect.gen(function* () {
            const principal = yield* CurrentPrincipal
            const userAccount = yield* userAccounts.getById(principal.userAccountId)
            const memberships = yield* authorization.listAccessibleTenants({
              userAccountId: principal.userAccountId,
            })
            const requestedTenantId = request.headers["x-tenant-id"]
            const activeTenant = requestedTenantId === undefined
              ? memberships[0] ?? null
              : memberships.find((membership) => membership.tenantId === requestedTenantId) ?? null
            if (requestedTenantId !== undefined && activeTenant === null) {
              return yield* Effect.fail(new ApiForbidden({ code: "forbidden" }))
            }
            const grants = activeTenant === null ? [] : yield* authorization.listDirectGrants({
              userAccountId: principal.userAccountId,
              tenantId: activeTenant.tenantId,
            })
            return {
              user: userAccount,
              memberships,
              activeTenant,
              capabilities: grants.map((grant) => grant.capability),
            }
          }).pipe(
            Effect.mapError((error) =>
              error instanceof UserAccountNotFound
                ? new ApiUnauthorized({ code: "unauthorized" })
                : error instanceof ApiForbidden
                ? error
                : error instanceof DatabaseFailure
                ? new ApiServiceUnavailable({ code: "service_unavailable" })
                : new ApiConflict({ code: "invalid_request" })
            ),
          ))
        .handle("logout", () =>
          Effect.gen(function* () {
            const principal = yield* CurrentPrincipal
            yield* auth.revoke(principal.sessionId).pipe(
              Effect.catch((error) =>
                error instanceof InvalidSessionToken
                  ? Effect.succeed(undefined)
                  : Effect.fail(error)
              ),
            )
          }).pipe(
            Effect.mapError((error) =>
              error instanceof DatabaseFailure
                ? new ApiServiceUnavailable({ code: "service_unavailable" })
                : new ApiUnauthorized({ code: "unauthorized" })
            ),
          ))
    }),
)

export const BearerAuthLive = Layer.effect(
  BearerAuth,
  Effect.gen(function* () {
    const auth = yield* AuthService
    return {
      bearer: (effect, options) =>
        Effect.provideServiceEffect(
          effect,
          CurrentPrincipal,
          auth.authenticate(Redacted.value(options.credential)).pipe(
            Effect.mapError((error) =>
              error instanceof DatabaseFailure || error instanceof ExternalProviderUnavailable
                ? new ApiServiceUnavailable({ code: "service_unavailable" })
                : new ApiUnauthorized({ code: "unauthorized" })
            ),
          ),
        ),
    }
  }),
)

export const HealthHandlers = HttpApiBuilder.group(
  RitseiApi,
  "Health",
  (handlers) => handlers.handle("health", () => Effect.succeed({ status: "ok" as const })),
)

export const UserAccountHandlers = HttpApiBuilder.group(
  RitseiApi,
  "UserAccounts",
  (handlers) =>
    Effect.gen(function* () {
      const authorization = yield* AuthorizationService
      const userAccounts = yield* UserAccountService
      return handlers
        .handle(
          "create",
          Effect.fn("Http.UserAccounts.create")(function* ({ headers, payload }) {
            const principal = yield* CurrentPrincipal
            return yield* coreApiEffect(Effect.gen(function* () {
              const userAccount = yield* userAccounts.createForTenant({
                principal,
                tenantId: headers["x-tenant-id"],
                ...payload,
              })
              yield* authorization.addMember({
                userAccountId: userAccount.id,
                tenantId: headers["x-tenant-id"],
              })
              return userAccount
            }))
          }),
        )
        .handle(
          "list",
          Effect.fn("Http.UserAccounts.list")(function* ({ headers }) {
            const principal = yield* CurrentPrincipal
            return yield* coreApiEffect(Effect.gen(function* () {
              yield* authorization.authorize({
                principal,
                tenantId: headers["x-tenant-id"],
                capability: IdentityCapabilities.userAccountRead,
              })
              const members = yield* authorization.listMembers({
                tenantId: headers["x-tenant-id"],
                limit: 200,
              })
              return yield* userAccounts.getByIds(members.map((member) => member.userAccountId))
            }))
          }),
        )
        .handle(
          "get",
          Effect.fn("Http.UserAccounts.get")(function* ({ headers, params }) {
            const principal = yield* CurrentPrincipal
            return yield* coreApiEffect(Effect.gen(function* () {
              yield* authorization.authorize({
                principal,
                tenantId: headers["x-tenant-id"],
                capability: IdentityCapabilities.userAccountRead,
              })
              yield* authorization.getMember({
                userAccountId: params.id,
                tenantId: headers["x-tenant-id"],
              })
              return yield* userAccounts.getById(params.id)
            }))
          }),
        )
        .handle(
          "update",
          Effect.fn("Http.UserAccounts.update")(function* ({ headers, params, payload }) {
            const principal = yield* CurrentPrincipal
            return yield* coreApiEffect(Effect.gen(function* () {
              yield* authorization.authorize({
                principal,
                tenantId: headers["x-tenant-id"],
                capability: IdentityCapabilities.userAccountUpdate,
              })
              yield* authorization.getMember({
                userAccountId: params.id,
                tenantId: headers["x-tenant-id"],
              })
              return yield* userAccounts.update({ id: params.id, email: payload.email })
            }))
          }),
        )
    }),
)

export const PartyHandlers = HttpApiBuilder.group(
  RitseiApi,
  "Parties",
  (handlers) =>
    Effect.gen(function* () {
      const party = yield* PartyService
      return handlers
        .handle(
          "list",
          Effect.fn("Http.Parties.list")(function* ({ headers, query }) {
            const principal = yield* CurrentPrincipal
            return yield* coreApiEffect(party.list({
              principal,
              tenantId: headers["x-tenant-id"],
              ...query,
            }))
          }),
        )
        .handle(
          "get",
          Effect.fn("Http.Parties.get")(function* ({ headers, params }) {
            const principal = yield* CurrentPrincipal
            return yield* coreApiEffect(party.getDetail({
              principal,
              tenantId: headers["x-tenant-id"],
              partyId: params.id,
            }))
          }),
        )
        .handle(
          "create",
          Effect.fn("Http.Parties.create")(function* ({ headers, payload }) {
            const principal = yield* CurrentPrincipal
            return yield* coreApiEffect(
              party.create({ principal, tenantId: headers["x-tenant-id"], ...payload }),
            )
          }),
        )
        .handle(
          "createLegalEntity",
          Effect.fn("Http.Parties.createLegalEntity")(function* ({ headers, params }) {
            const principal = yield* CurrentPrincipal
            return yield* coreApiEffect(party.createLegalEntity({
              principal,
              tenantId: headers["x-tenant-id"],
              organizationId: params.id,
            }))
          }),
        )
        .handle(
          "createBranch",
          Effect.fn("Http.Parties.createBranch")(function* ({ headers, params, payload }) {
            const principal = yield* CurrentPrincipal
            return yield* coreApiEffect(party.createBranch({
              principal,
              tenantId: headers["x-tenant-id"],
              legalEntityId: params.id,
              ...payload,
            }))
          }),
        )
        .handle(
          "assignRole",
          Effect.fn("Http.Parties.assignRole")(function* ({ headers, params, payload }) {
            const principal = yield* CurrentPrincipal
            return yield* coreApiEffect(party.assignRole({
              principal,
              tenantId: headers["x-tenant-id"],
              partyId: params.id,
              role: payload.role,
            }))
          }),
        )
        .handle(
          "attachIdentifier",
          Effect.fn("Http.Parties.attachIdentifier")(function* ({ headers, params, payload }) {
            const principal = yield* CurrentPrincipal
            return yield* coreApiEffect(party.attachIdentifier({
              principal,
              tenantId: headers["x-tenant-id"],
              partyId: params.id,
              ...payload,
            }))
          }),
        )
        .handle(
          "createRelationship",
          Effect.fn("Http.Parties.createRelationship")(function* ({ headers, params, payload }) {
            const principal = yield* CurrentPrincipal
            return yield* coreApiEffect(party.createRelationship({
              principal,
              tenantId: headers["x-tenant-id"],
              partyId: params.id,
              ...payload,
            }))
          }),
        )
        .handle(
          "createRepresentation",
          Effect.fn("Http.Parties.createRepresentation")(function* ({
            headers,
            params,
            payload,
          }) {
            const principal = yield* CurrentPrincipal
            return yield* coreApiEffect(party.createPartyRepresentation({
              principal,
              tenantId: headers["x-tenant-id"],
              partyId: params.id,
              ...payload,
            }))
          }),
        )
        .handle(
          "setRepresentationActive",
          Effect.fn("Http.Parties.setRepresentationActive")(function* ({
            headers,
            params,
            payload,
          }) {
            const principal = yield* CurrentPrincipal
            return yield* coreApiEffect(party.setPartyRepresentationActive({
              principal,
              tenantId: headers["x-tenant-id"],
              representationId: params.id,
              active: payload.active,
            }))
          }),
        )
        .handle(
          "findRelatedPartyPaths",
          Effect.fn("Http.Parties.findRelatedPartyPaths")(function* ({ headers, params, query }) {
            const principal = yield* CurrentPrincipal
            return yield* coreApiEffect(party.findRelatedPartyPaths({
              principal,
              tenantId: headers["x-tenant-id"],
              sourcePartyId: params.id,
              ...query,
            }))
          }),
        )
    }),
)

export const AuthorizationHandlers = HttpApiBuilder.group(
  RitseiApi,
  "Authorization",
  (handlers) =>
    Effect.gen(function* () {
      const authorization = yield* AuthorizationService
      const authorize = (
        principal: typeof CurrentPrincipal.Service,
        tenantId: string,
        capability: string,
      ) => authorization.authorize({ principal, tenantId, capability })
      return handlers
        .handle(
          "addMember",
          Effect.fn("Http.Authorization.addMember")(function* ({ headers, payload }) {
            const principal = yield* CurrentPrincipal
            return yield* coreApiEffect(Effect.gen(function* () {
              yield* authorize(
                principal,
                headers["x-tenant-id"],
                AuthorizationCapabilities.tenantMembershipAdd,
              )
              return yield* authorization.addMember({
                userAccountId: payload.userAccountId,
                tenantId: headers["x-tenant-id"],
              })
            }))
          }),
        )
        .handle(
          "listMembers",
          Effect.fn("Http.Authorization.listMembers")(function* ({ headers, query }) {
            const principal = yield* CurrentPrincipal
            return yield* coreApiEffect(Effect.gen(function* () {
              yield* authorize(
                principal,
                headers["x-tenant-id"],
                AuthorizationCapabilities.tenantMembershipRead,
              )
              return yield* authorization.listMembers({
                tenantId: headers["x-tenant-id"],
                ...query,
              })
            }))
          }),
        )
        .handle(
          "getMember",
          Effect.fn("Http.Authorization.getMember")(function* ({ headers, params }) {
            const principal = yield* CurrentPrincipal
            return yield* coreApiEffect(Effect.gen(function* () {
              yield* authorize(
                principal,
                headers["x-tenant-id"],
                AuthorizationCapabilities.tenantMembershipRead,
              )
              return yield* authorization.getMember({
                userAccountId: params.userAccountId,
                tenantId: headers["x-tenant-id"],
              })
            }))
          }),
        )
        .handle(
          "listDirectGrants",
          Effect.fn("Http.Authorization.listDirectGrants")(function* ({ headers, params }) {
            const principal = yield* CurrentPrincipal
            return yield* coreApiEffect(Effect.gen(function* () {
              yield* authorize(
                principal,
                headers["x-tenant-id"],
                AuthorizationCapabilities.tenantMembershipRead,
              )
              yield* authorize(
                principal,
                headers["x-tenant-id"],
                AuthorizationCapabilities.capabilityGrant,
              )
              return yield* authorization.listDirectGrants({
                userAccountId: params.userAccountId,
                tenantId: headers["x-tenant-id"],
              })
            }))
          }),
        )
        .handle(
          "listCapabilityDefinitions",
          Effect.fn("Http.Authorization.listCapabilityDefinitions")(function* ({ headers }) {
            const principal = yield* CurrentPrincipal
            return yield* coreApiEffect(Effect.gen(function* () {
              yield* authorize(
                principal,
                headers["x-tenant-id"],
                AuthorizationCapabilities.capabilityGrant,
              )
              return CapabilityDefinitions
            }))
          }),
        )
        .handle(
          "suspendMember",
          Effect.fn("Http.Authorization.suspendMember")(function* ({ headers, params }) {
            const principal = yield* CurrentPrincipal
            return yield* coreApiEffect(Effect.gen(function* () {
              yield* authorize(
                principal,
                headers["x-tenant-id"],
                AuthorizationCapabilities.tenantMembershipSuspend,
              )
              return yield* authorization.suspendMember({
                userAccountId: params.userAccountId,
                tenantId: headers["x-tenant-id"],
              })
            }))
          }),
        )
        .handle(
          "activateMember",
          Effect.fn("Http.Authorization.activateMember")(function* ({ headers, params }) {
            const principal = yield* CurrentPrincipal
            return yield* coreApiEffect(Effect.gen(function* () {
              yield* authorize(
                principal,
                headers["x-tenant-id"],
                AuthorizationCapabilities.tenantMembershipActivate,
              )
              return yield* authorization.activateMember({
                userAccountId: params.userAccountId,
                tenantId: headers["x-tenant-id"],
              })
            }))
          }),
        )
        .handle(
          "removeMember",
          Effect.fn("Http.Authorization.removeMember")(function* ({ headers, params }) {
            const principal = yield* CurrentPrincipal
            return yield* coreApiEffect(Effect.gen(function* () {
              yield* authorize(
                principal,
                headers["x-tenant-id"],
                AuthorizationCapabilities.tenantMembershipRemove,
              )
              return yield* authorization.removeMember({
                userAccountId: params.userAccountId,
                tenantId: headers["x-tenant-id"],
              })
            }))
          }),
        )
        .handle(
          "grant",
          Effect.fn("Http.Authorization.grant")(function* ({ headers, payload }) {
            const principal = yield* CurrentPrincipal
            return yield* coreApiEffect(Effect.gen(function* () {
              yield* authorize(
                principal,
                headers["x-tenant-id"],
                AuthorizationCapabilities.capabilityGrant,
              )
              return yield* authorization.grant({
                userAccountId: payload.userAccountId,
                tenantId: headers["x-tenant-id"],
                capability: payload.capability,
              })
            }))
          }),
        )
    }),
)

export const SalesHandlers = HttpApiBuilder.group(
  RitseiApi,
  "Sales",
  (handlers) =>
    Effect.gen(function* () {
      const sales = yield* SalesService
      return handlers
        .handle(
          "listCustomers",
          Effect.fn("Http.Sales.listCustomers")(function* ({ headers, query }) {
            const principal = yield* CurrentPrincipal
            return yield* coreApiEffect(
              sales.listCustomers({ principal, tenantId: headers["x-tenant-id"], ...query }),
            )
          }),
        )
        .handle(
          "getCustomer",
          Effect.fn("Http.Sales.getCustomer")(function* ({ headers, params }) {
            const principal = yield* CurrentPrincipal
            return yield* coreApiEffect(
              sales.getCustomer({
                principal,
                tenantId: headers["x-tenant-id"],
                customerId: params.id,
              }),
            )
          }),
        )
        .handle(
          "createCustomer",
          Effect.fn("Http.Sales.createCustomer")(function* ({ headers, payload }) {
            const principal = yield* CurrentPrincipal
            return yield* coreApiEffect(
              sales.createCustomer({ principal, tenantId: headers["x-tenant-id"], ...payload }),
            )
          }),
        )
        .handle(
          "listQuotations",
          Effect.fn("Http.Sales.listQuotations")(function* ({ headers, query }) {
            const principal = yield* CurrentPrincipal
            return yield* coreApiEffect(
              sales.listQuotations({ principal, tenantId: headers["x-tenant-id"], ...query }),
            )
          }),
        )
        .handle(
          "getQuotation",
          Effect.fn("Http.Sales.getQuotation")(function* ({ headers, params }) {
            const principal = yield* CurrentPrincipal
            return yield* coreApiEffect(
              sales.getQuotation({
                principal,
                tenantId: headers["x-tenant-id"],
                quotationId: params.id,
              }),
            )
          }),
        )
        .handle(
          "createQuotation",
          Effect.fn("Http.Sales.createQuotation")(function* ({ headers, payload }) {
            const principal = yield* CurrentPrincipal
            return yield* coreApiEffect(
              sales.createQuotation({ principal, tenantId: headers["x-tenant-id"], ...payload }),
            )
          }),
        )
        .handle(
          "listOrders",
          Effect.fn("Http.Sales.listOrders")(function* ({ headers, query }) {
            const principal = yield* CurrentPrincipal
            return yield* coreApiEffect(
              sales.listOrders({ principal, tenantId: headers["x-tenant-id"], ...query }),
            )
          }),
        )
        .handle(
          "getOrder",
          Effect.fn("Http.Sales.getOrder")(function* ({ headers, params }) {
            const principal = yield* CurrentPrincipal
            return yield* coreApiEffect(
              sales.getOrder({
                principal,
                tenantId: headers["x-tenant-id"],
                orderId: params.id,
              }),
            )
          }),
        )
        .handle(
          "createOrder",
          Effect.fn("Http.Sales.createOrder")(function* ({ headers, payload }) {
            const principal = yield* CurrentPrincipal
            return yield* coreApiEffect(
              sales.createOrder({ principal, tenantId: headers["x-tenant-id"], ...payload }),
            )
          }),
        )
        .handle(
          "confirmOrder",
          Effect.fn("Http.Sales.confirmOrder")(function* ({ headers, params, payload }) {
            const principal = yield* CurrentPrincipal
            return yield* coreApiEffect(
              sales.confirmOrder({
                principal,
                tenantId: headers["x-tenant-id"],
                orderId: params.id,
                ...payload,
              }),
            )
          }),
        )
        .handle(
          "cancelOrder",
          Effect.fn("Http.Sales.cancelOrder")(function* ({ headers, params }) {
            const principal = yield* CurrentPrincipal
            return yield* coreApiEffect(
              sales.cancelConfirmedOrder({
                principal,
                tenantId: headers["x-tenant-id"],
                orderId: params.id,
              }),
            )
          }),
        )
    }),
)

export const InventoryHandlers = HttpApiBuilder.group(
  RitseiApi,
  "Inventory",
  (handlers) =>
    Effect.gen(function* () {
      const inventory = yield* InventoryService
      return handlers
        .handle(
          "listWarehouses",
          Effect.fn("Http.Inventory.listWarehouses")(function* ({ headers, query }) {
            const principal = yield* CurrentPrincipal
            return yield* coreApiEffect(
              inventory.listWarehouses({ principal, tenantId: headers["x-tenant-id"], ...query }),
            )
          }),
        )
        .handle(
          "listItems",
          Effect.fn("Http.Inventory.listItems")(function* ({ headers, query }) {
            const principal = yield* CurrentPrincipal
            return yield* coreApiEffect(
              inventory.listItems({ principal, tenantId: headers["x-tenant-id"], ...query }),
            )
          }),
        )
        .handle(
          "listStockBalances",
          Effect.fn("Http.Inventory.listStockBalances")(function* ({ headers, query }) {
            const principal = yield* CurrentPrincipal
            return yield* coreApiEffect(
              inventory.listStockBalances({
                principal,
                tenantId: headers["x-tenant-id"],
                ...query,
              }),
            )
          }),
        )
        .handle(
          "listStockReservations",
          Effect.fn("Http.Inventory.listStockReservations")(function* ({ headers, query }) {
            const principal = yield* CurrentPrincipal
            return yield* coreApiEffect(
              inventory.listStockReservations({
                principal,
                tenantId: headers["x-tenant-id"],
                ...query,
              }),
            )
          }),
        )
        .handle(
          "listStockTransfers",
          Effect.fn("Http.Inventory.listStockTransfers")(function* ({ headers, query }) {
            const principal = yield* CurrentPrincipal
            return yield* coreApiEffect(
              inventory.listStockTransfers({
                principal,
                tenantId: headers["x-tenant-id"],
                ...query,
              }),
            )
          }),
        )
        .handle(
          "listStockMovements",
          Effect.fn("Http.Inventory.listStockMovements")(function* ({ headers, query }) {
            const principal = yield* CurrentPrincipal
            return yield* coreApiEffect(
              inventory.listStockMovements({
                principal,
                tenantId: headers["x-tenant-id"],
                ...query,
              }),
            )
          }),
        )
        .handle(
          "createWarehouse",
          Effect.fn("Http.Inventory.createWarehouse")(function* ({ headers, payload }) {
            const principal = yield* CurrentPrincipal
            return yield* coreApiEffect(
              inventory.createWarehouse({
                principal,
                tenantId: headers["x-tenant-id"],
                ...payload,
              }),
            )
          }),
        )
        .handle(
          "createItem",
          Effect.fn("Http.Inventory.createItem")(function* ({ headers, payload }) {
            const principal = yield* CurrentPrincipal
            return yield* coreApiEffect(
              inventory.createItem({ principal, tenantId: headers["x-tenant-id"], ...payload }),
            )
          }),
        )
        .handle(
          "adjustStock",
          Effect.fn("Http.Inventory.adjustStock")(function* ({ headers, payload }) {
            const principal = yield* CurrentPrincipal
            return yield* coreApiEffect(
              inventory.adjustStock({ principal, tenantId: headers["x-tenant-id"], ...payload }),
            )
          }),
        )
        .handle(
          "receiveStock",
          Effect.fn("Http.Inventory.receiveStock")(function* ({ headers, payload }) {
            const principal = yield* CurrentPrincipal
            return yield* coreApiEffect(
              inventory.receiveStock({ principal, tenantId: headers["x-tenant-id"], ...payload }),
            )
          }),
        )
        .handle(
          "reserveStock",
          Effect.fn("Http.Inventory.reserveStock")(function* ({ headers, payload }) {
            const principal = yield* CurrentPrincipal
            return yield* coreApiEffect(
              inventory.reserveStock({ principal, tenantId: headers["x-tenant-id"], ...payload }),
            )
          }),
        )
        .handle(
          "releaseReservation",
          Effect.fn("Http.Inventory.releaseReservation")(function* ({ headers, params }) {
            const principal = yield* CurrentPrincipal
            return yield* coreApiEffect(
              inventory.releaseReservation({
                principal,
                tenantId: headers["x-tenant-id"],
                reservationId: params.id,
              }),
            )
          }),
        )
        .handle(
          "fulfillReservation",
          Effect.fn("Http.Inventory.fulfillReservation")(function* ({ headers, params }) {
            const principal = yield* CurrentPrincipal
            return yield* coreApiEffect(
              inventory.fulfillReservation({
                principal,
                tenantId: headers["x-tenant-id"],
                reservationId: params.id,
              }),
            )
          }),
        )
        .handle(
          "createTransfer",
          Effect.fn("Http.Inventory.createTransfer")(function* ({ headers, payload }) {
            const principal = yield* CurrentPrincipal
            return yield* coreApiEffect(
              inventory.createTransfer({ principal, tenantId: headers["x-tenant-id"], ...payload }),
            )
          }),
        )
        .handle(
          "confirmTransfer",
          Effect.fn("Http.Inventory.confirmTransfer")(function* ({ headers, params }) {
            const principal = yield* CurrentPrincipal
            return yield* coreApiEffect(
              inventory.confirmTransfer({
                principal,
                tenantId: headers["x-tenant-id"],
                transferId: params.id,
              }),
            )
          }),
        )
        .handle(
          "completeTransfer",
          Effect.fn("Http.Inventory.completeTransfer")(function* ({ headers, params }) {
            const principal = yield* CurrentPrincipal
            return yield* coreApiEffect(
              inventory.completeTransfer({
                principal,
                tenantId: headers["x-tenant-id"],
                transferId: params.id,
              }),
            )
          }),
        )
    }),
)

export const ProcurementHandlers = HttpApiBuilder.group(
  RitseiApi,
  "Procurement",
  (handlers) =>
    Effect.gen(function* () {
      const procurement = yield* ProcurementService
      const readYourWrites = yield* Effect.serviceOption(PostgresReadYourWrites)
      return handlers
        .handle(
          "listSupplierAccounts",
          Effect.fn("Http.Procurement.listSupplierAccounts")(function* ({ headers, query }) {
            const principal = yield* CurrentPrincipal
            return yield* coreApiEffect(procurement.listSupplierAccounts({
              principal,
              tenantId: headers["x-tenant-id"],
              ...query,
            }))
          }),
        )
        .handle(
          "createSupplierAccount",
          Effect.fn("Http.Procurement.createSupplierAccount")(function* ({ headers, payload }) {
            const principal = yield* CurrentPrincipal
            return yield* coreApiEffect(procurement.createSupplierAccount({
              principal,
              tenantId: headers["x-tenant-id"],
              ...payload,
            }))
          }),
        )
        .handle(
          "listPurchaseOrders",
          Effect.fn("Http.Procurement.listPurchaseOrders")(function* ({ headers, query }) {
            const principal = yield* CurrentPrincipal
            return yield* coreApiEffect(procurement.listPurchaseOrders({
              principal,
              tenantId: headers["x-tenant-id"],
              ...query,
            }))
          }),
        )
        .handle(
          "createPurchaseOrder",
          Effect.fn("Http.Procurement.createPurchaseOrder")(function* ({ headers, payload }) {
            const principal = yield* CurrentPrincipal
            const order = yield* coreApiEffect(procurement.createPurchaseOrder({
              principal,
              tenantId: headers["x-tenant-id"],
              ...payload,
            }))
            // ponytail: best-effort post-commit token capture; create has no idempotency key, so a
            // capture outage must not turn a committed success into a retryable failure.
            const token = readYourWrites._tag === "Some"
              ? yield* readYourWrites.value.capture(headers["x-tenant-id"]).pipe(
                Effect.catch(() => Effect.succeed(undefined)),
              )
              : undefined
            return HttpApiSchema.withHeaders({
              body: order,
              headers: { "x-ritsei-consistency-token": token },
            })
          }),
        )
        .handle(
          "getPurchaseOrder",
          Effect.fn("Http.Procurement.getPurchaseOrder")(function* ({ headers, params }) {
            const principal = yield* CurrentPrincipal
            return yield* coreApiEffect(procurement.getPurchaseOrder({
              principal,
              tenantId: headers["x-tenant-id"],
              purchaseOrderId: params.id,
            })).pipe(
              Effect.provideService(
                CurrentConsistencyToken,
                headers["x-ritsei-consistency-token"],
              ),
            )
          }),
        )
        .handle(
          "confirmPurchaseOrder",
          Effect.fn("Http.Procurement.confirmPurchaseOrder")(
            function* ({ headers, params, payload }) {
              const principal = yield* CurrentPrincipal
              return yield* coreApiEffect(procurement.confirmPurchaseOrder({
                principal,
                tenantId: headers["x-tenant-id"],
                purchaseOrderId: params.id,
                ...payload,
              }))
            },
          ),
        )
        .handle(
          "cancelPurchaseOrder",
          Effect.fn("Http.Procurement.cancelPurchaseOrder")(function* ({ headers, params }) {
            const principal = yield* CurrentPrincipal
            return yield* coreApiEffect(procurement.cancelPurchaseOrder({
              principal,
              tenantId: headers["x-tenant-id"],
              purchaseOrderId: params.id,
            }))
          }),
        )
        .handle(
          "listPurchaseReceipts",
          Effect.fn("Http.Procurement.listPurchaseReceipts")(
            function* ({ headers, params, query }) {
              const principal = yield* CurrentPrincipal
              return yield* coreApiEffect(procurement.listPurchaseReceipts({
                principal,
                tenantId: headers["x-tenant-id"],
                purchaseOrderId: params.id,
                ...query,
              }))
            },
          ),
        )
        .handle(
          "receivePurchaseOrder",
          Effect.fn("Http.Procurement.receivePurchaseOrder")(
            function* ({ headers, params, payload }) {
              const principal = yield* CurrentPrincipal
              return yield* coreApiEffect(procurement.receivePurchaseOrder({
                principal,
                tenantId: headers["x-tenant-id"],
                purchaseOrderId: params.id,
                ...payload,
              }))
            },
          ),
        )
    }),
)

export const ProcessHandlers = HttpApiBuilder.group(
  RitseiApi,
  "Process",
  (handlers) =>
    Effect.gen(function* () {
      const process = yield* ProcessService
      const studio = yield* ProcessStudioService
      return handlers
        .handle(
          "confirmOrder",
          Effect.fn("Http.Process.confirmOrder")(function* ({ headers, payload }) {
            const principal = yield* CurrentPrincipal
            return yield* coreApiEffect(
              process.confirmOrder({ principal, tenantId: headers["x-tenant-id"], ...payload }),
            )
          }),
        )
        .handle(
          "cancelOrder",
          Effect.fn("Http.Process.cancelOrder")(function* ({ headers, payload }) {
            const principal = yield* CurrentPrincipal
            return yield* coreApiEffect(
              process.cancelOrder({ principal, tenantId: headers["x-tenant-id"], ...payload }),
            )
          }),
        )
        .handle(
          "fulfillOrder",
          Effect.fn("Http.Process.fulfillOrder")(function* ({ headers, payload }) {
            const principal = yield* CurrentPrincipal
            return yield* coreApiEffect(
              process.fulfillOrder({ principal, tenantId: headers["x-tenant-id"], ...payload }),
            )
          }),
        )
        .handle(
          "recoverOrder",
          Effect.fn("Http.Process.recoverOrder")(function* ({ headers, payload }) {
            const principal = yield* CurrentPrincipal
            return yield* coreApiEffect(
              process.recoverOrder({ principal, tenantId: headers["x-tenant-id"], ...payload }),
            )
          }),
        )
        .handle(
          "manualRecovery",
          Effect.fn("Http.Process.manualRecovery")(function* ({ headers, payload }) {
            const principal = yield* CurrentPrincipal
            return yield* coreApiEffect(
              process.markManualRecovery({
                principal,
                tenantId: headers["x-tenant-id"],
                ...payload,
              }),
            )
          }),
        )
        .handle(
          "listCatalog",
          Effect.fn("Http.Process.listCatalog")(function* ({ headers, query }) {
            const principal = yield* CurrentPrincipal
            return yield* coreApiEffect(
              studio.listCatalog({ principal, tenantId: headers["x-tenant-id"], ...query }),
            )
          }),
        )
        .handle(
          "validateDefinition",
          Effect.fn("Http.Process.validateDefinition")(function* ({ headers, payload }) {
            const principal = yield* CurrentPrincipal
            return yield* coreApiEffect(
              studio.validateDefinition({
                principal,
                tenantId: headers["x-tenant-id"],
                ...payload,
              }),
            )
          }),
        )
        .handle(
          "listRuntimeInstances",
          Effect.fn("Http.Process.listRuntimeInstances")(function* ({ headers, query }) {
            const principal = yield* CurrentPrincipal
            return yield* coreApiEffect(
              studio.listRuntimeInstances({
                principal,
                tenantId: headers["x-tenant-id"],
                ...query,
              }),
            )
          }),
        )
        .handle(
          "listWorkflowRuns",
          Effect.fn("Http.Process.listWorkflowRuns")(function* ({ headers, query }) {
            const principal = yield* CurrentPrincipal
            return yield* coreApiEffect(
              studio.listWorkflowRuns({ principal, tenantId: headers["x-tenant-id"], ...query }),
            )
          }),
        )
        .handle(
          "listOperatorInbox",
          Effect.fn("Http.Process.listOperatorInbox")(function* ({ headers, query }) {
            const principal = yield* CurrentPrincipal
            return yield* coreApiEffect(
              studio.listOperatorInbox({ principal, tenantId: headers["x-tenant-id"], ...query }),
            )
          }),
        )
        .handle(
          "listOperatorControls",
          Effect.fn("Http.Process.listOperatorControls")(function* ({ headers, query }) {
            const principal = yield* CurrentPrincipal
            return yield* coreApiEffect(
              studio.listOperatorControls({
                principal,
                tenantId: headers["x-tenant-id"],
                ...query,
              }),
            )
          }),
        )
        .handle(
          "operateRuntime",
          Effect.fn("Http.Process.operateRuntime")(function* ({ headers, params, payload }) {
            const principal = yield* CurrentPrincipal
            return yield* coreApiEffect(
              studio.operateRuntime({
                principal,
                tenantId: headers["x-tenant-id"],
                instanceId: params.id,
                ...payload,
              }),
            )
          }),
        )
    }),
)

export const AccountingHandlers = HttpApiBuilder.group(
  RitseiApi,
  "Accounting",
  (handlers) =>
    Effect.gen(function* () {
      const accounting = yield* AccountingService
      const financialOperations = yield* FinancialOperationService
      return handlers
        .handle(
          "listConfigurations",
          Effect.fn("Http.Accounting.listConfigurations")(function* ({ headers, query }) {
            const principal = yield* CurrentPrincipal
            return yield* coreApiEffect(
              accounting.listAccountingConfigurations({
                principal,
                tenantId: headers["x-tenant-id"],
                ...query,
              }),
            )
          }),
        )
        .handle(
          "listAccounts",
          Effect.fn("Http.Accounting.listAccounts")(function* ({ headers, query }) {
            const principal = yield* CurrentPrincipal
            return yield* coreApiEffect(
              accounting.listAccounts({
                principal,
                tenantId: headers["x-tenant-id"],
                ...query,
              }),
            )
          }),
        )
        .handle(
          "listPeriods",
          Effect.fn("Http.Accounting.listPeriods")(function* ({ headers, query }) {
            const principal = yield* CurrentPrincipal
            return yield* coreApiEffect(
              accounting.listAccountingPeriods({
                principal,
                tenantId: headers["x-tenant-id"],
                ...query,
              }),
            )
          }),
        )
        .handle(
          "listRevenuePostingProfiles",
          Effect.fn("Http.Accounting.listRevenuePostingProfiles")(function* ({ headers, query }) {
            const principal = yield* CurrentPrincipal
            return yield* coreApiEffect(
              accounting.listRevenuePostingProfiles({
                principal,
                tenantId: headers["x-tenant-id"],
                ...query,
              }),
            )
          }),
        )
        .handle(
          "listJournals",
          Effect.fn("Http.Accounting.listJournals")(function* ({ headers, query }) {
            const principal = yield* CurrentPrincipal
            return yield* coreApiEffect(
              accounting.listJournalEntries({
                principal,
                tenantId: headers["x-tenant-id"],
                ...query,
              }),
            )
          }),
        )
        .handle(
          "prepareTigerBeetleCutover",
          Effect.fn("Http.Accounting.prepareTigerBeetleCutover")(function* ({ headers, params }) {
            const principal = yield* CurrentPrincipal
            return yield* coreApiEffect(
              accounting.prepareTigerBeetleCutover({
                principal,
                tenantId: headers["x-tenant-id"],
                legalEntityId: params.id,
              }),
            )
          }),
        )
        .handle(
          "recordFinancialVerificationArtifact",
          Effect.fn("Http.Accounting.recordFinancialVerificationArtifact")(
            function* ({ headers, payload }) {
              const principal = yield* CurrentPrincipal
              return yield* coreApiEffect(
                accounting.recordFinancialVerificationArtifact({
                  principal,
                  tenantId: headers["x-tenant-id"],
                  evidence: payload,
                }),
              )
            },
          ),
        )
        .handle(
          "recordFinancialStagingEvidence",
          Effect.fn("Http.Accounting.recordFinancialStagingEvidence")(
            function* ({ headers, payload }) {
              const principal = yield* CurrentPrincipal
              return yield* coreApiEffect(
                accounting.recordFinancialStagingEvidence({
                  principal,
                  tenantId: headers["x-tenant-id"],
                  ...payload,
                }),
              )
            },
          ),
        )
        .handle(
          "listFinancialStagingEvidence",
          Effect.fn("Http.Accounting.listFinancialStagingEvidence")(function* ({ headers, query }) {
            const principal = yield* CurrentPrincipal
            return yield* coreApiEffect(
              accounting.listFinancialStagingEvidence({
                principal,
                tenantId: headers["x-tenant-id"],
                ...query,
              }),
            )
          }),
        )
        .handle(
          "approveTigerBeetleCutover",
          Effect.fn("Http.Accounting.approveTigerBeetleCutover")(
            function* ({ headers, params, payload }) {
              const principal = yield* CurrentPrincipal
              return yield* coreApiEffect(
                accounting.approveTigerBeetleCutover({
                  principal,
                  tenantId: headers["x-tenant-id"],
                  legalEntityId: params.id,
                  ...payload,
                }),
              )
            },
          ),
        )
        .handle(
          "activateTigerBeetleCutover",
          Effect.fn("Http.Accounting.activateTigerBeetleCutover")(function* ({ headers, params }) {
            const principal = yield* CurrentPrincipal
            return yield* coreApiEffect(
              accounting.activateTigerBeetleCutover({
                principal,
                tenantId: headers["x-tenant-id"],
                legalEntityId: params.id,
              }),
            )
          }),
        )
        .handle(
          "configureLegalEntity",
          Effect.fn("Http.Accounting.configureLegalEntity")(
            function* ({ headers, params, payload }) {
              const principal = yield* CurrentPrincipal
              return yield* coreApiEffect(
                accounting.configureLegalEntity({
                  principal,
                  tenantId: headers["x-tenant-id"],
                  legalEntityId: params.id,
                  ...payload,
                }),
              )
            },
          ),
        )
        .handle(
          "createAccount",
          Effect.fn("Http.Accounting.createAccount")(function* ({ headers, payload }) {
            const principal = yield* CurrentPrincipal
            return yield* coreApiEffect(
              accounting.createAccount({ principal, tenantId: headers["x-tenant-id"], ...payload }),
            )
          }),
        )
        .handle(
          "postJournal",
          Effect.fn("Http.Accounting.postJournal")(function* ({ headers, payload }) {
            const principal = yield* CurrentPrincipal
            return yield* coreApiEffect(
              accounting.postJournal({ principal, tenantId: headers["x-tenant-id"], ...payload }),
            )
          }),
        )
        .handle(
          "configureRevenuePosting",
          Effect.fn("Http.Accounting.configureRevenuePosting")(function* ({ headers, payload }) {
            const principal = yield* CurrentPrincipal
            return yield* coreApiEffect(
              accounting.configureRevenuePosting({
                principal,
                tenantId: headers["x-tenant-id"],
                ...payload,
              }),
            )
          }),
        )
        .handle(
          "openPeriod",
          Effect.fn("Http.Accounting.openPeriod")(function* ({ headers, payload }) {
            const principal = yield* CurrentPrincipal
            return yield* coreApiEffect(
              accounting.openPeriod({
                principal,
                tenantId: headers["x-tenant-id"],
                ...payload,
              }),
            )
          }),
        )
        .handle(
          "closePeriod",
          Effect.fn("Http.Accounting.closePeriod")(function* ({ headers, params, payload }) {
            const principal = yield* CurrentPrincipal
            return yield* coreApiEffect(
              accounting.closePeriod({
                principal,
                tenantId: headers["x-tenant-id"],
                periodId: params.id,
                ...payload,
              }),
            )
          }),
        )
        .handle(
          "rebuildFinancialProjections",
          Effect.fn("Http.Accounting.rebuildFinancialProjections")(
            function* ({ headers, payload }) {
              const principal = yield* CurrentPrincipal
              return yield* coreApiEffect(
                financialOperations.rebuildFinancialProjections({
                  principal,
                  tenantId: headers["x-tenant-id"],
                  ...payload,
                }),
              )
            },
          ),
        )
        .handle(
          "reconcileFinancialCheckpoint",
          Effect.fn("Http.Accounting.reconcileFinancialCheckpoint")(
            function* ({ headers, payload }) {
              const principal = yield* CurrentPrincipal
              return yield* coreApiEffect(
                financialOperations.reconcileFinancialCheckpoint({
                  principal,
                  tenantId: headers["x-tenant-id"],
                  ...payload,
                }),
              )
            },
          ),
        )
        .handle(
          "createFinancialJournalIntent",
          Effect.fn("Http.Accounting.createFinancialJournalIntent")(
            function* ({ headers, payload }) {
              const principal = yield* CurrentPrincipal
              return yield* coreApiEffect(
                financialOperations.createJournalIntent({
                  principal,
                  tenantId: headers["x-tenant-id"],
                  ...payload,
                }),
              )
            },
          ),
        )
        .handle(
          "createFinancialRevenueIntent",
          Effect.fn("Http.Accounting.createFinancialRevenueIntent")(
            function* ({ headers, payload }) {
              const principal = yield* CurrentPrincipal
              return yield* coreApiEffect(
                financialOperations.createRevenueIntent({
                  principal,
                  tenantId: headers["x-tenant-id"],
                  ...payload,
                }),
              )
            },
          ),
        )
        .handle(
          "createFinancialReversalIntent",
          Effect.fn("Http.Accounting.createFinancialReversalIntent")(
            function* ({ headers, payload }) {
              const principal = yield* CurrentPrincipal
              return yield* coreApiEffect(
                financialOperations.createReversalIntent({
                  principal,
                  tenantId: headers["x-tenant-id"],
                  ...payload,
                }),
              )
            },
          ),
        )
    }),
)
export const ApiHandlers = Layer.mergeAll(
  AuthenticationHandlers,
  HealthHandlers,
  UserAccountHandlers,
  PartyHandlers,
  AuthorizationHandlers,
  SalesHandlers,
  InventoryHandlers,
  ProcurementHandlers,
  AccountingHandlers,
  ProcessHandlers,
)

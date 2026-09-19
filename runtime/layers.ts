import * as Layer from "effect/Layer"
import type { Sql } from "postgres"

import {
  AccountingService,
  FinancialOperationServiceLive,
  makeAccountingService,
} from "../modules/accounting/mod.ts"
import { AuthService, makeAuthService } from "../modules/auth/mod.ts"
import { AuthorizationService, makeAuthorizationService } from "../modules/authorization/mod.ts"
import {
  IdentityEventPublisherLive,
  makeUserAccountService,
  UserAccountService,
} from "../modules/identity/mod.ts"
import { DurableJobEnqueuer } from "../foundation/mod.ts"
import { PostgresDatabaseLive, PostgresReadYourWritesLive, WebCryptoLive } from "../platform/mod.ts"
import { makeMessagingService, MessagingService } from "../modules/messaging/mod.ts"
import { makePartyService, PartyEventPublisherLive, PartyService } from "../modules/party/mod.ts"
import { makeSalesService, SalesService } from "../modules/sales/mod.ts"
import { InventoryService, makeInventoryService } from "../modules/inventory/mod.ts"
import { ProcurementLive } from "../modules/procurement/mod.ts"
import {
  makeProcessJobEnqueuer,
  makeProcessService,
  ProcessService,
  ProcessStudioLive,
} from "../modules/process/mod.ts"
import type { FinancialVerificationSignerService } from "../modules/accounting/mod.ts"
import { IdentityAccountAuthorizerLive } from "./adapters/identity-account-authorizer.ts"
import { makeIdentityProviderLayer } from "./authentication/oidc.ts"
import {
  makeFinancialLedgerLayer,
  makeFinancialStoreObservationLayer,
} from "./adapters/financial-ledger.ts"
import type { RitseiRuntimeConfiguration } from "./config.ts"

export const serviceLayers = (
  client: Sql,
  configuration: RitseiRuntimeConfiguration,
  financialSigner?: Layer.Layer<FinancialVerificationSignerService>,
  replicaClient?: Sql,
) => {
  const DatabaseLive = PostgresDatabaseLive(client)
  const readYourWrites = configuration.postgresReadYourWrites !== undefined &&
      replicaClient !== undefined
    ? PostgresReadYourWritesLive(client, replicaClient, configuration.postgresReadYourWrites)
    : Layer.empty
  const PlatformCore = Layer.merge(DatabaseLive, readYourWrites)
  const PlatformLive = Layer.mergeAll(PlatformCore, WebCryptoLive)
  const financialLedger = makeFinancialLedgerLayer(DatabaseLive, configuration)
  const financialObservation = makeFinancialStoreObservationLayer(DatabaseLive, configuration)

  const AuthorizationLive = Layer.effect(AuthorizationService, makeAuthorizationService).pipe(
    Layer.provide(DatabaseLive),
  )

  const BusinessRequirements = Layer.mergeAll(PlatformCore, AuthorizationLive)

  const MessagingLive = Layer.effect(MessagingService, makeMessagingService).pipe(
    Layer.provide(DatabaseLive),
  )

  const IdentityLive = Layer.effect(UserAccountService, makeUserAccountService).pipe(
    Layer.provide(Layer.mergeAll(
      DatabaseLive,
      IdentityAccountAuthorizerLive.pipe(Layer.provide(AuthorizationLive)),
      IdentityEventPublisherLive.pipe(Layer.provide(MessagingLive)),
    )),
  )

  const AuthLive = Layer.effect(AuthService, makeAuthService).pipe(
    Layer.provide(
      Layer.mergeAll(PlatformLive, IdentityLive, makeIdentityProviderLayer(configuration)),
    ),
  )

  const PartyLive = Layer.effect(PartyService, makePartyService).pipe(
    Layer.provide(Layer.merge(
      BusinessRequirements,
      PartyEventPublisherLive.pipe(Layer.provide(MessagingLive)),
    )),
  )

  const SalesLive = Layer.effect(SalesService, makeSalesService).pipe(
    Layer.provide(Layer.merge(BusinessRequirements, MessagingLive)),
  )

  const InventoryLive = Layer.effect(InventoryService, makeInventoryService).pipe(
    Layer.provide(Layer.merge(BusinessRequirements, MessagingLive)),
  )

  const AccountingRequirements = financialSigner === undefined
    ? Layer.mergeAll(
      BusinessRequirements,
      MessagingLive,
      SalesLive,
      financialLedger,
      financialObservation,
    )
    : Layer.mergeAll(
      BusinessRequirements,
      MessagingLive,
      SalesLive,
      financialLedger,
      financialObservation,
      financialSigner,
    )
  const AccountingLive = Layer.effect(AccountingService, makeAccountingService).pipe(
    Layer.provide(AccountingRequirements),
  )

  const ProcessJobEnqueuerLive = Layer.effect(
    DurableJobEnqueuer,
    makeProcessJobEnqueuer,
  ).pipe(Layer.provide(DatabaseLive))

  const FinancialOperationsLive = FinancialOperationServiceLive.pipe(
    Layer.provide(Layer.mergeAll(
      BusinessRequirements,
      MessagingLive,
      SalesLive,
      ProcessJobEnqueuerLive,
      financialLedger,
      financialObservation,
    )),
  )

  const ProcessLive = Layer.effect(ProcessService, makeProcessService).pipe(
    Layer.provide(
      Layer.mergeAll(BusinessRequirements, SalesLive, InventoryLive, AccountingLive, MessagingLive),
    ),
  )

  const ProcessStudio = ProcessStudioLive.pipe(
    Layer.provide(Layer.merge(DatabaseLive, AuthorizationLive)),
  )

  const ProcurementLiveWithRequirements = ProcurementLive.pipe(
    Layer.provide(
      Layer.mergeAll(BusinessRequirements, PartyLive, InventoryLive, MessagingLive),
    ),
  )

  const ApplicationLive = Layer.mergeAll(
    IdentityLive,
    AuthLive,
    AuthorizationLive,
    PartyLive,
    SalesLive,
    InventoryLive,
    AccountingLive,
    FinancialOperationsLive,
    ProcessJobEnqueuerLive,
    MessagingLive,
    ProcessLive,
    ProcessStudio,
    ProcurementLiveWithRequirements,
  )

  return ApplicationLive
}

export const makeApplicationLive = serviceLayers

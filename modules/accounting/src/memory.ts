import * as Clock from "effect/Clock"
import * as Encoding from "effect/Encoding"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"

import { AuthorizationService } from "../../authorization/mod.ts"
import { AccountingCapabilities } from "./capabilities.ts"
import {
  FinancialVerificationKeyring,
  FinancialVerificationSigner,
} from "./verification-contract.ts"
import { uuidv7 } from "../../../foundation/mod.ts"
import { MessagingService } from "../../messaging/mod.ts"
import { SalesService } from "../../sales/mod.ts"
import { AccountingRevenuePostedEvent } from "./events.ts"
import { hashFinancialVerificationEvidence } from "./financial-readiness.ts"
import { makeMemoryFinancialStagingEvidenceStore } from "./financial-staging-evidence.ts"
import { withAccountingOperationNames } from "./service-wrappers.ts"
import {
  normalizeLines,
  revenueReference,
  reversalReference,
  utcDate,
  validateLines,
} from "./domain-helpers.ts"
import {
  Account,
  AccountingConfiguration,
  AccountingPeriod,
  AccountingService,
  ActivateTigerBeetleCutoverInput,
  ApproveTigerBeetleCutoverInput,
  ClosePeriodInput,
  ConfigureLegalEntityInput,
  ConfigureRevenuePostingInput,
  CreateAccountInput,
  FinancialCutoverControl,
  FinancialVerificationArtifact,
  JournalEntry,
  ListAccountingConfigurationsInput,
  ListAccountingPeriodsInput,
  ListAccountsInput,
  ListFinancialStagingEvidenceInput,
  ListJournalEntriesInput,
  ListRevenuePostingProfilesInput,
  OpenPeriodInput,
  PostJournalInput,
  PostRevenueForOrderInput,
  PrepareTigerBeetleCutoverInput,
  RecordFinancialStagingEvidenceInput,
  RecordFinancialVerificationArtifactInput,
  RevenuePostingProfile,
  ReverseRevenueForOrderInput,
} from "./contract.ts"
import {
  AccountAlreadyExists,
  AccountingConfigurationAlreadyExists,
  AccountingLegalEntityNotFound,
  AccountingPeriodNotFound,
  AccountingPeriodNotOpen,
  AccountingPeriodOverlap,
  AccountNotFound,
  FinancialEngineActivated,
  FinancialEngineCutoverBlocked,
  FinancialStagingEvidenceInvalid,
  FinancialVerificationArtifactInvalid,
  FinancialVerificationArtifactNotFound,
  InvalidRevenuePostingProfile,
  JournalIdempotencyConflict,
  RevenueJournalNotFound,
  RevenuePostingProfileAlreadyExists,
  RevenuePostingProfileNotFound,
} from "./errors.ts"

const decodeFinancialVerificationSignature = (
  signature: string,
  tenantId: string,
  legalEntityId: string,
) =>
  Effect.fromResult(Encoding.decodeBase64Url(signature)).pipe(
    Effect.mapError(() =>
      new FinancialVerificationArtifactInvalid({ tenantId, legalEntityId, reason: "unsigned" })
    ),
  )
export const makeAccountingTestLayer = () =>
  Layer.effect(
    AccountingService,
    Effect.gen(function* () {
      const authorization = yield* AuthorizationService
      const messaging = yield* MessagingService
      const sales = yield* SalesService
      const clock = yield* Clock.Clock
      const signerOption = yield* Effect.serviceOption(FinancialVerificationSigner)
      const keyringOption = yield* Effect.serviceOption(FinancialVerificationKeyring)
      const configurations = new Map<string, AccountingConfiguration>()
      const profiles = new Map<string, RevenuePostingProfile>()
      const periods = new Map<string, AccountingPeriod>()
      const storedAccounts = new Map<string, Account>()
      const storedJournals = new Map<string, JournalEntry>()
      const controls = new Map<string, FinancialCutoverControl>()
      const verificationArtifacts = new Map<string, FinancialVerificationArtifact>()
      const stagingEvidenceStore = makeMemoryFinancialStagingEvidenceStore()
      const nextId = uuidv7
      // Fallow: memory and PostgreSQL adapters intentionally mirror the guarded service shape.
      // fallow-ignore-next-line code-duplication
      const testControl = (tenantId: string, legalEntityId: string) => {
        const key = `${tenantId}:${legalEntityId}`
        const existing = controls.get(key)
        if (existing !== undefined) return existing
        const created: FinancialCutoverControl = {
          tenantId,
          legalEntityId,
          status: "postgresql",
          sourceEngine: "postgresql",
          targetEngine: "tigerbeetle",
          cutoverWatermark: null,
          verificationHash: null,
          openingBalanceVerified: false,
          historicalBoundaryVerified: false,
          reconciliationHealthy: false,
          backupRecoveryVerified: false,
          evidenceArtifactId: null,
          unresolvedAcceptedOperations: 0,
          approvedBy: null,
          approvedAt: null,
          activatedBy: null,
          activatedAt: null,
          lastError: null,
        }
        controls.set(key, created)
        return created
      }
      const service: AccountingService = {
        listAccountingConfigurations: (input) =>
          Effect.gen(function* () {
            const decoded = yield* Schema.decodeUnknownEffect(ListAccountingConfigurationsInput)(
              input,
            )
            yield* authorization.authorize({
              principal: decoded.principal,
              tenantId: decoded.tenantId,
              capability: AccountingCapabilities.legalEntityRead,
            })
            return [...configurations.values()]
              .filter((configuration) =>
                configuration.tenantId === decoded.tenantId &&
                (decoded.legalEntityId === undefined ||
                  configuration.legalEntityId === decoded.legalEntityId)
              )
              .toSorted((left, right) => left.legalEntityId.localeCompare(right.legalEntityId))
              .slice(0, decoded.limit ?? 200)
          }),
        // Fallow: memory and PostgreSQL adapters intentionally mirror public account-read authorization.
        // fallow-ignore-next-line code-duplication
        listAccounts: (input) =>
          Effect.gen(function* () {
            const decoded = yield* Schema.decodeUnknownEffect(ListAccountsInput)(input)
            yield* authorization.authorize({
              principal: decoded.principal,
              tenantId: decoded.tenantId,
              capability: AccountingCapabilities.accountRead,
            })
            return [...storedAccounts.values()]
              .filter((account) =>
                account.tenantId === decoded.tenantId &&
                (decoded.type === undefined || account.type === decoded.type)
              )
              .toSorted((left, right) => left.code.localeCompare(right.code))
              .slice(0, decoded.limit ?? 200)
          }),
        // Fallow: memory and PostgreSQL adapters intentionally mirror public period-read authorization.
        // fallow-ignore-next-line code-duplication
        listAccountingPeriods: (input) =>
          Effect.gen(function* () {
            const decoded = yield* Schema.decodeUnknownEffect(ListAccountingPeriodsInput)(input)
            yield* authorization.authorize({
              principal: decoded.principal,
              tenantId: decoded.tenantId,
              capability: AccountingCapabilities.periodRead,
            })
            return [...periods.values()]
              .filter((period) =>
                period.tenantId === decoded.tenantId &&
                (decoded.legalEntityId === undefined ||
                  period.legalEntityId === decoded.legalEntityId) &&
                (decoded.status === undefined || period.status === decoded.status)
              )
              .toSorted((left, right) => left.startsOn.localeCompare(right.startsOn))
              .slice(0, decoded.limit ?? 200)
          }),
        listRevenuePostingProfiles: (input) =>
          Effect.gen(function* () {
            const decoded = yield* Schema.decodeUnknownEffect(ListRevenuePostingProfilesInput)(
              input,
            )
            yield* authorization.authorize({
              principal: decoded.principal,
              tenantId: decoded.tenantId,
              capability: AccountingCapabilities.revenueRead,
            })
            return [...profiles.values()]
              .filter((profile) =>
                profile.tenantId === decoded.tenantId &&
                (decoded.legalEntityId === undefined ||
                  profile.legalEntityId === decoded.legalEntityId)
              )
              .toSorted((left, right) => left.legalEntityId.localeCompare(right.legalEntityId))
              .slice(0, decoded.limit ?? 200)
          }),
        // Fallow: memory and PostgreSQL adapters intentionally mirror public read authorization.
        // fallow-ignore-next-line code-duplication
        listJournalEntries: (input) =>
          Effect.gen(function* () {
            const decoded = yield* Schema.decodeUnknownEffect(ListJournalEntriesInput)(input)
            yield* authorization.authorize({
              principal: decoded.principal,
              tenantId: decoded.tenantId,
              capability: AccountingCapabilities.journalRead,
            })
            return [...storedJournals.values()]
              .filter((journal) =>
                journal.tenantId === decoded.tenantId &&
                (decoded.status === undefined || journal.status === decoded.status)
              )
              .toSorted((left, right) => right.postedAt.localeCompare(left.postedAt))
              .slice(0, decoded.limit ?? 200)
          }),
        recordFinancialStagingEvidence: (input) =>
          Effect.gen(function* () {
            const decoded = yield* Schema.decodeUnknownEffect(RecordFinancialStagingEvidenceInput)(
              input,
            )
            yield* authorization.authorize({
              principal: decoded.principal,
              tenantId: decoded.tenantId,
              capability: AccountingCapabilities.financialEvidenceRecord,
            })
            if (decoded.evidence.tenantId !== decoded.tenantId) {
              return yield* Effect.fail(
                new FinancialStagingEvidenceInvalid({
                  tenantId: decoded.tenantId,
                  recordId: decoded.evidence.recordId,
                  reason: "scope_mismatch",
                }),
              )
            }
            if (decoded.evidence.operatorPrincipalId !== decoded.principal.userAccountId) {
              return yield* Effect.fail(
                new FinancialStagingEvidenceInvalid({
                  tenantId: decoded.tenantId,
                  recordId: decoded.evidence.recordId,
                  reason: "operator_mismatch",
                }),
              )
            }
            if (!configurations.has(`${decoded.tenantId}:${decoded.evidence.legalEntityId}`)) {
              return yield* Effect.fail(
                new AccountingLegalEntityNotFound({
                  tenantId: decoded.tenantId,
                  legalEntityId: decoded.evidence.legalEntityId,
                }),
              )
            }
            const result = yield* stagingEvidenceStore.append({
              tenantId: decoded.tenantId,
              evidence: decoded.evidence,
              canonicalizationVersion: decoded.canonicalizationVersion,
              evidenceHash: decoded.evidenceHash,
            })
            return result.record
          }),
        listFinancialStagingEvidence: (input) =>
          Effect.gen(function* () {
            const decoded = yield* Schema.decodeUnknownEffect(ListFinancialStagingEvidenceInput)(
              input,
            )
            yield* authorization.authorize({
              principal: decoded.principal,
              tenantId: decoded.tenantId,
              capability: AccountingCapabilities.financialEvidenceRead,
            })
            return yield* stagingEvidenceStore.list({
              tenantId: decoded.tenantId,
              ...(decoded.legalEntityId === undefined
                ? {}
                : { legalEntityId: decoded.legalEntityId }),
              ...(decoded.gateId === undefined ? {} : { gateId: decoded.gateId }),
              ...(decoded.cohortId === undefined ? {} : { cohortId: decoded.cohortId }),
              ...(decoded.deploymentRevision === undefined
                ? {}
                : { deploymentRevision: decoded.deploymentRevision }),
              limit: decoded.limit,
            })
          }),
        recordFinancialVerificationArtifact: (input) =>
          Effect.gen(function* () {
            const decoded = yield* Schema.decodeUnknownEffect(
              RecordFinancialVerificationArtifactInput,
            )(input)
            yield* authorization.authorize({
              principal: decoded.principal,
              tenantId: decoded.tenantId,
              capability: AccountingCapabilities.financialEvidenceRecord,
            })
            if (decoded.evidence.tenantId !== decoded.tenantId) {
              return yield* Effect.fail(
                new FinancialVerificationArtifactInvalid({
                  tenantId: decoded.tenantId,
                  legalEntityId: decoded.evidence.legalEntityId,
                  reason: "scope_mismatch",
                }),
              )
            }
            const configuration = configurations.get(
              `${decoded.tenantId}:${decoded.evidence.legalEntityId}`,
            )
            if (configuration?.baseCurrency !== decoded.evidence.currency) {
              return yield* Effect.fail(
                new FinancialVerificationArtifactInvalid({
                  tenantId: decoded.tenantId,
                  legalEntityId: decoded.evidence.legalEntityId,
                  reason: "scope_mismatch",
                }),
              )
            }
            if (Option.isNone(signerOption)) {
              return yield* Effect.fail(
                new FinancialVerificationArtifactInvalid({
                  tenantId: decoded.tenantId,
                  legalEntityId: decoded.evidence.legalEntityId,
                  reason: "unsigned",
                }),
              )
            }
            const artifactHash = yield* hashFinancialVerificationEvidence(decoded.evidence)
            const signatureBytes = yield* signerOption.value.sign(
              new TextEncoder().encode(artifactHash),
            ).pipe(
              Effect.mapError(() =>
                new FinancialVerificationArtifactInvalid({
                  tenantId: decoded.tenantId,
                  legalEntityId: decoded.evidence.legalEntityId,
                  reason: "unsigned",
                })
              ),
            )
            const signature = Encoding.encodeBase64Url(signatureBytes)
            const artifact: FinancialVerificationArtifact = {
              id: nextId(),
              tenantId: decoded.tenantId,
              legalEntityId: decoded.evidence.legalEntityId,
              artifactHash,
              signatureAlgorithm: signerOption.value.algorithm,
              signingKeyId: signerOption.value.keyId,
              signature,
              status: decoded.evidence.mismatchCount === 0 ? "verified" : "rejected",
              evidence: decoded.evidence,
              producerPrincipalId: decoded.principal.userAccountId,
              createdAt: new Date(clock.currentTimeMillisUnsafe()).toISOString(),
            }
            verificationArtifacts.set(artifact.id, artifact)
            return artifact
          }),
        prepareTigerBeetleCutover: (input) =>
          Effect.gen(function* () {
            const decoded = yield* Schema.decodeUnknownEffect(PrepareTigerBeetleCutoverInput)(input)
            yield* authorization.authorize({
              principal: decoded.principal,
              tenantId: decoded.tenantId,
              capability: AccountingCapabilities.financialEngineActivate,
            })
            const key = `${decoded.tenantId}:${decoded.legalEntityId}`
            if (!configurations.has(key)) {
              return yield* Effect.fail(
                new AccountingLegalEntityNotFound({
                  tenantId: decoded.tenantId,
                  legalEntityId: decoded.legalEntityId,
                }),
              )
            }
            const current = testControl(decoded.tenantId, decoded.legalEntityId)
            if (current.status === "tigerbeetle") {
              return yield* Effect.fail(
                new FinancialEngineActivated({
                  tenantId: decoded.tenantId,
                  legalEntityId: decoded.legalEntityId,
                }),
              )
            }
            if (current.status === "postgresql") {
              const prepared = { ...current, status: "preparing_tigerbeetle" as const }
              controls.set(key, prepared)
              return prepared
            }
            return current
          }),
        approveTigerBeetleCutover: (input) =>
          Effect.gen(function* () {
            const decoded = yield* Schema.decodeUnknownEffect(ApproveTigerBeetleCutoverInput)(input)
            yield* authorization.authorize({
              principal: decoded.principal,
              tenantId: decoded.tenantId,
              capability: AccountingCapabilities.financialEngineActivate,
            })
            const key = `${decoded.tenantId}:${decoded.legalEntityId}`
            const current = controls.get(key)
            if (current === undefined || current.status === "postgresql") {
              return yield* Effect.fail(
                new FinancialEngineCutoverBlocked({
                  tenantId: decoded.tenantId,
                  legalEntityId: decoded.legalEntityId,
                  reason: "not_prepared",
                }),
              )
            }
            if (current.status === "tigerbeetle") return current
            if (current.status === "approved") {
              if (current.evidenceArtifactId === decoded.evidenceArtifactId) return current
              return yield* Effect.fail(
                new FinancialEngineCutoverBlocked({
                  tenantId: decoded.tenantId,
                  legalEntityId: decoded.legalEntityId,
                  reason: "verification_mismatch",
                }),
              )
            }
            const artifact = verificationArtifacts.get(decoded.evidenceArtifactId)
            const configuration = configurations.get(key)
            if (artifact === undefined) {
              return yield* Effect.fail(
                new FinancialVerificationArtifactNotFound({
                  tenantId: decoded.tenantId,
                  artifactId: decoded.evidenceArtifactId,
                }),
              )
            }
            if (
              artifact.legalEntityId !== decoded.legalEntityId ||
              artifact.evidence.currency !== configuration?.baseCurrency ||
              artifact.status !== "verified" ||
              artifact.evidence.kind !== "cutover_rehearsal" ||
              artifact.evidence.mismatchCount !== 0
            ) {
              return yield* Effect.fail(
                new FinancialVerificationArtifactInvalid({
                  tenantId: decoded.tenantId,
                  legalEntityId: decoded.legalEntityId,
                  reason: artifact.legalEntityId !== decoded.legalEntityId ||
                      artifact.evidence.currency !== configuration?.baseCurrency
                    ? "scope_mismatch"
                    : artifact.evidence.mismatchCount > 0
                    ? "mismatch"
                    : "incomplete",
                }),
              )
            }
            if (
              Option.isNone(keyringOption) &&
              (Option.isNone(signerOption) || artifact.signingKeyId !== signerOption.value.keyId)
            ) {
              return yield* Effect.fail(
                new FinancialVerificationArtifactInvalid({
                  tenantId: decoded.tenantId,
                  legalEntityId: decoded.legalEntityId,
                  reason: Option.isNone(signerOption) ? "unsigned" : "stale",
                }),
              )
            }
            const computedArtifactHash = yield* hashFinancialVerificationEvidence(artifact.evidence)
            if (computedArtifactHash !== artifact.artifactHash) {
              return yield* Effect.fail(
                new FinancialVerificationArtifactInvalid({
                  tenantId: decoded.tenantId,
                  legalEntityId: decoded.legalEntityId,
                  reason: "mismatch",
                }),
              )
            }
            const signatureBytes = yield* decodeFinancialVerificationSignature(
              artifact.signature,
              decoded.tenantId,
              decoded.legalEntityId,
            )
            const signaturePayload = new TextEncoder().encode(artifact.artifactHash)
            const signatureValid = yield* Option.isSome(keyringOption)
              ? keyringOption.value.verify(
                artifact.signingKeyId,
                signaturePayload,
                signatureBytes,
              ).pipe(
                Effect.mapError(() =>
                  new FinancialVerificationArtifactInvalid({
                    tenantId: decoded.tenantId,
                    legalEntityId: decoded.legalEntityId,
                    reason: "stale",
                  })
                ),
              )
              : Option.getOrThrow(signerOption).verify(signaturePayload, signatureBytes).pipe(
                Effect.mapError(() =>
                  new FinancialVerificationArtifactInvalid({
                    tenantId: decoded.tenantId,
                    legalEntityId: decoded.legalEntityId,
                    reason: "unsigned",
                  })
                ),
              )
            if (!signatureValid) {
              return yield* Effect.fail(
                new FinancialVerificationArtifactInvalid({
                  tenantId: decoded.tenantId,
                  legalEntityId: decoded.legalEntityId,
                  reason: "unsigned",
                }),
              )
            }
            const approved = {
              ...current,
              status: "approved" as const,
              cutoverWatermark: artifact.evidence.targetWatermark,
              verificationHash: artifact.artifactHash,
              openingBalanceVerified: true,
              historicalBoundaryVerified: true,
              reconciliationHealthy: true,
              backupRecoveryVerified: true,
              evidenceArtifactId: artifact.id,
              approvedBy: decoded.principal.userAccountId,
              approvedAt: new Date(clock.currentTimeMillisUnsafe()).toISOString(),
            }
            controls.set(key, approved)
            return approved
          }),
        activateTigerBeetleCutover: (input) =>
          Effect.gen(function* () {
            const decoded = yield* Schema.decodeUnknownEffect(ActivateTigerBeetleCutoverInput)(
              input,
            )
            yield* authorization.authorize({
              principal: decoded.principal,
              tenantId: decoded.tenantId,
              capability: AccountingCapabilities.financialEngineActivate,
            })
            const current = controls.get(`${decoded.tenantId}:${decoded.legalEntityId}`)
            if (current?.status === "tigerbeetle") return current
            return yield* Effect.fail(
              new FinancialEngineCutoverBlocked({
                tenantId: decoded.tenantId,
                legalEntityId: decoded.legalEntityId,
                reason: "ledger_not_configured",
              }),
            )
          }),
        configureLegalEntity: (input) =>
          Effect.gen(function* () {
            const decoded = yield* Schema.decodeUnknownEffect(ConfigureLegalEntityInput)(input)
            yield* authorization.authorize({
              principal: decoded.principal,
              tenantId: decoded.tenantId,
              capability: AccountingCapabilities.legalEntityConfigure,
            })
            if (decoded.financialEngine === "tigerbeetle") {
              return yield* Effect.fail(
                new FinancialEngineCutoverBlocked({
                  tenantId: decoded.tenantId,
                  legalEntityId: decoded.legalEntityId,
                  reason: "activation_gates_pending",
                }),
              )
            }
            const key = `${decoded.tenantId}:${decoded.legalEntityId}`
            if (configurations.has(key)) {
              return yield* Effect.fail(
                new AccountingConfigurationAlreadyExists({
                  tenantId: decoded.tenantId,
                  legalEntityId: decoded.legalEntityId,
                }),
              )
            }
            const configuration: AccountingConfiguration = {
              tenantId: decoded.tenantId,
              legalEntityId: decoded.legalEntityId,
              baseCurrency: decoded.baseCurrency.toUpperCase(),
              precision: decoded.precision,
              fiscalYearStartMonth: decoded.fiscalYearStartMonth,
              postingEnabled: decoded.postingEnabled,
              financialEngine: decoded.financialEngine ?? "postgresql",
            }
            configurations.set(key, configuration)
            testControl(decoded.tenantId, decoded.legalEntityId)
            return configuration
          }),
        createAccount: (input) =>
          Effect.gen(function* () {
            const decoded = yield* Schema.decodeUnknownEffect(CreateAccountInput)(input)
            yield* authorization.authorize({
              principal: decoded.principal,
              tenantId: decoded.tenantId,
              capability: AccountingCapabilities.accountCreate,
            })
            const code = decoded.code.trim().toUpperCase()
            if (
              [...storedAccounts.values()].some((account) =>
                account.tenantId === decoded.tenantId && account.code === code
              )
            ) {
              return yield* Effect.fail(
                new AccountAlreadyExists({ tenantId: decoded.tenantId, code }),
              )
            }
            const account = {
              id: nextId(),
              tenantId: decoded.tenantId,
              code,
              name: decoded.name.trim(),
              type: decoded.type,
            }
            storedAccounts.set(account.id, account)
            return account
          }),
        configureRevenuePosting: (input) =>
          Effect.gen(function* () {
            const decoded = yield* Schema.decodeUnknownEffect(ConfigureRevenuePostingInput)(input)
            yield* authorization.authorize({
              principal: decoded.principal,
              tenantId: decoded.tenantId,
              capability: AccountingCapabilities.revenueConfigure,
            })
            const receivable = storedAccounts.get(decoded.receivableAccountId)
            const revenue = storedAccounts.get(decoded.revenueAccountId)
            if (
              receivable?.tenantId !== decoded.tenantId || revenue?.tenantId !== decoded.tenantId
            ) {
              return yield* Effect.fail(new AccountNotFound({ tenantId: decoded.tenantId }))
            }
            if (receivable.type !== "asset" || revenue.type !== "revenue") {
              return yield* Effect.fail(
                new InvalidRevenuePostingProfile({
                  tenantId: decoded.tenantId,
                  legalEntityId: decoded.legalEntityId,
                }),
              )
            }
            const key = `${decoded.tenantId}:${decoded.legalEntityId}`
            if (profiles.has(key)) {
              return yield* Effect.fail(
                new RevenuePostingProfileAlreadyExists({
                  tenantId: decoded.tenantId,
                  legalEntityId: decoded.legalEntityId,
                }),
              )
            }
            const profile: RevenuePostingProfile = {
              tenantId: decoded.tenantId,
              legalEntityId: decoded.legalEntityId,
              receivableAccountId: decoded.receivableAccountId,
              revenueAccountId: decoded.revenueAccountId,
            }
            profiles.set(key, profile)
            return profile
          }),
        openPeriod: (input) =>
          Effect.gen(function* () {
            const decoded = yield* Schema.decodeUnknownEffect(OpenPeriodInput)(input)
            yield* authorization.authorize({
              principal: decoded.principal,
              tenantId: decoded.tenantId,
              capability: AccountingCapabilities.periodOpen,
            })
            const overlap = [...periods.values()].some((period) =>
              period.tenantId === decoded.tenantId &&
              period.legalEntityId === decoded.legalEntityId &&
              period.startsOn <= decoded.endsOn && decoded.startsOn <= period.endsOn
            )
            if (overlap) {
              return yield* Effect.fail(
                new AccountingPeriodOverlap({
                  tenantId: decoded.tenantId,
                  legalEntityId: decoded.legalEntityId,
                }),
              )
            }
            const period: AccountingPeriod = {
              id: nextId(),
              tenantId: decoded.tenantId,
              legalEntityId: decoded.legalEntityId,
              startsOn: decoded.startsOn,
              endsOn: decoded.endsOn,
              status: "open",
            }
            periods.set(period.id, period)
            return period
          }),
        closePeriod: (input) =>
          Effect.gen(function* () {
            const decoded = yield* Schema.decodeUnknownEffect(ClosePeriodInput)(input)
            yield* authorization.authorize({
              principal: decoded.principal,
              tenantId: decoded.tenantId,
              capability: AccountingCapabilities.periodClose,
            })
            const period = periods.get(decoded.periodId)
            if (
              period === undefined || period.tenantId !== decoded.tenantId ||
              period.legalEntityId !== decoded.legalEntityId
            ) {
              return yield* Effect.fail(
                new AccountingPeriodNotFound({
                  tenantId: decoded.tenantId,
                  legalEntityId: decoded.legalEntityId,
                  periodId: decoded.periodId,
                }),
              )
            }
            const closed = { ...period, status: "closed" as const }
            periods.set(closed.id, closed)
            return closed
          }),
        postRevenueForOrder: (input) =>
          Effect.gen(function* () {
            const decoded = yield* Schema.decodeUnknownEffect(PostRevenueForOrderInput)(input)
            yield* authorization.authorize({
              principal: decoded.principal,
              tenantId: decoded.tenantId,
              capability: AccountingCapabilities.revenuePost,
            })
            const amount = yield* sales.getConfirmedOrderTotal({
              principal: decoded.principal,
              tenantId: decoded.tenantId,
              orderId: decoded.orderId,
            })
            const reference = revenueReference(decoded.legalEntityId, decoded.orderId)
            const commandId = decoded.commandId.trim()
            const correlationId = decoded.correlationId.trim()
            const causationId = decoded.causationId?.trim() ?? null
            const existing = storedJournals.get(`${decoded.tenantId}:${reference}`)
            if (existing !== undefined) {
              if (existing.lines[0]?.debit !== amount) {
                return yield* Effect.fail(
                  new JournalIdempotencyConflict({ tenantId: decoded.tenantId, reference }),
                )
              }
              return existing
            }
            const key = `${decoded.tenantId}:${decoded.legalEntityId}`
            const profile = profiles.get(key)
            if (profile === undefined) {
              return yield* Effect.fail(
                new RevenuePostingProfileNotFound({
                  tenantId: decoded.tenantId,
                  legalEntityId: decoded.legalEntityId,
                }),
              )
            }
            const today = utcDate(clock)
            if (
              configurations.get(key)?.postingEnabled !== true ||
              ![...periods.values()].some((period) =>
                period.tenantId === decoded.tenantId &&
                period.legalEntityId === decoded.legalEntityId &&
                period.status === "open" && period.startsOn <= today && today <= period.endsOn
              )
            ) {
              return yield* Effect.fail(
                new AccountingPeriodNotOpen({
                  tenantId: decoded.tenantId,
                  legalEntityId: decoded.legalEntityId,
                }),
              )
            }
            const journal: JournalEntry = {
              id: uuidv7(),
              tenantId: decoded.tenantId,
              reference,
              status: "posted",
              postedAt: new Date(clock.currentTimeMillisUnsafe()).toISOString(),
              lines: [
                { accountId: profile.receivableAccountId, debit: amount, credit: "0" },
                { accountId: profile.revenueAccountId, debit: "0", credit: amount },
              ],
            }
            yield* messaging.append({
              eventId: uuidv7(),
              eventType: AccountingRevenuePostedEvent.id,
              eventVersion: AccountingRevenuePostedEvent.version,
              tenantId: decoded.tenantId,
              aggregateType: AccountingRevenuePostedEvent.aggregateType,
              aggregateId: journal.id,
              commandId,
              correlationId,
              causationId,
              idempotencyKey: decoded.orderId,
              actorPrincipalId: decoded.principal.userAccountId,
              occurredAt: journal.postedAt,
              payload: {
                journalId: journal.id,
                legalEntityId: decoded.legalEntityId,
                orderId: decoded.orderId,
              },
            })
            storedJournals.set(`${decoded.tenantId}:${reference}`, journal)
            return journal
          }),
        reverseRevenueForOrder: (input) =>
          Effect.gen(function* () {
            const decoded = yield* Schema.decodeUnknownEffect(ReverseRevenueForOrderInput)(input)
            yield* authorization.authorize({
              principal: decoded.principal,
              tenantId: decoded.tenantId,
              capability: AccountingCapabilities.revenueReverse,
            })
            const reference = reversalReference(decoded.legalEntityId, decoded.orderId)
            const existing = storedJournals.get(`${decoded.tenantId}:${reference}`)
            if (existing !== undefined) return existing
            const key = `${decoded.tenantId}:${decoded.legalEntityId}`
            if (!profiles.has(key)) {
              return yield* Effect.fail(
                new RevenuePostingProfileNotFound({
                  tenantId: decoded.tenantId,
                  legalEntityId: decoded.legalEntityId,
                }),
              )
            }
            const today = utcDate(clock)
            if (
              configurations.get(key)?.postingEnabled !== true ||
              ![...periods.values()].some((period) =>
                period.tenantId === decoded.tenantId &&
                period.legalEntityId === decoded.legalEntityId &&
                period.status === "open" && period.startsOn <= today && today <= period.endsOn
              )
            ) {
              return yield* Effect.fail(
                new AccountingPeriodNotOpen({
                  tenantId: decoded.tenantId,
                  legalEntityId: decoded.legalEntityId,
                }),
              )
            }
            const source = storedJournals.get(
              `${decoded.tenantId}:${revenueReference(decoded.legalEntityId, decoded.orderId)}`,
            )
            if (source === undefined) {
              return yield* Effect.fail(
                new RevenueJournalNotFound({
                  tenantId: decoded.tenantId,
                  legalEntityId: decoded.legalEntityId,
                  orderId: decoded.orderId,
                }),
              )
            }
            const journal: JournalEntry = {
              id: nextId(),
              tenantId: decoded.tenantId,
              reference,
              status: "reversed",
              postedAt: new Date(clock.currentTimeMillisUnsafe()).toISOString(),
              reversesEntryId: source.id,
              lines: source.lines.map((line) => ({
                accountId: line.accountId,
                debit: line.credit,
                credit: line.debit,
              })),
            }
            storedJournals.set(`${decoded.tenantId}:${reference}`, journal)
            return journal
          }),
        postJournal: (input) =>
          Effect.gen(function* () {
            const decoded = yield* Schema.decodeUnknownEffect(PostJournalInput)(input)
            yield* authorization.authorize({
              principal: decoded.principal,
              tenantId: decoded.tenantId,
              capability: AccountingCapabilities.journalPost,
            })
            const error = validateLines(decoded.lines)
            if (error !== undefined) return yield* Effect.fail(error)
            if (
              decoded.lines.some((line) =>
                storedAccounts.get(line.accountId)?.tenantId !== decoded.tenantId
              )
            ) {
              return yield* Effect.fail(new AccountNotFound({ tenantId: decoded.tenantId }))
            }
            const reference = decoded.reference.trim()
            const key = `${decoded.tenantId}:${reference}`
            const existing = storedJournals.get(key)
            if (existing !== undefined) {
              if (
                JSON.stringify(normalizeLines(existing.lines)) !==
                  JSON.stringify(normalizeLines(decoded.lines))
              ) {
                return yield* Effect.fail(
                  new JournalIdempotencyConflict({
                    tenantId: decoded.tenantId,
                    reference,
                  }),
                )
              }
              return existing
            }
            const journal: JournalEntry = {
              id: nextId(),
              tenantId: decoded.tenantId,
              reference,
              status: "posted",
              postedAt: new Date(clock.currentTimeMillisUnsafe()).toISOString(),
              lines: decoded.lines,
            }
            storedJournals.set(key, journal)
            return journal
          }),
      }
      return withAccountingOperationNames(service)
    }),
  )

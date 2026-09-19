import { and, asc, desc, eq, gte, inArray, lte } from "drizzle-orm"
import * as Clock from "effect/Clock"
import * as Encoding from "effect/Encoding"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Result from "effect/Result"
import * as Schema from "effect/Schema"

import {
  accountingPeriods,
  accounts,
  financialCutoverControls,
  financialOperations,
  financialReconciliationCheckpoints,
  financialVerificationArtifacts,
  journalEntries,
  journalLines,
  legalEntityAccountingConfigurations,
  revenuePostingProfiles,
} from "../../../db/schema/accounting.ts"
import { AuthorizationService } from "../../authorization/mod.ts"
import { AccountingCapabilities } from "./capabilities.ts"
import { Database, DatabaseFailure, isDatabaseConstraint, uuidv7 } from "../../../foundation/mod.ts"
import {
  FinancialVerificationKeyring,
  FinancialVerificationSigner,
} from "./verification-contract.ts"
import { MessagingService } from "../../messaging/mod.ts"
import { SalesService } from "../../sales/mod.ts"
import { AccountingRevenuePostedEvent, RevenuePostedEventPayload } from "./events.ts"
import {
  FinancialStagingEvidenceStore,
  makePostgresFinancialStagingEvidenceStore,
} from "./financial-staging-evidence.ts"
import {
  type ExecutionAccountOutcome,
  type FinancialAccountConstraint,
  FinancialLedgerPort,
} from "./financial-ledger.ts"
import {
  FinancialVerificationEvidence,
  hashFinancialVerificationEvidence,
} from "./financial-readiness.ts"
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
  AccountingService,
  ActivateTigerBeetleCutoverInput,
  ApproveTigerBeetleCutoverInput,
  ClosePeriodInput,
  ConfigureLegalEntityInput,
  ConfigureRevenuePostingInput,
  CreateAccountInput,
  FinancialCutoverControl,
  FinancialVerificationArtifact,
  JournalLine,
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
  FinancialOperationsPending,
  FinancialStagingEvidenceInvalid,
  FinancialVerificationArtifactInvalid,
  FinancialVerificationArtifactNotFound,
  InvalidRevenuePostingProfile,
  JournalIdempotencyConflict,
  JournalReferenceAlreadyExists,
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

const journalEntrySelection = {
  id: journalEntries.id,
  tenantId: journalEntries.tenantId,
  reference: journalEntries.reference,
  status: journalEntries.status,
  reversesEntryId: journalEntries.reversesEntryId,
  postedAt: journalEntries.postedAt,
}

const journalLineSelection = {
  accountId: journalLines.accountId,
  debit: journalLines.debit,
  credit: journalLines.credit,
}

const journalLineWithEntrySelection = {
  entryId: journalLines.entryId,
  accountId: journalLines.accountId,
  debit: journalLines.debit,
  credit: journalLines.credit,
}

const accountingConfigurationSelection = {
  tenantId: legalEntityAccountingConfigurations.tenantId,
  legalEntityId: legalEntityAccountingConfigurations.legalEntityId,
  baseCurrency: legalEntityAccountingConfigurations.baseCurrency,
  precision: legalEntityAccountingConfigurations.precision,
  fiscalYearStartMonth: legalEntityAccountingConfigurations.fiscalYearStartMonth,
  postingEnabled: legalEntityAccountingConfigurations.postingEnabled,
  financialEngine: legalEntityAccountingConfigurations.financialEngine,
}

const accountSelection = {
  id: accounts.id,
  tenantId: accounts.tenantId,
  code: accounts.code,
  name: accounts.name,
  type: accounts.type,
}

const accountingPeriodSelection = {
  id: accountingPeriods.id,
  tenantId: accountingPeriods.tenantId,
  legalEntityId: accountingPeriods.legalEntityId,
  startsOn: accountingPeriods.startsOn,
  endsOn: accountingPeriods.endsOn,
  status: accountingPeriods.status,
}

const revenuePostingProfileSelection = {
  tenantId: revenuePostingProfiles.tenantId,
  legalEntityId: revenuePostingProfiles.legalEntityId,
  receivableAccountId: revenuePostingProfiles.receivableAccountId,
  revenueAccountId: revenuePostingProfiles.revenueAccountId,
}

export const makeAccountingService = Effect.gen(function* () {
  const database = yield* Database
  const authorization = yield* AuthorizationService
  const messaging = yield* MessagingService
  const sales = yield* SalesService
  const clock = yield* Clock.Clock
  const ledgerOption = yield* Effect.serviceOption(FinancialLedgerPort)
  const signerOption = yield* Effect.serviceOption(FinancialVerificationSigner)
  const keyringOption = yield* Effect.serviceOption(FinancialVerificationKeyring)
  const stagingEvidenceStoreOption = yield* Effect.serviceOption(FinancialStagingEvidenceStore)
  const stagingEvidenceStore = Option.isSome(stagingEvidenceStoreOption)
    ? stagingEvidenceStoreOption.value
    : yield* makePostgresFinancialStagingEvidenceStore
  const now = () => new Date(clock.currentTimeMillisUnsafe())
  const toCutoverControl = (row: {
    readonly tenantId: string
    readonly legalEntityId: string
    readonly status: FinancialCutoverControl["status"]
    readonly sourceEngine: "postgresql" | "tigerbeetle"
    readonly targetEngine: "postgresql" | "tigerbeetle"
    readonly cutoverWatermark: string | null
    readonly verificationHash: string | null
    readonly openingBalanceVerified: boolean
    readonly historicalBoundaryVerified: boolean
    readonly reconciliationHealthy: boolean
    readonly backupRecoveryVerified: boolean
    readonly evidenceArtifactId: string | null
    readonly unresolvedAcceptedOperations: number
    readonly approvedBy: string | null
    readonly approvedAt: Date | null
    readonly activatedBy: string | null
    readonly activatedAt: Date | null
    readonly lastError: string | null
  }): FinancialCutoverControl => ({
    tenantId: row.tenantId,
    legalEntityId: row.legalEntityId,
    status: row.status,
    sourceEngine: row.sourceEngine as "postgresql",
    targetEngine: row.targetEngine as "tigerbeetle",
    cutoverWatermark: row.cutoverWatermark,
    verificationHash: row.verificationHash,
    openingBalanceVerified: row.openingBalanceVerified,
    historicalBoundaryVerified: row.historicalBoundaryVerified,
    reconciliationHealthy: row.reconciliationHealthy,
    backupRecoveryVerified: row.backupRecoveryVerified,
    evidenceArtifactId: row.evidenceArtifactId,
    unresolvedAcceptedOperations: row.unresolvedAcceptedOperations,
    approvedBy: row.approvedBy,
    approvedAt: row.approvedAt?.toISOString() ?? null,
    activatedBy: row.activatedBy,
    activatedAt: row.activatedAt?.toISOString() ?? null,
    lastError: row.lastError,
  })
  const cutoverSelection = {
    tenantId: financialCutoverControls.tenantId,
    legalEntityId: financialCutoverControls.legalEntityId,
    status: financialCutoverControls.status,
    sourceEngine: financialCutoverControls.sourceEngine,
    targetEngine: financialCutoverControls.targetEngine,
    cutoverWatermark: financialCutoverControls.cutoverWatermark,
    verificationHash: financialCutoverControls.verificationHash,
    openingBalanceVerified: financialCutoverControls.openingBalanceVerified,
    historicalBoundaryVerified: financialCutoverControls.historicalBoundaryVerified,
    reconciliationHealthy: financialCutoverControls.reconciliationHealthy,
    backupRecoveryVerified: financialCutoverControls.backupRecoveryVerified,
    evidenceArtifactId: financialCutoverControls.evidenceArtifactId,
    unresolvedAcceptedOperations: financialCutoverControls.unresolvedAcceptedOperations,
    approvedBy: financialCutoverControls.approvedBy,
    approvedAt: financialCutoverControls.approvedAt,
    activatedBy: financialCutoverControls.activatedBy,
    activatedAt: financialCutoverControls.activatedAt,
    lastError: financialCutoverControls.lastError,
  }
  const toVerificationArtifact = (row: {
    readonly id: string
    readonly tenantId: string
    readonly legalEntityId: string
    readonly artifactHash: string
    readonly signatureAlgorithm: string
    readonly signingKeyId: string
    readonly signature: string
    readonly status: "verified" | "rejected"
    readonly kind: FinancialVerificationEvidence["kind"]
    readonly completeness: FinancialVerificationEvidence["completeness"]
    readonly scope: string
    readonly schemaVersion: number
    readonly mappingVersion: number
    readonly currency: string
    readonly sourceWatermark: string
    readonly targetWatermark: string
    readonly sourceSnapshotRef: string
    readonly targetSnapshotRef: string
    readonly operationSetHash: string
    readonly accountBalanceHash: string
    readonly transferSetHash: string
    readonly projectionHash: string | null
    readonly sourceDebitMinor: string
    readonly sourceCreditMinor: string
    readonly targetDebitMinor: string
    readonly targetCreditMinor: string
    readonly accountCount: number
    readonly operationCount: number
    readonly transferCount: number
    readonly mismatchCount: number
    readonly producerPrincipalId: string
    readonly startedAt: Date
    readonly completedAt: Date
    readonly createdAt: Date
  }): FinancialVerificationArtifact => ({
    id: row.id,
    tenantId: row.tenantId,
    legalEntityId: row.legalEntityId,
    artifactHash: row.artifactHash,
    signatureAlgorithm: row.signatureAlgorithm as "Ed25519",
    signingKeyId: row.signingKeyId,
    signature: row.signature,
    status: row.status,
    evidence: {
      tenantId: row.tenantId,
      legalEntityId: row.legalEntityId,
      kind: row.kind,
      completeness: row.completeness,
      scope: row.scope,
      schemaVersion: row.schemaVersion,
      mappingVersion: row.mappingVersion,
      currency: row.currency,
      sourceWatermark: row.sourceWatermark,
      targetWatermark: row.targetWatermark,
      sourceSnapshotRef: row.sourceSnapshotRef,
      targetSnapshotRef: row.targetSnapshotRef,
      operationSetHash: row.operationSetHash,
      accountBalanceHash: row.accountBalanceHash,
      transferSetHash: row.transferSetHash,
      projectionHash: row.projectionHash,
      sourceDebitMinor: row.sourceDebitMinor,
      sourceCreditMinor: row.sourceCreditMinor,
      targetDebitMinor: row.targetDebitMinor,
      targetCreditMinor: row.targetCreditMinor,
      accountCount: row.accountCount,
      operationCount: row.operationCount,
      transferCount: row.transferCount,
      mismatchCount: row.mismatchCount,
      startedAt: row.startedAt.toISOString(),
      completedAt: row.completedAt.toISOString(),
    },
    producerPrincipalId: row.producerPrincipalId,
    createdAt: row.createdAt.toISOString(),
  })
  const cutoverBlocked = (
    tenantId: string,
    legalEntityId: string,
    reason: FinancialEngineCutoverBlocked["reason"],
  ) => Effect.fail(new FinancialEngineCutoverBlocked({ tenantId, legalEntityId, reason }))
  const balanceConstraintForAccountType = (
    type: Account["type"],
  ): FinancialAccountConstraint =>
    type === "asset" || type === "expense"
      ? "credits_must_not_exceed_debits"
      : "debits_must_not_exceed_credits"
  const ensureLegacyEngine = (tenantId: string, legalEntityId: string) =>
    Effect.gen(function* () {
      const [configuration] = yield* database.query(
        (db) =>
          db.select({ financialEngine: legalEntityAccountingConfigurations.financialEngine })
            .from(legalEntityAccountingConfigurations).where(and(
              eq(legalEntityAccountingConfigurations.tenantId, tenantId),
              eq(legalEntityAccountingConfigurations.legalEntityId, legalEntityId),
            )),
        "accounting.legacy_engine.lookup",
      )
      if (configuration?.financialEngine === "tigerbeetle") {
        return yield* Effect.fail(new FinancialEngineActivated({ tenantId, legalEntityId }))
      }
    })
  const ensureLegacyTenantEngine = (tenantId: string) =>
    Effect.gen(function* () {
      const [configuration] = yield* database.query(
        (db) =>
          db.select({ legalEntityId: legalEntityAccountingConfigurations.legalEntityId })
            .from(legalEntityAccountingConfigurations).where(and(
              eq(legalEntityAccountingConfigurations.tenantId, tenantId),
              eq(legalEntityAccountingConfigurations.financialEngine, "tigerbeetle"),
            )),
        "accounting.legacy_tenant_engine.lookup",
      )
      if (configuration !== undefined) {
        return yield* Effect.fail(
          new FinancialEngineActivated({
            tenantId,
            legalEntityId: configuration.legalEntityId,
          }),
        )
      }
    })
  // Fallow: memory and PostgreSQL adapters intentionally mirror the guarded service shape.
  // fallow-ignore-next-line code-duplication
  const loadCutoverControl = (tenantId: string, legalEntityId: string, lock = false) =>
    database.query(
      (db) => {
        const query = db.select(cutoverSelection).from(financialCutoverControls).where(and(
          eq(financialCutoverControls.tenantId, tenantId),
          eq(financialCutoverControls.legalEntityId, legalEntityId),
        ))
        return lock ? query.for("update") : query
      },
      "accounting.financial_cutover.get",
    )

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
        const rows = yield* database.query(
          (db) => {
            const filters = [eq(legalEntityAccountingConfigurations.tenantId, decoded.tenantId)]
            if (decoded.legalEntityId !== undefined) {
              filters.push(
                eq(legalEntityAccountingConfigurations.legalEntityId, decoded.legalEntityId),
              )
            }
            return db.select(accountingConfigurationSelection)
              .from(legalEntityAccountingConfigurations)
              .where(and(...filters))
              .orderBy(asc(legalEntityAccountingConfigurations.legalEntityId))
              .limit(decoded.limit ?? 200)
          },
          "accounting.configuration.list",
        )
        return rows.map((row) => ({ ...row, precision: 2 as const }))
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
        const rows = yield* database.query(
          (db) => {
            const filters = [eq(accounts.tenantId, decoded.tenantId)]
            if (decoded.type !== undefined) filters.push(eq(accounts.type, decoded.type))
            return db.select(accountSelection).from(accounts).where(and(...filters))
              .orderBy(asc(accounts.code)).limit(decoded.limit ?? 200)
          },
          "accounting.account.list",
        )
        return rows
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
        const rows = yield* database.query(
          (db) => {
            const filters = [eq(accountingPeriods.tenantId, decoded.tenantId)]
            if (decoded.legalEntityId !== undefined) {
              filters.push(eq(accountingPeriods.legalEntityId, decoded.legalEntityId))
            }
            if (decoded.status !== undefined) {
              filters.push(eq(accountingPeriods.status, decoded.status))
            }
            return db.select(accountingPeriodSelection).from(accountingPeriods).where(
              and(...filters),
            )
              .orderBy(asc(accountingPeriods.startsOn), asc(accountingPeriods.id))
              .limit(decoded.limit ?? 200)
          },
          "accounting.period.list",
        )
        return rows
      }),
    listRevenuePostingProfiles: (input) =>
      Effect.gen(function* () {
        const decoded = yield* Schema.decodeUnknownEffect(ListRevenuePostingProfilesInput)(input)
        yield* authorization.authorize({
          principal: decoded.principal,
          tenantId: decoded.tenantId,
          capability: AccountingCapabilities.revenueRead,
        })
        const rows = yield* database.query(
          (db) => {
            const filters = [eq(revenuePostingProfiles.tenantId, decoded.tenantId)]
            if (decoded.legalEntityId !== undefined) {
              filters.push(eq(revenuePostingProfiles.legalEntityId, decoded.legalEntityId))
            }
            return db.select(revenuePostingProfileSelection)
              .from(revenuePostingProfiles)
              .where(and(...filters))
              .orderBy(asc(revenuePostingProfiles.legalEntityId))
              .limit(decoded.limit ?? 200)
          },
          "accounting.revenue_profile.list",
        )
        return rows
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
        const rows = yield* database.query(
          (db) => {
            const filters = [eq(journalEntries.tenantId, decoded.tenantId)]
            if (decoded.status !== undefined) {
              filters.push(eq(journalEntries.status, decoded.status))
            } else {
              filters.push(inArray(journalEntries.status, ["posted", "reversed"]))
            }
            return db.select(journalEntrySelection).from(journalEntries).where(and(...filters))
              .orderBy(desc(journalEntries.postedAt), desc(journalEntries.id))
              .limit(decoded.limit ?? 200)
          },
          "accounting.journal.list",
        )
        if (rows.length === 0) return []
        const lines = yield* database.query(
          (db) =>
            db.select(journalLineWithEntrySelection).from(journalLines).where(and(
              eq(journalLines.tenantId, decoded.tenantId),
              inArray(journalLines.entryId, rows.map((row) => row.id)),
            )).orderBy(asc(journalLines.entryId), asc(journalLines.id)),
          "accounting.journal.lines.list",
        )
        const linesByEntry = new Map<string, JournalLine[]>()
        for (const line of lines) {
          const entryLines = linesByEntry.get(line.entryId) ?? []
          entryLines.push({
            accountId: line.accountId,
            debit: String(line.debit ?? "0"),
            credit: String(line.credit ?? "0"),
          })
          linesByEntry.set(line.entryId, entryLines)
        }
        return rows.map((row) => ({
          id: row.id,
          tenantId: row.tenantId,
          reference: row.reference,
          status: row.status as "posted" | "reversed",
          postedAt: row.postedAt!.toISOString(),
          ...(row.reversesEntryId === null ? {} : { reversesEntryId: row.reversesEntryId }),
          lines: linesByEntry.get(row.id) ?? [],
        }))
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
        const result = yield* stagingEvidenceStore.append({
          tenantId: decoded.tenantId,
          evidence: decoded.evidence,
          canonicalizationVersion: decoded.canonicalizationVersion,
          evidenceHash: decoded.evidenceHash,
        }).pipe(
          Effect.mapError((error) =>
            isDatabaseConstraint(error, "financial_staging_evidence_legal_entity_fkey", "23503")
              ? new AccountingLegalEntityNotFound({
                tenantId: decoded.tenantId,
                legalEntityId: decoded.evidence.legalEntityId,
              })
              : error
          ),
        )
        return result.record
      }),
    listFinancialStagingEvidence: (input) =>
      Effect.gen(function* () {
        const decoded = yield* Schema.decodeUnknownEffect(ListFinancialStagingEvidenceInput)(input)
        yield* authorization.authorize({
          principal: decoded.principal,
          tenantId: decoded.tenantId,
          capability: AccountingCapabilities.financialEvidenceRead,
        })
        return yield* stagingEvidenceStore.list({
          tenantId: decoded.tenantId,
          ...(decoded.legalEntityId === undefined ? {} : { legalEntityId: decoded.legalEntityId }),
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
        const decoded = yield* Schema.decodeUnknownEffect(RecordFinancialVerificationArtifactInput)(
          input,
        )
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
        const [configuration] = yield* database.query(
          (db) =>
            db.select({ baseCurrency: legalEntityAccountingConfigurations.baseCurrency })
              .from(legalEntityAccountingConfigurations).where(and(
                eq(legalEntityAccountingConfigurations.tenantId, decoded.tenantId),
                eq(
                  legalEntityAccountingConfigurations.legalEntityId,
                  decoded.evidence.legalEntityId,
                ),
              )),
          "accounting.financial_verification_artifact.configuration",
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
        const startedAt = new Date(decoded.evidence.startedAt)
        const completedAt = new Date(decoded.evidence.completedAt)
        if (!Number.isFinite(startedAt.getTime()) || !Number.isFinite(completedAt.getTime())) {
          return yield* Effect.fail(
            new FinancialVerificationArtifactInvalid({
              tenantId: decoded.tenantId,
              legalEntityId: decoded.evidence.legalEntityId,
              reason: "incomplete",
            }),
          )
        }
        if (completedAt < startedAt) {
          return yield* Effect.fail(
            new FinancialVerificationArtifactInvalid({
              tenantId: decoded.tenantId,
              legalEntityId: decoded.evidence.legalEntityId,
              reason: "incomplete",
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
        const artifactHash = yield* hashFinancialVerificationEvidence(decoded.evidence).pipe(
          Effect.catch(() =>
            Effect.fail(
              new FinancialVerificationArtifactInvalid({
                tenantId: decoded.tenantId,
                legalEntityId: decoded.evidence.legalEntityId,
                reason: "incomplete",
              }),
            )
          ),
        )
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
        const [inserted] = yield* database.query(
          (db) =>
            db.insert(financialVerificationArtifacts).values({
              tenantId: decoded.tenantId,
              legalEntityId: decoded.evidence.legalEntityId,
              kind: decoded.evidence.kind,
              status: decoded.evidence.mismatchCount === 0 ? "verified" : "rejected",
              completeness: decoded.evidence.completeness,
              scope: decoded.evidence.scope,
              schemaVersion: decoded.evidence.schemaVersion,
              mappingVersion: decoded.evidence.mappingVersion,
              currency: decoded.evidence.currency,
              sourceWatermark: decoded.evidence.sourceWatermark,
              targetWatermark: decoded.evidence.targetWatermark,
              sourceSnapshotRef: decoded.evidence.sourceSnapshotRef,
              targetSnapshotRef: decoded.evidence.targetSnapshotRef,
              artifactHash,
              signatureAlgorithm: signerOption.value.algorithm,
              signingKeyId: signerOption.value.keyId,
              signature,
              operationSetHash: decoded.evidence.operationSetHash,
              accountBalanceHash: decoded.evidence.accountBalanceHash,
              transferSetHash: decoded.evidence.transferSetHash,
              projectionHash: decoded.evidence.projectionHash,
              sourceDebitMinor: decoded.evidence.sourceDebitMinor,
              sourceCreditMinor: decoded.evidence.sourceCreditMinor,
              targetDebitMinor: decoded.evidence.targetDebitMinor,
              targetCreditMinor: decoded.evidence.targetCreditMinor,
              accountCount: decoded.evidence.accountCount,
              operationCount: decoded.evidence.operationCount,
              transferCount: decoded.evidence.transferCount,
              mismatchCount: decoded.evidence.mismatchCount,
              producerPrincipalId: decoded.principal.userAccountId,
              startedAt,
              completedAt,
            }).returning(),
          "accounting.financial_verification_artifact.record",
        )
        return toVerificationArtifact(inserted!)
      }),
    prepareTigerBeetleCutover: (input) =>
      Effect.gen(function* () {
        const decoded = yield* Schema.decodeUnknownEffect(PrepareTigerBeetleCutoverInput)(input)
        yield* authorization.authorize({
          principal: decoded.principal,
          tenantId: decoded.tenantId,
          capability: AccountingCapabilities.financialEngineActivate,
        })
        return yield* database.withTransaction(
          Effect.gen(function* () {
            const [configuration] = yield* database.query(
              (db) =>
                db.select({ financialEngine: legalEntityAccountingConfigurations.financialEngine })
                  .from(legalEntityAccountingConfigurations).where(and(
                    eq(legalEntityAccountingConfigurations.tenantId, decoded.tenantId),
                    eq(legalEntityAccountingConfigurations.legalEntityId, decoded.legalEntityId),
                  )).for("update"),
              "accounting.financial_cutover.prepare.configuration",
            )
            if (configuration === undefined) {
              return yield* Effect.fail(
                new AccountingLegalEntityNotFound({
                  tenantId: decoded.tenantId,
                  legalEntityId: decoded.legalEntityId,
                }),
              )
            }
            const [current] = yield* loadCutoverControl(
              decoded.tenantId,
              decoded.legalEntityId,
              true,
            )
            if (current === undefined) {
              return yield* cutoverBlocked(
                decoded.tenantId,
                decoded.legalEntityId,
                "not_prepared",
              )
            }
            if (
              configuration.financialEngine === "tigerbeetle" || current.status === "tigerbeetle"
            ) {
              return yield* Effect.fail(
                new FinancialEngineActivated({
                  tenantId: decoded.tenantId,
                  legalEntityId: decoded.legalEntityId,
                }),
              )
            }
            if (current.status !== "postgresql") return toCutoverControl(current)
            const [prepared] = yield* database.query(
              (db) =>
                db.update(financialCutoverControls).set({
                  status: "preparing_tigerbeetle",
                  lastError: null,
                  updatedAt: now(),
                }).where(and(
                  eq(financialCutoverControls.tenantId, decoded.tenantId),
                  eq(financialCutoverControls.legalEntityId, decoded.legalEntityId),
                )).returning(cutoverSelection),
              "accounting.financial_cutover.prepare",
            )
            return toCutoverControl(prepared!)
          }),
          "accounting.financial_cutover.prepare.transaction",
        )
      }),
    approveTigerBeetleCutover: (input) =>
      Effect.gen(function* () {
        const decoded = yield* Schema.decodeUnknownEffect(ApproveTigerBeetleCutoverInput)(input)
        yield* authorization.authorize({
          principal: decoded.principal,
          tenantId: decoded.tenantId,
          capability: AccountingCapabilities.financialEngineActivate,
        })
        return yield* database.withTransaction(
          Effect.gen(function* () {
            const [current] = yield* loadCutoverControl(
              decoded.tenantId,
              decoded.legalEntityId,
              true,
            )
            if (current === undefined) {
              return yield* cutoverBlocked(
                decoded.tenantId,
                decoded.legalEntityId,
                "not_prepared",
              )
            }
            if (current.status === "tigerbeetle") return toCutoverControl(current)
            if (current.status === "approved") {
              if (current.evidenceArtifactId === decoded.evidenceArtifactId) {
                return toCutoverControl(current)
              }
              return yield* cutoverBlocked(
                decoded.tenantId,
                decoded.legalEntityId,
                "verification_mismatch",
              )
            }
            if (current.status === "postgresql") {
              return yield* cutoverBlocked(
                decoded.tenantId,
                decoded.legalEntityId,
                "not_prepared",
              )
            }
            const [configuration] = yield* database.query(
              (db) =>
                db.select({
                  financialEngine: legalEntityAccountingConfigurations.financialEngine,
                  baseCurrency: legalEntityAccountingConfigurations.baseCurrency,
                }).from(legalEntityAccountingConfigurations).where(and(
                  eq(legalEntityAccountingConfigurations.tenantId, decoded.tenantId),
                  eq(legalEntityAccountingConfigurations.legalEntityId, decoded.legalEntityId),
                )).for("update"),
              "accounting.financial_cutover.approve.configuration",
            )
            if (configuration?.financialEngine !== "postgresql") {
              return yield* cutoverBlocked(
                decoded.tenantId,
                decoded.legalEntityId,
                "verification_mismatch",
              )
            }
            const [artifactRow] = yield* database.query(
              (db) =>
                db.select().from(financialVerificationArtifacts).where(and(
                  eq(financialVerificationArtifacts.tenantId, decoded.tenantId),
                  eq(financialVerificationArtifacts.id, decoded.evidenceArtifactId),
                )),
              "accounting.financial_cutover.approve.evidence",
            )
            if (artifactRow === undefined) {
              return yield* Effect.fail(
                new FinancialVerificationArtifactNotFound({
                  tenantId: decoded.tenantId,
                  artifactId: decoded.evidenceArtifactId,
                }),
              )
            }
            const artifact = toVerificationArtifact(artifactRow)
            if (
              artifact.legalEntityId !== decoded.legalEntityId ||
              artifact.evidence.currency !== configuration.baseCurrency ||
              artifact.status !== "verified" ||
              artifact.evidence.kind !== "cutover_rehearsal" ||
              artifact.evidence.mismatchCount !== 0 ||
              artifact.evidence.targetWatermark.trim() === ""
            ) {
              return yield* Effect.fail(
                new FinancialVerificationArtifactInvalid({
                  tenantId: decoded.tenantId,
                  legalEntityId: decoded.legalEntityId,
                  reason: artifact.legalEntityId !== decoded.legalEntityId ||
                      artifact.evidence.currency !== configuration.baseCurrency
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
            const unresolved = yield* database.query(
              (db) =>
                db.select({ id: financialOperations.id }).from(financialOperations).where(and(
                  eq(financialOperations.tenantId, decoded.tenantId),
                  eq(financialOperations.legalEntityId, decoded.legalEntityId),
                  inArray(financialOperations.status, [
                    "intent",
                    "submitted",
                    "accepted",
                    "unknown",
                    "manual_recovery",
                  ]),
                )),
              "accounting.financial_cutover.approve.unresolved",
            )
            if (unresolved.length > 0) {
              return yield* cutoverBlocked(
                decoded.tenantId,
                decoded.legalEntityId,
                "unresolved_operations",
              )
            }
            const [checkpoint] = yield* database.query(
              (db) =>
                db.select({
                  sourceWatermark: financialReconciliationCheckpoints.sourceWatermark,
                  targetWatermark: financialReconciliationCheckpoints.targetWatermark,
                  sourceSnapshotRef: financialReconciliationCheckpoints.sourceSnapshotRef,
                  targetSnapshotRef: financialReconciliationCheckpoints.targetSnapshotRef,
                  operationSetHash: financialReconciliationCheckpoints.operationSetHash,
                  accountBalanceHash: financialReconciliationCheckpoints.accountBalanceHash,
                  transferSetHash: financialReconciliationCheckpoints.transferSetHash,
                  projectionHash: financialReconciliationCheckpoints.projectionHash,
                  mismatchCount: financialReconciliationCheckpoints.mismatchCount,
                  orphanCount: financialReconciliationCheckpoints.orphanCount,
                }).from(financialReconciliationCheckpoints).where(and(
                  eq(financialReconciliationCheckpoints.tenantId, decoded.tenantId),
                  eq(financialReconciliationCheckpoints.legalEntityId, decoded.legalEntityId),
                  eq(financialReconciliationCheckpoints.engine, "tigerbeetle"),
                  eq(financialReconciliationCheckpoints.status, "verified"),
                  eq(financialReconciliationCheckpoints.evidenceArtifactId, artifact.id),
                )),
              "accounting.financial_cutover.approve.checkpoint",
            )
            if (
              checkpoint === undefined ||
              checkpoint.sourceWatermark !== artifact.evidence.sourceWatermark ||
              checkpoint.targetWatermark !== artifact.evidence.targetWatermark ||
              checkpoint.sourceSnapshotRef !== artifact.evidence.sourceSnapshotRef ||
              checkpoint.targetSnapshotRef !== artifact.evidence.targetSnapshotRef ||
              checkpoint.operationSetHash !== artifact.evidence.operationSetHash ||
              checkpoint.accountBalanceHash !== artifact.evidence.accountBalanceHash ||
              checkpoint.transferSetHash !== artifact.evidence.transferSetHash ||
              checkpoint.projectionHash !== artifact.evidence.projectionHash ||
              checkpoint.mismatchCount !== 0 ||
              checkpoint.orphanCount !== 0
            ) {
              return yield* cutoverBlocked(
                decoded.tenantId,
                decoded.legalEntityId,
                "verification_mismatch",
              )
            }
            const [approved] = yield* database.query(
              (db) =>
                db.update(financialCutoverControls).set({
                  status: "approved",
                  cutoverWatermark: artifact.evidence.targetWatermark,
                  verificationHash: artifact.artifactHash,
                  openingBalanceVerified: true,
                  historicalBoundaryVerified: true,
                  reconciliationHealthy: true,
                  backupRecoveryVerified: true,
                  evidenceArtifactId: artifact.id,
                  unresolvedAcceptedOperations: unresolved.length,
                  approvedBy: decoded.principal.userAccountId,
                  approvedAt: now(),
                  lastError: null,
                  updatedAt: now(),
                }).where(and(
                  eq(financialCutoverControls.tenantId, decoded.tenantId),
                  eq(financialCutoverControls.legalEntityId, decoded.legalEntityId),
                )).returning(cutoverSelection),
              "accounting.financial_cutover.approve",
            )
            return toCutoverControl(approved!)
          }),
          "accounting.financial_cutover.approve.transaction",
        )
      }),
    activateTigerBeetleCutover: (input) =>
      Effect.gen(function* () {
        const decoded = yield* Schema.decodeUnknownEffect(ActivateTigerBeetleCutoverInput)(input)
        yield* authorization.authorize({
          principal: decoded.principal,
          tenantId: decoded.tenantId,
          capability: AccountingCapabilities.financialEngineActivate,
        })
        if (Option.isNone(ledgerOption)) {
          return yield* cutoverBlocked(
            decoded.tenantId,
            decoded.legalEntityId,
            "ledger_not_configured",
          )
        }
        const activating = yield* database.withTransaction(
          Effect.gen(function* () {
            const [current] = yield* loadCutoverControl(
              decoded.tenantId,
              decoded.legalEntityId,
              true,
            )
            if (current === undefined) {
              return yield* cutoverBlocked(
                decoded.tenantId,
                decoded.legalEntityId,
                "not_prepared",
              )
            }
            if (current.status === "tigerbeetle") return toCutoverControl(current)
            if (current.status !== "approved" && current.status !== "activating") {
              return yield* cutoverBlocked(
                decoded.tenantId,
                decoded.legalEntityId,
                "activation_gates_pending",
              )
            }
            const [configuration] = yield* database.query(
              (db) =>
                db.select({ financialEngine: legalEntityAccountingConfigurations.financialEngine })
                  .from(legalEntityAccountingConfigurations).where(and(
                    eq(legalEntityAccountingConfigurations.tenantId, decoded.tenantId),
                    eq(legalEntityAccountingConfigurations.legalEntityId, decoded.legalEntityId),
                  )).for("update"),
              "accounting.financial_cutover.activate.configuration",
            )
            if (configuration?.financialEngine !== "postgresql") {
              return yield* cutoverBlocked(
                decoded.tenantId,
                decoded.legalEntityId,
                "verification_mismatch",
              )
            }
            const [updated] = yield* database.query(
              (db) =>
                db.update(financialCutoverControls).set({
                  status: "activating",
                  lastError: null,
                  updatedAt: now(),
                }).where(and(
                  eq(financialCutoverControls.tenantId, decoded.tenantId),
                  eq(financialCutoverControls.legalEntityId, decoded.legalEntityId),
                )).returning(cutoverSelection),
              "accounting.financial_cutover.activating",
            )
            return toCutoverControl(updated!)
          }),
          "accounting.financial_cutover.activate.prepare",
        )
        if (activating.status === "tigerbeetle") return activating

        const [activationConfiguration] = yield* database.query(
          (db) =>
            db.select({ baseCurrency: legalEntityAccountingConfigurations.baseCurrency })
              .from(legalEntityAccountingConfigurations).where(and(
                eq(legalEntityAccountingConfigurations.tenantId, decoded.tenantId),
                eq(legalEntityAccountingConfigurations.legalEntityId, decoded.legalEntityId),
              )),
          "accounting.financial_cutover.activate.currency",
        )
        if (activationConfiguration === undefined) {
          return yield* cutoverBlocked(
            decoded.tenantId,
            decoded.legalEntityId,
            "verification_mismatch",
          )
        }
        const accountRows = yield* database.query(
          (db) =>
            db.select({ id: accounts.id, type: accounts.type }).from(accounts).where(
              eq(accounts.tenantId, decoded.tenantId),
            ),
          "accounting.financial_cutover.activate.accounts",
        )
        for (const account of accountRows) {
          const result: ExecutionAccountOutcome = yield* ledgerOption.value.createExecutionAccount({
            tenantId: decoded.tenantId,
            legalEntityId: decoded.legalEntityId,
            accountId: account.id,
            currency: activationConfiguration.baseCurrency,
            mappingVersion: 1,
            balanceConstraint: balanceConstraintForAccountType(account.type),
          })
          if (result._tag !== "accepted") {
            yield* database.query(
              (db) =>
                db.update(financialCutoverControls).set({
                  lastError: `account_provisioning_${result._tag}`,
                  updatedAt: now(),
                }).where(and(
                  eq(financialCutoverControls.tenantId, decoded.tenantId),
                  eq(financialCutoverControls.legalEntityId, decoded.legalEntityId),
                )),
              "accounting.financial_cutover.activate.account_failure",
            )
            return yield* cutoverBlocked(
              decoded.tenantId,
              decoded.legalEntityId,
              "account_provisioning_failed",
            )
          }
        }
        return yield* database.withTransaction(
          Effect.gen(function* () {
            yield* database.query(
              (db) =>
                db.update(legalEntityAccountingConfigurations).set({
                  financialEngine: "tigerbeetle",
                  updatedAt: now(),
                }).where(and(
                  eq(legalEntityAccountingConfigurations.tenantId, decoded.tenantId),
                  eq(legalEntityAccountingConfigurations.legalEntityId, decoded.legalEntityId),
                )),
              "accounting.financial_cutover.activate.engine",
            )
            const [control] = yield* database.query(
              (db) =>
                db.update(financialCutoverControls).set({
                  status: "tigerbeetle",
                  activatedBy: decoded.principal.userAccountId,
                  activatedAt: now(),
                  lastError: null,
                  updatedAt: now(),
                }).where(and(
                  eq(financialCutoverControls.tenantId, decoded.tenantId),
                  eq(financialCutoverControls.legalEntityId, decoded.legalEntityId),
                  eq(financialCutoverControls.status, "activating"),
                )).returning(cutoverSelection),
              "accounting.financial_cutover.activate.complete",
            )
            if (control !== undefined) return toCutoverControl(control)
            const [completed] = yield* loadCutoverControl(
              decoded.tenantId,
              decoded.legalEntityId,
            )
            if (completed?.status === "tigerbeetle") return toCutoverControl(completed)
            return yield* cutoverBlocked(
              decoded.tenantId,
              decoded.legalEntityId,
              "activation_gates_pending",
            )
          }),
          "accounting.financial_cutover.activate.complete.transaction",
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
        const baseCurrency = decoded.baseCurrency.toUpperCase()
        const rows = yield* database.query(
          (db) =>
            db.insert(legalEntityAccountingConfigurations).values({
              tenantId: decoded.tenantId,
              legalEntityId: decoded.legalEntityId,
              baseCurrency,
              precision: decoded.precision,
              fiscalYearStartMonth: decoded.fiscalYearStartMonth,
              postingEnabled: decoded.postingEnabled,
              financialEngine: decoded.financialEngine ?? "postgresql",
            }).returning({
              tenantId: legalEntityAccountingConfigurations.tenantId,
              legalEntityId: legalEntityAccountingConfigurations.legalEntityId,
              baseCurrency: legalEntityAccountingConfigurations.baseCurrency,
              precision: legalEntityAccountingConfigurations.precision,
              fiscalYearStartMonth: legalEntityAccountingConfigurations.fiscalYearStartMonth,
              postingEnabled: legalEntityAccountingConfigurations.postingEnabled,
              financialEngine: legalEntityAccountingConfigurations.financialEngine,
            }),
          "accounting.legal_entity.configure",
        ).pipe(
          Effect.mapError((error) => {
            if (isDatabaseConstraint(error, "legal_entity_accounting_configurations_pkey")) {
              return new AccountingConfigurationAlreadyExists({
                tenantId: decoded.tenantId,
                legalEntityId: decoded.legalEntityId,
              })
            }
            if (
              isDatabaseConstraint(
                error,
                "legal_entity_accounting_configurations_legal_entity_fkey",
                "23503",
              )
            ) {
              return new AccountingLegalEntityNotFound({
                tenantId: decoded.tenantId,
                legalEntityId: decoded.legalEntityId,
              })
            }
            return error
          }),
        )
        return { ...rows[0]!, precision: 2 as const }
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
        const rows = yield* database.query(
          (db) =>
            db.insert(accounts).values({
              tenantId: decoded.tenantId,
              code,
              name: decoded.name.trim(),
              type: decoded.type,
            }).returning({
              id: accounts.id,
              tenantId: accounts.tenantId,
              code: accounts.code,
              name: accounts.name,
              type: accounts.type,
            }),
          "accounting.account.create",
        ).pipe(
          Effect.mapError((error) =>
            isDatabaseConstraint(error, "accounts_tenant_code_key")
              ? new AccountAlreadyExists({ tenantId: decoded.tenantId, code })
              : error
          ),
        )
        return rows[0]!
      }),
    configureRevenuePosting: (input) =>
      Effect.gen(function* () {
        const decoded = yield* Schema.decodeUnknownEffect(ConfigureRevenuePostingInput)(input)
        yield* authorization.authorize({
          principal: decoded.principal,
          tenantId: decoded.tenantId,
          capability: AccountingCapabilities.revenueConfigure,
        })
        const accountRows = yield* database.query(
          (db) =>
            db.select({ id: accounts.id, type: accounts.type }).from(accounts).where(
              and(
                eq(accounts.tenantId, decoded.tenantId),
                eq(accounts.id, decoded.receivableAccountId),
              ),
            ),
          "accounting.revenue_profile.receivable.lookup",
        )
        const revenueRows = yield* database.query(
          (db) =>
            db.select({ id: accounts.id, type: accounts.type }).from(accounts).where(
              and(
                eq(accounts.tenantId, decoded.tenantId),
                eq(accounts.id, decoded.revenueAccountId),
              ),
            ),
          "accounting.revenue_profile.revenue.lookup",
        )
        if (accountRows[0] === undefined || revenueRows[0] === undefined) {
          return yield* Effect.fail(new AccountNotFound({ tenantId: decoded.tenantId }))
        }
        if (accountRows[0].type !== "asset" || revenueRows[0].type !== "revenue") {
          return yield* Effect.fail(
            new InvalidRevenuePostingProfile({
              tenantId: decoded.tenantId,
              legalEntityId: decoded.legalEntityId,
            }),
          )
        }
        const rows = yield* database.query(
          (db) =>
            db.insert(revenuePostingProfiles).values(decoded).returning({
              tenantId: revenuePostingProfiles.tenantId,
              legalEntityId: revenuePostingProfiles.legalEntityId,
              receivableAccountId: revenuePostingProfiles.receivableAccountId,
              revenueAccountId: revenuePostingProfiles.revenueAccountId,
            }),
          "accounting.revenue_profile.configure",
        ).pipe(Effect.mapError((error) =>
          isDatabaseConstraint(error, "revenue_posting_profiles_pkey")
            ? new RevenuePostingProfileAlreadyExists({
              tenantId: decoded.tenantId,
              legalEntityId: decoded.legalEntityId,
            })
            : error
        ))
        return rows[0]!
      }),
    openPeriod: (input) =>
      Effect.gen(function* () {
        const decoded = yield* Schema.decodeUnknownEffect(OpenPeriodInput)(input)
        yield* authorization.authorize({
          principal: decoded.principal,
          tenantId: decoded.tenantId,
          capability: AccountingCapabilities.periodOpen,
        })
        const rows = yield* database.query(
          (db) =>
            db.insert(accountingPeriods).values({
              tenantId: decoded.tenantId,
              legalEntityId: decoded.legalEntityId,
              startsOn: decoded.startsOn,
              endsOn: decoded.endsOn,
            }).returning({
              id: accountingPeriods.id,
              tenantId: accountingPeriods.tenantId,
              legalEntityId: accountingPeriods.legalEntityId,
              startsOn: accountingPeriods.startsOn,
              endsOn: accountingPeriods.endsOn,
              status: accountingPeriods.status,
            }),
          "accounting.period.open",
        ).pipe(Effect.mapError((error) =>
          isDatabaseConstraint(error, "accounting_periods_no_overlap", "23P01")
            ? new AccountingPeriodOverlap({
              tenantId: decoded.tenantId,
              legalEntityId: decoded.legalEntityId,
            })
            : error
        ))
        return rows[0]!
      }),
    closePeriod: (input) =>
      Effect.gen(function* () {
        const decoded = yield* Schema.decodeUnknownEffect(ClosePeriodInput)(input)
        yield* authorization.authorize({
          principal: decoded.principal,
          tenantId: decoded.tenantId,
          capability: AccountingCapabilities.periodClose,
        })
        const period = yield* database.transaction(
          async (tx) => {
            const rows = await tx.select({
              id: accountingPeriods.id,
              tenantId: accountingPeriods.tenantId,
              legalEntityId: accountingPeriods.legalEntityId,
              startsOn: accountingPeriods.startsOn,
              endsOn: accountingPeriods.endsOn,
              status: accountingPeriods.status,
            }).from(accountingPeriods).where(and(
              eq(accountingPeriods.tenantId, decoded.tenantId),
              eq(accountingPeriods.legalEntityId, decoded.legalEntityId),
              eq(accountingPeriods.id, decoded.periodId),
            )).for("update")
            const existing = rows[0]
            if (existing === undefined || existing.status === "closed") {
              return { period: existing, pending: false as const }
            }
            const pending = await tx.select({ id: financialOperations.id }).from(
              financialOperations,
            )
              .where(and(
                eq(financialOperations.tenantId, decoded.tenantId),
                eq(financialOperations.legalEntityId, decoded.legalEntityId),
                eq(financialOperations.periodId, decoded.periodId),
                inArray(financialOperations.status, [
                  "intent",
                  "submitted",
                  "accepted",
                  "unknown",
                  "manual_recovery",
                ]),
              )).for("update")
            if (pending[0] !== undefined) {
              return { period: existing, pending: true as const }
            }
            return {
              pending: false as const,
              period: (await tx.update(accountingPeriods).set({
                status: "closed",
                updatedAt: now(),
              }).where(eq(accountingPeriods.id, existing.id)).returning({
                id: accountingPeriods.id,
                tenantId: accountingPeriods.tenantId,
                legalEntityId: accountingPeriods.legalEntityId,
                startsOn: accountingPeriods.startsOn,
                endsOn: accountingPeriods.endsOn,
                status: accountingPeriods.status,
              }))[0]!,
            }
          },
          "accounting.period.close",
        )
        if (period.pending) {
          return yield* Effect.fail(
            new FinancialOperationsPending({
              tenantId: decoded.tenantId,
              legalEntityId: decoded.legalEntityId,
              periodId: decoded.periodId,
            }),
          )
        }
        if (period.period === undefined) {
          return yield* Effect.fail(
            new AccountingPeriodNotFound({
              tenantId: decoded.tenantId,
              legalEntityId: decoded.legalEntityId,
              periodId: decoded.periodId,
            }),
          )
        }
        return period.period
      }),
    postRevenueForOrder: (input) =>
      Effect.gen(function* () {
        const decoded = yield* Schema.decodeUnknownEffect(PostRevenueForOrderInput)(input)
        yield* authorization.authorize({
          principal: decoded.principal,
          tenantId: decoded.tenantId,
          capability: AccountingCapabilities.revenuePost,
        })
        yield* ensureLegacyEngine(decoded.tenantId, decoded.legalEntityId)
        const reference = revenueReference(decoded.legalEntityId, decoded.orderId)
        const commandId = decoded.commandId.trim()
        const correlationId = decoded.correlationId.trim()
        const causationId = decoded.causationId?.trim() ?? null
        const loadExisting = () =>
          database.withTransaction(
            Effect.gen(function* () {
              const amount = yield* sales.getConfirmedOrderTotal({
                principal: decoded.principal,
                tenantId: decoded.tenantId,
                orderId: decoded.orderId,
              })
              const entries = yield* database.query(
                (db) =>
                  db.select(journalEntrySelection).from(journalEntries).where(and(
                    eq(journalEntries.tenantId, decoded.tenantId),
                    eq(journalEntries.reference, reference),
                  )),
                "accounting.revenue.lookup",
              )
              const entry = entries[0]
              if (entry === undefined) return undefined
              if (entry.status !== "posted" || entry.postedAt === null) {
                return yield* Effect.fail(
                  new JournalIdempotencyConflict({ tenantId: decoded.tenantId, reference }),
                )
              }
              const profiles = yield* database.query(
                (db) =>
                  db.select({
                    receivableAccountId: revenuePostingProfiles.receivableAccountId,
                    revenueAccountId: revenuePostingProfiles.revenueAccountId,
                  }).from(revenuePostingProfiles).where(and(
                    eq(revenuePostingProfiles.tenantId, decoded.tenantId),
                    eq(revenuePostingProfiles.legalEntityId, decoded.legalEntityId),
                  )),
                "accounting.revenue.profile.lookup",
              )
              const profile = profiles[0]
              const lines = yield* database.query(
                (db) =>
                  db.select(journalLineSelection).from(journalLines).where(and(
                    eq(journalLines.tenantId, decoded.tenantId),
                    eq(journalLines.entryId, entry.id),
                  )),
                "accounting.revenue.lines.lookup",
              )
              const expectedLines = profile === undefined ? [] : [
                {
                  accountId: profile.receivableAccountId,
                  debit: amount,
                  credit: "0",
                },
                {
                  accountId: profile.revenueAccountId,
                  debit: "0",
                  credit: amount,
                },
              ]
              const actualLines = lines.map((line) => ({
                accountId: line.accountId,
                debit: String(line.debit ?? "0"),
                credit: String(line.credit ?? "0"),
              }))
              if (
                profile === undefined || actualLines.length !== expectedLines.length ||
                JSON.stringify(normalizeLines(actualLines)) !==
                  JSON.stringify(normalizeLines(expectedLines))
              ) {
                return yield* Effect.fail(
                  new JournalIdempotencyConflict({ tenantId: decoded.tenantId, reference }),
                )
              }
              return {
                id: entry.id,
                tenantId: entry.tenantId,
                reference,
                status: "posted" as const,
                postedAt: entry.postedAt.toISOString(),
                lines: lines.map((line) => ({
                  accountId: line.accountId,
                  debit: String(line.debit ?? "0"),
                  credit: String(line.credit ?? "0"),
                })),
              }
            }),
            "accounting.revenue.replay",
          )
        const existing = yield* loadExisting()
        if (existing !== undefined) return existing
        const journal = yield* database.withTransaction(
          Effect.gen(function* () {
            const amount = yield* sales.getConfirmedOrderTotal({
              principal: decoded.principal,
              tenantId: decoded.tenantId,
              orderId: decoded.orderId,
            })
            const mutation = yield* database.transaction(
              async (tx) => {
                const profile = (await tx.select().from(revenuePostingProfiles).where(and(
                  eq(revenuePostingProfiles.tenantId, decoded.tenantId),
                  eq(revenuePostingProfiles.legalEntityId, decoded.legalEntityId),
                )).for("update"))[0]
                if (profile === undefined) return { _tag: "profile-missing" as const }
                const configuration = (await tx.select({
                  postingEnabled: legalEntityAccountingConfigurations.postingEnabled,
                })
                  .from(legalEntityAccountingConfigurations).where(and(
                    eq(legalEntityAccountingConfigurations.tenantId, decoded.tenantId),
                    eq(legalEntityAccountingConfigurations.legalEntityId, decoded.legalEntityId),
                  )).for("update"))[0]
                if (configuration?.postingEnabled !== true) {
                  return { _tag: "period-closed" as const }
                }
                const currentPeriod =
                  (await tx.select({ id: accountingPeriods.id }).from(accountingPeriods).where(and(
                    eq(accountingPeriods.tenantId, decoded.tenantId),
                    eq(accountingPeriods.legalEntityId, decoded.legalEntityId),
                    eq(accountingPeriods.status, "open"),
                    lte(accountingPeriods.startsOn, utcDate(clock)),
                    gte(accountingPeriods.endsOn, utcDate(clock)),
                  )).for("update"))[0]
                if (currentPeriod === undefined) return { _tag: "period-closed" as const }
                const entry = (await tx.insert(journalEntries).values({
                  tenantId: decoded.tenantId,
                  reference,
                }).returning({ id: journalEntries.id }))[0]!
                const lines: readonly JournalLine[] = [
                  { accountId: profile.receivableAccountId, debit: amount, credit: "0" },
                  { accountId: profile.revenueAccountId, debit: "0", credit: amount },
                ]
                await tx.insert(journalLines).values(lines.map((line) => ({
                  tenantId: decoded.tenantId,
                  entryId: entry.id,
                  ...line,
                })))
                const postedAt = now()
                const posted = (await tx.update(journalEntries).set({
                  status: "posted",
                  postedAt,
                  updatedAt: postedAt,
                })
                  .where(eq(journalEntries.id, entry.id)).returning(journalEntrySelection))[0]!
                return {
                  _tag: "posted" as const,
                  journal: {
                    id: posted.id,
                    tenantId: posted.tenantId,
                    reference: posted.reference,
                    status: "posted" as const,
                    postedAt: posted.postedAt!.toISOString(),
                    lines,
                  },
                }
              },
              "accounting.revenue.post",
            )
            if (mutation._tag === "posted") {
              const payload = yield* Schema.decodeUnknownEffect(RevenuePostedEventPayload)({
                journalId: mutation.journal.id,
                legalEntityId: decoded.legalEntityId,
                orderId: decoded.orderId,
              })
              yield* messaging.append({
                eventId: uuidv7(),
                eventType: AccountingRevenuePostedEvent.id,
                eventVersion: AccountingRevenuePostedEvent.version,
                tenantId: decoded.tenantId,
                aggregateType: AccountingRevenuePostedEvent.aggregateType,
                aggregateId: mutation.journal.id,
                commandId,
                correlationId,
                causationId,
                idempotencyKey: decoded.orderId,
                actorPrincipalId: decoded.principal.userAccountId,
                occurredAt: mutation.journal.postedAt,
                payload,
              })
            }
            return mutation
          }),
          "accounting.revenue.post.atomic",
        ).pipe(
          Effect.catchIf(
            (error): error is DatabaseFailure =>
              isDatabaseConstraint(error, "journal_entries_reference_key"),
            () =>
              Effect.gen(function* () {
                const existing = yield* loadExisting()
                if (existing === undefined) {
                  return yield* Effect.fail(
                    new JournalIdempotencyConflict({ tenantId: decoded.tenantId, reference }),
                  )
                }
                return { _tag: "posted" as const, journal: existing }
              }),
          ),
        )
        if (journal._tag === "profile-missing") {
          return yield* Effect.fail(
            new RevenuePostingProfileNotFound({
              tenantId: decoded.tenantId,
              legalEntityId: decoded.legalEntityId,
            }),
          )
        }
        if (journal._tag === "period-closed") {
          return yield* Effect.fail(
            new AccountingPeriodNotOpen({
              tenantId: decoded.tenantId,
              legalEntityId: decoded.legalEntityId,
            }),
          )
        }
        return journal.journal
      }),
    reverseRevenueForOrder: (input) =>
      Effect.gen(function* () {
        const decoded = yield* Schema.decodeUnknownEffect(ReverseRevenueForOrderInput)(input)
        yield* authorization.authorize({
          principal: decoded.principal,
          tenantId: decoded.tenantId,
          capability: AccountingCapabilities.revenueReverse,
        })
        yield* ensureLegacyEngine(decoded.tenantId, decoded.legalEntityId)
        const sourceReference = revenueReference(decoded.legalEntityId, decoded.orderId)
        const reference = reversalReference(decoded.legalEntityId, decoded.orderId)
        const journal = yield* database.transaction(
          async (tx) => {
            const existing = (await tx.select(journalEntrySelection).from(journalEntries).where(and(
              eq(journalEntries.tenantId, decoded.tenantId),
              eq(journalEntries.reference, reference),
            )).for("update"))[0]
            const sourceForExisting = existing === undefined
              ? undefined
              : (await tx.select({ id: journalEntries.id, status: journalEntries.status })
                .from(journalEntries).where(and(
                  eq(journalEntries.tenantId, decoded.tenantId),
                  eq(journalEntries.reference, sourceReference),
                )).for("update"))[0]
            const matchesSourceLines = async (
              entry: typeof existing,
              source: typeof sourceForExisting,
            ) => {
              if (
                entry === undefined || source === undefined || entry.status !== "reversed" ||
                entry.postedAt === null || source.status !== "posted" ||
                entry.reversesEntryId !== source.id
              ) return false
              const sourceLines = await tx.select(journalLineSelection).from(journalLines).where(
                and(
                  eq(journalLines.tenantId, decoded.tenantId),
                  eq(journalLines.entryId, source.id),
                ),
              )
              const reversalLines = await tx.select(journalLineSelection).from(journalLines).where(
                and(
                  eq(journalLines.tenantId, decoded.tenantId),
                  eq(journalLines.entryId, entry.id),
                ),
              )
              const expectedLines = sourceLines.map((line) => ({
                accountId: line.accountId,
                debit: String(line.credit ?? "0"),
                credit: String(line.debit ?? "0"),
              }))
              const actualLines = reversalLines.map((line) => ({
                accountId: line.accountId,
                debit: String(line.debit ?? "0"),
                credit: String(line.credit ?? "0"),
              }))
              return expectedLines.length === actualLines.length &&
                JSON.stringify(normalizeLines(expectedLines)) ===
                  JSON.stringify(normalizeLines(actualLines))
            }
            if (existing !== undefined) {
              return (await matchesSourceLines(existing, sourceForExisting))
                ? { _tag: "existing" as const, entry: existing }
                : { _tag: "idempotency-conflict" as const }
            }
            const profile =
              (await tx.select({ legalEntityId: revenuePostingProfiles.legalEntityId })
                .from(revenuePostingProfiles).where(and(
                  eq(revenuePostingProfiles.tenantId, decoded.tenantId),
                  eq(revenuePostingProfiles.legalEntityId, decoded.legalEntityId),
                )).for("update"))[0]
            if (profile === undefined) return { _tag: "profile-missing" as const }
            const concurrentExisting = (await tx.select(journalEntrySelection)
              .from(journalEntries).where(and(
                eq(journalEntries.tenantId, decoded.tenantId),
                eq(journalEntries.reference, reference),
              )).for("update"))[0]
            const sourceForConcurrentExisting = concurrentExisting === undefined
              ? undefined
              : (await tx.select({ id: journalEntries.id, status: journalEntries.status })
                .from(journalEntries).where(and(
                  eq(journalEntries.tenantId, decoded.tenantId),
                  eq(journalEntries.reference, sourceReference),
                )).for("update"))[0]
            if (concurrentExisting !== undefined) {
              return (await matchesSourceLines(concurrentExisting, sourceForConcurrentExisting))
                ? { _tag: "existing" as const, entry: concurrentExisting }
                : { _tag: "idempotency-conflict" as const }
            }
            const configuration = (await tx.select({
              postingEnabled: legalEntityAccountingConfigurations.postingEnabled,
            })
              .from(legalEntityAccountingConfigurations).where(and(
                eq(legalEntityAccountingConfigurations.tenantId, decoded.tenantId),
                eq(legalEntityAccountingConfigurations.legalEntityId, decoded.legalEntityId),
              )).for("update"))[0]
            const currentPeriod =
              (await tx.select({ id: accountingPeriods.id }).from(accountingPeriods).where(and(
                eq(accountingPeriods.tenantId, decoded.tenantId),
                eq(accountingPeriods.legalEntityId, decoded.legalEntityId),
                eq(accountingPeriods.status, "open"),
                lte(accountingPeriods.startsOn, utcDate(clock)),
                gte(accountingPeriods.endsOn, utcDate(clock)),
              )).for("update"))[0]
            if (configuration?.postingEnabled !== true || currentPeriod === undefined) {
              return { _tag: "period-closed" as const }
            }
            const source = (await tx.select(journalEntrySelection).from(journalEntries).where(and(
              eq(journalEntries.tenantId, decoded.tenantId),
              eq(journalEntries.reference, sourceReference),
            )).for("update"))[0]
            if (source === undefined || source.status !== "posted") {
              return { _tag: "source-missing" as const }
            }
            const sourceLines = await tx.select(journalLineSelection).from(journalLines).where(and(
              eq(journalLines.tenantId, decoded.tenantId),
              eq(journalLines.entryId, source.id),
            ))
            const lines = sourceLines.map((line) => ({
              accountId: line.accountId,
              debit: String(line.credit ?? "0"),
              credit: String(line.debit ?? "0"),
            }))
            const entry = (await tx.insert(journalEntries).values({
              tenantId: decoded.tenantId,
              reference,
            }).returning({ id: journalEntries.id }))[0]!
            await tx.insert(journalLines).values(lines.map((line) => ({
              tenantId: decoded.tenantId,
              entryId: entry.id,
              ...line,
            })))
            const postedAt = now()
            const posted = (await tx.update(journalEntries).set({
              status: "reversed",
              reversesEntryId: source.id,
              postedAt,
              updatedAt: postedAt,
            })
              .where(eq(journalEntries.id, entry.id)).returning(journalEntrySelection))[0]!
            return {
              _tag: "reversed" as const,
              journal: {
                id: posted.id,
                tenantId: posted.tenantId,
                reference: posted.reference,
                status: "reversed" as const,
                postedAt: posted.postedAt!.toISOString(),
                reversesEntryId: source.id,
                lines,
              },
            }
          },
          "accounting.revenue.reverse",
        )
        if (journal._tag === "profile-missing") {
          return yield* Effect.fail(
            new RevenuePostingProfileNotFound({
              tenantId: decoded.tenantId,
              legalEntityId: decoded.legalEntityId,
            }),
          )
        }
        if (journal._tag === "period-closed") {
          return yield* Effect.fail(
            new AccountingPeriodNotOpen({
              tenantId: decoded.tenantId,
              legalEntityId: decoded.legalEntityId,
            }),
          )
        }
        if (journal._tag === "idempotency-conflict") {
          return yield* Effect.fail(
            new JournalIdempotencyConflict({ tenantId: decoded.tenantId, reference }),
          )
        }
        if (journal._tag === "source-missing") {
          return yield* Effect.fail(
            new RevenueJournalNotFound({
              tenantId: decoded.tenantId,
              legalEntityId: decoded.legalEntityId,
              orderId: decoded.orderId,
            }),
          )
        }
        if (journal._tag === "existing") {
          const lines = yield* database.query(
            (db) =>
              db.select(journalLineSelection).from(journalLines).where(and(
                eq(journalLines.tenantId, decoded.tenantId),
                eq(journalLines.entryId, journal.entry.id),
              )),
            "accounting.revenue_reversal.lines.lookup",
          )
          return {
            id: journal.entry.id,
            tenantId: journal.entry.tenantId,
            reference,
            status: "reversed" as const,
            postedAt: journal.entry.postedAt!.toISOString(),
            lines: lines.map((line) => ({
              accountId: line.accountId,
              debit: String(line.debit ?? "0"),
              credit: String(line.credit ?? "0"),
            })),
          }
        }
        return journal.journal
      }),
    postJournal: (input) =>
      Effect.gen(function* () {
        const decoded = yield* Schema.decodeUnknownEffect(PostJournalInput)(input)
        yield* authorization.authorize({
          principal: decoded.principal,
          tenantId: decoded.tenantId,
          capability: AccountingCapabilities.journalPost,
        })
        yield* ensureLegacyTenantEngine(decoded.tenantId)
        const lineError = validateLines(decoded.lines)
        if (lineError !== undefined) return yield* Effect.fail(lineError)
        const reference = decoded.reference.trim()

        const loadExisting = () =>
          Effect.gen(function* () {
            const entries = yield* database.query(
              (db) =>
                db.select(journalEntrySelection)
                  .from(journalEntries)
                  .where(
                    and(
                      eq(journalEntries.tenantId, decoded.tenantId),
                      eq(journalEntries.reference, reference),
                    ),
                  ),
              "accounting.journal.lookup",
            )
            const entry = entries[0]
            if (entry === undefined || entry.status !== "posted" || entry.postedAt === null) {
              return yield* Effect.fail(
                new JournalReferenceAlreadyExists({
                  tenantId: decoded.tenantId,
                  reference,
                }),
              )
            }
            const lines = yield* database.query(
              (db) =>
                db.select(journalLineSelection)
                  .from(journalLines)
                  .where(
                    and(
                      eq(journalLines.tenantId, decoded.tenantId),
                      eq(journalLines.entryId, entry.id),
                    ),
                  ),
              "accounting.journal.lines.lookup",
            )
            const storedLines = lines.map((line) => ({
              accountId: line.accountId,
              debit: String(line.debit ?? "0"),
              credit: String(line.credit ?? "0"),
            }))
            if (
              JSON.stringify(normalizeLines(storedLines)) !==
                JSON.stringify(normalizeLines(decoded.lines))
            ) {
              return yield* Effect.fail(
                new JournalIdempotencyConflict({
                  tenantId: decoded.tenantId,
                  reference,
                }),
              )
            }
            return {
              id: entry.id,
              tenantId: entry.tenantId,
              reference: entry.reference,
              status: "posted" as const,
              postedAt: entry.postedAt.toISOString(),
              lines: decoded.lines,
            }
          })

        const result = yield* database.transaction(
          async (tx) => {
            const existingEntries = await tx.select(journalEntrySelection)
              .from(journalEntries)
              .where(
                and(
                  eq(journalEntries.tenantId, decoded.tenantId),
                  eq(journalEntries.reference, reference),
                ),
              )
              .for("update")
            const existing = existingEntries[0]
            if (existing !== undefined) {
              if (existing.status !== "posted" || existing.postedAt === null) {
                return { _tag: "idempotency-conflict" as const }
              }
              const lines = await tx.select(journalLineSelection)
                .from(journalLines)
                .where(
                  and(
                    eq(journalLines.tenantId, decoded.tenantId),
                    eq(journalLines.entryId, existing.id),
                  ),
                )
              const storedLines = lines.map((line) => ({
                accountId: line.accountId,
                debit: String(line.debit ?? "0"),
                credit: String(line.credit ?? "0"),
              }))
              if (
                JSON.stringify(normalizeLines(storedLines)) !==
                  JSON.stringify(normalizeLines(decoded.lines))
              ) {
                return { _tag: "idempotency-conflict" as const }
              }
              return {
                _tag: "existing" as const,
                journal: {
                  id: existing.id,
                  tenantId: existing.tenantId,
                  reference: existing.reference,
                  status: "posted" as const,
                  postedAt: existing.postedAt.toISOString(),
                  lines: decoded.lines,
                },
              }
            }

            const entry = (await tx.insert(journalEntries).values({
              tenantId: decoded.tenantId,
              reference,
            }).returning({ id: journalEntries.id }))[0]!

            await tx.insert(journalLines).values(
              decoded.lines.map((line) => ({
                tenantId: decoded.tenantId,
                entryId: entry.id,
                accountId: line.accountId,
                debit: line.debit,
                credit: line.credit,
              })),
            )

            const postedAt = now()
            const posted = (await tx.update(journalEntries)
              .set({ status: "posted", postedAt, updatedAt: postedAt })
              .where(eq(journalEntries.id, entry.id))
              .returning(journalEntrySelection))[0]!
            return {
              _tag: "created" as const,
              journal: {
                id: posted.id,
                tenantId: posted.tenantId,
                reference: posted.reference,
                status: "posted" as const,
                postedAt: posted.postedAt!.toISOString(),
                lines: decoded.lines,
              },
            }
          },
          "accounting.journal.post",
        ).pipe(
          Effect.mapError((error) => {
            if (isDatabaseConstraint(error, "journal_lines_account_fkey", "23503")) {
              return new AccountNotFound({ tenantId: decoded.tenantId })
            }
            if (isDatabaseConstraint(error, "journal_entries_reference_key")) {
              return new JournalReferenceAlreadyExists({
                tenantId: decoded.tenantId,
                reference,
              })
            }
            return error
          }),
          Effect.result,
        )
        if (Result.isFailure(result)) {
          if (result.failure instanceof JournalReferenceAlreadyExists) return yield* loadExisting()
          return yield* Effect.fail(result.failure)
        }
        if (result.success._tag === "idempotency-conflict") {
          return yield* Effect.fail(
            new JournalIdempotencyConflict({
              tenantId: decoded.tenantId,
              reference,
            }),
          )
        }
        return result.success.journal
      }),
  }
  return withAccountingOperationNames(service)
})

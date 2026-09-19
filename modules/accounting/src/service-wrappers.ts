import * as Effect from "effect/Effect"

import { AccountingService } from "./contract.ts"

export const withAccountingOperationNames = (service: AccountingService): AccountingService => ({
  configureLegalEntity: Effect.fn("AccountingService.configureLegalEntity")((input: unknown) =>
    service.configureLegalEntity(input)
  ),
  recordFinancialVerificationArtifact: Effect.fn(
    "AccountingService.recordFinancialVerificationArtifact",
  )((input: unknown) => service.recordFinancialVerificationArtifact(input)),
  recordFinancialStagingEvidence: Effect.fn(
    "AccountingService.recordFinancialStagingEvidence",
  )((input: unknown) => service.recordFinancialStagingEvidence(input)),
  listFinancialStagingEvidence: Effect.fn(
    "AccountingService.listFinancialStagingEvidence",
  )((input: unknown) => service.listFinancialStagingEvidence(input)),
  prepareTigerBeetleCutover: Effect.fn("AccountingService.prepareTigerBeetleCutover")((
    input: unknown,
  ) => service.prepareTigerBeetleCutover(input)),
  approveTigerBeetleCutover: Effect.fn("AccountingService.approveTigerBeetleCutover")((
    input: unknown,
  ) => service.approveTigerBeetleCutover(input)),
  activateTigerBeetleCutover: Effect.fn("AccountingService.activateTigerBeetleCutover")((
    input: unknown,
  ) => service.activateTigerBeetleCutover(input)),
  listAccountingConfigurations: Effect.fn("AccountingService.listAccountingConfigurations")((
    input: unknown,
  ) => service.listAccountingConfigurations(input)),
  listAccounts: Effect.fn("AccountingService.listAccounts")((input: unknown) =>
    service.listAccounts(input)
  ),
  listAccountingPeriods: Effect.fn("AccountingService.listAccountingPeriods")((input: unknown) =>
    service.listAccountingPeriods(input)
  ),
  listRevenuePostingProfiles: Effect.fn(
    "AccountingService.listRevenuePostingProfiles",
  )((input: unknown) => service.listRevenuePostingProfiles(input)),
  listJournalEntries: Effect.fn("AccountingService.listJournalEntries")((input: unknown) =>
    service.listJournalEntries(input)
  ),
  createAccount: Effect.fn("AccountingService.createAccount")((input: unknown) =>
    service.createAccount(input)
  ),
  configureRevenuePosting: Effect.fn("AccountingService.configureRevenuePosting")((
    input: unknown,
  ) => service.configureRevenuePosting(input)),
  openPeriod: Effect.fn("AccountingService.openPeriod")((input: unknown) =>
    service.openPeriod(input)
  ),
  closePeriod: Effect.fn("AccountingService.closePeriod")((input: unknown) =>
    service.closePeriod(input)
  ),
  postRevenueForOrder: Effect.fn("AccountingService.postRevenueForOrder")((input: unknown) =>
    service.postRevenueForOrder(input)
  ),
  reverseRevenueForOrder: Effect.fn("AccountingService.reverseRevenueForOrder")((input: unknown) =>
    service.reverseRevenueForOrder(input)
  ),
  postJournal: Effect.fn("AccountingService.postJournal")((input: unknown) =>
    service.postJournal(input)
  ),
})

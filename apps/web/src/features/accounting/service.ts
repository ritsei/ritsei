import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import {
  Account,
  AccountingConfiguration,
  AccountingPeriod,
  accountingRoutes,
  ClosePeriodInput,
  ConfigureLegalEntityInput,
  ConfigureRevenuePostingInput,
  CreateAccountInput,
  JournalEntry,
  ListAccountingConfigurationsInput,
  ListAccountingPeriodsInput,
  ListAccountsInput,
  ListJournalEntriesInput,
  ListRevenuePostingProfilesInput,
  OpenPeriodInput,
  PostJournalInput,
  RevenuePostingProfile,
} from "../../shared/contracts/generated/accounting.ts"
import {
  BrowserConnection,
  decodeInput,
  decodeResponse,
  definedFields,
  mutationRequest,
  querySuffix,
  RequestFailure,
  requestJson,
  responseListMatches,
  responseMatches,
} from "../../shared/api.ts"

const ConfigurationList = Schema.Array(AccountingConfiguration).check(Schema.isMaxLength(200))
const AccountList = Schema.Array(Account).check(Schema.isMaxLength(200))
const PeriodList = Schema.Array(AccountingPeriod).check(Schema.isMaxLength(200))
const RevenuePostingProfileList = Schema.Array(RevenuePostingProfile).check(
  Schema.isMaxLength(200),
)
const JournalEntryList = Schema.Array(JournalEntry).check(Schema.isMaxLength(200))

const exactMinor = (value: string): bigint => {
  const [whole, fraction = ""] = value.split(".")
  return BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, "0"))
}

const validJournal = (journal: JournalEntry): boolean => {
  const linesAreValid = journal.lines.every((line) => {
    const debit = exactMinor(line.debit)
    const credit = exactMinor(line.credit)
    return (debit > 0n) !== (credit > 0n)
  })
  const totals = journal.lines.reduce(
    (sum, line) => ({
      debit: sum.debit + exactMinor(line.debit),
      credit: sum.credit + exactMinor(line.credit),
    }),
    { debit: 0n, credit: 0n },
  )
  return linesAreValid && totals.debit === totals.credit && (
    journal.status === "reversed"
      ? journal.reversesEntryId !== undefined
      : journal.reversesEntryId === undefined
  )
}

export const listConfigurations = Effect.fn("Frontend.Accounting.listConfigurations")(
  function* (input: unknown = {}) {
    const decoded = yield* decodeInput(ListAccountingConfigurationsInput, input)
    const body = yield* requestJson(`${accountingRoutes.listConfigurations}${querySuffix(decoded)}`)
    const configurations = yield* decodeResponse(ConfigurationList, body)
    const connection = yield* BrowserConnection
    if (
      !responseListMatches(configurations, {
        tenantId: connection.tenantId,
        ...definedFields({ legalEntityId: decoded.legalEntityId }),
      })
    ) {
      return yield* Effect.fail(new RequestFailure({ kind: "invalid-response" }))
    }
    return configurations
  },
)

export const listAccounts = Effect.fn("Frontend.Accounting.listAccounts")(
  function* (input: unknown = {}) {
    const decoded = yield* decodeInput(ListAccountsInput, input)
    const body = yield* requestJson(`${accountingRoutes.listAccounts}${querySuffix(decoded)}`)
    const accounts = yield* decodeResponse(AccountList, body)
    const connection = yield* BrowserConnection
    if (
      !responseListMatches(accounts, {
        tenantId: connection.tenantId,
        ...definedFields({ type: decoded.type }),
      })
    ) {
      return yield* Effect.fail(new RequestFailure({ kind: "invalid-response" }))
    }
    return accounts
  },
)

export const listPeriods = Effect.fn("Frontend.Accounting.listPeriods")(
  function* (input: unknown = {}) {
    const decoded = yield* decodeInput(ListAccountingPeriodsInput, input)
    const body = yield* requestJson(`${accountingRoutes.listPeriods}${querySuffix(decoded)}`)
    const periods = yield* decodeResponse(PeriodList, body)
    const connection = yield* BrowserConnection
    if (
      !responseListMatches(periods, {
        tenantId: connection.tenantId,
        ...definedFields({ legalEntityId: decoded.legalEntityId, status: decoded.status }),
      })
    ) {
      return yield* Effect.fail(new RequestFailure({ kind: "invalid-response" }))
    }
    return periods
  },
)

export const listRevenuePostingProfiles = Effect.fn(
  "Frontend.Accounting.listRevenuePostingProfiles",
)(function* (input: unknown = {}) {
  const decoded = yield* decodeInput(ListRevenuePostingProfilesInput, input)
  const body = yield* requestJson(
    `${accountingRoutes.listRevenuePostingProfiles}${querySuffix(decoded)}`,
  )
  const profiles = yield* decodeResponse(RevenuePostingProfileList, body)
  const connection = yield* BrowserConnection
  if (
    !responseListMatches(profiles, {
      tenantId: connection.tenantId,
      ...definedFields({ legalEntityId: decoded.legalEntityId }),
    })
  ) {
    return yield* Effect.fail(new RequestFailure({ kind: "invalid-response" }))
  }
  return profiles
})

export const configureLegalEntity = Effect.fn("Frontend.Accounting.configureLegalEntity")(
  function* (legalEntityId: unknown, input: unknown) {
    const decodedId = yield* decodeInput(Schema.String.check(Schema.isUUID()), legalEntityId)
    const decoded = yield* decodeInput(ConfigureLegalEntityInput, input)
    const body = yield* mutationRequest(
      accountingRoutes.configureLegalEntity.replace(":id", encodeURIComponent(decodedId)),
      decoded,
    )
    const configuration = yield* decodeResponse(
      AccountingConfiguration,
      body,
      "unknown-outcome",
    )
    const connection = yield* BrowserConnection
    if (
      !responseMatches(configuration, {
        tenantId: connection.tenantId,
        legalEntityId: decodedId,
        baseCurrency: decoded.baseCurrency.trim().toUpperCase(),
        precision: 2,
        fiscalYearStartMonth: decoded.fiscalYearStartMonth,
        postingEnabled: decoded.postingEnabled,
        financialEngine: decoded.financialEngine ?? "postgresql",
      })
    ) {
      return yield* Effect.fail(new RequestFailure({ kind: "unknown-outcome" }))
    }
    return configuration
  },
)

export const configureRevenuePosting = Effect.fn(
  "Frontend.Accounting.configureRevenuePosting",
)(function* (input: unknown) {
  const decoded = yield* decodeInput(ConfigureRevenuePostingInput, input)
  const body = yield* mutationRequest(accountingRoutes.configureRevenuePosting, decoded)
  const profile = yield* decodeResponse(RevenuePostingProfile, body, "unknown-outcome")
  const connection = yield* BrowserConnection
  if (
    !responseMatches(profile, {
      tenantId: connection.tenantId,
      legalEntityId: decoded.legalEntityId,
      receivableAccountId: decoded.receivableAccountId,
      revenueAccountId: decoded.revenueAccountId,
    })
  ) {
    return yield* Effect.fail(new RequestFailure({ kind: "unknown-outcome" }))
  }
  return profile
})

export const openPeriod = Effect.fn("Frontend.Accounting.openPeriod")(
  function* (input: unknown) {
    const decoded = yield* decodeInput(OpenPeriodInput, input)
    const body = yield* mutationRequest(accountingRoutes.openPeriod, decoded)
    const period = yield* decodeResponse(AccountingPeriod, body, "unknown-outcome")
    const connection = yield* BrowserConnection
    if (
      !responseMatches(period, {
        tenantId: connection.tenantId,
        legalEntityId: decoded.legalEntityId,
        startsOn: decoded.startsOn,
        endsOn: decoded.endsOn,
        status: "open",
      })
    ) {
      return yield* Effect.fail(new RequestFailure({ kind: "unknown-outcome" }))
    }
    return period
  },
)

export const closePeriod = Effect.fn("Frontend.Accounting.closePeriod")(
  function* (periodId: unknown, input: unknown) {
    const decodedId = yield* decodeInput(Schema.String.check(Schema.isUUID()), periodId)
    const decoded = yield* decodeInput(ClosePeriodInput, input)
    const body = yield* mutationRequest(
      accountingRoutes.closePeriod.replace(":id", encodeURIComponent(decodedId)),
      decoded,
    )
    const period = yield* decodeResponse(AccountingPeriod, body, "unknown-outcome")
    const connection = yield* BrowserConnection
    if (
      !responseMatches(period, {
        tenantId: connection.tenantId,
        id: decodedId,
        legalEntityId: decoded.legalEntityId,
        status: "closed",
      })
    ) {
      return yield* Effect.fail(new RequestFailure({ kind: "unknown-outcome" }))
    }
    return period
  },
)

export const createAccount = Effect.fn("Frontend.Accounting.createAccount")(
  function* (input: unknown) {
    const decoded = yield* decodeInput(CreateAccountInput, input)
    const body = yield* mutationRequest(accountingRoutes.createAccount, decoded)
    const account = yield* decodeResponse(Account, body, "unknown-outcome")
    const connection = yield* BrowserConnection
    if (
      !responseMatches(account, {
        tenantId: connection.tenantId,
        code: decoded.code.trim().toUpperCase(),
        name: decoded.name.trim(),
        type: decoded.type,
      })
    ) {
      return yield* Effect.fail(new RequestFailure({ kind: "unknown-outcome" }))
    }
    return account
  },
)

export const postJournal = Effect.fn("Frontend.Accounting.postJournal")(
  function* (input: unknown) {
    const decoded = yield* decodeInput(PostJournalInput, input)
    const body = yield* mutationRequest(accountingRoutes.postJournal, decoded)
    const journal = yield* decodeResponse(JournalEntry, body, "unknown-outcome")
    const connection = yield* BrowserConnection
    if (
      !responseMatches(journal, {
        tenantId: connection.tenantId,
        status: "posted",
        reference: decoded.reference.trim(),
      }) || !validJournal(journal)
    ) {
      return yield* Effect.fail(new RequestFailure({ kind: "unknown-outcome" }))
    }
    return journal
  },
)

export const listJournals = Effect.fn("Frontend.Accounting.listJournals")(
  function* (input: unknown = {}) {
    const decoded = yield* decodeInput(ListJournalEntriesInput, input)
    const body = yield* requestJson(`${accountingRoutes.listJournals}${querySuffix(decoded)}`)
    const journals = yield* decodeResponse(JournalEntryList, body)
    const connection = yield* BrowserConnection
    if (
      !responseListMatches(journals, {
        tenantId: connection.tenantId,
        ...definedFields({ status: decoded.status }),
      }) ||
      journals.some((journal) => !validJournal(journal))
    ) {
      return yield* Effect.fail(new RequestFailure({ kind: "invalid-response" }))
    }
    return journals
  },
)

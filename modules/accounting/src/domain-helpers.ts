import * as Clock from "effect/Clock"

import { requireExactMajorToMinor } from "../../../foundation/mod.ts"
import { JournalLine } from "./contract.ts"
import { InvalidJournalLine, UnbalancedJournal } from "./errors.ts"

const toMinor = (value: string) => requireExactMajorToMinor(value, 2)

export const revenueReference = (legalEntityId: string, orderId: string) =>
  `revenue:${legalEntityId}:${orderId}`

export const reversalReference = (legalEntityId: string, orderId: string) =>
  `revenue-reversal:${legalEntityId}:${orderId}`

export const utcDate = (clock: Clock.Clock) =>
  new Date(clock.currentTimeMillisUnsafe()).toISOString().slice(0, 10)

export const normalizeLines = (lines: readonly JournalLine[]) =>
  lines.map((line) => `${line.accountId}:${toMinor(line.debit)}:${toMinor(line.credit)}`).toSorted()

export const validateLines = (lines: readonly JournalLine[]) => {
  if (lines.length < 2) return new UnbalancedJournal({ debit: "0", credit: "0" })
  let debit = 0n
  let credit = 0n
  for (const [index, line] of lines.entries()) {
    const lineDebit = toMinor(line.debit)
    const lineCredit = toMinor(line.credit)
    if ((lineDebit > 0n) === (lineCredit > 0n)) return new InvalidJournalLine({ index })
    debit += lineDebit
    credit += lineCredit
  }
  return debit === credit
    ? undefined
    : new UnbalancedJournal({ debit: String(debit), credit: String(credit) })
}

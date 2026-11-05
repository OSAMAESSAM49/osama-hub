/** Money is always stored as an integer number of piastres. No floating-point arithmetic touches it. */

import type { PartnerRate } from '@/types/models'

export const MAX_AMOUNT_MINOR = 100_000_000_000

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩'
const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹'

export function normalizeDigits(input: string): string {
  return input
    .replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String(PERSIAN_DIGITS.indexOf(d)))
    .replace(/٫/g, '.')
    .replace(/[٬,\s]/g, '')
}

/** Parses "1,250.50" or "١٢٥٠٫٥" into piastres by string handling, or returns null if invalid. */
export function parseAmount(input: string): number | null {
  const s = normalizeDigits(input)
  if (!/^\d+(\.\d{0,2})?$|^\.\d{1,2}$/.test(s)) return null
  const [whole = '0', frac = ''] = s.split('.')
  const minor = Number(whole || '0') * 100 + Number(frac.padEnd(2, '0') || '0')
  if (!Number.isSafeInteger(minor) || minor <= 0 || minor > MAX_AMOUNT_MINOR) return null
  return minor
}

/** Plain decimal text for editing and for CSV export, without float maths: 125050 → "1250.50". */
export function minorToDecimal(minor: number): string {
  const sign = minor < 0 ? '-' : ''
  const abs = Math.abs(minor)
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
}

/** Formats with Latin digits for financial clarity, showing piastres only when present. */
export function formatMoney(minor: number, lang: 'ar' | 'en' = 'ar', withUnit = true): string {
  const abs = Math.abs(minor)
  const whole = Math.floor(abs / 100)
  const frac = abs % 100
  const num = whole.toLocaleString('en-US') + (frac ? `.${String(frac).padStart(2, '0')}` : '')
  // The left-to-right mark keeps the minus sign in front of the number inside RTL text.
  const sign = minor < 0 ? '‎-' : ''
  if (!withUnit) return `${sign}${num}`
  return lang === 'ar' ? `${sign}${num} ج.م` : `${sign}EGP ${num}`
}

/** Rounds half up on integers: amount × bp / 10000. */
export function applyBasisPoints(amountMinor: number, bp: number): number {
  return Math.floor((amountMinor * bp + 5000) / 10000)
}

/** The rate in force on a date. Rates are effective-dated, so changing it never rewrites history. */
export function rateOn(date: string, rates: PartnerRate[]): number {
  const sorted = [...rates].sort((a, b) => a.from.localeCompare(b.from))
  let current = sorted[0]
  for (const r of sorted) if (r.from <= date) current = r
  return current?.bp ?? 0
}

interface DatedAmount {
  amountMinor: number
  date: string
}

/**
 * Partner share = (income - expenses) × partner rate, worked out month by month.
 * A month that ends in a loss earns no share, and its loss does not carry into other months, so a
 * year's share always equals the sum of its months. Rounding happens once per month and rate, so
 * totals do not drift with the number of transactions.
 */
export function partnerShare(incomes: DatedAmount[], expenses: DatedAmount[], rates: PartnerRate[]): number {
  const nets = new Map<string, { bp: number; net: number }>()
  const add = (row: DatedAmount, sign: 1 | -1) => {
    const bp = rateOn(row.date, rates)
    const key = `${row.date.slice(0, 7)}|${bp}`
    const entry = nets.get(key) ?? { bp, net: 0 }
    entry.net += sign * row.amountMinor
    nets.set(key, entry)
  }
  for (const i of incomes) add(i, 1)
  for (const e of expenses) add(e, -1)
  let total = 0
  for (const { bp, net } of nets.values()) if (net > 0) total += applyBasisPoints(net, bp)
  return total
}

export interface FinanceSummary {
  income: number
  expenses: number
  partnerShare: number
  /** Net = income - expenses - partner share. Payments to the partner are not subtracted again. */
  net: number
}

export function summarize(
  incomes: DatedAmount[],
  expenses: DatedAmount[],
  rates: PartnerRate[],
): FinanceSummary {
  const income = sum(incomes)
  const exp = sum(expenses)
  const share = partnerShare(incomes, expenses, rates)
  return { income, expenses: exp, partnerShare: share, net: income - exp - share }
}

/**
 * Partner balance. Payments settle a liability that was already deducted through the share, so they
 * reduce what is owed and never touch the net result. A negative balance means an overpayment.
 */
export function partnerBalance(
  allIncome: DatedAmount[],
  allExpenses: DatedAmount[],
  allPayments: { amountMinor: number }[],
  rates: PartnerRate[],
) {
  const owed = partnerShare(allIncome, allExpenses, rates)
  const paid = sum(allPayments)
  return { owed, paid, balance: owed - paid }
}

export function sum(items: { amountMinor: number }[]): number {
  return items.reduce((t, i) => t + i.amountMinor, 0)
}

/** Basis points to a display percentage, without floats: 550 → "5.5". */
export function bpToPercent(bp: number): string {
  const whole = Math.floor(bp / 100)
  const frac = bp % 100
  return frac ? `${whole}.${String(frac).padStart(2, '0').replace(/0$/, '')}` : String(whole)
}

export function percentToBp(input: string): number | null {
  const s = normalizeDigits(input)
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(s)) return null
  const [w = '0', f = ''] = s.split('.')
  const bp = Number(w) * 100 + Number(f.padEnd(2, '0') || '0')
  return bp <= 10000 ? bp : null
}

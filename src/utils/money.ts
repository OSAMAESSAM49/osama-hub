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

/**
 * Partner share = gross income × partner rate. It is computed on GROSS income, never on profit.
 * Income is grouped by rate and rounded per group, so totals do not drift with transaction count.
 */
export function partnerShare(incomes: { amountMinor: number; date: string }[], rates: PartnerRate[]): number {
  const byRate = new Map<number, number>()
  for (const i of incomes) {
    const bp = rateOn(i.date, rates)
    byRate.set(bp, (byRate.get(bp) ?? 0) + i.amountMinor)
  }
  let total = 0
  for (const [bp, amount] of byRate) total += applyBasisPoints(amount, bp)
  return total
}

export interface FinanceSummary {
  income: number
  expenses: number
  partnerShare: number
  /** Net = income - expenses - partner share. Payments to the partner are NOT subtracted. */
  net: number
}

export function summarize(
  incomes: { amountMinor: number; date: string }[],
  expenses: { amountMinor: number }[],
  rates: PartnerRate[],
): FinanceSummary {
  const income = sum(incomes)
  const exp = sum(expenses)
  const share = partnerShare(incomes, rates)
  return { income, expenses: exp, partnerShare: share, net: income - exp - share }
}

/**
 * Partner balance. Payments settle a liability that was already deducted through the share, so they
 * reduce what is owed and never touch the net result. A negative balance means an overpayment.
 */
export function partnerBalance(
  allIncome: { amountMinor: number; date: string }[],
  allPayments: { amountMinor: number }[],
  rates: PartnerRate[],
) {
  const owed = partnerShare(allIncome, rates)
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

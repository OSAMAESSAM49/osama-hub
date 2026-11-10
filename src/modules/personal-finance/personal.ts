import { tr } from '@/i18n'
import type { FinanceCategory, PersonalTransaction } from '@/types/models'
import { daysBetween, type DateRange, inRange } from '@/utils/dates'
import { downloadCsv } from '@/utils/csv'
import { minorToDecimal } from '@/utils/money'

export interface PersonalSummary {
  income: number
  expenses: number
  /** What is left: income - expenses. Negative means more was spent than came in. */
  balance: number
  count: number
}

export function personalSummary(rows: Pick<PersonalTransaction, 'kind' | 'amountMinor'>[]): PersonalSummary {
  let income = 0
  let expenses = 0
  for (const r of rows) {
    if (r.kind === 'income') income += r.amountMinor
    else expenses += r.amountMinor
  }
  return { income, expenses, balance: income - expenses, count: rows.length }
}

/**
 * Average spending per day over the days of the range that have already happened, so a month in
 * progress is not diluted by days still to come. Rounded down to whole piastres.
 */
export function dailyAverage(expensesMinor: number, range: DateRange, today: string): number {
  const end = range.to < today ? range.to : today
  if (end < range.from) return 0
  const days = daysBetween(range.from, end) + 1
  return Math.floor(expensesMinor / days)
}

export const inPeriod = <T extends { date: string }>(rows: T[], range: DateRange) => rows.filter((r) => inRange(r.date, range))

const catLabel = (list: FinanceCategory[], id: string) => {
  const c = list.find((x) => x.id === id)
  if (!c) return id
  return tr(c.ar, c.en)
}

export function exportPersonal(rows: PersonalTransaction[], incomeCats: FinanceCategory[], expenseCats: FinanceCategory[], range: DateRange) {
  const header = [tr('النوع', 'Type'), tr('التاريخ', 'Date'), tr('المبلغ (ج.م)', 'Amount (EGP)'), tr('التصنيف', 'Category'), tr('الوصف', 'Description'), tr('طريقة الدفع', 'Payment method'), tr('ملاحظات', 'Notes')]
  const body = inPeriod(rows, range)
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt))
    .map((r) => [
      r.kind === 'income' ? tr('دخل', 'Income') : tr('مصروف', 'Expense'),
      r.date,
      minorToDecimal(r.amountMinor),
      catLabel(r.kind === 'income' ? incomeCats : expenseCats, r.categoryId),
      r.description,
      r.paymentMethod,
      r.notes,
    ])
  const s = personalSummary(inPeriod(rows, range))
  const totals = [
    [],
    [tr('إجمالي الدخل', 'Total income'), '', minorToDecimal(s.income)],
    [tr('إجمالي المصروف', 'Total spent'), '', minorToDecimal(s.expenses)],
    [tr('المتبقي', 'Left over'), '', minorToDecimal(s.balance)],
  ]
  downloadCsv([header, ...body, ...totals], `osama-hub-personal_${range.from}_${range.to}.csv`)
}

import type { AppSettings, Expense, FinanceCategory, Income, PartnerPayment } from '@/types/models'
import { addDays, type DateRange, formatMonth, inRange, monthKey, parseDate, todayStr, yearKey } from '@/utils/dates'
import { downloadCsv } from '@/utils/csv'
import { minorToDecimal, partnerShare, rateOn, summarize, sum, bpToPercent } from '@/utils/money'
import { tr, getLang } from '@/i18n'

export const catName = (list: FinanceCategory[], id: string) => {
  const c = list.find((x) => x.id === id)
  if (!c) return id
  return getLang() === 'ar' ? c.ar : c.en
}

export interface PeriodRow {
  key: string
  label: string
  income: number
  expenses: number
  partner: number
  net: number
}

const group = <T extends { date: string }>(rows: T[], keyOf: (d: string) => string) => {
  const m = new Map<string, T[]>()
  for (const r of rows) {
    const k = keyOf(r.date)
    const arr = m.get(k)
    if (arr) arr.push(r)
    else m.set(k, [r])
  }
  return m
}

export function periodRows(
  incomes: Income[], expenses: Expense[], settings: AppSettings, keys: string[], keyOf: (d: string) => string, labelOf: (k: string) => string,
): PeriodRow[] {
  const inc = group(incomes, keyOf)
  const exp = group(expenses, keyOf)
  return keys.map((key) => {
    const s = summarize(inc.get(key) ?? [], exp.get(key) ?? [], settings.partnerRates)
    return { key, label: labelOf(key), income: s.income, expenses: s.expenses, partner: s.partnerShare, net: s.net }
  })
}

/** The right bucket size for a range: days up to two months, months up to three years, then years. */
export function trendBuckets(input: DateRange): { keys: string[]; keyOf: (d: string) => string; labelOf: (k: string) => string } {
  const lang = getLang()
  // A trend stops at today. Future periods have no data yet, and a zero there would read as a loss.
  const today = todayStr()
  const range = input.from <= today && input.to > today ? { from: input.from, to: today } : input
  const days = Math.round((parseDate(range.to).getTime() - parseDate(range.from).getTime()) / 86_400_000) + 1
  if (days <= 62) {
    const keys: string[] = []
    for (let d = range.from; d <= range.to; d = addDays(d, 1)) keys.push(d)
    return { keys, keyOf: (d) => d, labelOf: (k) => String(parseDate(k).getDate()) }
  }
  if (days <= 1100) {
    const keys: string[] = []
    let k = monthKey(range.from)
    const end = monthKey(range.to)
    while (k <= end) {
      keys.push(k)
      const d = parseDate(`${k}-01`)
      d.setMonth(d.getMonth() + 1)
      k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    }
    return { keys, keyOf: monthKey, labelOf: (m) => formatMonth(m, lang, true) }
  }
  const keys: string[] = []
  for (let y = Number(yearKey(range.from)); y <= Number(yearKey(range.to)); y++) keys.push(String(y))
  return { keys, keyOf: yearKey, labelOf: (y) => y }
}

export function categoryTotals(rows: { amountMinor: number; categoryId: string }[], cats: FinanceCategory[]) {
  const m = new Map<string, number>()
  for (const r of rows) m.set(r.categoryId, (m.get(r.categoryId) ?? 0) + r.amountMinor)
  const total = sum(rows)
  return [...m.entries()]
    .map(([id, amount]) => ({ id, name: catName(cats, id), amount, share: total ? (amount / total) * 100 : 0 }))
    .sort((a, b) => b.amount - a.amount)
}

// ── CSV exports. Amounts are exact decimals produced from integers. ──
const stamp = (r: DateRange) => `${r.from}_${r.to}`

export function exportTransactions(incomes: Income[], expenses: Expense[], settings: AppSettings, range: DateRange) {
  const rows: (string | number)[][] = [[
    tr('النوع', 'Type'), tr('التاريخ', 'Date'), tr('المبلغ (ج.م)', 'Amount (EGP)'), tr('التصنيف', 'Category'), tr('الإجراء', 'Procedure'),
    tr('المريض', 'Patient'), tr('المورد', 'Supplier'), tr('طريقة الدفع', 'Payment method'), tr('الوصف', 'Description'), tr('ملاحظات', 'Notes'),
  ]]
  const inc = incomes.filter((i) => inRange(i.date, range)).map((i) => ({ date: i.date, cells: [
    tr('إيراد', 'Income'), i.date, minorToDecimal(i.amountMinor), catName(settings.incomeCategories, i.categoryId), i.procedure, i.patientName, '', i.paymentMethod, i.description, i.notes,
  ] }))
  const exp = expenses.filter((e) => inRange(e.date, range)).map((e) => ({ date: e.date, cells: [
    tr('مصروف', 'Expense'), e.date, minorToDecimal(e.amountMinor), catName(settings.expenseCategories, e.categoryId), '', '', e.supplier, '', e.description, e.notes,
  ] }))
  rows.push(...[...inc, ...exp].sort((a, b) => a.date.localeCompare(b.date)).map((r) => r.cells))
  downloadCsv(rows, `osama-hub-transactions_${stamp(range)}.csv`)
}

const reportHeader = (first: string) => [first, tr('الإيرادات', 'Income'), tr('المصروفات', 'Expenses'), tr('حصة الشريك', 'Partner share'), tr('الصافي', 'Net')]
const reportRow = (r: PeriodRow) => [r.key, minorToDecimal(r.income), minorToDecimal(r.expenses), minorToDecimal(r.partner), minorToDecimal(r.net)]

export function exportMonthly(incomes: Income[], expenses: Expense[], settings: AppSettings, year: string) {
  const keys = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`)
  const rows = periodRows(incomes, expenses, settings, keys, monthKey, (k) => k)
  const total = summarize(incomes.filter((i) => yearKey(i.date) === year), expenses.filter((e) => yearKey(e.date) === year), settings.partnerRates)
  downloadCsv(
    [reportHeader(tr('الشهر', 'Month')), ...rows.map(reportRow), [tr('الإجمالي', 'Total'), minorToDecimal(total.income), minorToDecimal(total.expenses), minorToDecimal(total.partnerShare), minorToDecimal(total.net)]],
    `osama-hub-monthly-report_${year}.csv`,
  )
}

export function exportYearly(incomes: Income[], expenses: Expense[], settings: AppSettings) {
  const years = [...new Set([...incomes, ...expenses].map((r) => yearKey(r.date)))].sort()
  const rows = periodRows(incomes, expenses, settings, years, yearKey, (k) => k)
  downloadCsv([reportHeader(tr('السنة', 'Year')), ...rows.map(reportRow)], 'osama-hub-yearly-report.csv')
}

export interface StatementLine {
  date: string
  desc: string
  accrued: number
  paid: number
  balance: number
  note: string
}

/** Statement of account: the share accrues month by month and payments settle it, with a running balance. */
export function partnerStatement(incomes: Income[], expenses: Expense[], payments: PartnerPayment[], settings: AppSettings): StatementLine[] {
  const incomeByMonth = group(incomes, monthKey)
  const expensesByMonth = group(expenses, monthKey)
  const lines: { date: string; order: number; desc: string; accrued: number; paid: number; note: string }[] = []
  for (const m of new Set([...incomeByMonth.keys(), ...expensesByMonth.keys()])) {
    const inc = incomeByMonth.get(m) ?? []
    const exp = expensesByMonth.get(m) ?? []
    const net = sum(inc) - sum(exp)
    const share = partnerShare(inc, exp, settings.partnerRates)
    const pct = bpToPercent(rateOn(`${m}-28`, settings.partnerRates))
    lines.push({ date: `${m}-01`, order: 0, desc: tr(`حصة ${m} (${pct}% من الصافي ${minorToDecimal(net)})`, `Share for ${m} (${pct}% of net ${minorToDecimal(net)})`), accrued: share, paid: 0, note: '' })
  }
  for (const p of payments) lines.push({ date: p.date, order: 1, desc: tr('دفعة للشريك', 'Payment to partner'), accrued: 0, paid: p.amountMinor, note: p.notes })
  lines.sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order)
  let balance = 0
  return lines.map(({ order: _o, ...l }) => {
    balance += l.accrued - l.paid
    return { ...l, balance }
  })
}

export function exportPartnerStatement(incomes: Income[], expenses: Expense[], payments: PartnerPayment[], settings: AppSettings) {
  const rows: (string | number)[][] = [[tr('التاريخ', 'Date'), tr('البيان', 'Description'), tr('مستحق', 'Accrued'), tr('مدفوع', 'Paid'), tr('الرصيد', 'Balance'), tr('ملاحظات', 'Notes')]]
  for (const l of partnerStatement(incomes, expenses, payments, settings)) {
    rows.push([l.date, l.desc, l.accrued ? minorToDecimal(l.accrued) : '', l.paid ? minorToDecimal(l.paid) : '', minorToDecimal(l.balance), l.note])
  }
  downloadCsv(rows, 'osama-hub-partner-statement.csv')
}

/**
 * One report model, two outputs. The Excel file and the PDF are both rendered from this, so their
 * figures can never disagree. Money is kept in integer piastres until a renderer formats it.
 */
import { getLang, tr } from '@/i18n'
import type { AppSettings, Expense, FinanceCategory, Income, MonthlyBudget, PartnerPayment, PersonalTransaction } from '@/types/models'
import { budgetProgress, monthElapsed, type ProgressState, targetProgress } from '@/utils/budget'
import { type DateRange, inRange, monthKey, todayStr } from '@/utils/dates'
import { bpToPercent, rateOn, sum, summarize } from '@/utils/money'
import { partnerStatement, periodRows, trendBuckets } from '@/modules/clinic-finance/finance'
import { dailyAverage, personalSummary } from '@/modules/personal-finance/personal'

export type CellKind = 'text' | 'money' | 'date' | 'pct'
/** money: integer piastres · date: YYYY-MM-DD · pct: a fraction from 0 to 1. */
export type Cell = string | number | null

export interface ReportColumn {
  header: string
  kind?: CellKind
}
export interface ReportTable {
  title: string
  columns: ReportColumn[]
  rows: Cell[][]
  total?: Cell[]
  /** Detail tables get their own sheet in Excel and their own page section in the PDF. */
  sheet?: string
}
export interface ReportKpi {
  label: string
  minor?: number
  text?: string
  tone?: 'good' | 'bad'
}
export interface ReportProgress {
  label: string
  kind: 'budget' | 'target'
  used: number
  limit: number
  pct: number
  /** limit - used. Negative when a budget is exceeded. */
  remaining: number
  state: ProgressState
}
export interface Report {
  kind: 'clinic' | 'personal'
  title: string
  subtitle: string
  filename: string
  kpis: ReportKpi[]
  progressTitle?: string
  progress: ReportProgress[]
  tables: ReportTable[]
}

const catName = (list: FinanceCategory[], id: string) => {
  const c = list.find((x) => x.id === id)
  return c ? (getLang() === 'ar' ? c.ar : c.en) : id
}

export const progressStateText = (state: ProgressState) =>
  ({
    ok: tr('على المسار', 'On track'), fast: tr('الصرف أسرع من الشهر', 'Spending ahead of pace'), warn: tr('اقترب من الحد', 'Near the limit'), over: tr('تجاوز الحد', 'Over the limit'),
    done: tr('تحقق', 'Reached'), behind: tr('متأخر عن المسار', 'Behind pace'),
  })[state]

function byCategory(rows: { amountMinor: number; categoryId: string }[], cats: FinanceCategory[], budget?: MonthlyBudget): Cell[][] {
  const m = new Map<string, number>()
  for (const r of rows) m.set(r.categoryId, (m.get(r.categoryId) ?? 0) + r.amountMinor)
  const total = sum(rows)
  return [...m.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id, amount]) => {
      const row: Cell[] = [catName(cats, id), amount, total ? amount / total : 0]
      if (budget) row.push(budget.categories[id] ?? null)
      return row
    })
}

/** Category budgets that exist, measured against this month's spending. */
function categoryProgress(spentThisMonth: { amountMinor: number; categoryId: string }[], cats: FinanceCategory[], budget: MonthlyBudget, elapsed: number): ReportProgress[] {
  return Object.entries(budget.categories).map(([id, limit]) => {
    const used = sum(spentThisMonth.filter((r) => r.categoryId === id))
    return { label: catName(cats, id), kind: 'budget' as const, ...budgetProgress(used, limit, elapsed) }
  })
}

/** This month's target and budgets for the clinic. Shared by the on-screen cards and the reports. */
export function clinicProgress(incomes: Income[], expenses: Expense[], settings: AppSettings, today = todayStr()): ReportProgress[] {
  const month = monthKey(today)
  const mExp = expenses.filter((e) => monthKey(e.date) === month)
  const ms = summarize(incomes.filter((i) => monthKey(i.date) === month), mExp, settings.partnerRates)
  const elapsed = monthElapsed(today)
  const out: ReportProgress[] = []
  if (settings.clinicTarget) {
    const achieved = settings.clinicTarget.basis === 'income' ? ms.income : ms.net
    out.push({
      label: settings.clinicTarget.basis === 'income' ? tr('هدف الإيرادات', 'Income target') : tr('هدف الصافي', 'Net target'),
      kind: 'target', ...targetProgress(achieved, settings.clinicTarget.amountMinor, elapsed),
    })
  }
  if (settings.clinicBudget.totalMinor) out.push({ label: tr('بادجت المصروفات', 'Expense budget'), kind: 'budget', ...budgetProgress(ms.expenses, settings.clinicBudget.totalMinor, elapsed) })
  out.push(...categoryProgress(mExp, settings.expenseCategories, settings.clinicBudget, elapsed))
  return out
}

/** This month's personal budgets. */
export function personalProgress(all: PersonalTransaction[], settings: AppSettings, today = todayStr()): ReportProgress[] {
  const month = monthKey(today)
  const spent = all.filter((t) => t.kind === 'expense' && monthKey(t.date) === month)
  const elapsed = monthElapsed(today)
  const out: ReportProgress[] = []
  if (settings.personalBudget.totalMinor) out.push({ label: tr('البادجت الشهري', 'Monthly budget'), kind: 'budget', ...budgetProgress(sum(spent), settings.personalBudget.totalMinor, elapsed) })
  out.push(...categoryProgress(spent, settings.personalExpenseCategories, settings.personalBudget, elapsed))
  return out
}

const subtitleFor = (range: DateRange) => `${tr('الفترة', 'Period')}: ${range.from} → ${range.to} · ${tr('أُنشئ', 'Created')} ${todayStr()}`

export function clinicReport(incomes: Income[], expenses: Expense[], payments: PartnerPayment[], settings: AppSettings, range: DateRange, today = todayStr()): Report {
  const inc = incomes.filter((i) => inRange(i.date, range)).sort((a, b) => a.date.localeCompare(b.date))
  const exp = expenses.filter((e) => inRange(e.date, range)).sort((a, b) => a.date.localeCompare(b.date))
  const s = summarize(inc, exp, settings.partnerRates)
  const pct = bpToPercent(rateOn(range.to, settings.partnerRates))

  const month = monthKey(today)
  const progress = clinicProgress(incomes, expenses, settings, today)

  const b = trendBuckets(range)
  const periods = periodRows(inc, exp, settings, b.keys, b.keyOf, b.labelOf).filter((x) => x.income || x.expenses)
  const lines = partnerStatement(incomes, expenses, payments, settings)

  return {
    kind: 'clinic',
    title: `${settings.clinicName || tr('العيادة', 'Clinic')} · ${tr('تقرير مالي', 'Financial report')}`,
    subtitle: subtitleFor(range),
    filename: `osama-hub-clinic_${range.from}_${range.to}`,
    kpis: [
      { label: tr('الإيرادات', 'Income'), minor: s.income },
      { label: tr('المصروفات', 'Expenses'), minor: s.expenses },
      { label: tr(`حصة الشريك (${pct}% من الصافي)`, `Partner share (${pct}% of net)`), minor: s.partnerShare },
      { label: tr('صافي النتيجة', 'Net result'), minor: s.net, tone: s.net < 0 ? 'bad' : 'good' },
    ],
    progressTitle: tr(`الهدف والبادجت لشهر ${month}`, `Target and budget for ${month}`),
    progress,
    tables: [
      {
        title: tr('الإيرادات حسب التصنيف', 'Income by category'),
        columns: [{ header: tr('التصنيف', 'Category') }, { header: tr('المبلغ', 'Amount'), kind: 'money' }, { header: tr('النسبة', 'Share'), kind: 'pct' }],
        rows: byCategory(inc, settings.incomeCategories),
        total: [tr('الإجمالي', 'Total'), s.income, null],
      },
      {
        title: tr('المصروفات حسب التصنيف', 'Expenses by category'),
        columns: [{ header: tr('التصنيف', 'Category') }, { header: tr('المبلغ', 'Amount'), kind: 'money' }, { header: tr('النسبة', 'Share'), kind: 'pct' }, { header: tr('البادجت الشهري', 'Monthly budget'), kind: 'money' }],
        rows: byCategory(exp, settings.expenseCategories, settings.clinicBudget),
        total: [tr('الإجمالي', 'Total'), s.expenses, null, settings.clinicBudget.totalMinor],
      },
      {
        title: tr('المقارنة حسب الفترة', 'Comparison by period'),
        sheet: tr('حسب الفترة', 'By period'),
        columns: [{ header: tr('الفترة', 'Period') }, { header: tr('الإيرادات', 'Income'), kind: 'money' }, { header: tr('المصروفات', 'Expenses'), kind: 'money' }, { header: tr('حصة الشريك', 'Partner share'), kind: 'money' }, { header: tr('الصافي', 'Net'), kind: 'money' }],
        rows: periods.map((x) => [x.label, x.income, x.expenses, x.partner, x.net]),
        total: [tr('الإجمالي', 'Total'), s.income, s.expenses, s.partnerShare, s.net],
      },
      {
        title: tr('الإيرادات', 'Income'),
        sheet: tr('الإيرادات', 'Income'),
        columns: [
          { header: tr('التاريخ', 'Date'), kind: 'date' }, { header: tr('التصنيف', 'Category') }, { header: tr('الإجراء', 'Procedure') }, { header: tr('المريض', 'Patient') },
          { header: tr('طريقة الدفع', 'Payment') }, { header: tr('الوصف', 'Description') }, { header: tr('المبلغ', 'Amount'), kind: 'money' },
        ],
        rows: inc.map((i) => [i.date, catName(settings.incomeCategories, i.categoryId), i.procedure, i.patientName, i.paymentMethod, [i.description, i.notes].filter(Boolean).join(' · '), i.amountMinor]),
        total: [tr('الإجمالي', 'Total'), null, null, null, null, null, s.income],
      },
      {
        title: tr('المصروفات', 'Expenses'),
        sheet: tr('المصروفات', 'Expenses'),
        columns: [
          { header: tr('التاريخ', 'Date'), kind: 'date' }, { header: tr('التصنيف', 'Category') }, { header: tr('المورد', 'Supplier') }, { header: tr('الوصف', 'Description') },
          { header: tr('المبلغ', 'Amount'), kind: 'money' },
        ],
        rows: exp.map((e) => [e.date, catName(settings.expenseCategories, e.categoryId), e.supplier, [e.description, e.notes].filter(Boolean).join(' · '), e.amountMinor]),
        total: [tr('الإجمالي', 'Total'), null, null, null, s.expenses],
      },
      {
        title: `${tr('كشف حساب الشريك (كل الفترات)', 'Partner statement (all periods)')}${settings.partnerName ? ` · ${settings.partnerName}` : ''}`,
        sheet: tr('كشف الشريك', 'Partner'),
        columns: [{ header: tr('التاريخ', 'Date'), kind: 'date' }, { header: tr('البيان', 'Description') }, { header: tr('مستحق', 'Accrued'), kind: 'money' }, { header: tr('مدفوع', 'Paid'), kind: 'money' }, { header: tr('الرصيد', 'Balance'), kind: 'money' }],
        rows: lines.map((l) => [l.date, [l.desc, l.note].filter(Boolean).join(' · '), l.accrued || null, l.paid || null, l.balance]),
        total: [tr('الرصيد الحالي', 'Current balance'), null, sum(lines.map((l) => ({ amountMinor: l.accrued }))), sum(payments), lines.at(-1)?.balance ?? 0],
      },
    ],
  }
}

export function personalReport(all: PersonalTransaction[], settings: AppSettings, range: DateRange, today = todayStr()): Report {
  const rows = all.filter((t) => inRange(t.date, range)).sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt))
  const s = personalSummary(rows)
  const spent = rows.filter((t) => t.kind === 'expense')
  const earned = rows.filter((t) => t.kind === 'income')
  const budget = settings.personalBudget

  const month = monthKey(today)
  const progress = personalProgress(all, settings, today)

  const b = trendBuckets(range)
  const periods = b.keys
    .map((key) => ({ label: b.labelOf(key), ...personalSummary(rows.filter((t) => b.keyOf(t.date) === key)) }))
    .filter((p) => p.count)

  return {
    kind: 'personal',
    title: tr('المالية الشخصية · تقرير', 'Personal finance · report'),
    subtitle: subtitleFor(range),
    filename: `osama-hub-personal_${range.from}_${range.to}`,
    kpis: [
      { label: tr('الدخل', 'Income'), minor: s.income },
      { label: tr('المصروف', 'Spent'), minor: s.expenses },
      { label: s.balance >= 0 ? tr('المتبقي', 'Left over') : tr('صرفت أكثر مما دخل', 'Spent more than came in'), minor: s.balance, tone: s.balance < 0 ? 'bad' : 'good' },
      { label: tr('متوسط المصروف اليومي', 'Average spent per day'), minor: dailyAverage(s.expenses, range, today) },
    ],
    progressTitle: tr(`البادجت لشهر ${month}`, `Budget for ${month}`),
    progress,
    tables: [
      {
        title: tr('أين ذهبت فلوسك', 'Where your money went'),
        columns: [{ header: tr('التصنيف', 'Category') }, { header: tr('المبلغ', 'Amount'), kind: 'money' }, { header: tr('النسبة', 'Share'), kind: 'pct' }, { header: tr('البادجت الشهري', 'Monthly budget'), kind: 'money' }],
        rows: byCategory(spent, settings.personalExpenseCategories, budget),
        total: [tr('الإجمالي', 'Total'), s.expenses, null, budget.totalMinor],
      },
      {
        title: tr('مصادر الدخل', 'Where it came from'),
        columns: [{ header: tr('المصدر', 'Source') }, { header: tr('المبلغ', 'Amount'), kind: 'money' }, { header: tr('النسبة', 'Share'), kind: 'pct' }],
        rows: byCategory(earned, settings.personalIncomeCategories),
        total: [tr('الإجمالي', 'Total'), s.income, null],
      },
      {
        title: tr('حسب الفترة', 'By period'),
        sheet: tr('حسب الفترة', 'By period'),
        columns: [{ header: tr('الفترة', 'Period') }, { header: tr('الدخل', 'Income'), kind: 'money' }, { header: tr('المصروف', 'Spent'), kind: 'money' }, { header: tr('المتبقي', 'Left over'), kind: 'money' }],
        rows: periods.map((p) => [p.label, p.income, p.expenses, p.balance]),
        total: [tr('الإجمالي', 'Total'), s.income, s.expenses, s.balance],
      },
      {
        title: tr('كل الحركات', 'All entries'),
        sheet: tr('الحركات', 'Entries'),
        columns: [
          { header: tr('التاريخ', 'Date'), kind: 'date' }, { header: tr('التصنيف', 'Category') }, { header: tr('الوصف', 'Description') }, { header: tr('طريقة الدفع', 'Payment') },
          { header: tr('دخل', 'In'), kind: 'money' }, { header: tr('مصروف', 'Out'), kind: 'money' },
        ],
        rows: rows.map((t) => [
          t.date, catName(t.kind === 'income' ? settings.personalIncomeCategories : settings.personalExpenseCategories, t.categoryId),
          [t.description, t.notes].filter(Boolean).join(' · '), t.paymentMethod, t.kind === 'income' ? t.amountMinor : null, t.kind === 'expense' ? t.amountMinor : null,
        ]),
        total: [tr('الإجمالي', 'Total'), null, null, null, s.income, s.expenses],
      },
    ],
  }
}

import { lazy, Suspense, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ArrowDownCircle, ArrowUpCircle, Banknote, Download, FileSpreadsheet, HandCoins, Plus, Receipt, Search, Wallet } from 'lucide-react'
import { confirmDelete, toast } from '@/components/common/feedback'
import {
  Button, Chip, ChipRow, ComboInput, cx, EmptyState, heroNumberClass, FormFooter, Input, ListSkeleton, PageHeader, ProgressBar, SectionTitle, Segmented, Select, Sheet, Stat, SyncBadge, Textarea,
} from '@/components/common/ui'
import { CategoryBars, PeriodPicker, usePeriod } from '@/components/finance/shared'
import { useParamOnce } from '@/hooks/useParamOnce'
import { useSettings } from '@/hooks/useSettings'
import { useI18n } from '@/i18n'
import { repo, useCollection } from '@/services/data/store'
import type { Expense, Income, PartnerPayment, Stored } from '@/types/models'
import { type DateRange, endOfYear, formatDate, inRange, isValidDate, rangeFor, startOfYear, todayStr, yearKey } from '@/utils/dates'
import { bpToPercent, formatMoney, MAX_AMOUNT_MINOR, minorToDecimal, parseAmount, partnerBalance, partnerShare, rateOn, sum, summarize } from '@/utils/money'
import { matches } from '@/utils/text'
import { catName, categoryTotals, exportMonthly, exportPartnerStatement, exportTransactions, exportYearly, periodRows, trendBuckets } from './finance'

const FinanceCharts = {
  IncomeExpense: lazy(() => import('@/components/charts/FinanceCharts').then((m) => ({ default: m.IncomeExpenseChart }))),
  Net: lazy(() => import('@/components/charts/FinanceCharts').then((m) => ({ default: m.NetChart }))),
}

type Tab = 'overview' | 'income' | 'expenses' | 'partner' | 'reports'
type Kind = 'income' | 'expense'

// ── Forms ──
function TransactionForm({ kind, record, onClose }: { kind: Kind; record?: Stored<Income> | Stored<Expense>; onClose: () => void }) {
  const { tr, lang } = useI18n()
  const { settings } = useSettings()
  const incomes = useCollection('income').items
  const expenses = useCollection('expenses').items
  const inc = kind === 'income' ? (record as Stored<Income> | undefined) : undefined
  const exp = kind === 'expense' ? (record as Stored<Expense> | undefined) : undefined
  const cats = (kind === 'income' ? settings.incomeCategories : settings.expenseCategories).filter((c) => !c.archived || c.id === record?.categoryId)

  const [amount, setAmount] = useState(record ? minorToDecimal(record.amountMinor) : '')
  const [date, setDate] = useState(record?.date ?? todayStr())
  const [categoryId, setCategoryId] = useState(record?.categoryId ?? cats[0]?.id ?? 'other')
  const [patientName, setPatientName] = useState(inc?.patientName ?? '')
  const [procedure, setProcedure] = useState(inc?.procedure ?? '')
  const [paymentMethod, setPaymentMethod] = useState(inc?.paymentMethod ?? '')
  const [supplier, setSupplier] = useState(exp?.supplier ?? '')
  const [description, setDescription] = useState(record?.description ?? '')
  const [notes, setNotes] = useState(record?.notes ?? '')
  const [errors, setErrors] = useState<{ amount?: string; date?: string }>({})
  // A ref, not a button of type submit: pressing Enter must always mean a plain save.
  const again = useRef(false)
  const looksLikePartner = kind === 'expense' && /(شريك|الشريك|partner)/i.test(`${description} ${supplier}`)

  const reset = () => {
    setAmount('')
    setPatientName('')
    setProcedure('')
    setDescription('')
    setNotes('')
    setSupplier('')
    setErrors({})
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const minor = parseAmount(amount)
    const errs: typeof errors = {}
    if (minor === null) errs.amount = tr(`أدخل مبلغًا صحيحًا أكبر من صفر (حتى قرشين عشريين، وبحد أقصى ${formatMoney(MAX_AMOUNT_MINOR, 'ar')}).`, 'Enter a valid amount above zero, with up to 2 decimals.')
    if (!isValidDate(date)) errs.date = tr('تاريخ غير صالح.', 'Invalid date.')
    setErrors(errs)
    if (Object.keys(errs).length) return
    if (kind === 'income') {
      const data = { amountMinor: minor!, date, categoryId, patientName: patientName.trim(), procedure: procedure.trim(), paymentMethod: paymentMethod.trim(), description: description.trim(), notes: notes.trim() }
      if (record) await repo.update('income', record.id, data)
      else await repo.create('income', data)
    } else {
      const data = { amountMinor: minor!, date, categoryId, supplier: supplier.trim(), description: description.trim(), notes: notes.trim() }
      if (record) await repo.update('expenses', record.id, data)
      else await repo.create('expenses', data)
    }
    toast(tr('تم الحفظ', 'Saved'))
    if (again.current && !record) {
      again.current = false
      reset()
      return
    }
    onClose()
  }

  const del = async () => {
    if (!record) return
    const ok = await confirmDelete(
      kind === 'income' ? tr('هذا الإيراد', 'this income') : tr('هذا المصروف', 'this expense'),
      `${formatMoney(record.amountMinor, lang)} · ${formatDate(record.date, lang, settings.dateFormat)}. ${tr('ستتغير الحسابات والتقارير وفقًا لذلك.', 'Totals and reports will change accordingly.')}`,
    )
    if (ok) {
      await repo.remove(kind === 'income' ? 'income' : 'expenses', record.id)
      onClose()
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={record ? tr('تعديل المعاملة', 'Edit transaction') : kind === 'income' ? tr('إيراد جديد', 'New income') : tr('مصروف جديد', 'New expense')}
      footer={
        <>
          {!record && (
            <Button
              variant="ghost"
              className="me-auto"
              onClick={() => {
                again.current = true
                document.querySelector<HTMLFormElement>('#sheet-form')?.requestSubmit()
              }}
            >
              {tr('حفظ وإضافة آخر', 'Save & add another')}
            </Button>
          )}
          <FormFooter onCancel={onClose} onDelete={record ? () => void del() : undefined} />
        </>
      }
    >
      <form id="sheet-form" onSubmit={(e) => void submit(e)} className="space-y-3" noValidate>
        <div className="grid grid-cols-2 gap-3">
          <Input label={tr('المبلغ (ج.م)', 'Amount (EGP)')} inputMode="decimal" dir="ltr" value={amount} onChange={(e) => setAmount(e.target.value)} error={errors.amount} autoFocus={!record} className="tnum" />
          <Input label={tr('التاريخ', 'Date')} type="date" value={date} onChange={(e) => setDate(e.target.value)} error={errors.date} />
        </div>
        <Select label={tr('التصنيف', 'Category')} value={categoryId} onChange={(e) => setCategoryId(e.target.value)} options={cats.map((c) => ({ value: c.id, label: lang === 'ar' ? c.ar : c.en }))} />
        {kind === 'income' ? (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <ComboInput label={tr('الإجراء', 'Procedure')} value={procedure} onChange={setProcedure} suggestions={incomes.map((i) => i.procedure).filter(Boolean)} />
              <ComboInput label={tr('اسم المريض (اختياري)', 'Patient name (optional)')} value={patientName} onChange={setPatientName} suggestions={incomes.map((i) => i.patientName).filter(Boolean)} />
            </div>
            <ComboInput label={tr('طريقة الدفع (اختياري)', 'Payment method (optional)')} value={paymentMethod} onChange={setPaymentMethod} suggestions={[tr('نقدي', 'Cash'), tr('بطاقة', 'Card'), 'InstaPay', tr('محفظة إلكترونية', 'Mobile wallet'), tr('تحويل بنكي', 'Bank transfer')]} />
          </>
        ) : (
          <ComboInput label={tr('المورد أو المستلم (اختياري)', 'Supplier or recipient (optional)')} value={supplier} onChange={setSupplier} suggestions={expenses.map((x) => x.supplier).filter(Boolean)} />
        )}
        <Input label={tr('الوصف', 'Description')} value={description} onChange={(e) => setDescription(e.target.value)} />
        {looksLikePartner && (
          <p role="alert" className="rounded-2xl bg-caution/12 px-4 py-3 text-sm text-caution">
            {tr('حصة الشريك محسوبة تلقائيًا من الإيرادات. إذا كانت هذه دفعة للشريك، فسجّلها في تبويب الشريك حتى لا تُحسب مرتين.', 'The partner share is already deducted automatically. If this is a payment to the partner, record it in the Partner tab so it is not counted twice.')}
          </p>
        )}
        <Textarea label={tr('ملاحظات', 'Notes')} value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
      </form>
    </Sheet>
  )
}

function PaymentForm({ payment, balance, onClose }: { payment?: Stored<PartnerPayment>; balance: number; onClose: () => void }) {
  const { tr, lang } = useI18n()
  const [amount, setAmount] = useState(payment ? minorToDecimal(payment.amountMinor) : balance > 0 ? minorToDecimal(balance) : '')
  const [date, setDate] = useState(payment?.date ?? todayStr())
  const [notes, setNotes] = useState(payment?.notes ?? '')
  const [errors, setErrors] = useState<{ amount?: string; date?: string }>({})
  const minor = parseAmount(amount)
  const available = balance + (payment?.amountMinor ?? 0)
  const over = minor !== null && minor > available

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const errs: typeof errors = {}
    if (minor === null) errs.amount = tr('أدخل مبلغًا صحيحًا.', 'Enter a valid amount.')
    if (!isValidDate(date)) errs.date = tr('تاريخ غير صالح.', 'Invalid date.')
    setErrors(errs)
    if (Object.keys(errs).length) return
    const data = { amountMinor: minor!, date, notes: notes.trim() }
    if (payment) await repo.update('partnerPayments', payment.id, data)
    else await repo.create('partnerPayments', data)
    toast(tr('سُجلت الدفعة', 'Payment recorded'))
    onClose()
  }

  const del = async () => {
    if (payment && (await confirmDelete(tr('هذه الدفعة', 'this payment'), tr('سيعود مبلغها إلى الرصيد المستحق.', 'Its amount returns to the unpaid balance.')))) {
      await repo.remove('partnerPayments', payment.id)
      onClose()
    }
  }

  return (
    <Sheet open onClose={onClose} title={payment ? tr('تعديل الدفعة', 'Edit payment') : tr('تسجيل دفعة للشريك', 'Record a partner payment')} footer={<FormFooter onCancel={onClose} onDelete={payment ? () => void del() : undefined} />}>
      <form id="sheet-form" onSubmit={(e) => void submit(e)} className="space-y-3" noValidate>
        <div className="grid grid-cols-2 gap-3">
          <Input label={tr('المبلغ (ج.م)', 'Amount (EGP)')} inputMode="decimal" dir="ltr" value={amount} onChange={(e) => setAmount(e.target.value)} error={errors.amount} />
          <Input label={tr('التاريخ', 'Date')} type="date" value={date} onChange={(e) => setDate(e.target.value)} error={errors.date} />
        </div>
        {over && <p role="alert" className="rounded-2xl bg-caution/12 px-4 py-3 text-sm text-caution">{tr(`هذا أكبر من المستحق (${formatMoney(available, lang)}). سيظهر الفرق كرصيد زائد للشريك.`, `This is more than the balance due (${formatMoney(available, lang)}). The difference shows as a partner overpayment.`)}</p>}
        <Textarea label={tr('ملاحظات', 'Notes')} value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        <p className="text-sm text-faint">{tr('الدفعة تسدد التزامًا قائمًا، لذلك لا تُخصم مرة أخرى من صافي النتيجة.', 'A payment settles an existing liability, so it is not deducted from the net result again.')}</p>
      </form>
    </Sheet>
  )
}

// ── Overview ──
function Overview({ incomes, expenses, payments, onAdd, onPartner }: {
  incomes: Stored<Income>[]
  expenses: Stored<Expense>[]
  payments: Stored<PartnerPayment>[]
  onAdd: (k: Kind) => void
  onPartner: () => void
}) {
  const { tr, lang } = useI18n()
  const { settings } = useSettings()
  const period = usePeriod('month')
  const { range } = period
  const m = (v: number) => formatMoney(v, lang)
  const today = todayStr()
  const s = useMemo(() => summarize(incomes.filter((i) => inRange(i.date, range)), expenses.filter((e) => inRange(e.date, range)), settings.partnerRates), [incomes, expenses, range, settings.partnerRates])
  const fixed = useMemo(() => {
    const at = (r: DateRange) => summarize(incomes.filter((i) => inRange(i.date, r)), expenses.filter((e) => inRange(e.date, r)), settings.partnerRates)
    return {
      day: at(rangeFor('today', settings.weekStart, today)),
      month: at(rangeFor('month', settings.weekStart, today)),
      year: at(rangeFor('year', settings.weekStart, today)),
    }
  }, [incomes, expenses, settings, today])
  const bal = partnerBalance(incomes, expenses, payments, settings.partnerRates)
  const trend = useMemo(() => {
    const yr: DateRange = { from: startOfYear(today), to: endOfYear(today) }
    const b = trendBuckets(yr)
    return periodRows(incomes, expenses, settings, b.keys, b.keyOf, b.labelOf).map((r) => ({ key: r.key, label: r.label, income: r.income, expenses: r.expenses, net: r.net }))
  }, [incomes, expenses, settings, today])
  const hasData = incomes.length + expenses.length > 0
  const base = Math.max(s.income, s.expenses + s.partnerShare, 1)

  return (
    <div className="space-y-4">
      <PeriodPicker p={period} />
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-5">
        {/* Hero: the one number that matters, in the references' lime card */}
        <section className="relative overflow-hidden rounded-[2.25rem] bg-lime p-6 text-charcoal lg:col-span-3">
          <p className="text-[15px] font-medium opacity-70">{tr('صافي النتيجة', 'Net result')}</p>
          <p className={cx('tnum mt-2 leading-none font-bold', heroNumberClass(formatMoney(s.net, 'en', false)))} dir="ltr" style={{ textAlign: lang === 'ar' ? 'right' : 'left' }}>
            {formatMoney(s.net, 'en', false)}
          </p>
          <p className="mt-1 text-sm opacity-70">{tr('جنيه مصري', 'Egyptian pounds')} · {formatDate(range.from, lang, 'dmy')} – {formatDate(range.to, lang, 'dmy')}</p>
          <div className="mt-6 flex flex-wrap gap-2">
            <Button variant="ink" className="!bg-charcoal !text-white" icon={ArrowDownCircle} onClick={() => onAdd('income')}>{tr('إيراد', 'Income')}</Button>
            <Button className="!bg-white/70 !text-charcoal" icon={ArrowUpCircle} onClick={() => onAdd('expense')}>{tr('مصروف', 'Expense')}</Button>
          </div>
        </section>

        {/* The sum behind it, in the references' stacked style */}
        <section className="card flex flex-col justify-center gap-4 p-5 lg:col-span-2">
          {[
            { label: tr('الإيرادات', 'Income'), value: s.income, tone: 'cobalt' as const },
            { label: tr('المصروفات', 'Expenses'), value: s.expenses, tone: 'ink' as const },
            { label: tr(`حصة الشريك (${bpToPercent(rateOn(range.to, settings.partnerRates))}% من الصافي)`, `Partner share (${bpToPercent(rateOn(range.to, settings.partnerRates))}% of net)`), value: s.partnerShare, tone: 'gold' as const },
          ].map((row) => (
            <div key={row.label}>
              <div className="mb-1.5 flex items-baseline justify-between gap-3">
                <span className="min-w-0 text-sm text-muted">{row.label}</span>
                <span className="tnum shrink-0 text-lg font-bold whitespace-nowrap">{m(row.value)}</span>
              </div>
              <ProgressBar value={(row.value / base) * 100} tone={row.tone} label={row.label} />
            </div>
          ))}
        </section>
      </div>

      <section className="card p-5">
        <SectionTitle>{tr('نظرة ثابتة', 'At a glance')}</SectionTitle>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[26rem] text-[15px]">
            <thead>
              <tr className="text-start text-sm text-faint">
                <th className="py-1.5 text-start font-medium"><span className="sr-only">{tr('البند', 'Item')}</span></th>
                <th className="py-1.5 text-end font-medium">{tr('اليوم', 'Today')}</th>
                <th className="py-1.5 text-end font-medium">{tr('الشهر', 'Month')}</th>
                <th className="py-1.5 text-end font-medium">{tr('السنة', 'Year')}</th>
              </tr>
            </thead>
            <tbody className="tnum">
              {([
                [tr('الإيرادات', 'Income'), 'income'],
                [tr('المصروفات', 'Expenses'), 'expenses'],
                [tr('حصة الشريك', 'Partner share'), 'partnerShare'],
                [tr('الصافي', 'Net'), 'net'],
              ] as const).map(([label, k]) => (
                <tr key={k} className={cx('border-t border-line', k === 'net' && 'font-bold')}>
                  <td className="py-2">{label}</td>
                  <td className="py-2 text-end whitespace-nowrap">{formatMoney(fixed.day[k], lang, false)}</td>
                  <td className="py-2 text-end whitespace-nowrap">{formatMoney(fixed.month[k], lang, false)}</td>
                  <td className="py-2 text-end whitespace-nowrap">{formatMoney(fixed.year[k], lang, false)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <button type="button" onClick={onPartner} className="card flex w-full items-center justify-between gap-3 p-5 text-start transition hover:bg-raised">
        <span className="flex items-center gap-3">
          <span className="grid size-12 place-items-center rounded-full bg-raised"><HandCoins className="size-5" /></span>
          <span>
            <span className="block text-sm text-muted">{bal.balance >= 0 ? tr('المستحق للشريك حتى الآن', 'Owed to partner so far') : tr('مدفوع زائد للشريك', 'Partner overpaid')}</span>
            <span className="tnum block text-xl font-bold">{m(Math.abs(bal.balance))}</span>
          </span>
        </span>
      </button>

      {hasData && (
        <section className="card p-5">
          <SectionTitle>{tr(`الاتجاه خلال ${yearKey(today)}`, `Trend for ${yearKey(today)}`)}</SectionTitle>
          <Suspense fallback={<div className="skeleton h-64" />}><FinanceCharts.IncomeExpense data={trend} /></Suspense>
          <h3 className="mt-6 mb-1 text-sm font-medium text-muted">{tr('صافي النتيجة شهريًا', 'Net result by month')}</h3>
          <Suspense fallback={<div className="skeleton h-48" />}><FinanceCharts.Net data={trend} /></Suspense>
        </section>
      )}
    </div>
  )
}

// ── Transaction lists ──
const PAGE = 60

function TransactionList({ kind, rows, onEdit }: { kind: Kind; rows: (Stored<Income> | Stored<Expense>)[]; onEdit: (r: Stored<Income> | Stored<Expense>) => void }) {
  const { tr, lang } = useI18n()
  const { settings } = useSettings()
  const period = usePeriod('month')
  const [q, setQ] = useState('')
  const [category, setCategory] = useState<string | null>(null)
  const [limit, setLimit] = useState(PAGE)
  const cats = kind === 'income' ? settings.incomeCategories : settings.expenseCategories

  const filtered = useMemo(() => rows
    .filter((r) => {
      if (!inRange(r.date, period.range)) return false
      if (category && r.categoryId !== category) return false
      const i = r as unknown as Income & Expense
      return matches(`${i.description} ${i.notes} ${i.patientName ?? ''} ${i.procedure ?? ''} ${i.supplier ?? ''} ${i.paymentMethod ?? ''} ${catName(cats, r.categoryId)} ${minorToDecimal(r.amountMinor)}`, q)
    })
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)), [rows, period.range, category, q, cats])
  const total = sum(filtered)
  const visible = filtered.slice(0, limit)
  const days = useMemo(() => {
    const m = new Map<string, typeof visible>()
    for (const r of visible) m.set(r.date, [...(m.get(r.date) ?? []), r])
    return [...m.entries()]
  }, [visible])
  useEffect(() => setLimit(PAGE), [period.range, q, category])

  return (
    <div>
      <PeriodPicker p={period} />
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute start-4 top-1/2 size-4.5 -translate-y-1/2 text-faint" />
        <input aria-label={tr('بحث في المعاملات', 'Search transactions')} value={q} onChange={(e) => setQ(e.target.value)} placeholder={kind === 'income' ? tr('مريض، إجراء، مبلغ…', 'Patient, procedure, amount…') : tr('مورد، وصف، مبلغ…', 'Supplier, description, amount…')} className="field !rounded-full !px-11" dir={q ? 'auto' : undefined} />
      </div>
      <ChipRow className="mb-4">
        {cats.filter((c) => !c.archived).map((c) => <Chip key={c.id} active={category === c.id} onClick={() => setCategory(category === c.id ? null : c.id)}>{lang === 'ar' ? c.ar : c.en}</Chip>)}
      </ChipRow>
      <div className="mb-3 flex items-baseline justify-between px-1">
        <span className="text-sm text-muted">{tr(`${filtered.length} معاملة`, `${filtered.length} transactions`)}</span>
        <span className="tnum text-xl font-bold">{formatMoney(total, lang)}</span>
      </div>
      {filtered.length === 0 ? (
        <EmptyState icon={Receipt} title={tr('لا توجد معاملات في هذه الفترة', 'No transactions in this period')} body={tr('غيّر الفترة أو أضف معاملة جديدة.', 'Change the period or add a new one.')} />
      ) : (
        <div className="space-y-4">
          {days.map(([day, list]) => (
            <section key={day} aria-label={day}>
              <div className="mb-1.5 flex items-baseline justify-between px-2 text-sm text-faint">
                <span>{formatDate(day, lang, settings.dateFormat)}</span>
                <span className="tnum">{formatMoney(sum(list), lang, false)}</span>
              </div>
              <div className="card divide-y divide-line overflow-hidden">
                {list.map((r) => {
                  const i = r as unknown as Stored<Income> & Stored<Expense>
                  const title = kind === 'income' ? i.procedure || i.description || catName(cats, r.categoryId) : i.description || i.supplier || catName(cats, r.categoryId)
                  const sub = [catName(cats, r.categoryId), kind === 'income' ? i.patientName : i.supplier].filter(Boolean).join(' · ')
                  return (
                    <button key={r.id} type="button" onClick={() => onEdit(r)} className="flex min-h-16 w-full items-center gap-3 px-4 py-2.5 text-start transition hover:bg-raised">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium" dir="auto">{title}</span>
                        <span className="block truncate text-sm text-muted" dir="auto">{sub}</span>
                      </span>
                      <SyncBadge state={r._sync} compact />
                      <span className={cx('tnum shrink-0 font-bold', kind === 'income' ? 'text-positive' : 'text-ink')}>{formatMoney(r.amountMinor, lang, false)}</span>
                    </button>
                  )
                })}
              </div>
            </section>
          ))}
          {filtered.length > limit && <Button className="w-full" onClick={() => setLimit(limit + PAGE)}>{tr('عرض المزيد', 'Show more')}</Button>}
        </div>
      )}
    </div>
  )
}

// ── Partner ──
function PartnerTab({ incomes, expenses, payments, onPay, onEditPayment }: { incomes: Stored<Income>[]; expenses: Stored<Expense>[]; payments: Stored<PartnerPayment>[]; onPay: () => void; onEditPayment: (p: Stored<PartnerPayment>) => void }) {
  const { tr, lang } = useI18n()
  const { settings } = useSettings()
  const bal = partnerBalance(incomes, expenses, payments, settings.partnerRates)
  const m = (v: number) => formatMoney(v, lang)
  const today = todayStr()
  const period = usePeriod('year')
  const periodIncome = useMemo(() => incomes.filter((i) => inRange(i.date, period.range)), [incomes, period.range])
  const periodExpenses = useMemo(() => expenses.filter((e) => inRange(e.date, period.range)), [expenses, period.range])
  const paidPct = bal.owed ? (bal.paid / bal.owed) * 100 : 0
  const sorted = useMemo(() => [...payments].sort((a, b) => b.date.localeCompare(a.date)), [payments])

  return (
    <div className="space-y-4">
      <section className="rounded-[2.25rem] bg-cobalt p-6 text-white">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[15px] opacity-80">{bal.balance >= 0 ? tr('المتبقي للشريك', 'Remaining for partner') : tr('مدفوع زائد للشريك', 'Partner overpaid')}{settings.partnerName ? ` · ${settings.partnerName}` : ''}</p>
            <p className={cx('tnum mt-2 leading-none font-bold', heroNumberClass(formatMoney(Math.abs(bal.balance), 'en', false)))}>{formatMoney(Math.abs(bal.balance), 'en', false)}</p>
            <p className="mt-1 text-sm opacity-80">{tr('جنيه مصري', 'Egyptian pounds')}</p>
          </div>
          <Button variant="primary" icon={Plus} capsule onClick={onPay}>{tr('تسجيل دفعة', 'Record payment')}</Button>
        </div>
        <div className="mt-5 grid grid-cols-1 gap-3 text-sm min-[360px]:grid-cols-2">
          <div><div className="opacity-80">{tr('إجمالي الحصة', 'Total share')}</div><div className="tnum text-lg font-bold">{m(bal.owed)}</div></div>
          <div><div className="opacity-80">{tr('إجمالي المدفوع', 'Total paid')}</div><div className="tnum text-lg font-bold">{m(bal.paid)}</div></div>
        </div>
        <div className="mt-4 h-3 overflow-hidden rounded-full bg-white/20" role="progressbar" aria-valuenow={Math.round(paidPct)} aria-valuemin={0} aria-valuemax={100} aria-label={tr('نسبة المدفوع', 'Paid share')}>
          <div className="hatch h-full rounded-full bg-lime" style={{ width: `${Math.min(100, paidPct)}%` }} />
        </div>
      </section>

      <section className="card p-5 text-[15px] text-muted">
        <p>
          {tr('حصة الشريك = (الإيرادات − المصروفات) × النسبة، وتُحسب لكل شهر على حدة. النسبة الحالية', 'Partner share = (income − expenses) × rate, worked out for each month. The current rate is')}{' '}
          <strong className="text-ink">{bpToPercent(rateOn(today, settings.partnerRates))}%</strong>
          {tr('، وتُعدّل من الإعدادات. الشهر الخاسر لا تُحسب عنه حصة. صافي النتيجة = الإيرادات − المصروفات − الحصة. الدفعات تسدد الحصة ولا تُخصم مرة ثانية.', ', editable in Settings. A month that ends in a loss earns no share. Net result = income − expenses − share. Payments settle the share and are not deducted a second time.')}
        </p>
      </section>

      <section className="card p-5">
        <SectionTitle>{tr('الحصة حسب الفترة', 'Share by period')}</SectionTitle>
        <PeriodPicker p={period} />
        <div className="grid grid-cols-2 gap-4">
          <Stat label={tr('الصافي قبل حصة الشريك', 'Net before partner share')} value={m(sum(periodIncome) - sum(periodExpenses))} />
          <Stat label={tr('حصة الشريك', 'Partner share')} value={m(partnerShare(periodIncome, periodExpenses, settings.partnerRates))} />
        </div>
      </section>

      <section>
        <SectionTitle action={<Button size="sm" icon={Download} onClick={() => exportPartnerStatement(incomes, expenses, payments, settings)}>{tr('كشف حساب', 'Statement')}</Button>}>{tr('سجل الدفعات', 'Payment history')}</SectionTitle>
        {sorted.length === 0 ? (
          <EmptyState icon={Wallet} title={tr('لم تُسجل دفعات بعد', 'No payments recorded yet')} body={tr('سجّل كل دفعة ليبقى الرصيد دقيقًا.', 'Record each payment to keep the balance accurate.')} />
        ) : (
          <div className="card divide-y divide-line overflow-hidden">
            {sorted.map((p) => (
              <button key={p.id} type="button" onClick={() => onEditPayment(p)} className="flex min-h-16 w-full items-center gap-3 px-4 py-2.5 text-start transition hover:bg-raised">
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{formatDate(p.date, lang, settings.dateFormat)}</span>
                  {p.notes && <span className="block truncate text-sm text-muted" dir="auto">{p.notes}</span>}
                </span>
                <SyncBadge state={p._sync} compact />
                <span className="tnum font-bold">{formatMoney(p.amountMinor, lang, false)}</span>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

// ── Reports ──
function Reports({ incomes, expenses, payments }: { incomes: Stored<Income>[]; expenses: Stored<Expense>[]; payments: Stored<PartnerPayment>[] }) {
  const { tr, lang } = useI18n()
  const { settings } = useSettings()
  const period = usePeriod('year')
  const { range } = period
  const inc = useMemo(() => incomes.filter((i) => inRange(i.date, range)), [incomes, range])
  const exp = useMemo(() => expenses.filter((e) => inRange(e.date, range)), [expenses, range])
  const s = summarize(inc, exp, settings.partnerRates)
  const rows = useMemo(() => {
    const b = trendBuckets(range)
    return periodRows(inc, exp, settings, b.keys, b.keyOf, b.labelOf)
  }, [inc, exp, range, settings])
  const trend = rows.map((r) => ({ key: r.key, label: r.label, income: r.income, expenses: r.expenses, net: r.net }))
  const tableRows = rows.filter((r) => r.income || r.expenses)
  const years = useMemo(() => [...new Set([todayStr().slice(0, 4), ...[...incomes, ...expenses].map((r) => r.date.slice(0, 4))])].sort().reverse(), [incomes, expenses])
  const [year, setYear] = useState(years[0]!)

  return (
    <div className="space-y-4">
      <PeriodPicker p={period} />
      <section className="grid grid-cols-2 gap-4 sm:grid-cols-4 card p-5">
        <Stat label={tr('الإيرادات', 'Income')} value={formatMoney(s.income, lang)} />
        <Stat label={tr('المصروفات', 'Expenses')} value={formatMoney(s.expenses, lang)} />
        <Stat label={tr('حصة الشريك', 'Partner share')} value={formatMoney(s.partnerShare, lang)} />
        <Stat label={tr('الصافي', 'Net')} value={formatMoney(s.net, lang)} tone={s.net < 0 ? 'bad' : 'good'} />
      </section>
      <section className="card p-5">
        <SectionTitle>{tr('الإيرادات مقابل المصروفات', 'Income vs expenses')}</SectionTitle>
        <Suspense fallback={<div className="skeleton h-64" />}><FinanceCharts.IncomeExpense data={trend} /></Suspense>
        <h3 className="mt-6 mb-1 text-sm font-medium text-muted">{tr('اتجاه صافي النتيجة', 'Net result trend')}</h3>
        <Suspense fallback={<div className="skeleton h-48" />}><FinanceCharts.Net data={trend} /></Suspense>
      </section>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <CategoryBars title={tr('الإيرادات حسب التصنيف', 'Income by category')} rows={categoryTotals(inc, settings.incomeCategories)} />
        <CategoryBars title={tr('المصروفات حسب التصنيف', 'Expenses by category')} rows={categoryTotals(exp, settings.expenseCategories)} />
      </div>
      <section className="card p-5">
        <SectionTitle>{tr('المقارنة التفصيلية', 'Detailed comparison')}</SectionTitle>
        {tableRows.length === 0 ? <p className="text-[15px] text-faint">{tr('لا بيانات في هذه الفترة.', 'No data in this period.')}</p> : (
          <div className="overflow-x-auto">
            <table className="tnum w-full min-w-[34rem] text-[15px]">
              <thead>
                <tr className="text-sm text-faint">
                  <th className="py-1.5 text-start font-medium">{tr('الفترة', 'Period')}</th>
                  <th className="py-1.5 text-end font-medium">{tr('الإيرادات', 'Income')}</th>
                  <th className="py-1.5 text-end font-medium">{tr('المصروفات', 'Expenses')}</th>
                  <th className="py-1.5 text-end font-medium">{tr('حصة الشريك', 'Partner')}</th>
                  <th className="py-1.5 text-end font-medium">{tr('الصافي', 'Net')}</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((r) => (
                  <tr key={r.key} className="border-t border-line">
                    <td className="py-2">{r.key.length === 10 ? formatDate(r.key, lang, 'dmy') : r.label}</td>
                    <td className="py-2 text-end">{formatMoney(r.income, lang, false)}</td>
                    <td className="py-2 text-end">{formatMoney(r.expenses, lang, false)}</td>
                    <td className="py-2 text-end">{formatMoney(r.partner, lang, false)}</td>
                    <td className={cx('py-2 text-end font-bold', r.net < 0 && 'text-negative')}>{formatMoney(r.net, lang, false)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="card space-y-3 p-5">
        <SectionTitle>{tr('تصدير CSV (يفتح في Excel)', 'Export CSV (opens in Excel)')}</SectionTitle>
        <Button icon={FileSpreadsheet} onClick={() => exportTransactions(incomes, expenses, settings, range)}>{tr('معاملات الفترة المحددة', 'Transactions for selected period')}</Button>
        <div className="flex flex-wrap items-end gap-2">
          <Select label={tr('سنة التقرير', 'Report year')} value={year} onChange={(e) => setYear(e.target.value)} options={years.map((y) => ({ value: y, label: y }))} className="w-32" />
          <Button icon={FileSpreadsheet} onClick={() => exportMonthly(incomes, expenses, settings, year)}>{tr('التقرير الشهري', 'Monthly report')}</Button>
          <Button icon={FileSpreadsheet} onClick={() => exportYearly(incomes, expenses, settings)}>{tr('التقرير السنوي', 'Yearly report')}</Button>
          <Button icon={FileSpreadsheet} onClick={() => exportPartnerStatement(incomes, expenses, payments, settings)}>{tr('كشف حساب الشريك', 'Partner statement')}</Button>
        </div>
      </section>
    </div>
  )
}

// ── Page ──
export default function ClinicPage() {
  const { tr } = useI18n()
  const { settings } = useSettings()
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as Tab) || 'overview'
  const setTab = (t: Tab) => setParams((p) => { p.set('tab', t); return p }, { replace: true })
  const incomes = useCollection('income')
  const expenses = useCollection('expenses')
  const payments = useCollection('partnerPayments')
  const [form, setForm] = useState<{ kind: Kind; record?: Stored<Income> | Stored<Expense> } | null>(null)
  const [payForm, setPayForm] = useState<{ payment?: Stored<PartnerPayment> } | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  useParamOnce('add', (v) => setForm({ kind: v === 'expense' ? 'expense' : 'income' }))
  useParamOnce('open', setOpenId)

  useEffect(() => {
    if (!openId || incomes.loading || expenses.loading) return
    const i = incomes.items.find((x) => x.id === openId)
    const e = expenses.items.find((x) => x.id === openId)
    if (i) setForm({ kind: 'income', record: i })
    else if (e) setForm({ kind: 'expense', record: e })
    setOpenId(null)
  }, [openId, incomes, expenses])

  const balance = partnerBalance(incomes.items, expenses.items, payments.items, settings.partnerRates).balance
  const loading = incomes.loading || expenses.loading || payments.loading

  return (
    <div className="fade-in">
      <PageHeader title={settings.clinicName || tr('مالية العيادة', 'Clinic Finance')} />
      <Segmented
        className="mb-4"
        label={tr('أقسام المالية', 'Finance sections')}
        value={tab}
        onChange={setTab}
        options={[
          { value: 'overview', label: tr('نظرة عامة', 'Overview'), icon: Banknote },
          { value: 'income', label: tr('الإيرادات', 'Income'), icon: ArrowDownCircle },
          { value: 'expenses', label: tr('المصروفات', 'Expenses'), icon: ArrowUpCircle },
          { value: 'partner', label: tr('الشريك', 'Partner'), icon: HandCoins },
          { value: 'reports', label: tr('التقارير', 'Reports'), icon: FileSpreadsheet },
        ]}
      />
      {loading ? <ListSkeleton /> : (
        <>
          {tab === 'overview' && <Overview incomes={incomes.items} expenses={expenses.items} payments={payments.items} onAdd={(kind) => setForm({ kind })} onPartner={() => setTab('partner')} />}
          {tab === 'income' && (
            <>
              <div className="mb-3 flex justify-end"><Button variant="primary" icon={Plus} capsule onClick={() => setForm({ kind: 'income' })}>{tr('إيراد', 'Income')}</Button></div>
              <TransactionList kind="income" rows={incomes.items} onEdit={(record) => setForm({ kind: 'income', record })} />
            </>
          )}
          {tab === 'expenses' && (
            <>
              <div className="mb-3 flex justify-end"><Button variant="primary" icon={Plus} capsule onClick={() => setForm({ kind: 'expense' })}>{tr('مصروف', 'Expense')}</Button></div>
              <TransactionList kind="expense" rows={expenses.items} onEdit={(record) => setForm({ kind: 'expense', record })} />
            </>
          )}
          {tab === 'partner' && <PartnerTab incomes={incomes.items} expenses={expenses.items} payments={payments.items} onPay={() => setPayForm({})} onEditPayment={(payment) => setPayForm({ payment })} />}
          {tab === 'reports' && <Reports incomes={incomes.items} expenses={expenses.items} payments={payments.items} />}
        </>
      )}
      {form && <TransactionForm key={`${form.kind}-${form.record?.id ?? 'new'}`} kind={form.kind} record={form.record} onClose={() => setForm(null)} />}
      {payForm && <PaymentForm key={payForm.payment?.id ?? 'new'} payment={payForm.payment} balance={balance} onClose={() => setPayForm(null)} />}
    </div>
  )
}

import { lazy, Suspense, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  ArrowDownLeft, ArrowUpRight, Baby, BookOpen, Briefcase, Car, Circle, Coins, FileSpreadsheet, FileText, Fuel, Gift, GraduationCap, HandHeart, HeartPulse, Home,
  Laptop, PieChart, Plus, Popcorn, Receipt, Repeat, Search, ShoppingBag, ShoppingBasket, Stethoscope, TrendingUp, Undo2, Users, Utensils, Wallet,
  type LucideIcon,
} from 'lucide-react'
import { confirmDelete, toast } from '@/components/common/feedback'
import { GoalsCard } from '@/components/finance/Goals'
import { ReportPreview } from '@/components/finance/ReportPreview'
import { CategoryBars, categoryName, categoryTotals, PeriodPicker, usePeriod } from '@/components/finance/shared'
import { personalProgress, personalReport, type Report } from '@/services/export/report'
import {
  Button, cardNumberClass, Chip, ChipRow, ComboInput, cx, EmptyState, FormFooter, heroNumberClass, Input, ListSkeleton, PageHeader, SectionTitle, Segmented, Sheet, Stat, SyncBadge, Textarea,
} from '@/components/common/ui'
import { useParamOnce } from '@/hooks/useParamOnce'
import { useSettings } from '@/hooks/useSettings'
import { useI18n } from '@/i18n'
import { repo, useCollection } from '@/services/data/store'
import type { FinanceCategory, PersonalTransaction, Stored } from '@/types/models'
import { formatDate, isValidDate, todayStr } from '@/utils/dates'
import { formatMoney, MAX_AMOUNT_MINOR, minorToDecimal, parseAmount, sum } from '@/utils/money'
import { matches } from '@/utils/text'
import { trendBuckets } from '../clinic-finance/finance'
import { dailyAverage, exportPersonal, inPeriod, personalSummary } from './personal'

const IncomeExpenseChart = lazy(() => import('@/components/charts/FinanceCharts').then((m) => ({ default: m.IncomeExpenseChart })))

type Kind = PersonalTransaction['kind']

const ICONS: Record<string, LucideIcon> = {
  food: Utensils, groceries: ShoppingBasket, transport: Car, fuel: Fuel, bills: Receipt, home: Home, kids: Baby, family: Users,
  health: HeartPulse, education: GraduationCap, shopping: ShoppingBag, fun: Popcorn, charity: HandHeart, gifts: Gift, subscriptions: Repeat,
  clinic: Stethoscope, salary: Briefcase, freelance: Laptop, teaching: BookOpen, gift: Gift, investment: TrendingUp, refund: Undo2,
}
const iconFor = (id: string) => ICONS[id] ?? Circle

function useCategories() {
  const { settings } = useSettings()
  return {
    income: settings.personalIncomeCategories,
    expense: settings.personalExpenseCategories,
    of: (kind: Kind) => (kind === 'income' ? settings.personalIncomeCategories : settings.personalExpenseCategories),
  }
}

// ── Form ──
function TransactionSheet({ initialKind, record, onClose }: { initialKind: Kind; record?: Stored<PersonalTransaction>; onClose: () => void }) {
  const { tr, lang } = useI18n()
  const { settings } = useSettings()
  const cats = useCategories()
  const all = useCollection('personalTransactions').items
  const [kind, setKind] = useState<Kind>(record?.kind ?? initialKind)
  const [amount, setAmount] = useState(record ? minorToDecimal(record.amountMinor) : '')
  const [date, setDate] = useState(record?.date ?? todayStr())
  const list = cats.of(kind).filter((c) => !c.archived || c.id === record?.categoryId)
  const [categoryId, setCategoryId] = useState(record?.categoryId ?? list[0]?.id ?? 'other')
  const [description, setDescription] = useState(record?.description ?? '')
  const [paymentMethod, setPaymentMethod] = useState(record?.paymentMethod ?? '')
  const [notes, setNotes] = useState(record?.notes ?? '')
  const [errors, setErrors] = useState<{ amount?: string; date?: string }>({})
  const again = useRef(false)
  const amountRef = useRef<HTMLDivElement>(null)

  const switchKind = (k: Kind) => {
    setKind(k)
    const next = cats.of(k).filter((c) => !c.archived)
    if (!next.some((c) => c.id === categoryId)) setCategoryId(next[0]?.id ?? 'other')
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const minor = parseAmount(amount)
    const errs: typeof errors = {}
    if (minor === null) errs.amount = tr(`أدخل مبلغًا صحيحًا أكبر من صفر (حتى ${formatMoney(MAX_AMOUNT_MINOR, 'ar')}).`, 'Enter a valid amount above zero.')
    if (!isValidDate(date)) errs.date = tr('تاريخ غير صالح.', 'Invalid date.')
    setErrors(errs)
    if (Object.keys(errs).length) return
    const data = { kind, amountMinor: minor!, date, categoryId, description: description.trim(), paymentMethod: paymentMethod.trim(), notes: notes.trim() }
    if (record) await repo.update('personalTransactions', record.id, data)
    else await repo.create('personalTransactions', data)
    toast(kind === 'expense' ? tr('سُجل المصروف', 'Expense saved') : tr('سُجل الدخل', 'Income saved'))
    if (again.current && !record) {
      again.current = false
      setAmount('')
      setDescription('')
      setNotes('')
      setErrors({})
      amountRef.current?.querySelector('input')?.focus()
      return
    }
    onClose()
  }

  const del = async () => {
    if (!record) return
    const ok = await confirmDelete(
      record.kind === 'expense' ? tr('هذا المصروف', 'this expense') : tr('هذا الدخل', 'this income'),
      `${formatMoney(record.amountMinor, lang)} · ${formatDate(record.date, lang, settings.dateFormat)}`,
    )
    if (ok) {
      await repo.remove('personalTransactions', record.id)
      onClose()
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={record ? tr('تعديل الحركة', 'Edit entry') : kind === 'expense' ? tr('مصروف جديد', 'New expense') : tr('دخل جديد', 'New income')}
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
      <form id="sheet-form" onSubmit={(e) => void submit(e)} className="space-y-4" noValidate>
        <Segmented<Kind>
          label={tr('نوع الحركة', 'Entry type')}
          value={kind}
          onChange={switchKind}
          options={[
            { value: 'expense', label: tr('مصروف', 'Expense'), icon: ArrowUpRight },
            { value: 'income', label: tr('دخل', 'Income'), icon: ArrowDownLeft },
          ]}
        />
        <div ref={amountRef} className="grid grid-cols-2 gap-3">
          <Input label={tr('المبلغ (ج.م)', 'Amount (EGP)')} inputMode="decimal" dir="ltr" value={amount} onChange={(e) => setAmount(e.target.value)} error={errors.amount} autoFocus={!record} className="tnum" />
          <Input label={tr('التاريخ', 'Date')} type="date" value={date} onChange={(e) => setDate(e.target.value)} error={errors.date} />
        </div>
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-muted">{tr('التصنيف', 'Category')}</legend>
          {/* Tap targets instead of a dropdown: picking a category is the most frequent action here. */}
          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
            {list.map((c) => {
              const Icon = iconFor(c.id)
              const on = c.id === categoryId
              return (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setCategoryId(c.id)}
                  className={cx('flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl px-1 py-2 text-center text-[13px] leading-tight transition', on ? 'bg-ink text-canvas' : 'bg-raised hover:bg-line')}
                >
                  <Icon className="size-5 shrink-0" />
                  <span className="line-clamp-2">{lang === 'ar' ? c.ar : c.en}</span>
                </button>
              )
            })}
          </div>
        </fieldset>
        <ComboInput
          label={tr('الوصف (اختياري)', 'Description (optional)')}
          value={description}
          onChange={setDescription}
          suggestions={all.filter((t) => t.kind === kind && t.categoryId === categoryId).map((t) => t.description).filter(Boolean)}
          placeholder={kind === 'expense' ? tr('مثل: عشاء، بنزين، فاتورة الكهرباء', 'e.g. dinner, fuel, electricity bill') : ''}
        />
        <ComboInput label={tr('طريقة الدفع (اختياري)', 'Payment method (optional)')} value={paymentMethod} onChange={setPaymentMethod} suggestions={[tr('نقدي', 'Cash'), tr('بطاقة', 'Card'), 'InstaPay', tr('محفظة إلكترونية', 'Mobile wallet'), tr('تحويل بنكي', 'Bank transfer')]} />
        <Textarea label={tr('ملاحظات', 'Notes')} value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
      </form>
    </Sheet>
  )
}

// ── List ──
const PAGE = 60

function Row({ t, cats, onOpen }: { t: Stored<PersonalTransaction>; cats: FinanceCategory[]; onOpen: () => void }) {
  const { lang } = useI18n()
  const Icon = iconFor(t.categoryId)
  const cat = categoryName(cats, t.categoryId, lang)
  const income = t.kind === 'income'
  return (
    <button type="button" onClick={onOpen} className="flex min-h-16 w-full items-center gap-3 px-4 py-2.5 text-start transition hover:bg-raised">
      <span className={cx('grid size-10 shrink-0 place-items-center rounded-full', income ? 'bg-positive/12 text-positive' : 'bg-raised text-ink')}>
        <Icon className="size-4.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium" dir="auto">{t.description || cat}</span>
        <span className="block truncate text-sm text-muted" dir="auto">{[t.description ? cat : '', t.paymentMethod].filter(Boolean).join(' · ')}</span>
      </span>
      <SyncBadge state={t._sync} compact />
      <span className={cx('tnum shrink-0 font-bold', income ? 'text-positive' : 'text-ink')} dir="ltr">
        {income ? '+' : '−'}{formatMoney(t.amountMinor, lang, false)}
      </span>
    </button>
  )
}

export default function PersonalPage() {
  const { tr, lang } = useI18n()
  const { settings } = useSettings()
  const cats = useCategories()
  const { items, loading } = useCollection('personalTransactions')
  const period = usePeriod('month')
  const today = todayStr()
  const [view, setView] = useState<'list' | 'insights'>('list')
  const [kindFilter, setKindFilter] = useState<'all' | Kind>('all')
  const [category, setCategory] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [limit, setLimit] = useState(PAGE)
  const [form, setForm] = useState<{ kind: Kind; record?: Stored<PersonalTransaction> } | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [report, setReport] = useState<Report | null>(null)
  const [exporting, setExporting] = useState(false)
  const excel = async () => {
    setExporting(true)
    try {
      const { downloadExcel } = await import('@/services/export/excel')
      await downloadExcel(personalReport(items, settings, period.range))
      toast(tr('نُزل ملف Excel', 'Excel file downloaded'))
    } catch {
      toast(tr('تعذر إنشاء ملف Excel', 'Could not create the Excel file'), 'error')
    } finally {
      setExporting(false)
    }
  }
  useParamOnce('add', (v) => setForm({ kind: v === 'income' ? 'income' : 'expense' }))
  useParamOnce('open', setOpenId)

  useEffect(() => {
    if (!openId || loading) return
    const t = items.find((x) => x.id === openId)
    if (t) setForm({ kind: t.kind, record: t })
    setOpenId(null)
  }, [openId, items, loading])

  const inRangeRows = useMemo(() => inPeriod(items, period.range), [items, period.range])
  const summary = useMemo(() => personalSummary(inRangeRows), [inRangeRows])
  const todaySummary = useMemo(() => personalSummary(items.filter((t) => t.date === today)), [items, today])

  const filtered = useMemo(() => inRangeRows
    .filter((t) => {
      if (kindFilter !== 'all' && t.kind !== kindFilter) return false
      if (category && t.categoryId !== category) return false
      return matches(`${t.description} ${t.notes} ${t.paymentMethod} ${categoryName(cats.of(t.kind), t.categoryId, lang)} ${minorToDecimal(t.amountMinor)}`, q)
    })
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)), [inRangeRows, kindFilter, category, q, cats, lang])
  useEffect(() => setLimit(PAGE), [period.range, kindFilter, category, q])

  const days = useMemo(() => {
    const m = new Map<string, Stored<PersonalTransaction>[]>()
    for (const t of filtered.slice(0, limit)) m.set(t.date, [...(m.get(t.date) ?? []), t])
    return [...m.entries()]
  }, [filtered, limit])

  const chipCats = kindFilter === 'income' ? cats.income : kindFilter === 'expense' ? cats.expense : [...cats.expense, ...cats.income.filter((c) => !cats.expense.some((e) => e.id === c.id))]
  const usedCats = new Set(inRangeRows.map((t) => t.categoryId))
  const balanceText = formatMoney(summary.balance, 'en', false)

  const spent = inRangeRows.filter((t) => t.kind === 'expense')
  const earned = inRangeRows.filter((t) => t.kind === 'income')
  const trend = useMemo(() => {
    const b = trendBuckets(period.range)
    return b.keys.map((key) => {
      const rows = inRangeRows.filter((t) => b.keyOf(t.date) === key)
      const s = personalSummary(rows)
      return { key, label: b.labelOf(key), income: s.income, expenses: s.expenses, net: s.balance }
    })
  }, [inRangeRows, period.range])
  const topCategory = categoryTotals(spent, cats.expense, lang)[0]

  return (
    <div className="fade-in">
      <PageHeader
        title={tr('المالية الشخصية', 'Personal Finance')}
        subtitle={tr('مصروفك ودخلك اليومي، منفصلان تمامًا عن العيادة.', 'Your daily spending and income, kept apart from the clinic.')}
        actions={<Button variant="primary" icon={Plus} capsule onClick={() => setForm({ kind: 'expense' })}>{tr('مصروف', 'Expense')}</Button>}
      />
      <PeriodPicker p={period} />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-5">
        <section className="rounded-[2.25rem] bg-[#A8E6CF] p-6 text-charcoal lg:col-span-3">
          <p className="text-[15px] font-medium opacity-70">{summary.balance >= 0 ? tr('المتبقي', 'Left over') : tr('صرفت أكثر مما دخل', 'Spent more than came in')}</p>
          <p className={cx('tnum mt-2 leading-none font-bold', heroNumberClass(balanceText))} dir="ltr" style={{ textAlign: lang === 'ar' ? 'right' : 'left' }}>{balanceText}</p>
          <p className="mt-1 text-sm opacity-70">{tr('جنيه مصري', 'Egyptian pounds')} · {formatDate(period.range.from, lang, 'dmy')} – {formatDate(period.range.to, lang, 'dmy')}</p>
          <div className="mt-5 grid grid-cols-1 gap-2 min-[340px]:grid-cols-2">
            <div className="rounded-3xl bg-white/60 px-4 py-3">
              <div className="text-sm opacity-70">{tr('الدخل', 'Income')}</div>
              <div className={cx('tnum font-bold', cardNumberClass(formatMoney(summary.income, lang, false)))}>{formatMoney(summary.income, lang, false)}</div>
            </div>
            <div className="rounded-3xl bg-charcoal px-4 py-3 text-white">
              <div className="text-sm opacity-70">{tr('المصروف', 'Spent')}</div>
              <div className={cx('tnum font-bold', cardNumberClass(formatMoney(summary.expenses, lang, false)))}>{formatMoney(summary.expenses, lang, false)}</div>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button variant="ink" className="!bg-charcoal !text-white" icon={ArrowUpRight} onClick={() => setForm({ kind: 'expense' })}>{tr('مصروف', 'Expense')}</Button>
            <Button className="!bg-white/70 !text-charcoal" icon={ArrowDownLeft} onClick={() => setForm({ kind: 'income' })}>{tr('دخل', 'Income')}</Button>
          </div>
        </section>
        <section className="card grid grid-cols-2 content-center gap-4 p-5 lg:col-span-2 lg:grid-cols-1">
          <Stat label={tr('صرفت اليوم', 'Spent today')} value={formatMoney(todaySummary.expenses, lang)} />
          <Stat label={tr('دخل اليوم', 'Income today')} value={formatMoney(todaySummary.income, lang)} />
          <Stat label={tr('متوسط المصروف اليومي', 'Average per day')} value={formatMoney(dailyAverage(summary.expenses, period.range, today), lang)} />
          <Stat label={tr('أكثر بند صرفًا', 'Top spending')} value={topCategory ? topCategory.name : '—'} sub={topCategory ? formatMoney(topCategory.amount, lang) : undefined} />
        </section>
      </div>

      <div className="mt-3">
        <GoalsCard scope="personal" progress={personalProgress(items, settings)} />
      </div>

      <Segmented
        className="mt-5 mb-4"
        label={tr('طريقة العرض', 'View')}
        value={view}
        onChange={setView}
        options={[{ value: 'list', label: tr('الحركات', 'Entries'), icon: Wallet }, { value: 'insights', label: tr('التحليل', 'Insights'), icon: PieChart }]}
      />

      {view === 'list' ? (
        <>
          <div className="relative mb-3">
            <Search className="pointer-events-none absolute start-4 top-1/2 size-4.5 -translate-y-1/2 text-faint" />
            <input aria-label={tr('بحث في الحركات', 'Search entries')} value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr('وصف، تصنيف، مبلغ…', 'Description, category, amount…')} className="field !rounded-full !px-11" dir={q ? 'auto' : undefined} />
          </div>
          <ChipRow className="mb-2">
            <Chip active={kindFilter === 'all'} onClick={() => { setKindFilter('all'); setCategory(null) }}>{tr('الكل', 'All')}</Chip>
            <Chip active={kindFilter === 'expense'} onClick={() => { setKindFilter('expense'); setCategory(null) }}>{tr('المصروفات', 'Spending')}</Chip>
            <Chip active={kindFilter === 'income'} onClick={() => { setKindFilter('income'); setCategory(null) }}>{tr('الدخل', 'Income')}</Chip>
          </ChipRow>
          <ChipRow className="mb-4">
            {chipCats.filter((c) => usedCats.has(c.id)).map((c) => <Chip key={c.id} active={category === c.id} onClick={() => setCategory(category === c.id ? null : c.id)}>{lang === 'ar' ? c.ar : c.en}</Chip>)}
          </ChipRow>
          {loading ? <ListSkeleton /> : filtered.length === 0 ? (
            <EmptyState
              icon={Coins}
              title={items.length === 0 ? tr('سجّل أول مصروف', 'Log your first expense') : tr('لا توجد حركات هنا', 'No entries here')}
              body={items.length === 0 ? tr('ثوانٍ لكل حركة: المبلغ والتصنيف، والباقي اختياري.', 'Seconds per entry: amount and category, the rest is optional.') : tr('غيّر الفترة أو الفلتر.', 'Change the period or filter.')}
              action={items.length === 0 ? <Button variant="primary" icon={Plus} onClick={() => setForm({ kind: 'expense' })}>{tr('مصروف جديد', 'New expense')}</Button> : undefined}
            />
          ) : (
            <div className="space-y-4">
              {days.map(([day, list]) => {
                const d = personalSummary(list)
                return (
                  <section key={day} aria-label={day}>
                    <div className="mb-1.5 flex items-baseline justify-between gap-2 px-2 text-sm text-faint">
                      <span>{day === today ? tr('اليوم', 'Today') : formatDate(day, lang, settings.dateFormat)}</span>
                      <span className="tnum">{d.expenses ? `${tr('صُرف', 'Spent')} ${formatMoney(d.expenses, lang, false)}` : ''}{d.expenses && d.income ? ' · ' : ''}{d.income ? `${tr('دخل', 'In')} ${formatMoney(d.income, lang, false)}` : ''}</span>
                    </div>
                    <div className="card divide-y divide-line overflow-hidden">
                      {list.map((t) => <Row key={t.id} t={t} cats={cats.of(t.kind)} onOpen={() => setForm({ kind: t.kind, record: t })} />)}
                    </div>
                  </section>
                )
              })}
              {filtered.length > limit && <Button className="w-full" onClick={() => setLimit(limit + PAGE)}>{tr('عرض المزيد', 'Show more')}</Button>}
            </div>
          )}
        </>
      ) : (
        <div className="space-y-4">
          {inRangeRows.length > 0 && (
            <section className="card p-5">
              <SectionTitle>{tr('الدخل مقابل المصروف', 'Income vs spending')}</SectionTitle>
              <Suspense fallback={<div className="skeleton h-64" />}><IncomeExpenseChart data={trend} /></Suspense>
            </section>
          )}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <CategoryBars title={tr('أين ذهبت فلوسك', 'Where your money went')} rows={categoryTotals(spent, cats.expense, lang)} />
            <CategoryBars title={tr('مصادر الدخل', 'Where it came from')} rows={categoryTotals(earned, cats.income, lang)} />
          </div>
          <section className="card space-y-3 p-5">
            <SectionTitle>{tr('تقرير منسق للفترة المحددة', 'Formatted report for this period')}</SectionTitle>
            <div className="flex flex-wrap gap-2">
              <Button variant="ink" icon={FileText} onClick={() => setReport(personalReport(items, settings, period.range))}>{tr('تقرير PDF', 'PDF report')}</Button>
              <Button icon={FileSpreadsheet} busy={exporting} onClick={() => void excel()}>{tr('ملف Excel منسق', 'Formatted Excel')}</Button>
            </div>
          </section>
          <section className="card space-y-3 p-5">
            <SectionTitle>{tr('تصدير CSV (يفتح في Excel)', 'Export CSV (opens in Excel)')}</SectionTitle>
            <p className="text-sm text-muted">{tr(`${inRangeRows.length} حركة في الفترة المحددة، بإجمالي مصروف ${formatMoney(sum(spent), lang)}.`, `${inRangeRows.length} entries in this period, ${formatMoney(sum(spent), lang)} spent.`)}</p>
            <Button icon={FileSpreadsheet} disabled={!inRangeRows.length} onClick={() => exportPersonal(items, cats.income, cats.expense, period.range)}>{tr('تصدير الفترة المحددة', 'Export this period')}</Button>
          </section>
        </div>
      )}

      {report && <ReportPreview report={report} onClose={() => setReport(null)} />}
      {form && <TransactionSheet key={`${form.kind}-${form.record?.id ?? 'new'}`} initialKind={form.kind} record={form.record} onClose={() => setForm(null)} />}
    </div>
  )
}

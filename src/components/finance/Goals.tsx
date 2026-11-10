/** Monthly target and budget cards with progress bars, plus the sheet that edits them. */
import { useState, type FormEvent } from 'react'
import { Pencil, Plus, Target, Trash2 } from 'lucide-react'
import { toast } from '@/components/common/feedback'
import { Button, cx, FormFooter, IconButton, Input, Segmented, Select, Sheet } from '@/components/common/ui'
import { useSettings } from '@/hooks/useSettings'
import { useI18n } from '@/i18n'
import { progressStateText, type ReportProgress } from '@/services/export/report'
import type { AppSettings, ClinicTarget, FinanceCategory, MonthlyBudget } from '@/types/models'
import { monthElapsed } from '@/utils/budget'
import { todayStr } from '@/utils/dates'
import { formatMoney, minorToDecimal, parseAmount } from '@/utils/money'

export type GoalScope = 'clinic' | 'personal'

const tone = (p: ReportProgress) =>
  p.state === 'over' ? 'bg-negative' : p.state === 'warn' || p.state === 'fast' || p.state === 'behind' ? 'bg-caution' : p.kind === 'target' ? 'bg-cobalt' : 'bg-positive'

/** A bar that shows how much is used or achieved, with a tick for how much of the month has passed. */
export function ProgressRow({ p, compact }: { p: ReportProgress; compact?: boolean }) {
  const { tr, lang } = useI18n()
  const elapsed = Math.round(monthElapsed(todayStr()) * 100)
  const left = p.kind === 'budget'
    ? p.remaining >= 0 ? tr(`متبقي ${formatMoney(p.remaining, lang)}`, `${formatMoney(p.remaining, lang)} left`) : tr(`تجاوزت بـ ${formatMoney(-p.remaining, lang)}`, `${formatMoney(-p.remaining, lang)} over`)
    : p.remaining > 0 ? tr(`باقي ${formatMoney(p.remaining, lang)}`, `${formatMoney(p.remaining, lang)} to go`) : tr('تحقق الهدف', 'Target reached')
  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <span className={cx('min-w-0 font-medium', compact ? 'text-sm' : 'text-[15px]')}>{p.label}</span>
        <span className="tnum text-sm text-muted">
          {formatMoney(p.used, lang, false)} / {formatMoney(p.limit, lang, false)}
        </span>
      </div>
      <div
        className="relative h-3 overflow-hidden rounded-full bg-raised"
        role="progressbar"
        aria-valuenow={Math.round(p.pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${p.label}: ${Math.round(p.pct)}%`}
      >
        <div className={cx('hatch h-full rounded-full transition-all duration-500', tone(p))} style={{ width: `${Math.min(100, p.pct)}%` }} />
        {/* The month-so-far marker: spending to its left is on pace. */}
        <span aria-hidden className="absolute inset-y-0 w-0.5 bg-ink/50" style={{ insetInlineStart: `${elapsed}%` }} />
      </div>
      <div className="mt-1 flex flex-wrap justify-between gap-x-3 text-xs">
        <span className={cx('font-medium', p.state === 'over' ? 'text-negative' : p.state === 'warn' || p.state === 'fast' || p.state === 'behind' ? 'text-caution' : 'text-positive')}>
          {Math.round(p.pct)}% · {progressStateText(p.state)}
        </span>
        <span className="text-faint">{left}</span>
      </div>
    </div>
  )
}

export function GoalsCard({ scope, progress }: { scope: GoalScope; progress: ReportProgress[] }) {
  const { tr } = useI18n()
  const [editing, setEditing] = useState(false)
  const title = scope === 'clinic' ? tr('هدف وبادجت هذا الشهر', "This month's target and budget") : tr('بادجت هذا الشهر', "This month's budget")
  return (
    <section className="card p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-bold"><Target className="size-5 text-muted" />{title}</h2>
        {progress.length > 0 && <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEditing(true)}>{tr('تعديل', 'Edit')}</Button>}
      </div>
      {progress.length === 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[15px] text-muted">
            {scope === 'clinic'
              ? tr('حدد هدفًا شهريًا للإيرادات أو الصافي، وحدًا للمصروفات، وتابع تقدمك يومًا بيوم.', 'Set a monthly income or net target and an expense limit, then follow your progress day by day.')
              : tr('حدد بادجت شهريًا لمصروفك، أو لبنود معينة، وتابع اد إيه استهلكت.', 'Set a monthly spending budget, overall or per category, and see how much is used.')}
          </p>
          <Button variant="primary" icon={Plus} onClick={() => setEditing(true)}>{scope === 'clinic' ? tr('حدد الهدف والبادجت', 'Set target and budget') : tr('حدد البادجت', 'Set a budget')}</Button>
        </div>
      ) : (
        <div className="space-y-4">{progress.map((p) => <ProgressRow key={p.label} p={p} />)}</div>
      )}
      {progress.length > 0 && <p className="mt-3 text-xs text-faint">{tr('الخط الرأسي يمثل ما مضى من الشهر.', 'The vertical line marks how much of the month has passed.')}</p>}
      {editing && <GoalsSheet scope={scope} onClose={() => setEditing(false)} />}
    </section>
  )
}

const amountText = (minor: number | null | undefined) => (minor ? minorToDecimal(minor).replace(/\.00$/, '') : '')

export function GoalsSheet({ scope, onClose }: { scope: GoalScope; onClose: () => void }) {
  const { tr, lang } = useI18n()
  const { settings, save } = useSettings()
  const budget: MonthlyBudget = scope === 'clinic' ? settings.clinicBudget : settings.personalBudget
  const cats: FinanceCategory[] = (scope === 'clinic' ? settings.expenseCategories : settings.personalExpenseCategories).filter((c) => !c.archived)
  const [basis, setBasis] = useState<ClinicTarget['basis']>(settings.clinicTarget?.basis ?? 'net')
  const [target, setTarget] = useState(amountText(settings.clinicTarget?.amountMinor))
  const [total, setTotal] = useState(amountText(budget.totalMinor))
  const [rows, setRows] = useState<{ id: string; amount: string }[]>(Object.entries(budget.categories).map(([id, v]) => ({ id, amount: amountText(v) })))
  const [errors, setErrors] = useState<Record<string, string>>({})

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const errs: Record<string, string> = {}
    const parse = (key: string, text: string) => {
      if (!text.trim()) return null
      const v = parseAmount(text)
      if (v === null) errs[key] = tr('مبلغ غير صحيح.', 'Invalid amount.')
      return v
    }
    const t = scope === 'clinic' ? parse('target', target) : null
    const tot = parse('total', total)
    const categories: Record<string, number> = {}
    rows.forEach((r, i) => {
      const v = parse(`row${i}`, r.amount)
      if (v !== null && r.id) categories[r.id] = v
    })
    setErrors(errs)
    if (Object.keys(errs).length) return
    const next: MonthlyBudget = { totalMinor: tot, categories }
    const patch: Partial<AppSettings> = scope === 'clinic'
      ? { clinicBudget: next, clinicTarget: t ? { basis, amountMinor: t } : null }
      : { personalBudget: next }
    await save(patch)
    toast(tr('حُفظ', 'Saved'))
    onClose()
  }

  const unused = cats.filter((c) => !rows.some((r) => r.id === c.id))

  return (
    <Sheet open onClose={onClose} title={scope === 'clinic' ? tr('الهدف والبادجت الشهري', 'Monthly target and budget') : tr('البادجت الشهري', 'Monthly budget')} footer={<FormFooter onCancel={onClose} />}>
      <form id="sheet-form" onSubmit={(e) => void submit(e)} className="space-y-5" noValidate>
        {scope === 'clinic' && (
          <fieldset className="space-y-3 rounded-3xl bg-raised/60 p-4">
            <legend className="sr-only">{tr('الهدف', 'Target')}</legend>
            <h3 className="font-bold">{tr('الهدف المالي للشهر', 'Monthly financial target')}</h3>
            <Segmented
              label={tr('يُقاس على', 'Measured on')}
              value={basis}
              onChange={setBasis}
              options={[{ value: 'net', label: tr('صافي النتيجة', 'Net result') }, { value: 'income', label: tr('الإيرادات', 'Income') }]}
            />
            <Input label={tr('قيمة الهدف (ج.م)', 'Target (EGP)')} inputMode="decimal" dir="ltr" value={target} onChange={(e) => setTarget(e.target.value)} error={errors.target} placeholder={tr('اتركه فارغًا لإلغاء الهدف', 'Leave empty for no target')} />
            <p className="text-xs text-faint">{basis === 'net' ? tr('الصافي بعد المصروفات وحصة الشريك.', 'Net after expenses and the partner share.') : tr('إجمالي الإيرادات قبل أي خصم.', 'Total income before anything is deducted.')}</p>
          </fieldset>
        )}
        <fieldset className="space-y-3">
          <legend className="sr-only">{tr('البادجت', 'Budget')}</legend>
          <h3 className="font-bold">{scope === 'clinic' ? tr('بادجت المصروفات', 'Expense budget') : tr('بادجت المصروف', 'Spending budget')}</h3>
          <Input label={tr('الحد الشهري الإجمالي (ج.م)', 'Total monthly limit (EGP)')} inputMode="decimal" dir="ltr" value={total} onChange={(e) => setTotal(e.target.value)} error={errors.total} placeholder={tr('اختياري', 'Optional')} />
          <div>
            <div className="mb-1.5 text-sm font-medium text-muted">{tr('حد لكل بند (اختياري)', 'Limit per category (optional)')}</div>
            <ul className="space-y-2">
              {rows.map((r, i) => (
                <li key={i} className="flex items-start gap-2">
                  <Select
                    aria-label={tr('البند', 'Category')}
                    className="min-w-0 flex-1"
                    value={r.id}
                    onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, id: e.target.value } : x)))}
                    options={cats.filter((c) => c.id === r.id || !rows.some((x) => x.id === c.id)).map((c) => ({ value: c.id, label: lang === 'ar' ? c.ar : c.en }))}
                  />
                  <Input aria-label={tr('الحد', 'Limit')} className="w-32" inputMode="decimal" dir="ltr" value={r.amount} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} error={errors[`row${i}`]} />
                  <IconButton icon={Trash2} label={tr('إزالة', 'Remove')} onClick={() => setRows(rows.filter((_, j) => j !== i))} />
                </li>
              ))}
            </ul>
            {unused.length > 0 && (
              <Button size="sm" className="mt-2" icon={Plus} onClick={() => setRows([...rows, { id: unused[0]!.id, amount: '' }])}>{tr('حد لبند', 'Add a category limit')}</Button>
            )}
          </div>
        </fieldset>
        <p className="text-xs text-faint">{tr('الهدف والبادجت شهريان ويبدآن من جديد أول كل شهر.', 'Targets and budgets are monthly and start fresh each month.')}</p>
      </form>
    </Sheet>
  )
}

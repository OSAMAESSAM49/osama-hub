/** Period selection and category breakdown, shared by Clinic Finance and Personal Finance. */
import { useMemo, useState } from 'react'
import { Chip, ChipRow, Input, SectionTitle } from '@/components/common/ui'
import { useSettings } from '@/hooks/useSettings'
import { useI18n } from '@/i18n'
import type { FinanceCategory } from '@/types/models'
import { type DateRange, rangeFor, type RangePreset, startOfYear, todayStr } from '@/utils/dates'
import { formatMoney, sum } from '@/utils/money'

export function usePeriod(initial: RangePreset = 'month') {
  const { settings } = useSettings()
  const [preset, setPreset] = useState<RangePreset>(initial)
  const today = todayStr()
  const [custom, setCustom] = useState<DateRange>({ from: startOfYear(today), to: today })
  const range = useMemo(() => (preset === 'custom' ? custom : rangeFor(preset, settings.weekStart, today)), [preset, custom, settings.weekStart, today])
  return { preset, setPreset, custom, setCustom, range }
}

export function PeriodPicker({ p }: { p: ReturnType<typeof usePeriod> }) {
  const { tr } = useI18n()
  const options: [RangePreset, string][] = [
    ['today', tr('اليوم', 'Today')], ['yesterday', tr('أمس', 'Yesterday')], ['week', tr('هذا الأسبوع', 'This week')],
    ['month', tr('هذا الشهر', 'This month')], ['year', tr('هذه السنة', 'This year')], ['custom', tr('مخصص', 'Custom')],
  ]
  const invalid = p.preset === 'custom' && p.custom.from > p.custom.to
  return (
    <div className="mb-4">
      <ChipRow>
        {options.map(([v, label]) => <Chip key={v} active={p.preset === v} onClick={() => p.setPreset(v)}>{label}</Chip>)}
      </ChipRow>
      {p.preset === 'custom' && (
        <div className="mt-2 grid max-w-md grid-cols-2 gap-2">
          <Input aria-label={tr('من', 'From')} label={tr('من', 'From')} type="date" value={p.custom.from} onChange={(e) => p.setCustom({ ...p.custom, from: e.target.value })} />
          <Input aria-label={tr('إلى', 'To')} label={tr('إلى', 'To')} type="date" value={p.custom.to} onChange={(e) => p.setCustom({ ...p.custom, to: e.target.value })} error={invalid ? tr('يجب أن يكون بعد تاريخ البداية.', 'Must be after the start.') : null} />
        </div>
      )}
    </div>
  )
}

export const categoryName = (list: FinanceCategory[], id: string, lang: 'ar' | 'en') => {
  const c = list.find((x) => x.id === id)
  return c ? (lang === 'ar' ? c.ar : c.en) : id
}

export interface CategoryTotal {
  id: string
  name: string
  amount: number
  share: number
}

export function categoryTotals(rows: { amountMinor: number; categoryId: string }[], cats: FinanceCategory[], lang: 'ar' | 'en'): CategoryTotal[] {
  const m = new Map<string, number>()
  for (const r of rows) m.set(r.categoryId, (m.get(r.categoryId) ?? 0) + r.amountMinor)
  const total = sum(rows)
  return [...m.entries()]
    .map(([id, amount]) => ({ id, name: categoryName(cats, id, lang), amount, share: total ? (amount / total) * 100 : 0 }))
    .sort((a, b) => b.amount - a.amount)
}

export function CategoryBars({ title, rows }: { title: string; rows: CategoryTotal[] }) {
  const { tr, lang } = useI18n()
  return (
    <section className="card p-5">
      <SectionTitle>{title}</SectionTitle>
      {rows.length === 0 ? <p className="text-[15px] text-faint">{tr('لا بيانات في هذه الفترة.', 'No data in this period.')}</p> : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.id}>
              <div className="mb-1 flex items-baseline justify-between gap-3 text-[15px]">
                <span className="min-w-0 truncate">{r.name}</span>
                <span className="tnum shrink-0 font-bold">{formatMoney(r.amount, lang, false)} <span className="text-xs font-normal text-faint">{r.share.toFixed(0)}%</span></span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-raised">
                <div className="h-full rounded-full" style={{ width: `${r.share}%`, background: 'var(--c-series-1)' }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

import { useMemo, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useI18n } from '@/i18n'
import { addDays, formatMonth, monthGrid, parseDate, shiftMonth, todayStr } from '@/utils/dates'
import { useSettings } from '@/hooks/useSettings'
import { cx, IconButton } from './ui'

export interface CalendarItem {
  id: string
  date: string
  title: string
  tone?: string
  onClick?: () => void
}

/** A month grid shared by tasks, ideas and the journal. On phones each day shows dots, then a list. */
export function CalendarMonth({ items, renderExtra, onPickDay }: {
  items: CalendarItem[]
  renderExtra?: (day: string) => ReactNode
  onPickDay?: (day: string) => void
}) {
  const { lang, tr } = useI18n()
  const { settings } = useSettings()
  const today = todayStr()
  const [month, setMonth] = useState(today.slice(0, 7))
  const [selected, setSelected] = useState<string | null>(today)
  const grid = useMemo(() => monthGrid(month, settings.weekStart), [month, settings.weekStart])
  const byDay = useMemo(() => {
    const m = new Map<string, CalendarItem[]>()
    for (const i of items) m.set(i.date, [...(m.get(i.date) ?? []), i])
    return m
  }, [items])
  const fmtDay = new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG' : 'en-GB', { weekday: 'short' })
  const dayItems = selected ? (byDay.get(selected) ?? []) : []

  return (
    <div className="card p-3 sm:p-5">
      <div className="mb-3 flex items-center justify-between">
        <IconButton icon={lang === 'ar' ? ChevronRight : ChevronLeft} label={tr('الشهر السابق', 'Previous month')} onClick={() => setMonth(shiftMonth(month, -1))} />
        <h3 className="font-bold">{formatMonth(month, lang)}</h3>
        <IconButton icon={lang === 'ar' ? ChevronLeft : ChevronRight} label={tr('الشهر التالي', 'Next month')} onClick={() => setMonth(shiftMonth(month, 1))} />
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs text-faint">
        {Array.from({ length: 7 }, (_, i) => addDays(grid[0]![0]!, i)).map((d) => (
          <div key={d} className="py-1">{fmtDay.format(parseDate(d))}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {grid.flat().map((d) => {
          const list = byDay.get(d) ?? []
          const inMonth = d.startsWith(month)
          return (
            <button
              key={d}
              type="button"
              onClick={() => {
                setSelected(d)
                onPickDay?.(d)
              }}
              aria-pressed={selected === d}
              aria-label={`${d}, ${list.length}`}
              className={cx(
                'flex min-h-14 flex-col items-center gap-1 rounded-2xl p-1 transition sm:min-h-20',
                !inMonth && 'opacity-35',
                selected === d ? 'bg-ink text-canvas' : 'hover:bg-raised',
              )}
            >
              <span className={cx('tnum grid size-6 place-items-center rounded-full text-sm', d === today && selected !== d && 'bg-lime font-bold text-charcoal')}>
                {parseDate(d).getDate()}
              </span>
              <span className="hidden w-full flex-col gap-0.5 sm:flex">
                {list.slice(0, 2).map((i) => (
                  <span key={i.id} className="truncate rounded-md bg-raised px-1 text-start text-[11px] leading-5 text-ink">{i.title}</span>
                ))}
                {list.length > 2 && <span className="text-[11px] opacity-70">+{list.length - 2}</span>}
              </span>
              <span className="flex gap-0.5 sm:hidden">
                {list.slice(0, 3).map((i) => (
                  <span key={i.id} className={cx('size-1.5 rounded-full', selected === d ? 'bg-canvas' : 'bg-accent')} />
                ))}
              </span>
            </button>
          )
        })}
      </div>
      {selected && (
        <div className="mt-3 space-y-1.5 border-t border-line pt-3">
          {dayItems.length === 0 && !renderExtra && <p className="px-2 text-sm text-faint">{tr('لا يوجد شيء في هذا اليوم.', 'Nothing on this day.')}</p>}
          {dayItems.map((i) => (
            <button key={i.id} type="button" onClick={i.onClick} className="block w-full truncate rounded-2xl bg-raised px-4 py-2.5 text-start text-[15px] hover:bg-line">
              {i.title}
            </button>
          ))}
          {renderExtra?.(selected)}
        </div>
      )}
    </div>
  )
}

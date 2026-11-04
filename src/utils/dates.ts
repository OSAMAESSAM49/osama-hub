/** Dates are local-calendar strings (YYYY-MM-DD). All maths goes through noon to avoid DST edge cases. */

export const pad = (n: number) => String(n).padStart(2, '0')

export const toDateStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const todayStr = () => toDateStr(new Date())

export const parseDate = (s: string) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y!, (m ?? 1) - 1, d ?? 1, 12)
}

export function isValidDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const d = parseDate(s)
  return toDateStr(d) === s
}

export function addDays(s: string, n: number): string {
  const d = parseDate(s)
  d.setDate(d.getDate() + n)
  return toDateStr(d)
}

export function startOfWeek(s: string, weekStart: number): string {
  const d = parseDate(s)
  return addDays(s, -((d.getDay() - weekStart + 7) % 7))
}

export const monthKey = (s: string) => s.slice(0, 7)
export const yearKey = (s: string) => s.slice(0, 4)
export const startOfMonth = (s: string) => `${s.slice(0, 7)}-01`
export function endOfMonth(s: string): string {
  const d = parseDate(startOfMonth(s))
  d.setMonth(d.getMonth() + 1, 0)
  return toDateStr(d)
}
export const startOfYear = (s: string) => `${s.slice(0, 4)}-01-01`
export const endOfYear = (s: string) => `${s.slice(0, 4)}-12-31`

export type RangePreset = 'today' | 'yesterday' | 'week' | 'month' | 'year' | 'custom'
export interface DateRange {
  from: string
  to: string
}

export function rangeFor(preset: Exclude<RangePreset, 'custom'>, weekStart: number, today = todayStr()): DateRange {
  switch (preset) {
    case 'today':
      return { from: today, to: today }
    case 'yesterday': {
      const y = addDays(today, -1)
      return { from: y, to: y }
    }
    case 'week': {
      const from = startOfWeek(today, weekStart)
      return { from, to: addDays(from, 6) }
    }
    case 'month':
      return { from: startOfMonth(today), to: endOfMonth(today) }
    case 'year':
      return { from: startOfYear(today), to: endOfYear(today) }
  }
}

export const inRange = (date: string, r: DateRange) => date >= r.from && date <= r.to

export const daysBetween = (a: string, b: string) =>
  Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / 86_400_000)

export type DateFormat = 'long' | 'dmy' | 'iso'

const locale = (lang: 'ar' | 'en') => (lang === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB')

export function formatDate(s: string | null | undefined, lang: 'ar' | 'en', fmt: DateFormat = 'long'): string {
  if (!s) return ''
  const d = s.length > 10 ? new Date(s) : parseDate(s)
  if (Number.isNaN(d.getTime())) return ''
  if (fmt === 'iso') return toDateStr(d)
  if (fmt === 'dmy') return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`
  return new Intl.DateTimeFormat(locale(lang), { day: 'numeric', month: 'long', year: 'numeric' }).format(d)
}

export function formatDayLong(s: string, lang: 'ar' | 'en'): string {
  return new Intl.DateTimeFormat(locale(lang), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(
    parseDate(s),
  )
}

export function formatMonth(key: string, lang: 'ar' | 'en', short = false): string {
  return new Intl.DateTimeFormat(locale(lang), { month: short ? 'short' : 'long', year: short ? undefined : 'numeric' }).format(
    parseDate(`${key}-01`),
  )
}

export function formatTime(iso: string, lang: 'ar' | 'en', fmt: '12' | '24' = '12'): string {
  return new Intl.DateTimeFormat(locale(lang), { hour: 'numeric', minute: '2-digit', hour12: fmt === '12' }).format(new Date(iso))
}

export function formatDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec))
  const m = Math.floor(s / 60)
  const h = Math.floor(m / 60)
  return h ? `${h}:${pad(m % 60)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`
}

/** Calendar weeks that cover a month, for month-grid views. */
export function monthGrid(month: string, weekStart: number): string[][] {
  const first = startOfWeek(`${month}-01`, weekStart)
  const last = endOfMonth(`${month}-01`)
  const weeks: string[][] = []
  let cursor = first
  while (cursor <= last) {
    const week = Array.from({ length: 7 }, (_, i) => addDays(cursor, i))
    weeks.push(week)
    cursor = addDays(cursor, 7)
  }
  return weeks
}

export function shiftMonth(month: string, n: number): string {
  const d = parseDate(`${month}-01`)
  d.setMonth(d.getMonth() + n)
  return toDateStr(d).slice(0, 7)
}

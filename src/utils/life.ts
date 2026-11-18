/** Life-in-days figures from a birth date. Pure date maths on local calendar dates. */
import { daysBetween, isValidDate, pad, parseDate, toDateStr } from './dates'

/** The same day N years later. 29 February becomes 28 February in non-leap years. */
export function addYears(date: string, years: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  const target = new Date(y + years, m - 1, 1, 12)
  const lastDay = new Date(y + years, m, 0, 12).getDate()
  target.setDate(Math.min(d, lastDay))
  return toDateStr(target)
}

export interface Age {
  years: number
  months: number
  days: number
}

/** The same day N months later, clamped to the end of a shorter month. */
export function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  const target = new Date(y, m - 1 + months, 1, 12)
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0, 12).getDate()
  target.setDate(Math.min(d, lastDay))
  return toDateStr(target)
}

/** Calendar age: whole years, then whole months, then the days left over. Never negative. */
export function ageOn(birth: string, today: string): Age {
  let years = parseDate(today).getFullYear() - parseDate(birth).getFullYear()
  while (years > 0 && addYears(birth, years) > today) years--
  const anchor = addYears(birth, years)
  let months = 0
  while (months < 11 && addMonths(anchor, months + 1) <= today) months++
  return { years, months, days: daysBetween(addMonths(anchor, months), today) }
}

export interface LifeStats {
  age: Age
  daysLived: number
  weeksLived: number
  /** Days from today until the lower and upper ages; 0 once passed. */
  daysToMin: number
  daysToMax: number
  /** Share of the upper age already lived, 0 to 100. */
  pctOfMax: number
  /** Where the lower age sits on a bar that ends at the upper age, 0 to 100. */
  minMarkPct: number
  /** Fraction of the current year of life already lived, 0 to 1. */
  yearFraction: number
}

export function lifeStats(birth: string, today: string, minYears: number, maxYears: number): LifeStats | null {
  if (!isValidDate(birth) || birth > today || maxYears <= 0 || minYears > maxYears) return null
  const age = ageOn(birth, today)
  const daysLived = daysBetween(birth, today)
  const endMin = addYears(birth, minYears)
  const endMax = addYears(birth, maxYears)
  const total = daysBetween(birth, endMax)
  const lastBirthday = addYears(birth, age.years)
  const nextBirthday = addYears(birth, age.years + 1)
  return {
    age,
    daysLived,
    weeksLived: Math.floor(daysLived / 7),
    daysToMin: Math.max(0, daysBetween(today, endMin)),
    daysToMax: Math.max(0, daysBetween(today, endMax)),
    pctOfMax: Math.min(100, (daysLived / total) * 100),
    minMarkPct: (daysBetween(birth, endMin) / total) * 100,
    yearFraction: daysBetween(lastBirthday, today) / daysBetween(lastBirthday, nextBirthday),
  }
}

export const formatBirth = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

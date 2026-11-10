/** Monthly budgets and targets. Pure functions on integer piastres, so they are easy to test. */
import { endOfMonth, parseDate } from './dates'

export type ProgressState = 'ok' | 'fast' | 'warn' | 'over' | 'done' | 'behind'

export interface Progress {
  used: number
  limit: number
  /** used / limit as a percentage, uncapped (can exceed 100). */
  pct: number
  /** limit - used. Negative when over a budget. */
  remaining: number
  state: ProgressState
}

/** How far through its month a date is, from 0 to 1. Day 15 of a 30-day month is 0.5. */
export function monthElapsed(today: string): number {
  const day = parseDate(today).getDate()
  const days = parseDate(endOfMonth(today)).getDate()
  return day / days
}

/**
 * Spending against a budget. "warn" means close to the limit (80%+); "fast" means spending is running
 * ahead of how much of the month has passed, while there is still time to adjust; "over" means the
 * limit is passed.
 */
export function budgetProgress(usedMinor: number, limitMinor: number, elapsed: number): Progress {
  const pct = limitMinor > 0 ? (usedMinor / limitMinor) * 100 : 0
  let state: ProgressState = 'ok'
  if (usedMinor > limitMinor) state = 'over'
  else if (pct >= 80) state = 'warn'
  else if (pct > elapsed * 100 + 10) state = 'fast'
  return { used: usedMinor, limit: limitMinor, pct, remaining: limitMinor - usedMinor, state }
}

/** Earnings against a target. "behind" means below the pace the month so far would need. */
export function targetProgress(achievedMinor: number, targetMinor: number, elapsed: number): Progress {
  const pct = targetMinor > 0 ? (Math.max(0, achievedMinor) / targetMinor) * 100 : 0
  let state: ProgressState = 'ok'
  if (achievedMinor >= targetMinor) state = 'done'
  else if (pct < elapsed * 100 - 10) state = 'behind'
  return { used: achievedMinor, limit: targetMinor, pct, remaining: targetMinor - achievedMinor, state }
}

export interface MonthlyBudget {
  /** Total monthly spending limit, or null for none. */
  totalMinor: number | null
  /** Optional per-category limits, by category id. */
  categories: Record<string, number>
}

export const emptyBudget = (): MonthlyBudget => ({ totalMinor: null, categories: {} })

export const hasBudget = (b: MonthlyBudget | undefined) =>
  !!b && (b.totalMinor !== null || Object.keys(b.categories).length > 0)

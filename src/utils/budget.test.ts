import { describe, expect, it } from 'vitest'
import { budgetProgress, hasBudget, monthElapsed, targetProgress } from './budget'

describe('month elapsed', () => {
  it('is the share of the month passed', () => {
    expect(monthElapsed('2026-11-15')).toBe(0.5)
    expect(monthElapsed('2026-11-30')).toBe(1)
    expect(monthElapsed('2026-02-14')).toBe(0.5)
  })
})

describe('budget progress', () => {
  it('is ok while spending stays behind the month', () => {
    expect(budgetProgress(30_000, 100_000, 0.5)).toMatchObject({ pct: 30, remaining: 70_000, state: 'ok' })
  })
  it('warns near the limit', () => {
    expect(budgetProgress(85_000, 100_000, 0.9).state).toBe('warn')
  })
  it('flags spending that runs ahead of the month, separately from being near the limit', () => {
    expect(budgetProgress(55_000, 100_000, 0.33).state).toBe('fast')
    expect(budgetProgress(40_000, 100_000, 0.33).state).toBe('ok')
  })
  it('is over once the limit is passed, with a negative remainder', () => {
    expect(budgetProgress(120_000, 100_000, 0.5)).toMatchObject({ pct: 120, remaining: -20_000, state: 'over' })
  })
  it('is exactly on the limit without being over', () => {
    expect(budgetProgress(100_000, 100_000, 1).state).toBe('warn')
  })
})

describe('target progress', () => {
  it('is done when the target is reached', () => {
    expect(targetProgress(500_000, 400_000, 0.5)).toMatchObject({ state: 'done', remaining: -100_000 })
  })
  it('is behind when below the pace of the month', () => {
    expect(targetProgress(100_000, 1_000_000, 0.5).state).toBe('behind')
    expect(targetProgress(450_000, 1_000_000, 0.5).state).toBe('ok')
  })
  it('never shows a negative percentage for a loss', () => {
    expect(targetProgress(-50_000, 100_000, 0.5).pct).toBe(0)
  })
})

describe('has budget', () => {
  it('needs a total or at least one category', () => {
    expect(hasBudget({ totalMinor: null, categories: {} })).toBe(false)
    expect(hasBudget({ totalMinor: 100, categories: {} })).toBe(true)
    expect(hasBudget({ totalMinor: null, categories: { food: 100 } })).toBe(true)
  })
})

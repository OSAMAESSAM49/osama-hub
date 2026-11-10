import { describe, expect, it } from 'vitest'
import { dailyAverage, inPeriod, personalSummary } from './personal'

describe('personal finance', () => {
  it('sums income and spending separately and shows what is left', () => {
    const s = personalSummary([
      { kind: 'income', amountMinor: 1_000_000 },
      { kind: 'expense', amountMinor: 12_550 },
      { kind: 'expense', amountMinor: 7_450 },
    ])
    expect(s).toEqual({ income: 1_000_000, expenses: 20_000, balance: 980_000, count: 3 })
  })

  it('shows a negative balance when spending is higher', () => {
    expect(personalSummary([{ kind: 'expense', amountMinor: 500 }]).balance).toBe(-500)
  })

  it('averages spending only over days that have already happened', () => {
    const month = { from: '2026-11-01', to: '2026-11-30' }
    expect(dailyAverage(100_000, month, '2026-11-10')).toBe(10_000)
    expect(dailyAverage(300_000, { from: '2026-10-01', to: '2026-10-30' }, '2026-11-10')).toBe(10_000)
    expect(dailyAverage(100_000, { from: '2026-12-01', to: '2026-12-31' }, '2026-11-10')).toBe(0)
  })

  it('filters by date range inclusively', () => {
    const rows = [{ date: '2026-11-01' }, { date: '2026-11-30' }, { date: '2026-12-01' }]
    expect(inPeriod(rows, { from: '2026-11-01', to: '2026-11-30' })).toHaveLength(2)
  })
})

import { describe, expect, it } from 'vitest'
import { addMonths, addYears, ageOn, lifeStats } from './life'

describe('age', () => {
  it('counts whole years, then months, then days', () => {
    expect(ageOn('1994-06-29', '2026-11-18')).toEqual({ years: 32, months: 4, days: 20 })
    expect(ageOn('1994-06-29', '2026-06-29')).toEqual({ years: 32, months: 0, days: 0 })
    expect(ageOn('1994-06-29', '2026-06-28')).toEqual({ years: 31, months: 11, days: 30 })
  })
  it('handles month ends', () => {
    expect(ageOn('2000-01-31', '2000-03-01')).toEqual({ years: 0, months: 1, days: 1 })
    expect(ageOn('2000-01-31', '2000-02-29')).toEqual({ years: 0, months: 1, days: 0 })
    expect(ageOn('2026-11-18', '2026-11-18')).toEqual({ years: 0, months: 0, days: 0 })
  })
})

describe('add months', () => {
  it('clamps to the end of a shorter month', () => {
    expect(addMonths('2000-01-31', 1)).toBe('2000-02-29')
    expect(addMonths('2001-01-31', 1)).toBe('2001-02-28')
    expect(addMonths('2026-11-18', 2)).toBe('2027-01-18')
  })
})

describe('add years', () => {
  it('keeps the same day', () => {
    expect(addYears('1994-06-29', 60)).toBe('2054-06-29')
  })
  it('moves 29 February to 28 February in a non-leap year', () => {
    expect(addYears('2000-02-29', 1)).toBe('2001-02-28')
    expect(addYears('2000-02-29', 4)).toBe('2004-02-29')
  })
})

describe('life stats', () => {
  const s = lifeStats('1994-06-29', '2026-11-18', 60, 70)!

  it('counts days and weeks lived', () => {
    // 32 years from 1994-06-29 is 2026-06-29: 11,688 days, then 142 more days to 18 November.
    expect(s.daysLived).toBe(11_688 + 142)
    expect(s.weeksLived).toBe(Math.floor((11_688 + 142) / 7))
  })

  it('counts days remaining to the lower and upper ages', () => {
    expect(s.daysToMin).toBeGreaterThan(9_900)
    // 2054-06-29 to 2064-06-29 holds three leap days: 2056, 2060 and 2064.
    expect(s.daysToMax - s.daysToMin).toBe(3_653)
  })

  it('places today and the lower age on the bar', () => {
    expect(s.pctOfMax).toBeCloseTo((s.daysLived / (s.daysLived + s.daysToMax)) * 100, 6)
    expect(s.minMarkPct).toBeCloseTo((60 / 70) * 100, 1)
  })

  it('knows how far into the current year of life it is', () => {
    expect(s.yearFraction).toBeCloseTo(142 / 365, 6)
  })

  it('stops counting down once an age is passed', () => {
    const old = lifeStats('1950-01-01', '2026-11-18', 60, 70)!
    expect(old.daysToMin).toBe(0)
    expect(old.daysToMax).toBe(0)
    expect(old.pctOfMax).toBe(100)
  })

  it('rejects impossible input', () => {
    expect(lifeStats('2027-01-01', '2026-11-18', 60, 70)).toBeNull()
    expect(lifeStats('not-a-date', '2026-11-18', 60, 70)).toBeNull()
    expect(lifeStats('1994-06-29', '2026-11-18', 75, 70)).toBeNull()
  })
})

describe('home widget order', async () => {
  const { widgetOrder } = await import('@/services/data/defaults')
  it('puts the life card first for an existing saved order', () => {
    expect(widgetOrder(['finance', 'tasks'])[0]).toBe('life')
  })
  it('keeps the life card where the owner moved it', () => {
    const order = widgetOrder(['finance', 'life', 'tasks'])
    expect(order.indexOf('life')).toBe(1)
  })
  it('adds other new widgets at the end and drops unknown ones', () => {
    const order = widgetOrder(['finance', 'gone' as never])
    expect(order).not.toContain('gone')
    expect(order.at(-1)).not.toBe('life')
    expect(new Set(order).size).toBe(order.length)
  })
})

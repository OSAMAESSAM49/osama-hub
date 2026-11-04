import { describe, expect, it } from 'vitest'
import { csvCell, toCsv } from './csv'
import {
  applyBasisPoints, bpToPercent, formatMoney, minorToDecimal, parseAmount, partnerBalance, partnerShare,
  percentToBp, rateOn, summarize,
} from './money'
import { addDays, endOfMonth, isValidDate, monthGrid, rangeFor, startOfWeek } from './dates'
import { highlightParts, looksLikeSecret, matches, parseUrl, urlKey } from './text'

const RATES = [{ from: '0001-01-01', bp: 500 }]

describe('parseAmount', () => {
  it('parses Latin and Arabic digits into integer piastres', () => {
    expect(parseAmount('1250.50')).toBe(125050)
    expect(parseAmount('١٢٥٠٫٥')).toBe(125050)
    expect(parseAmount('1,250')).toBe(125000)
    expect(parseAmount('.5')).toBe(50)
  })
  it('has no floating-point error', () => {
    expect(parseAmount('0.07')).toBe(7)
    expect(parseAmount('1.15')).toBe(115)
    expect(parseAmount('4.35')).toBe(435)
    expect(parseAmount('19.99')).toBe(1999)
  })
  it('rejects invalid values', () => {
    for (const bad of ['', '0', '-5', 'abc', '1.234', '1.2.3', '1000000000.01']) expect(parseAmount(bad)).toBeNull()
  })
})

describe('partner share', () => {
  it('is 5% of GROSS income, whatever the expenses are', () => {
    const s = summarize([{ amountMinor: 1_000_000, date: '2026-01-10' }], [{ amountMinor: 900_000 }], RATES)
    expect(s.partnerShare).toBe(50_000)
    expect(s.net).toBe(1_000_000 - 900_000 - 50_000)
  })
  it('does not reduce the share when expenses exceed income', () => {
    const s = summarize([{ amountMinor: 100_000, date: '2026-01-10' }], [{ amountMinor: 500_000 }], RATES)
    expect(s.partnerShare).toBe(5_000)
    expect(s.net).toBe(-405_000)
  })
  it('rounds half up on the grouped total, not per transaction', () => {
    expect(applyBasisPoints(10, 500)).toBe(1)
    const many = Array.from({ length: 100 }, () => ({ amountMinor: 1, date: '2026-01-01' }))
    expect(partnerShare(many, RATES)).toBe(5)
  })
  it('applies effective-dated rates without rewriting history', () => {
    const rates = [{ from: '0001-01-01', bp: 500 }, { from: '2026-06-01', bp: 1000 }]
    expect(rateOn('2026-05-31', rates)).toBe(500)
    expect(rateOn('2026-06-01', rates)).toBe(1000)
    const share = partnerShare(
      [{ amountMinor: 100_000, date: '2026-05-01' }, { amountMinor: 100_000, date: '2026-07-01' }],
      rates,
    )
    expect(share).toBe(5_000 + 10_000)
  })
  it('never subtracts payments from the net result, so nothing is counted twice', () => {
    const incomes = [{ amountMinor: 1_000_000, date: '2026-01-10' }]
    const before = summarize(incomes, [], RATES).net
    const bal = partnerBalance(incomes, [{ amountMinor: 20_000 }], RATES)
    expect(bal).toEqual({ owed: 50_000, paid: 20_000, balance: 30_000 })
    expect(summarize(incomes, [], RATES).net).toBe(before)
  })
  it('reports an overpayment as a negative balance', () => {
    expect(partnerBalance([{ amountMinor: 100_000, date: '2026-01-01' }], [{ amountMinor: 6_000 }], RATES).balance).toBe(-1_000)
  })
})

describe('formatting', () => {
  it('formats without float maths', () => {
    expect(minorToDecimal(125050)).toBe('1250.50')
    expect(minorToDecimal(-5)).toBe('-0.05')
    expect(formatMoney(125050, 'en')).toBe('EGP 1,250.50')
    expect(formatMoney(100000, 'ar')).toBe('1,000 ج.م')
  })
  it('converts percentages exactly', () => {
    expect(percentToBp('5')).toBe(500)
    expect(percentToBp('٥٫٥')).toBe(550)
    expect(percentToBp('101')).toBeNull()
    expect(bpToPercent(500)).toBe('5')
    expect(bpToPercent(550)).toBe('5.5')
    expect(bpToPercent(525)).toBe('5.25')
  })
})

describe('csv', () => {
  it('starts with a BOM and uses CRLF', () => {
    const out = toCsv([['a', 'b']])
    expect(out.charCodeAt(0)).toBe(0xfeff)
    expect(out.endsWith('\r\n')).toBe(true)
  })
  it('escapes quotes and blocks formula injection', () => {
    expect(csvCell('a,"b"')).toBe('"a,""b"""')
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`)
    expect(csvCell('-12.50')).toBe('-12.50')
    expect(csvCell('+201000')).toBe("'+201000")
  })
})

describe('dates', () => {
  it('computes ranges with a Saturday week start', () => {
    // 5 Nov 2026 is a Thursday, so the week begins on Saturday 31 Oct.
    expect(startOfWeek('2026-11-05', 6)).toBe('2026-10-31')
    expect(rangeFor('week', 6, '2026-11-05')).toEqual({ from: '2026-10-31', to: '2026-11-06' })
    expect(rangeFor('yesterday', 6, '2026-03-01').from).toBe('2026-02-28')
    expect(rangeFor('month', 6, '2026-02-10')).toEqual({ from: '2026-02-01', to: '2026-02-28' })
  })
  it('validates and walks dates', () => {
    expect(isValidDate('2026-02-30')).toBe(false)
    expect(isValidDate('2028-02-29')).toBe(true)
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(endOfMonth('2028-02-10')).toBe('2028-02-29')
  })
  it('builds a complete month grid', () => {
    const grid = monthGrid('2026-11', 6)
    expect(grid.every((w) => w.length === 7)).toBe(true)
    expect(grid.flat()).toContain('2026-11-30')
  })
})

describe('search and links', () => {
  it('matches across Arabic spelling variants', () => {
    expect(matches('أَحْمَد', 'احمد')).toBe(true)
    expect(matches('مدرسة النور', 'مدرسه')).toBe(true)
    expect(matches('Composite restoration', 'COMPOSITE')).toBe(true)
    expect(matches('abc', 'xyz')).toBe(false)
  })
  it('highlights on original text', () => {
    expect(highlightParts('علي أحمد', 'احمد').some((p) => p.hit && p.text.includes('أحمد'))).toBe(true)
  })
  it('validates urls and rejects unsafe schemes', () => {
    expect(parseUrl('example.com')?.href).toBe('https://example.com/')
    expect(parseUrl('javascript:alert(1)')).toBeNull()
    expect(parseUrl('not a url')).toBeNull()
  })
  it('detects duplicate links', () => {
    expect(urlKey('https://www.example.com/a/?utm_source=x')).toBe(urlKey('http://example.com/a'))
    expect(urlKey('https://a.com/x')).not.toBe(urlKey('https://a.com/y'))
  })
  it('flags secrets in the vault', () => {
    expect(looksLikeSecret('كلمة السر للبنك')).toBe(true)
    expect(looksLikeSecret('رقم مورد الخامات')).toBe(false)
  })
})

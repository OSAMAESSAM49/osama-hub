import { describe, expect, it } from 'vitest'
import { defaultSettings } from '@/services/data/defaults'
import type { AppSettings, Expense, Income, PartnerPayment, PersonalTransaction } from '@/types/models'
import { phaseSummary, sortPhases } from '@/modules/life-compass/Phases'
import { buildWorkbook } from './excel'
import { clinicProgress, clinicReport, personalProgress, personalReport } from './report'

const base = { createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z' }
const inc = (id: string, amountMinor: number, date: string, categoryId = 'implants'): Income => ({
  ...base, id, amountMinor, date, categoryId, patientName: '', procedure: 'زراعة', description: '', paymentMethod: '', notes: '',
})
const exp = (id: string, amountMinor: number, date: string, categoryId = 'materials'): Expense => ({
  ...base, id, amountMinor, date, categoryId, supplier: '', description: '', notes: '',
})
const pt = (id: string, kind: 'income' | 'expense', amountMinor: number, date: string, categoryId: string): PersonalTransaction => ({
  ...base, id, kind, amountMinor, date, categoryId, description: '', paymentMethod: '', notes: '',
})

const settings = (over: Partial<AppSettings> = {}): AppSettings => ({ ...defaultSettings(), ...over })
const NOV = { from: '2026-11-01', to: '2026-11-30' }
const TODAY = '2026-11-15'

describe('clinic report', () => {
  const incomes = [inc('i1', 8_055_000, '2026-11-02'), inc('i2', 100_000, '2026-10-05')]
  const expenses = [exp('e1', 5_631_600, '2026-11-03'), exp('e2', 50_000, '2026-11-10', 'rent')]
  const payments: PartnerPayment[] = [{ ...base, id: 'p1', amountMinor: 10_000, date: '2026-11-04', notes: '' }]

  it('summarises the period with the partner share on net', () => {
    const r = clinicReport(incomes, expenses, payments, settings(), NOV, TODAY)
    const kpi = Object.fromEntries(r.kpis.map((k) => [k.label.split(' ')[0], k.minor]))
    expect(r.kpis[0]!.minor).toBe(8_055_000)
    expect(r.kpis[1]!.minor).toBe(5_681_600)
    expect(r.kpis[2]!.minor).toBe(118_670)
    expect(r.kpis[3]!.minor).toBe(8_055_000 - 5_681_600 - 118_670)
    expect(Object.keys(kpi)).toHaveLength(4)
  })

  it('only includes transactions in the period', () => {
    const r = clinicReport(incomes, expenses, payments, settings(), NOV, TODAY)
    const incomeTable = r.tables.find((t) => t.sheet === 'الإيرادات')!
    expect(incomeTable.rows).toHaveLength(1)
  })

  it('measures the monthly target and budgets', () => {
    const s = settings({
      clinicTarget: { basis: 'income', amountMinor: 10_000_000 },
      clinicBudget: { totalMinor: 5_000_000, categories: { rent: 100_000 } },
    })
    const p = clinicProgress(incomes, expenses, s, TODAY)
    expect(p.map((x) => x.kind)).toEqual(['target', 'budget', 'budget'])
    expect(p[0]).toMatchObject({ used: 8_055_000, limit: 10_000_000, state: 'ok' })
    expect(p[1]).toMatchObject({ used: 5_681_600, state: 'over' })
    expect(p[2]).toMatchObject({ used: 50_000, limit: 100_000 })
  })

  it('measures a net target after expenses and the partner share', () => {
    const p = clinicProgress(incomes, expenses, settings({ clinicTarget: { basis: 'net', amountMinor: 2_000_000 } }), TODAY)
    expect(p[0]!.used).toBe(8_055_000 - 5_681_600 - 118_670)
    expect(p[0]!.state).toBe('done')
  })

  it('has no progress rows when nothing is set', () => {
    expect(clinicProgress(incomes, expenses, settings(), TODAY)).toEqual([])
  })
})

describe('personal report', () => {
  const rows = [pt('a', 'income', 1_000_000, '2026-11-01', 'clinic'), pt('b', 'expense', 30_000, '2026-11-02', 'food'), pt('c', 'expense', 20_000, '2026-11-03', 'fuel')]

  it('summarises income, spending and what is left', () => {
    const r = personalReport(rows, settings(), NOV, TODAY)
    expect(r.kpis.slice(0, 3).map((k) => k.minor)).toEqual([1_000_000, 50_000, 950_000])
  })

  it('measures the budget and category limits', () => {
    const p = personalProgress(rows, settings({ personalBudget: { totalMinor: 100_000, categories: { food: 25_000 } } }), TODAY)
    expect(p[0]).toMatchObject({ used: 50_000, limit: 100_000, state: 'ok' })
    expect(p[1]).toMatchObject({ used: 30_000, limit: 25_000, state: 'over' })
  })
})

describe('excel workbook', () => {
  it('has a summary sheet, a sheet per detail table, and real numbers', async () => {
    const r = personalReport(
      [pt('a', 'income', 1_000_050, '2026-11-01', 'clinic'), pt('b', 'expense', 12_550, '2026-11-02', 'food')],
      settings({ personalBudget: { totalMinor: 100_000, categories: {} } }),
      NOV,
      TODAY,
    )
    const wb = await buildWorkbook(r)
    const names = wb.worksheets.map((w) => w.name)
    expect(names).toEqual(['الملخص', 'حسب الفترة', 'الحركات'])
    const summary = wb.getWorksheet('الملخص')!
    expect(summary.views[0]!.rightToLeft).toBe(true)
    // The first KPI is income, stored as a number in pounds with a money format.
    const income = summary.getRow(5).getCell(2)
    expect(income.value).toBe(10_000.5)
    expect(income.numFmt).toContain('#,##0.00')
    const entries = wb.getWorksheet('الحركات')!
    expect(entries.getRow(5).getCell(1).value).toBeInstanceOf(Date)
    // A round trip through the file format keeps the figures.
    const buf = await wb.xlsx.writeBuffer()
    const back = new (wb.constructor as new () => typeof wb)()
    await back.xlsx.load(buf)
    expect(back.getWorksheet('الملخص')!.getRow(5).getCell(2).value).toBe(10_000.5)
  })

  it('builds the clinic workbook with the partner statement', async () => {
    const wb = await buildWorkbook(clinicReport([inc('i', 100_000, '2026-11-02')], [], [], settings(), NOV, TODAY))
    expect(wb.worksheets.map((w) => w.name)).toEqual(['الملخص', 'حسب الفترة', 'الإيرادات', 'المصروفات', 'كشف الشريك'])
  })
})

describe('goal phases', () => {
  const p = (title: string, order: number | undefined, createdAt: string, completed = false, progress = 0) => ({ title, order, createdAt, completed, progress })
  it('orders by position, then by creation for older phases', () => {
    const sorted = sortPhases([p('c', undefined, '2026-01-03'), p('b', 1, '2026-01-01'), p('a', 0, '2026-01-02'), p('d', undefined, '2026-01-04')])
    expect(sorted.map((x) => x.title)).toEqual(['a', 'b', 'c', 'd'])
  })
  it('finds the current phase as the first one not done', () => {
    const s = phaseSummary([p('a', 0, 'x', true), p('b', 1, 'x'), p('c', 2, 'x')])
    expect(s).toMatchObject({ total: 3, done: 1, currentIndex: 1 })
    expect(s.current?.title).toBe('b')
  })
  it('has no current phase when all are done', () => {
    expect(phaseSummary([p('a', 0, 'x', true)]).current).toBeNull()
  })
})

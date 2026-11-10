/** Renders a Report as a formatted Excel workbook. The library loads only when exporting. */
import type { Workbook, Worksheet } from 'exceljs'
import { getLang, tr } from '@/i18n'
import { downloadBlob } from '@/utils/csv'
import { parseDate } from '@/utils/dates'
import { progressStateText, type Cell, type Report, type ReportColumn, type ReportProgress } from './report'

const C = {
  ink: 'FF111114', white: 'FFFFFFFF', lime: 'FFC8FF2E', mint: 'FFA8E6CF', raised: 'FFEAE7DE', zebra: 'FFF8F6F0',
  line: 'FFD9D5CA', muted: 'FF62605A', positive: 'FF14724A', negative: 'FFB23A22', caution: 'FF8F6200',
}
const FONT = 'Arial'
const MONEY = '#,##0.00;[Red]-#,##0.00'
const fill = (argb: string) => ({ type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb } })

const toCell = (v: Cell, col?: ReportColumn) => {
  if (v === null || v === '') return null
  if (col?.kind === 'money' && typeof v === 'number') return v / 100
  if (col?.kind === 'date' && typeof v === 'string') {
    const d = parseDate(v)
    return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  }
  return v
}

async function newBook(): Promise<Workbook> {
  const mod = await import('exceljs')
  const ExcelJS = (mod as unknown as { default?: typeof mod }).default ?? mod
  const wb = new ExcelJS.Workbook()
  wb.creator = 'OSAMA HUB'
  wb.created = new Date()
  return wb
}

function sheet(wb: Workbook, name: string, widths: number[]): Worksheet {
  const ws = wb.addWorksheet(name.slice(0, 31), { views: [{ rightToLeft: getLang() === 'ar', showGridLines: false }] })
  ws.columns = widths.map((width) => ({ width }))
  return ws
}

function band(ws: Worksheet, row: number, cols: number, text: string, opts: { size: number; bg: string; fg: string; height: number; center?: boolean }) {
  ws.mergeCells(row, 1, row, cols)
  const c = ws.getCell(row, 1)
  c.value = text
  c.font = { name: FONT, size: opts.size, bold: true, color: { argb: opts.fg } }
  c.fill = fill(opts.bg)
  c.alignment = { vertical: 'middle', horizontal: opts.center ? 'center' : undefined, indent: opts.center ? 0 : 1 }
  ws.getRow(row).height = opts.height
}

function header(ws: Worksheet, report: Report, cols: number, heading: string) {
  band(ws, 1, cols, heading, { size: 16, bg: C.ink, fg: C.white, height: 34, center: true })
  ws.mergeCells(2, 1, 2, cols)
  const s = ws.getCell(2, 1)
  s.value = `${report.subtitle} · OSAMA HUB`
  s.font = { name: FONT, size: 10, color: { argb: C.muted } }
  s.alignment = { horizontal: 'center' }
}

/** A table with a dark header, zebra rows, money and date formats, and a bold total row. */
function table(ws: Worksheet, start: number, columns: ReportColumn[], rows: Cell[][], total?: Cell[]): number {
  const head = ws.getRow(start)
  columns.forEach((col, i) => {
    const cell = head.getCell(i + 1)
    cell.value = col.header
    cell.font = { name: FONT, bold: true, color: { argb: C.white } }
    cell.fill = fill(C.ink)
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
  })
  head.height = 24
  const write = (rowNo: number, values: Cell[], isTotal: boolean, zebra: boolean) => {
    const row = ws.getRow(rowNo)
    values.forEach((v, i) => {
      const col = columns[i]
      const cell = row.getCell(i + 1)
      cell.value = toCell(v, col) as never
      cell.font = { name: FONT, size: 11, bold: isTotal }
      if (col?.kind === 'money') cell.numFmt = MONEY
      if (col?.kind === 'date') cell.numFmt = 'yyyy-mm-dd'
      if (col?.kind === 'pct') cell.numFmt = '0%'
      cell.alignment = { vertical: 'middle', horizontal: col?.kind && col.kind !== 'text' ? 'center' : undefined, wrapText: !col?.kind || col.kind === 'text' }
      if (isTotal) {
        cell.fill = fill(C.raised)
        cell.border = { top: { style: 'thin', color: { argb: C.ink } } }
      } else {
        if (zebra) cell.fill = fill(C.zebra)
        cell.border = { bottom: { style: 'hair', color: { argb: C.line } } }
      }
    })
  }
  rows.forEach((r, i) => write(start + 1 + i, r, false, i % 2 === 1))
  let next = start + 1 + rows.length
  if (!rows.length) {
    ws.mergeCells(next, 1, next, columns.length)
    const c = ws.getCell(next, 1)
    c.value = tr('لا بيانات في هذه الفترة.', 'No data in this period.')
    c.font = { name: FONT, italic: true, color: { argb: C.muted } }
    next++
  }
  if (total) write(next++, total, true, false)
  return next
}

/** A text bar that reads at a glance in any spreadsheet app, coloured by state. */
const textBar = (p: ReportProgress) => {
  const filled = Math.max(0, Math.min(10, Math.round(p.pct / 10)))
  return '█'.repeat(filled) + '░'.repeat(10 - filled)
}
const stateColor = (p: ReportProgress) => (p.state === 'over' ? C.negative : p.state === 'warn' || p.state === 'fast' || p.state === 'behind' ? C.caution : C.positive)

export async function buildWorkbook(report: Report): Promise<Workbook> {
  const wb = await newBook()
  const ws = sheet(wb, tr('الملخص', 'Summary'), [34, 20, 14, 18, 16])
  header(ws, report, 5, report.title)
  const accent = report.kind === 'clinic' ? C.lime : C.mint

  band(ws, 4, 5, tr('النتيجة', 'Result'), { size: 12, bg: accent, fg: C.ink, height: 24 })
  let r = 5
  for (const k of report.kpis) {
    const row = ws.getRow(r++)
    row.getCell(1).value = k.label
    row.getCell(1).font = { name: FONT, color: { argb: C.muted } }
    const v = row.getCell(2)
    v.value = k.minor !== undefined ? k.minor / 100 : (k.text ?? '')
    if (k.minor !== undefined) v.numFmt = MONEY
    v.font = { name: FONT, size: 13, bold: true, color: { argb: k.tone === 'bad' ? C.negative : k.tone === 'good' ? C.positive : C.ink } }
    v.alignment = { horizontal: 'center' }
    row.height = 24
  }

  if (report.progress.length) {
    r++
    band(ws, r++, 5, report.progressTitle ?? '', { size: 12, bg: accent, fg: C.ink, height: 24 })
    r = table(
      ws, r,
      [{ header: tr('البند', 'Item') }, { header: tr('المستهدف أو الحد', 'Target or limit'), kind: 'money' }, { header: tr('الفعلي', 'Actual'), kind: 'money' }, { header: tr('النسبة', 'Progress') }, { header: tr('الحالة', 'Status') }],
      report.progress.map((p) => [p.label, p.limit, p.used, `${textBar(p)} ${Math.round(p.pct)}%`, progressStateText(p.state)]),
    )
    report.progress.forEach((p, i) => {
      const row = ws.getRow(r - report.progress.length + i)
      row.getCell(4).font = { name: FONT, color: { argb: stateColor(p) } }
      row.getCell(5).font = { name: FONT, bold: true, color: { argb: stateColor(p) } }
    })
  }

  for (const t of report.tables.filter((x) => !x.sheet)) {
    r++
    band(ws, r++, 5, t.title, { size: 12, bg: accent, fg: C.ink, height: 24 })
    r = table(ws, r, t.columns, t.rows, t.total)
  }

  for (const t of report.tables.filter((x) => x.sheet)) {
    const widths = t.columns.map((c) => (c.kind === 'date' ? 13 : c.kind === 'money' ? 16 : c.kind === 'pct' ? 10 : 26))
    const s = sheet(wb, t.sheet!, widths)
    header(s, report, t.columns.length, t.title)
    const last = table(s, 4, t.columns, t.rows, t.total)
    s.views = [{ rightToLeft: getLang() === 'ar', showGridLines: false, state: 'frozen', ySplit: 4 }]
    if (t.rows.length) s.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + t.rows.length, column: t.columns.length } }
    void last
  }
  return wb
}

export async function downloadExcel(report: Report) {
  const wb = await buildWorkbook(report)
  const buf = await wb.xlsx.writeBuffer()
  downloadBlob(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${report.filename}.xlsx`)
}

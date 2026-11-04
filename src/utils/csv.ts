/** CSV that opens correctly in Excel: UTF-8 BOM for Arabic, CRLF line ends, quoted cells. */

/** Prefixes cells that a spreadsheet would run as a formula, preventing CSV injection. */
export function csvCell(value: string | number | null | undefined): string {
  if (typeof value === 'number') return String(value)
  let s = value ?? ''
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return `﻿${rows.map((r) => r.map(csvCell).join(',')).join('\r\n')}\r\n`
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export function downloadCsv(rows: (string | number | null | undefined)[][], filename: string) {
  downloadBlob(new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' }), filename)
}

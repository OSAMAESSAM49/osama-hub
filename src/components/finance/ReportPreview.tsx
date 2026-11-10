import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { FileSpreadsheet, Printer, X } from 'lucide-react'
import { toast } from '@/components/common/feedback'
import { Button, IconButton } from '@/components/common/ui'
import { useI18n } from '@/i18n'
import { progressStateText, type Cell, type Report, type ReportColumn, type ReportProgress } from '@/services/export/report'
import { formatDate } from '@/utils/dates'
import { formatMoney } from '@/utils/money'

/**
 * A print-ready A4 report. Printing goes through the browser, which renders Arabic perfectly in the
 * app's own fonts, and every browser offers "Save as PDF" from its print dialog.
 */
export function ReportPreview({ report, onClose }: { report: Report; onClose: () => void }) {
  const { tr, lang } = useI18n()
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    document.body.classList.add('printing')
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.classList.remove('printing')
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const print = () => {
    // Most browsers use the page title as the suggested PDF file name.
    const previous = document.title
    document.title = report.filename
    const restore = () => {
      document.title = previous
      window.removeEventListener('afterprint', restore)
    }
    window.addEventListener('afterprint', restore)
    window.print()
    setTimeout(restore, 60_000)
  }

  const excel = async () => {
    setBusy(true)
    try {
      const { downloadExcel } = await import('@/services/export/excel')
      await downloadExcel(report)
      toast(tr('نُزل ملف Excel', 'Excel file downloaded'))
    } catch {
      toast(tr('تعذر إنشاء ملف Excel', 'Could not create the Excel file'), 'error')
    } finally {
      setBusy(false)
    }
  }

  return createPortal(
    <div className="print-host fixed inset-0 z-50 overflow-y-auto bg-[#d9d6cd]" role="dialog" aria-modal="true" aria-label={report.title}>
      <div className="print-toolbar safe-top sticky top-0 z-10 flex flex-wrap items-center gap-2 bg-canvas/95 px-4 py-2.5 backdrop-blur">
        <IconButton icon={X} label={tr('إغلاق', 'Close')} tone="soft" onClick={onClose} />
        <span className="me-auto min-w-0 truncate font-bold">{tr('معاينة التقرير', 'Report preview')}</span>
        <Button icon={FileSpreadsheet} busy={busy} onClick={() => void excel()}>Excel</Button>
        <Button variant="primary" icon={Printer} capsule onClick={print}>{tr('حفظ PDF', 'Save PDF')}</Button>
      </div>
      <p className="print-toolbar px-4 pt-3 text-center text-sm text-muted">
        {tr('في نافذة الطباعة اختر «حفظ كـ PDF». على الآيفون: مشاركة ← حفظ في الملفات.', 'In the print window choose “Save as PDF”. On iPhone: Share → Save to Files.')}
      </p>
      <article className="report-page mx-auto my-4 w-full max-w-[794px] bg-white text-[#141416] shadow-xl" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
        <ReportBody report={report} />
      </article>
    </div>,
    document.body,
  )
}

function formatCell(v: Cell, col: ReportColumn | undefined, lang: 'ar' | 'en'): string {
  if (v === null || v === '') return ''
  if (col?.kind === 'money' && typeof v === 'number') return formatMoney(v, lang, false)
  if (col?.kind === 'pct' && typeof v === 'number') return `${Math.round(v * 100)}%`
  if (col?.kind === 'date' && typeof v === 'string') return formatDate(v, lang, 'dmy')
  return String(v)
}

const barColor = (p: ReportProgress) => (p.state === 'over' ? '#b23a22' : p.state === 'warn' || p.state === 'fast' || p.state === 'behind' ? '#c48a00' : p.kind === 'target' ? '#3a3ff0' : '#14724a')

function ReportBody({ report }: { report: Report }) {
  const { tr, lang } = useI18n()
  const accent = report.kind === 'clinic' ? '#c8ff2e' : '#a8e6cf'
  return (
    <div className="report">
      <header className="report-head" style={{ background: '#111114', color: '#fff' }}>
        <div>
          <div className="report-brand">OSAMA HUB</div>
          <h1>{report.title}</h1>
          <p>{report.subtitle}</p>
        </div>
        <span className="report-mark" style={{ background: accent }} aria-hidden>
          <span />
        </span>
      </header>

      <section className="report-kpis">
        {report.kpis.map((k) => (
          <div key={k.label} className="report-kpi">
            <div className="report-kpi-label">{k.label}</div>
            <div className="report-kpi-value tnum" style={{ color: k.tone === 'bad' ? '#b23a22' : '#141416' }} dir="ltr">
              {k.minor !== undefined ? formatMoney(k.minor, 'en', false) : k.text}
            </div>
            {k.minor !== undefined && <div className="report-kpi-unit">{tr('جنيه مصري', 'EGP')}</div>}
          </div>
        ))}
      </section>

      {report.progress.length > 0 && (
        <section className="report-section">
          <h2 style={{ borderColor: accent }}>{report.progressTitle}</h2>
          <div className="report-progress">
            {report.progress.map((p) => (
              <div key={p.label} className="report-bar">
                <div className="report-bar-top">
                  <span className="report-bar-label">{p.label}</span>
                  <span className="tnum">
                    {formatMoney(p.used, lang, false)} / {formatMoney(p.limit, lang, false)} · <strong style={{ color: barColor(p) }}>{Math.round(p.pct)}% · {progressStateText(p.state)}</strong>
                  </span>
                </div>
                <div className="report-track">
                  <div className="report-fill" style={{ width: `${Math.min(100, p.pct)}%`, background: barColor(p) }} />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {report.tables.map((t) => (
        <section key={t.title} className={t.sheet ? 'report-section report-detail' : 'report-section report-keep'}>
          <h2 style={{ borderColor: accent }}>{t.title}</h2>
          {t.rows.length === 0 ? (
            <p className="report-empty">{tr('لا بيانات في هذه الفترة.', 'No data in this period.')}</p>
          ) : (
            <table className="report-table">
              <thead>
                <tr>{t.columns.map((c) => <th key={c.header} className={c.kind && c.kind !== 'text' ? 'num' : ''}>{c.header}</th>)}</tr>
              </thead>
              <tbody>
                {t.rows.map((row, i) => (
                  <tr key={i}>
                    {row.map((v, j) => (
                      <td key={j} className={t.columns[j]?.kind && t.columns[j]?.kind !== 'text' ? 'num tnum' : ''} dir={t.columns[j]?.kind === 'money' ? 'ltr' : undefined}>
                        {formatCell(v, t.columns[j], lang)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              {t.total && (
                <tfoot>
                  <tr>
                    {t.total.map((v, j) => (
                      <td key={j} className={t.columns[j]?.kind && t.columns[j]?.kind !== 'text' ? 'num tnum' : ''} dir={t.columns[j]?.kind === 'money' ? 'ltr' : undefined}>
                        {formatCell(v, t.columns[j], lang)}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              )}
            </table>
          )}
        </section>
      ))}
      <footer className="report-foot">OSAMA HUB · {report.subtitle}</footer>
    </div>
  )
}

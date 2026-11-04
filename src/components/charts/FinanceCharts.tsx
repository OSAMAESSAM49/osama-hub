import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useI18n } from '@/i18n'
import { formatMoney } from '@/utils/money'

export interface TrendPoint {
  key: string
  label: string
  income: number
  expenses: number
  net: number
}

const compact = (minor: number) => {
  const v = minor / 100
  const abs = Math.abs(v)
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (abs >= 1000) return `${(v / 1000).toFixed(abs >= 10_000 ? 0 : 1).replace(/\.0$/, '')}K`
  return String(Math.round(v))
}

const axisProps = { axisLine: false, tickLine: false, tick: { fill: 'var(--c-faint)', fontSize: 12 } } as const

function ChartTooltip({ active, payload, label, names }: {
  active?: boolean
  payload?: { dataKey?: string | number; value?: number | string; color?: string }[]
  label?: string | number
  names: Record<string, string>
}) {
  const { lang } = useI18n()
  if (!active || !payload?.length) return null
  return (
    <div dir={lang === 'ar' ? 'rtl' : 'ltr'} className="rounded-2xl bg-ink px-3.5 py-2.5 text-sm text-canvas shadow-xl">
      <div className="mb-1 font-medium opacity-70">{label}</div>
      {payload.map((p) => (
        <div key={String(p.dataKey)} className="flex items-center gap-2">
          <span className="size-2.5 rounded-full" style={{ background: p.color }} />
          <span className="opacity-80">{names[String(p.dataKey)]}</span>
          <span className="tnum ms-auto ps-4 font-bold">{formatMoney(Number(p.value), lang)}</span>
        </div>
      ))}
    </div>
  )
}

/** Income and expenses share one axis because they share one unit. Net has its own chart below. */
export function IncomeExpenseChart({ data }: { data: TrendPoint[] }) {
  const { tr } = useI18n()
  const names = { income: tr('الإيرادات', 'Income'), expenses: tr('المصروفات', 'Expenses') }
  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-4 text-sm text-muted">
        <span className="inline-flex items-center gap-1.5"><span className="size-3 rounded-[4px]" style={{ background: 'var(--c-series-1)' }} />{names.income}</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-3 rounded-[4px]" style={{ background: 'var(--c-series-2)' }} />{names.expenses}</span>
      </div>
      <div dir="ltr" className="h-64" role="img" aria-label={`${names.income} / ${names.expenses}`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barGap={2} barCategoryGap="28%" margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--c-line)" strokeDasharray="2 4" />
            <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={10} />
            <YAxis {...axisProps} tickFormatter={compact} width={44} />
            <Tooltip cursor={{ fill: 'var(--c-raised)', opacity: 0.6 }} content={(p) => <ChartTooltip {...(p as object)} names={names} />} />
            <Bar dataKey="income" fill="var(--c-series-1)" radius={[4, 4, 0, 0]} maxBarSize={26} />
            <Bar dataKey="expenses" fill="var(--c-series-2)" radius={[4, 4, 0, 0]} maxBarSize={26} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

export function NetChart({ data }: { data: TrendPoint[] }) {
  const { tr } = useI18n()
  const names = { net: tr('صافي النتيجة', 'Net result') }
  return (
    <div dir="ltr" className="h-48" role="img" aria-label={names.net}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--c-line)" strokeDasharray="2 4" />
          <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={10} />
          <YAxis {...axisProps} tickFormatter={compact} width={44} />
          <ReferenceLine y={0} stroke="var(--c-faint)" />
          <Tooltip cursor={{ stroke: 'var(--c-faint)' }} content={(p) => <ChartTooltip {...(p as object)} names={names} />} />
          <Line type="monotone" dataKey="net" stroke="var(--c-series-1)" strokeWidth={2} dot={{ r: 4, fill: 'var(--c-series-1)', stroke: 'var(--c-surface)', strokeWidth: 2 }} activeDot={{ r: 6 }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

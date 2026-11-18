/** "Life in days": how much of a typical lifespan has passed, shown calmly at the top of home. */
import { useState, type FormEvent } from 'react'
import { Hourglass, Pencil } from 'lucide-react'
import { toast } from '@/components/common/feedback'
import { Button, cx, FormFooter, IconButton, Input, Sheet } from '@/components/common/ui'
import { useSettings } from '@/hooks/useSettings'
import { useI18n } from '@/i18n'
import { isValidDate, todayStr } from '@/utils/dates'
import { lifeStats } from '@/utils/life'

const n = (v: number) => v.toLocaleString('en-US')

function LifeSettingsSheet({ onClose }: { onClose: () => void }) {
  const { tr } = useI18n()
  const { settings, save } = useSettings()
  const [birth, setBirth] = useState(settings.birthDate ?? '')
  const [min, setMin] = useState(String(settings.lifeSpanMin))
  const [max, setMax] = useState(String(settings.lifeSpanMax))
  const [errors, setErrors] = useState<{ birth?: string; span?: string }>({})

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const lo = Number(min)
    const hi = Number(max)
    const errs: typeof errors = {}
    if (birth && (!isValidDate(birth) || birth > todayStr())) errs.birth = tr('تاريخ غير صحيح.', 'Invalid date.')
    if (!Number.isInteger(lo) || !Number.isInteger(hi) || lo < 1 || hi > 130 || lo > hi) errs.span = tr('أدخل عمرين صحيحين، والأول أصغر من الثاني.', 'Enter two whole ages, the first not above the second.')
    setErrors(errs)
    if (Object.keys(errs).length) return
    await save({ birthDate: birth || null, lifeSpanMin: lo, lifeSpanMax: hi })
    toast(tr('حُفظ', 'Saved'))
    onClose()
  }

  return (
    <Sheet open onClose={onClose} title={tr('رحلة العمر', 'Life in days')} footer={<FormFooter onCancel={onClose} />}>
      <form id="sheet-form" onSubmit={(e) => void submit(e)} className="space-y-4" noValidate>
        <Input label={tr('تاريخ الميلاد', 'Date of birth')} type="date" value={birth} max={todayStr()} onChange={(e) => setBirth(e.target.value)} error={errors.birth} />
        <div className="grid grid-cols-2 gap-3">
          <Input label={tr('من عمر', 'From age')} inputMode="numeric" dir="ltr" value={min} onChange={(e) => setMin(e.target.value)} error={errors.span} />
          <Input label={tr('إلى عمر', 'To age')} inputMode="numeric" dir="ltr" value={max} onChange={(e) => setMax(e.target.value)} />
        </div>
        <p className="text-sm text-muted">{tr('النطاق الذي يُقاس عليه الشريط. القيمة الافتراضية من 60 إلى 70 سنة.', 'The range the bar measures against. The default is 60 to 70 years.')}</p>
      </form>
    </Sheet>
  )
}

export function LifeCard() {
  const { tr, lang } = useI18n()
  const rtl = lang === 'ar'
  const { settings } = useSettings()
  const [editing, setEditing] = useState(false)
  const today = todayStr()
  const lo = settings.lifeSpanMin
  const hi = settings.lifeSpanMax
  const s = settings.birthDate ? lifeStats(settings.birthDate, today, lo, hi) : null

  return (
    <section className="relative overflow-hidden rounded-[2.25rem] bg-forest p-6 text-cream lg:col-span-4 lg:p-8" aria-label={tr('رحلة العمر', 'Life in days')}>
      <div className="flex items-start justify-between gap-3">
        <p className="flex items-center gap-2 text-sm text-gold"><Hourglass className="size-4" />{tr('رحلة العمر', 'Life in days')}</p>
        {s && <IconButton icon={Pencil} size="sm" label={tr('تعديل', 'Edit')} className="text-cream/70 hover:!bg-white/10" onClick={() => setEditing(true)} />}
      </div>

      {!s ? (
        <div className="mt-3">
          <h2 className="font-display text-2xl font-bold">{tr('كم مضى من رحلتك، وكم قد يتبقى؟', 'How much of your journey has passed?')}</h2>
          <p className="mt-1 text-[15px] text-cream/70">{tr('أدخل تاريخ ميلادك ليظهر عمرك بالأيام، وموقعك من متوسط الأعمار.', 'Enter your date of birth to see your life in days, measured against a typical lifespan.')}</p>
          <Button variant="primary" className="mt-4" onClick={() => setEditing(true)}>{tr('أدخل تاريخ الميلاد', 'Enter date of birth')}</Button>
        </div>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-end justify-between gap-x-6 gap-y-1">
            <div>
              <p className="tnum text-[min(3rem,12vw)] leading-none font-bold" dir="ltr" style={{ textAlign: 'start' }}>{n(s.daysLived)}</p>
              <p className="mt-1 text-[15px] text-cream/80">{tr('يومًا عشتها حتى اليوم', 'days lived so far')}</p>
            </div>
            <p className="text-[15px] text-cream/80">
              {tr(`${s.age.years} سنة و${s.age.months} شهر و${s.age.days} يوم`, `${s.age.years} years, ${s.age.months} months, ${s.age.days} days`)}
            </p>
          </div>

          {/* The bar runs from birth to the upper age, with the 60 to 70 band marked. */}
          <div className="mt-6">
            <p className="mb-2 flex items-baseline justify-between gap-3 text-sm text-cream/70">
              <span><span className="tnum text-lg font-bold text-cream">{Math.round(s.pctOfMax)}%</span> {tr(`مضى من ${hi} سنة`, `of ${hi} years lived`)}</span>
            </p>
            <div className="relative h-4 rounded-full bg-cream/12">
              <div
                aria-hidden
                className="absolute inset-y-0 rounded-e-full bg-[repeating-linear-gradient(135deg,rgb(246_240_223/0.28)_0_2px,transparent_2px_7px)]"
                style={{ insetInlineStart: `${s.minMarkPct}%`, insetInlineEnd: 0 }}
              />
              <div className="absolute inset-y-0 rounded-full bg-gradient-to-l from-gold to-[#e2c77f] ltr:bg-gradient-to-r" style={{ insetInlineStart: 0, width: `${s.pctOfMax}%` }} />
              <span
                aria-hidden
                className="absolute top-1/2 size-5 -translate-y-1/2 rounded-full border-[3px] border-forest bg-cream shadow"
                style={{ insetInlineStart: `calc(${s.pctOfMax}% - 0.625rem)` }}
              />
            </div>
            <div className="relative mt-1.5 h-4 text-xs text-cream/60" dir="ltr">
              <span className="absolute" style={{ [rtl ? 'right' : 'left']: 0 }}>0</span>
              <span className="absolute -translate-x-1/2" style={{ left: rtl ? `${100 - s.minMarkPct}%` : `${s.minMarkPct}%` }}>{lo}</span>
              <span className="absolute" style={{ [rtl ? 'left' : 'right']: 0 }}>{hi}</span>
            </div>
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(s.pctOfMax)}
              aria-label={tr(`مضى ${Math.round(s.pctOfMax)}% من ${hi} سنة`, `${Math.round(s.pctOfMax)}% of ${hi} years`)}
              className="sr-only"
            />
          </div>

          <dl className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-3xl bg-cream/8 px-4 py-3">
              <dt className="text-xs text-cream/60">{s.daysToMin ? tr(`أيام حتى سن ${lo}`, `Days until ${lo}`) : tr(`سن ${lo}`, `Age ${lo}`)}</dt>
              <dd className="tnum text-xl font-bold">{s.daysToMin ? n(s.daysToMin) : tr('تجاوزتها', 'Passed')}</dd>
            </div>
            <div className="rounded-3xl bg-cream/8 px-4 py-3">
              <dt className="text-xs text-cream/60">{s.daysToMax ? tr(`أيام حتى سن ${hi}`, `Days until ${hi}`) : tr(`سن ${hi}`, `Age ${hi}`)}</dt>
              <dd className="tnum text-xl font-bold">{s.daysToMax ? n(s.daysToMax) : tr('تجاوزتها', 'Passed')}</dd>
            </div>
          </dl>

          {/* One square per year of life: lived, this year in progress, and the years ahead. */}
          <div className="mt-5" aria-hidden>
            <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${Math.min(14, hi)}, minmax(0, 1fr))` }}>
              {Array.from({ length: hi }, (_, i) => {
                const lived = i < s.age.years
                const current = i === s.age.years
                const band = i >= lo
                return (
                  <span
                    key={i}
                    title={String(i + 1)}
                    className={cx('relative aspect-square overflow-hidden rounded-[5px]', lived ? 'bg-gold' : band ? 'bg-cream/[0.07] ring-1 ring-cream/20 ring-inset' : 'bg-cream/[0.12]')}
                  >
                    {current && <span className="absolute inset-y-0 bg-gold" style={{ insetInlineStart: 0, width: `${Math.round(s.yearFraction * 100)}%` }} />}
                  </span>
                )
              })}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-cream/60">
              <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-[3px] bg-gold" />{tr('سنوات مضت', 'Years lived')}</span>
              <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-[3px] bg-cream/[0.12]" />{tr('سنوات قادمة', 'Years ahead')}</span>
              <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-[3px] ring-1 ring-cream/30 ring-inset" />{tr(`من ${lo} إلى ${hi}`, `${lo} to ${hi}`)}</span>
            </div>
          </div>

          <p className="mt-4 text-xs text-cream/55">
            {tr(`تقدير مبني على متوسط الأعمار من ${lo} إلى ${hi} سنة، للتأمل لا للتنبؤ. والأعمار بيد الله.`, `An estimate based on a typical lifespan of ${lo} to ${hi} years, for reflection rather than prediction.`)}
          </p>
        </>
      )}
      {editing && <LifeSettingsSheet onClose={() => setEditing(false)} />}
    </section>
  )
}

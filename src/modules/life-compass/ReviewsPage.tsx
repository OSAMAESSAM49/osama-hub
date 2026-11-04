import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookHeart, MessageCircleQuestion, Plus, Search } from 'lucide-react'
import { confirmDelete, toast } from '@/components/common/feedback'
import { Button, Chip, ChipRow, EmptyState, FormFooter, Input, PageHeader, Sheet, SyncBadge, Textarea } from '@/components/common/ui'
import { useParamOnce } from '@/hooks/useParamOnce'
import { useSettings } from '@/hooks/useSettings'
import { useI18n } from '@/i18n'
import { reviewTypeLabel } from '@/i18n/labels'
import { repo, useCollection } from '@/services/data/store'
import type { LifeReview, ReviewType, Stored } from '@/types/models'
import { formatDate, isValidDate, todayStr } from '@/utils/dates'
import { excerpt, matches } from '@/utils/text'

const QUESTIONS: Record<ReviewType, [string, string, string][]> = {
  weekly: [
    ['well', 'ما الذي سار جيدًا هذا الأسبوع؟', 'What went well this week?'],
    ['done', 'ماذا أنجزت؟', 'What did I accomplish?'],
    ['neglected', 'ما الذي أهملته؟', 'What did I neglect?'],
    ['drained', 'ما الذي استنزف طاقتي؟', 'What drained my energy?'],
    ['improve', 'ما الذي ينبغي تحسينه الأسبوع القادم؟', 'What should I improve next week?'],
    ['priorities', 'ما أهم ثلاث أولويات لدي؟', 'What are my three most important priorities?'],
  ],
  monthly: [
    ['progress', 'ما التقدم الذي أحرزته؟', 'What progress did I make?'],
    ['goals', 'أي الأهداف تقدمت؟', 'Which goals moved forward?'],
    ['learned', 'ماذا تعلمت؟', 'What did I learn?'],
    ['balance', 'ما مدى توازن حياتي؟', 'How balanced was my life?'],
    ['stop', 'ما الذي ينبغي أن أتوقف عنه؟', 'What should I stop doing?'],
    ['focus', 'على ماذا أركز الشهر القادم؟', 'What should I focus on next month?'],
  ],
  annual: [
    ['achievements', 'ما أهم إنجازاتي؟', 'What were my most important achievements?'],
    ['challenges', 'ما أكبر التحديات؟', 'What were my biggest challenges?'],
    ['grew', 'كيف نموت؟', 'How did I grow?'],
    ['priorities', 'ما الذي تغير في أولوياتي؟', 'What changed in my priorities?'],
    ['continue', 'أي الأهداف ينبغي أن تستمر؟', 'Which goals should continue?'],
    ['next', 'كيف أريد أن تبدو السنة القادمة؟', 'What do I want the next year to look like?'],
  ],
}

function ReviewForm({ review, type, onClose }: { review?: Stored<LifeReview>; type: ReviewType; onClose: () => void }) {
  const { tr, lang } = useI18n()
  const nav = useNavigate()
  const [date, setDate] = useState(review?.date ?? todayStr())
  const [answers, setAnswers] = useState<Record<string, string>>(review?.answers ?? {})
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!isValidDate(date)) return setError(tr('تاريخ غير صالح.', 'Invalid date.'))
    if (!Object.values(answers).some((a) => a.trim())) return setError(tr('أجب عن سؤال واحد على الأقل.', 'Answer at least one question.'))
    if (review) await repo.update('lifeReviews', review.id, { date, answers })
    else await repo.create('lifeReviews', { type, date, answers })
    toast(tr('حُفظت المراجعة', 'Review saved'))
    onClose()
  }

  const del = async () => {
    if (review && (await confirmDelete(tr('هذه المراجعة', 'this review')))) {
      await repo.remove('lifeReviews', review.id)
      onClose()
    }
  }

  const toJournal = async () => {
    if (!review) return
    const plain = QUESTIONS[review.type].map(([k, ar, en]) => (review.answers[k] ? `${lang === 'ar' ? ar : en} ${review.answers[k]}` : '')).filter(Boolean).join(' ')
    const j = await repo.create('lifeJournal', {
      title: `${reviewTypeLabel(review.type)} · ${review.date}`, content: '', plain, date: todayStr(), mood: '', tags: [], domainId: null, goalId: null, favorite: false, archived: false,
      source: { collection: 'lifeReviews', id: review.id },
    })
    onClose()
    nav(`/compass/journal?open=${j.id}`)
  }

  return (
    <Sheet open wide onClose={onClose} title={reviewTypeLabel(review?.type ?? type)} footer={<FormFooter onCancel={onClose} onDelete={review ? () => void del() : undefined} />}>
      <form id="sheet-form" onSubmit={(e) => void submit(e)} className="space-y-4" noValidate>
        <Input label={tr('التاريخ', 'Date')} type="date" value={date} onChange={(e) => setDate(e.target.value)} className="max-w-48" error={error} />
        {QUESTIONS[review?.type ?? type].map(([key, ar, en]) => (
          <Textarea key={key} label={lang === 'ar' ? ar : en} value={answers[key] ?? ''} onChange={(e) => setAnswers({ ...answers, [key]: e.target.value })} rows={3} />
        ))}
        {review && <Button size="sm" icon={BookHeart} onClick={() => void toJournal()}>{tr('تدوينة من المراجعة', 'Journal entry from this review')}</Button>}
      </form>
    </Sheet>
  )
}

export default function ReviewsPage() {
  const { tr, lang } = useI18n()
  const { settings } = useSettings()
  const { items, loading } = useCollection('lifeReviews')
  const [filter, setFilter] = useState<ReviewType | null>(null)
  const [q, setQ] = useState('')
  const [form, setForm] = useState<{ review?: Stored<LifeReview>; type: ReviewType } | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  useParamOnce('open', setOpenId)

  useEffect(() => {
    if (!openId || loading) return
    const r = items.find((x) => x.id === openId)
    if (r) setForm({ review: r, type: r.type })
    setOpenId(null)
  }, [openId, items, loading])

  const shown = useMemo(() => items
    .filter((r) => (!filter || r.type === filter) && matches(`${r.date} ${Object.values(r.answers).join(' ')}`, q))
    .sort((a, b) => b.date.localeCompare(a.date)), [items, filter, q])

  return (
    <div>
      <PageHeader title={tr('المراجعات', 'Reviews')} subtitle={tr('وقفة صادقة مع النفس، على وتيرتك أنت.', 'An honest pause, at your own pace.')} />
      <div className="mb-4 grid gap-2 sm:grid-cols-3">
        {(['weekly', 'monthly', 'annual'] as ReviewType[]).map((t) => (
          <button key={t} type="button" onClick={() => setForm({ type: t })} className="card flex min-h-20 items-center justify-between gap-2 p-4 text-start font-bold transition hover:bg-raised">
            {reviewTypeLabel(t)}
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-gold text-charcoal"><Plus className="size-5" /></span>
          </button>
        ))}
      </div>
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute start-4 top-1/2 size-4.5 -translate-y-1/2 text-faint" />
        <input aria-label={tr('بحث في المراجعات', 'Search reviews')} value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr('ابحث في مراجعاتك', 'Search your reviews')} className="field !rounded-full !px-11" dir={q ? 'auto' : undefined} />
      </div>
      <ChipRow className="mb-4">
        {(['weekly', 'monthly', 'annual'] as ReviewType[]).map((t) => <Chip key={t} active={filter === t} onClick={() => setFilter(filter === t ? null : t)}>{reviewTypeLabel(t)}</Chip>)}
      </ChipRow>
      {shown.length === 0 ? (
        <EmptyState icon={MessageCircleQuestion} title={q || filter ? tr('لا توجد نتائج', 'No results') : tr('لا مراجعات بعد', 'No reviews yet')} body={q || filter ? undefined : tr('اختر نوع مراجعة من الأعلى وابدأ بسؤال واحد.', 'Choose a review type above and start with one question.')} />
      ) : (
        <div className="space-y-2">
          {shown.map((r) => (
            <button key={r.id} type="button" onClick={() => setForm({ review: r, type: r.type })} className="card block w-full p-4 text-start transition hover:bg-raised">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold">{reviewTypeLabel(r.type)}</span>
                <span className="flex items-center gap-2 text-sm text-faint">{formatDate(r.date, lang, settings.dateFormat)} <SyncBadge state={r._sync} compact /></span>
              </div>
              <p className="mt-1 line-clamp-2 text-[15px] text-muted" dir="auto">{excerpt(Object.values(r.answers).filter(Boolean).join(' · '), 180)}</p>
            </button>
          ))}
        </div>
      )}
      {form && <ReviewForm key={form.review?.id ?? form.type} review={form.review} type={form.type} onClose={() => setForm(null)} />}
    </div>
  )
}

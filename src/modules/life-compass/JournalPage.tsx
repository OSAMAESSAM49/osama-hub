import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Archive, ArchiveRestore, BookHeart, CalendarDays, Link2, List, Plus, Search, Sparkles, Star, Trash2 } from 'lucide-react'
import { CalendarMonth } from '@/components/common/Calendar'
import { confirmDelete } from '@/components/common/feedback'
import { Button, Chip, ChipRow, cx, EmptyState, IconButton, Input, PageHeader, Segmented, Select, Sheet, SyncBadge, Tag, TagInput } from '@/components/common/ui'
import { useParamOnce } from '@/hooks/useParamOnce'
import { useSettings } from '@/hooks/useSettings'
import { useI18n } from '@/i18n'
import { resolveRef } from '@/services/data/links'
import { getOne, repo, useCollection } from '@/services/data/store'
import type { LifeJournal } from '@/types/models'
import { formatDate, isValidDate, parseDate, todayStr } from '@/utils/dates'
import { excerpt, matches, newId } from '@/utils/text'

const RichText = lazy(() => import('@/components/forms/RichText'))

const MOODS: [string, string, string][] = [
  ['😌', 'هادئ', 'Calm'], ['🙂', 'جيد', 'Good'], ['😄', 'سعيد', 'Happy'], ['🤲', 'ممتن', 'Grateful'], ['💪', 'متحمس', 'Motivated'],
  ['😐', 'عادي', 'Neutral'], ['😔', 'حزين', 'Sad'], ['😟', 'قلق', 'Anxious'], ['😩', 'مرهق', 'Tired'],
]

const PROMPTS: [string, string][] = [
  ['ما الذي تشعر بالامتنان له اليوم؟', 'What are you grateful for today?'],
  ['ما الحوار الذي بقي في ذهنك؟', 'Which conversation stayed on your mind?'],
  ['ماذا تعلمت عن نفسك هذا الأسبوع؟', 'What did you learn about yourself this week?'],
  ['ما الشيء الصغير الذي أسعد أسرتك؟', 'What small thing made your family happy?'],
  ['لو عدت إلى بداية اليوم، ماذا ستغيّر؟', 'If you could restart today, what would you change?'],
  ['ما القرار الذي تؤجله؟ ولماذا؟', 'Which decision are you postponing, and why?'],
  ['كيف كانت علاقتك بالقرآن اليوم؟', 'How was your connection with the Quran today?'],
  ['ما الذي منحك طاقة اليوم؟', 'What gave you energy today?'],
]

const dailyPrompt = (date: string) => PROMPTS[Math.floor(parseDate(date).getTime() / 86_400_000) % PROMPTS.length]!

function JournalEditor({ id, initialDate, initialPrompt, onClose }: { id: string; initialDate: string; initialPrompt?: string; onClose: () => void }) {
  const { tr, lang } = useI18n()
  const { items: domains } = useCollection('lifeDomains')
  const { items: goals } = useCollection('lifeGoals')
  const { items: journal } = useCollection('lifeJournal')
  useCollection('notes')
  useCollection('voiceNotes')
  useCollection('lifeReviews')
  const live = journal.find((j) => j.id === id)
  const blank: Omit<LifeJournal, 'createdAt' | 'updatedAt'> = {
    id, title: initialPrompt ?? '', content: '', plain: '', date: initialDate, mood: '', tags: [], domainId: null, goalId: null, favorite: false, archived: false, source: null,
  }
  const [draft, setDraft] = useState(() => getOne('lifeJournal', id) ?? blank)
  const latest = useRef(draft)
  const dirty = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flush = async () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    if (!dirty.current) return
    const d = latest.current
    if (!isValidDate(d.date)) return
    const stored = getOne('lifeJournal', id)
    if (!stored && !d.title.trim() && !d.plain.trim() && !d.mood) return
    dirty.current = false
    if (stored) await repo.update('lifeJournal', id, d)
    else await repo.create('lifeJournal', d)
  }

  const change = (patch: Partial<LifeJournal>) => {
    const next = { ...latest.current, ...patch }
    latest.current = next
    dirty.current = true
    setDraft(next)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void flush(), 500)
  }

  useEffect(() => () => void flush(), []) // eslint-disable-line react-hooks/exhaustive-deps

  const close = async () => {
    await flush()
    onClose()
  }

  const del = async () => {
    if (await confirmDelete(tr('هذه التدوينة', 'this entry'))) {
      dirty.current = false
      if (getOne('lifeJournal', id)) await repo.remove('lifeJournal', id)
      onClose()
    }
  }

  const source = resolveRef(draft.source)

  return (
    <Sheet
      open
      wide
      onClose={() => void close()}
      title={live ? tr('تدوينة', 'Journal entry') : tr('تدوينة جديدة', 'New entry')}
      footer={
        <>
          <div className="me-auto flex items-center gap-1">
            <IconButton icon={Star} label={tr('مفضلة', 'Favorite')} active={draft.favorite} onClick={() => change({ favorite: !draft.favorite })} />
            <IconButton icon={draft.archived ? ArchiveRestore : Archive} label={draft.archived ? tr('إلغاء الأرشفة', 'Unarchive') : tr('أرشفة', 'Archive')} onClick={() => { change({ archived: !draft.archived }); void close() }} />
            <IconButton icon={Trash2} label={tr('حذف', 'Delete')} onClick={() => void del()} />
          </div>
          {live ? <SyncBadge state={live._sync} /> : <span className="text-xs text-faint">{tr('يُحفظ تلقائيًا', 'Saves automatically')}</span>}
          <Button variant="ink" onClick={() => void close()}>{tr('تم', 'Done')}</Button>
        </>
      }
    >
      <input aria-label={tr('العنوان', 'Title')} value={draft.title} onChange={(e) => change({ title: e.target.value })} placeholder={tr('العنوان', 'Title')} dir={draft.title ? 'auto' : undefined} className="w-full bg-transparent font-display text-2xl font-bold outline-none placeholder:text-faint" />
      {source && <Link to={source.path} onClick={() => void close()} className="inline-flex items-center gap-1.5 text-sm text-accent"><Link2 className="size-4" />{tr('من', 'From')}: {source.title}</Link>}
      <div role="radiogroup" aria-label={tr('المزاج', 'Mood')} className="no-scrollbar -mx-1 flex gap-1 overflow-x-auto px-1">
        {MOODS.map(([emoji, ar, en]) => (
          <button key={emoji} type="button" role="radio" aria-checked={draft.mood === emoji} aria-label={lang === 'ar' ? ar : en} title={lang === 'ar' ? ar : en} onClick={() => change({ mood: draft.mood === emoji ? '' : emoji })} className={cx('grid size-11 shrink-0 place-items-center rounded-full text-xl transition', draft.mood === emoji ? 'bg-ink' : 'bg-raised hover:bg-line')}>
            {emoji}
          </button>
        ))}
      </div>
      <Suspense fallback={<div className="skeleton h-48" />}>
        <RichText serif value={draft.content || (draft.plain && !draft.content ? `<p>${draft.plain.replace(/[<>&]/g, '')}</p>` : '')} onChange={(content, plain) => change({ content, plain })} placeholder={tr('ما الذي يدور في بالك؟', "What's on your mind?")} />
      </Suspense>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Input label={tr('التاريخ', 'Date')} type="date" value={draft.date} onChange={(e) => change({ date: e.target.value })} />
        <Select label={tr('المجال', 'Domain')} value={draft.domainId ?? ''} onChange={(e) => change({ domainId: e.target.value || null })} options={[{ value: '', label: '—' }, ...domains.map((d) => ({ value: d.id, label: d.name }))]} />
        <Select label={tr('الهدف', 'Goal')} value={draft.goalId ?? ''} onChange={(e) => change({ goalId: e.target.value || null })} options={[{ value: '', label: '—' }, ...goals.map((g) => ({ value: g.id, label: g.title }))]} />
      </div>
      <TagInput value={draft.tags} onChange={(tags) => change({ tags })} suggestions={[...new Set(journal.flatMap((j) => j.tags))]} />
    </Sheet>
  )
}

export default function JournalPage() {
  const { tr, lang } = useI18n()
  const { settings } = useSettings()
  const { items } = useCollection('lifeJournal')
  const { items: domains } = useCollection('lifeDomains')
  const [view, setView] = useState<'timeline' | 'calendar'>('timeline')
  const [scope, setScope] = useState<'all' | 'favorites' | 'archived'>('all')
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<{ id: string; date: string; prompt?: string } | null>(null)
  const today = todayStr()
  const prompt = dailyPrompt(today)
  const promptText = lang === 'ar' ? prompt[0] : prompt[1]
  useParamOnce('open', (id) => setEditing({ id, date: today }))
  useParamOnce('new', () => setEditing({ id: newId(), date: today }))

  const shown = useMemo(() => items
    .filter((j) => (scope === 'archived' ? j.archived : !j.archived) && (scope !== 'favorites' || j.favorite) && matches(`${j.title} ${j.plain} ${j.tags.join(' ')}`, q))
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)), [items, scope, q])

  const months = useMemo(() => {
    const m = new Map<string, typeof shown>()
    for (const j of shown) m.set(j.date.slice(0, 7), [...(m.get(j.date.slice(0, 7)) ?? []), j])
    return [...m.entries()]
  }, [shown])

  return (
    <div>
      <PageHeader
        title={tr('المذكرات', 'Life Journal')}
        actions={
          <>
            <Segmented label={tr('طريقة العرض', 'View')} value={view} onChange={setView} options={[{ value: 'timeline', label: tr('الخط الزمني', 'Timeline'), icon: List }, { value: 'calendar', label: tr('تقويم', 'Calendar'), icon: CalendarDays }]} />
            <Button variant="primary" icon={Plus} capsule onClick={() => setEditing({ id: newId(), date: today })}>{tr('تدوينة', 'Entry')}</Button>
          </>
        }
      />
      <button type="button" onClick={() => setEditing({ id: newId(), date: today, prompt: promptText })} className="mb-4 flex w-full items-center gap-3 rounded-[1.75rem] bg-gold/20 p-4 text-start transition hover:bg-gold/30">
        <Sparkles className="size-5 shrink-0 text-gold" />
        <span><span className="block text-sm text-muted">{tr('سؤال اليوم', "Today's prompt")}</span><span className="font-reading text-[1.08rem]">{promptText}</span></span>
      </button>
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute start-4 top-1/2 size-4.5 -translate-y-1/2 text-faint" />
        <input aria-label={tr('بحث في المذكرات', 'Search the journal')} value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr('ابحث في مذكراتك', 'Search your journal')} className="field !rounded-full !px-11" dir={q ? 'auto' : undefined} />
      </div>
      <ChipRow className="mb-4">
        <Chip active={scope === 'all'} onClick={() => setScope('all')}>{tr('الكل', 'All')}</Chip>
        <Chip active={scope === 'favorites'} onClick={() => setScope('favorites')}><Star className="size-3.5" />{tr('المفضلة', 'Favorites')}</Chip>
        <Chip active={scope === 'archived'} onClick={() => setScope('archived')}>{tr('الأرشيف', 'Archive')}</Chip>
      </ChipRow>
      {view === 'calendar' ? (
        <CalendarMonth
          items={shown.map((j) => ({ id: j.id, date: j.date, title: `${j.mood} ${j.title || excerpt(j.plain, 30) || tr('تدوينة', 'Entry')}`.trim(), onClick: () => setEditing({ id: j.id, date: j.date }) }))}
          renderExtra={(day) => (
            <button type="button" className="flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl text-sm text-accent hover:bg-raised" onClick={() => setEditing({ id: newId(), date: day })}>
              <Plus className="size-4" /> {tr('تدوينة في هذا اليوم', 'Entry on this day')}
            </button>
          )}
        />
      ) : shown.length === 0 ? (
        <EmptyState icon={BookHeart} title={q ? tr('لا توجد نتائج', 'No results') : tr('صفحتك البيضاء', 'Your blank page')} body={q ? undefined : tr('سطر واحد يكفي. لا أحد يقرأ هذا غيرك.', 'One line is enough. No one reads this but you.')} />
      ) : (
        <div className="space-y-6">
          {months.map(([month, list]) => (
            <section key={month}>
              <h2 className="mb-2 font-display text-xl font-bold">{new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB', { month: 'long', year: 'numeric' }).format(parseDate(`${month}-01`))}</h2>
              <ol className="ms-2 space-y-2 border-s-2 border-gold/40 ps-4">
                {list.map((j) => (
                  <li key={j.id}>
                    <button type="button" onClick={() => setEditing({ id: j.id, date: j.date })} className="card block w-full p-4 text-start transition hover:bg-raised">
                      <div className="flex items-center gap-2">
                        {j.mood && <span className="text-lg">{j.mood}</span>}
                        <h3 className="min-w-0 flex-1 truncate font-bold" dir="auto">{j.title || formatDate(j.date, lang, settings.dateFormat)}</h3>
                        {j.favorite && <Star className="size-4 shrink-0 fill-current text-gold" />}
                        <SyncBadge state={j._sync} compact />
                      </div>
                      {j.plain && <p className="mt-1 line-clamp-3 font-reading text-muted" dir="auto">{j.plain}</p>}
                      <div className="mt-2 flex flex-wrap items-center gap-1">
                        <span className="text-xs text-faint">{formatDate(j.date, lang, settings.dateFormat)}</span>
                        {domains.find((d) => d.id === j.domainId) && <Tag>{domains.find((d) => d.id === j.domainId)!.name}</Tag>}
                        {j.tags.slice(0, 3).map((t) => <Tag key={t}>#{t}</Tag>)}
                      </div>
                    </button>
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}
      {editing && <JournalEditor key={editing.id} id={editing.id} initialDate={editing.date} initialPrompt={editing.prompt} onClose={() => setEditing(null)} />}
    </div>
  )
}

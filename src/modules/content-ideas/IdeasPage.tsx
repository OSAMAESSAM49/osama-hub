import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarDays, Columns3, Lightbulb, List, ListChecks, Plus, Search, Star } from 'lucide-react'
import { CalendarMonth } from '@/components/common/Calendar'
import { confirmDelete, toast } from '@/components/common/feedback'
import {
  Button, Chip, ChipRow, cx, EmptyState, FormFooter, IconButton, Input, ListSkeleton, PageHeader, Segmented, Select, Sheet, SyncBadge, Tag, TagInput, Textarea,
} from '@/components/common/ui'
import { useParamOnce } from '@/hooks/useParamOnce'
import { useSettings } from '@/hooks/useSettings'
import { useI18n } from '@/i18n'
import {
  contentTypeLabel, contentTypeOptions, IDEA_STATUSES, ideaCategoryLabel, ideaCategoryOptions, ideaStatusLabel, ideaStatusOptions, platformLabel, platformOptions, priority3Label, priority3Options,
} from '@/i18n/labels'
import { ideaToTask } from '@/services/data/links'
import { repo, useCollection } from '@/services/data/store'
import type { ContentIdea, IdeaStatus, Priority3, Stored } from '@/types/models'
import { formatDate, isValidDate } from '@/utils/dates'
import { matches, parseUrl } from '@/utils/text'

function IdeaForm({ idea, allTags, initialDate, onClose }: { idea?: Stored<ContentIdea>; allTags: string[]; initialDate?: string; onClose: () => void }) {
  const { tr } = useI18n()
  const nav = useNavigate()
  const goals = useCollection('lifeGoals').items
  const [title, setTitle] = useState(idea?.title ?? '')
  const [description, setDescription] = useState(idea?.description ?? '')
  const [category, setCategory] = useState(idea?.category ?? 'dentalEducation')
  const [platform, setPlatform] = useState(idea?.platform ?? 'instagram')
  const [contentType, setContentType] = useState(idea?.contentType ?? 'reel')
  const [tags, setTags] = useState(idea?.tags ?? [])
  const [priority, setPriority] = useState<Priority3>(idea?.priority ?? 'medium')
  const [status, setStatus] = useState<IdeaStatus>(idea?.status ?? 'new')
  const [plannedDate, setPlannedDate] = useState(idea?.plannedDate ?? initialDate ?? '')
  const [links, setLinks] = useState((idea?.links ?? []).join('\n'))
  const [notes, setNotes] = useState(idea?.notes ?? '')
  const [goalId, setGoalId] = useState(idea?.goalId ?? '')
  const [errors, setErrors] = useState<{ title?: string; date?: string; links?: string }>({})

  const save = async (): Promise<Stored<ContentIdea> | null> => {
    const errs: typeof errors = {}
    if (!title.trim()) errs.title = tr('اكتب عنوان الفكرة.', 'Enter a title.')
    if (plannedDate && !isValidDate(plannedDate)) errs.date = tr('تاريخ غير صالح.', 'Invalid date.')
    const linkList = links.split('\n').map((l) => l.trim()).filter(Boolean)
    if (linkList.some((l) => !parseUrl(l))) errs.links = tr('يوجد رابط غير صالح.', 'One of the links is not valid.')
    setErrors(errs)
    if (Object.keys(errs).length) return null
    const data = {
      title: title.trim(), description, category, platform, contentType, tags, priority, status, plannedDate: plannedDate || null,
      links: linkList.map((l) => parseUrl(l)!.href), notes, goalId: goalId || null,
    }
    return idea ? repo.update('contentIdeas', idea.id, data) : repo.create('contentIdeas', { ...data, favorite: false, taskId: null })
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (await save()) {
      toast(tr('حُفظت الفكرة', 'Idea saved'))
      onClose()
    }
  }

  const toTask = async () => {
    const saved = await save()
    if (!saved) return
    const res = await ideaToTask(saved)
    toast(res.created ? tr('أُنشئت مهمة مرتبطة بالفكرة', 'Linked task created') : tr('لهذه الفكرة مهمة بالفعل', 'This idea already has a task'), res.created ? 'ok' : 'info')
    onClose()
    nav(`/tasks?open=${res.id}`)
  }

  const del = async () => {
    if (idea && (await confirmDelete(tr('هذه الفكرة', 'this idea')))) {
      await repo.remove('contentIdeas', idea.id)
      onClose()
    }
  }

  return (
    <Sheet open wide onClose={onClose} title={idea ? tr('تعديل الفكرة', 'Edit idea') : tr('فكرة جديدة', 'New idea')} footer={<FormFooter onCancel={onClose} onDelete={idea ? () => void del() : undefined} />}>
      <form id="sheet-form" onSubmit={(e) => void submit(e)} className="space-y-3" noValidate>
        <Input label={tr('العنوان', 'Title')} value={title} onChange={(e) => setTitle(e.target.value)} error={errors.title} autoFocus={!idea} />
        <Textarea label={tr('الوصف', 'Description')} value={description} onChange={(e) => setDescription(e.target.value)} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Select label={tr('التصنيف', 'Category')} value={category} onChange={(e) => setCategory(e.target.value)} options={ideaCategoryOptions()} />
          <Select label={tr('المنصة', 'Platform')} value={platform} onChange={(e) => setPlatform(e.target.value)} options={platformOptions()} />
          <Select label={tr('نوع المحتوى', 'Content type')} value={contentType} onChange={(e) => setContentType(e.target.value)} options={contentTypeOptions()} />
          <Select label={tr('الأولوية', 'Priority')} value={priority} onChange={(e) => setPriority(e.target.value as Priority3)} options={priority3Options()} />
          <Select label={tr('الحالة', 'Status')} value={status} onChange={(e) => setStatus(e.target.value as IdeaStatus)} options={ideaStatusOptions()} />
          <Input label={tr('موعد النشر', 'Publish date')} type="date" value={plannedDate} onChange={(e) => setPlannedDate(e.target.value)} error={errors.date} />
        </div>
        <TagInput value={tags} onChange={setTags} suggestions={allTags} />
        <Textarea label={tr('روابط ذات صلة (رابط في كل سطر)', 'Related links (one per line)')} value={links} onChange={(e) => setLinks(e.target.value)} rows={2} error={errors.links} dir="ltr" />
        <Textarea label={tr('ملاحظات', 'Notes')} value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        <Select label={tr('تخدم هدف حياة (اختياري)', 'Serves a life goal (optional)')} value={goalId} onChange={(e) => setGoalId(e.target.value)} options={[{ value: '', label: '—' }, ...goals.map((g) => ({ value: g.id, label: g.title }))]} />
        <Button icon={ListChecks} onClick={() => void toTask()}>{idea?.taskId ? tr('فتح المهمة المرتبطة', 'Open linked task') : tr('تحويل إلى مهمة', 'Convert to a task')}</Button>
      </form>
    </Sheet>
  )
}

function IdeaCard({ idea, onOpen, draggable }: { idea: Stored<ContentIdea>; onOpen: () => void; draggable?: boolean }) {
  const { tr, lang } = useI18n()
  const { settings } = useSettings()
  return (
    <article
      draggable={draggable}
      onDragStart={(e) => e.dataTransfer.setData('text/idea', idea.id)}
      className={cx('card flex items-start gap-1 p-3', draggable && 'cursor-grab active:cursor-grabbing')}
    >
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-start">
        <h3 className="line-clamp-2 font-bold" dir="auto">{idea.title}</h3>
        {idea.description && <p className="mt-0.5 line-clamp-2 text-sm text-muted" dir="auto">{idea.description}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-1">
          <Tag>{platformLabel(idea.platform)}</Tag>
          <Tag>{contentTypeLabel(idea.contentType)}</Tag>
          {idea.priority === 'high' && <Tag tone="warn">{priority3Label('high')}</Tag>}
          {idea.plannedDate && <Tag tone="accent">{formatDate(idea.plannedDate, lang, settings.dateFormat)}</Tag>}
          {idea.taskId && <Tag tone="good"><ListChecks className="size-3" />{tr('مهمة', 'Task')}</Tag>}
          <SyncBadge state={idea._sync} compact />
        </div>
      </button>
      <IconButton size="sm" icon={Star} label={tr('مفضلة', 'Favorite')} active={idea.favorite} onClick={() => void repo.update('contentIdeas', idea.id, { favorite: !idea.favorite })} />
    </article>
  )
}

export default function IdeasPage() {
  const { tr } = useI18n()
  const { items, loading } = useCollection('contentIdeas')
  const [view, setView] = useState<'board' | 'list' | 'calendar'>('board')
  const [q, setQ] = useState('')
  const [category, setCategory] = useState<string | null>(null)
  const [favOnly, setFavOnly] = useState(false)
  const [form, setForm] = useState<{ idea?: Stored<ContentIdea>; date?: string } | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [over, setOver] = useState<IdeaStatus | null>(null)
  useParamOnce('new', () => setForm({}))
  useParamOnce('open', setOpenId)

  useEffect(() => {
    if (!openId || loading) return
    const it = items.find((i) => i.id === openId)
    if (it) setForm({ idea: it })
    setOpenId(null)
  }, [openId, items, loading])

  const allTags = useMemo(() => [...new Set(items.flatMap((i) => i.tags))], [items])
  const shown = useMemo(() => items
    .filter((i) => (!category || i.category === category) && (!favOnly || i.favorite) && matches(`${i.title} ${i.description} ${i.notes} ${i.tags.join(' ')} ${platformLabel(i.platform)}`, q))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [items, category, favOnly, q])

  return (
    <div className="fade-in">
      <PageHeader
        title={tr('أفكار المحتوى', 'Content Ideas')}
        subtitle={tr('مساحتك الإبداعية', 'Your creative workspace')}
        actions={<Button variant="primary" icon={Plus} capsule onClick={() => setForm({})}>{tr('فكرة', 'Idea')}</Button>}
      />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-56">
          <Search className="pointer-events-none absolute start-4 top-1/2 size-4.5 -translate-y-1/2 text-faint" />
          <input aria-label={tr('بحث في الأفكار', 'Search ideas')} value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr('ابحث في الأفكار', 'Search ideas')} className="field !rounded-full !px-11" dir={q ? 'auto' : undefined} />
        </div>
        <Segmented
          label={tr('طريقة العرض', 'View')}
          value={view}
          onChange={setView}
          options={[
            { value: 'board', label: tr('لوحة', 'Board'), icon: Columns3 },
            { value: 'list', label: tr('قائمة', 'List'), icon: List },
            { value: 'calendar', label: tr('تقويم', 'Calendar'), icon: CalendarDays },
          ]}
        />
      </div>
      <ChipRow className="mb-4">
        <Chip active={favOnly} onClick={() => setFavOnly(!favOnly)}><Star className="size-3.5" />{tr('المفضلة', 'Favorites')}</Chip>
        {ideaCategoryOptions().map((c) => <Chip key={c.value} active={category === c.value} onClick={() => setCategory(category === c.value ? null : c.value)}>{c.label}</Chip>)}
      </ChipRow>

      {loading ? <ListSkeleton /> : items.length === 0 ? (
        <EmptyState
          icon={Lightbulb}
          title={tr('دوّن فكرتك الأولى', 'Capture your first idea')}
          body={tr('تعليم طب الأسنان، Dentispace، ريلز، يوتيوب… كل فكرة تبدأ بعنوان.', 'Dental education, Dentispace, reels, YouTube… every idea starts with a title.')}
          action={<Button variant="primary" icon={Plus} onClick={() => setForm({})}>{tr('فكرة جديدة', 'New idea')}</Button>}
        />
      ) : view === 'board' ? (
        <div className="no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 lg:mx-0 lg:px-0">
          {IDEA_STATUSES.map((s) => {
            const col = shown.filter((i) => i.status === s)
            return (
              <section
                key={s}
                aria-label={ideaStatusLabel(s)}
                onDragOver={(e) => { e.preventDefault(); setOver(s) }}
                onDragLeave={() => setOver(null)}
                onDrop={(e) => {
                  e.preventDefault()
                  setOver(null)
                  const id = e.dataTransfer.getData('text/idea')
                  if (id) void repo.update('contentIdeas', id, { status: s })
                }}
                className={cx('w-72 shrink-0 snap-start rounded-[1.75rem] bg-raised/60 p-2 transition lg:min-w-0 lg:flex-1', over === s && 'outline-2 outline-accent')}
              >
                <h2 className="flex items-center justify-between px-2 py-1.5 text-sm font-bold">{ideaStatusLabel(s)} <span className="tnum font-normal text-faint">{col.length}</span></h2>
                <div className="space-y-2">{col.map((i) => <IdeaCard key={i.id} idea={i} draggable onOpen={() => setForm({ idea: i })} />)}</div>
              </section>
            )
          })}
        </div>
      ) : view === 'list' ? (
        shown.length ? (
          <div className="space-y-2">
            {shown.map((i) => (
              <div key={i.id}>
                <IdeaCard idea={i} onOpen={() => setForm({ idea: i })} />
              </div>
            ))}
          </div>
        ) : <EmptyState icon={Search} title={tr('لا توجد نتائج', 'No results')} />
      ) : (
        <CalendarMonth
          items={shown.filter((i) => i.plannedDate).map((i) => ({ id: i.id, date: i.plannedDate!, title: `${i.title} · ${ideaCategoryLabel(i.category)}`, onClick: () => setForm({ idea: i }) }))}
          renderExtra={(day) => (
            <button type="button" className="flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl text-sm text-accent hover:bg-raised" onClick={() => setForm({ date: day })}>
              <Plus className="size-4" /> {tr('فكرة في هذا اليوم', 'Idea on this day')}
            </button>
          )}
        />
      )}
      {form && <IdeaForm key={form.idea?.id ?? 'new'} idea={form.idea} initialDate={form.date} allTags={allTags} onClose={() => setForm(null)} />}
    </div>
  )
}

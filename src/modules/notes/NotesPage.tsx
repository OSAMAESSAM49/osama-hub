import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Archive, ArchiveRestore, BookHeart, LayoutGrid, List, NotebookPen, Pin, Plus, Search, Trash2 } from 'lucide-react'
import { confirmDelete, toast } from '@/components/common/feedback'
import {
  Button, Chip, ChipRow, ComboInput, cx, EmptyState, IconButton, ListSkeleton, PageHeader, Segmented, Sheet, SyncBadge, Tag, TagInput,
} from '@/components/common/ui'
import { useSettings } from '@/hooks/useSettings'
import { useParamOnce } from '@/hooks/useParamOnce'
import { useI18n } from '@/i18n'
import { getOne, repo, useCollection } from '@/services/data/store'
import type { Note, Stored } from '@/types/models'
import { formatDate, todayStr } from '@/utils/dates'
import { excerpt, matches, newId } from '@/utils/text'
import { useNavigate } from 'react-router-dom'

const RichText = lazy(() => import('@/components/forms/RichText'))

const blankNote = (id: string): Omit<Note, 'createdAt' | 'updatedAt'> => ({
  id, title: '', content: '', plain: '', category: '', tags: [], pinned: false, archived: false,
})

/** Saves as you type. The record is only created on the first real input, so empty notes never pile up. */
function NoteEditor({ noteId, onClose, categories, allTags }: { noteId: string; onClose: () => void; categories: string[]; allTags: string[] }) {
  const { tr, lang } = useI18n()
  const { settings } = useSettings()
  const nav = useNavigate()
  const existing = getOne('notes', noteId)
  const [draft, setDraft] = useState<Omit<Note, 'createdAt' | 'updatedAt'>>(() => existing ?? blankNote(noteId))
  const live = useCollection('notes').items.find((n) => n.id === noteId)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latest = useRef(draft)
  const dirty = useRef(false)

  const flush = async () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    if (!dirty.current) return
    const d = latest.current
    const hasContent = d.title.trim() || d.plain.trim()
    const stored = getOne('notes', noteId)
    if (!stored && !hasContent) return
    dirty.current = false
    if (stored) await repo.update('notes', noteId, d)
    else await repo.create('notes', d)
  }

  const change = (patch: Partial<Note>) => {
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
    if (!(await confirmDelete(tr('هذه الملاحظة', 'this note')))) return
    dirty.current = false
    if (getOne('notes', noteId)) await repo.remove('notes', noteId)
    onClose()
    toast(tr('حُذفت الملاحظة', 'Note deleted'))
  }

  const toJournal = async () => {
    await flush()
    const n = getOne('notes', noteId)
    if (!n) return
    const j = await repo.create('lifeJournal', {
      title: n.title, content: n.content, plain: n.plain, date: todayStr(), mood: '', tags: n.tags, domainId: null, goalId: null,
      favorite: false, archived: false, source: { collection: 'notes', id: n.id },
    })
    onClose()
    nav(`/compass/journal?open=${j.id}`)
  }

  return (
    <Sheet
      open
      wide
      onClose={() => void close()}
      title={existing ? tr('تعديل الملاحظة', 'Edit note') : tr('ملاحظة جديدة', 'New note')}
      footer={
        <>
          <div className="me-auto flex items-center gap-1">
            <IconButton icon={Pin} label={tr('تثبيت', 'Pin')} active={draft.pinned} onClick={() => change({ pinned: !draft.pinned })} />
            <IconButton
              icon={draft.archived ? ArchiveRestore : Archive}
              label={draft.archived ? tr('إلغاء الأرشفة', 'Unarchive') : tr('أرشفة', 'Archive')}
              onClick={() => { change({ archived: !draft.archived }); void close() }}
            />
            {live && <IconButton icon={BookHeart} label={tr('إنشاء تدوينة من الملاحظة', 'Create journal entry')} onClick={() => void toJournal()} />}
            <IconButton icon={Trash2} label={tr('حذف', 'Delete')} onClick={() => void del()} />
          </div>
          {live ? <SyncBadge state={live._sync} /> : <span className="text-xs text-faint">{tr('يُحفظ تلقائيًا', 'Saves automatically')}</span>}
          <Button variant="ink" onClick={() => void close()}>{tr('تم', 'Done')}</Button>
        </>
      }
    >
      <input
        aria-label={tr('العنوان', 'Title')}
        data-autofocus={existing ? undefined : ''}
        value={draft.title}
        onChange={(e) => change({ title: e.target.value })}
        placeholder={tr('العنوان', 'Title')}
        dir={draft.title ? 'auto' : undefined}
        className="w-full bg-transparent font-display text-2xl font-bold outline-none placeholder:text-faint"
      />
      <Suspense fallback={<div className="skeleton h-48" />}>
        <RichText value={draft.content} onChange={(content, plain) => change({ content, plain })} placeholder={tr('ابدأ الكتابة…', 'Start writing…')} />
      </Suspense>
      <div className="grid gap-3 sm:grid-cols-2">
        <ComboInput label={tr('التصنيف', 'Category')} value={draft.category} onChange={(category) => change({ category })} suggestions={categories} />
        <TagInput value={draft.tags} onChange={(tags) => change({ tags })} suggestions={allTags} />
      </div>
      {live && (
        <p className="text-xs text-faint">
          {tr('أُنشئت', 'Created')} {formatDate(live.createdAt, lang, settings.dateFormat)} · {tr('آخر تعديل', 'Edited')} {formatDate(live.updatedAt, lang, settings.dateFormat)}
        </p>
      )}
    </Sheet>
  )
}

export default function NotesPage() {
  const { tr, lang } = useI18n()
  const { settings } = useSettings()
  const { items, loading } = useCollection('notes')
  const [q, setQ] = useState('')
  const [view, setView] = useState<'grid' | 'list'>(() => {
    try { return localStorage.getItem('osama-hub:notes-view') === 'list' ? 'list' : 'grid' } catch { return 'grid' }
  })
  const [scope, setScope] = useState<'active' | 'pinned' | 'archived'>('active')
  const [category, setCategory] = useState<string | null>(null)
  const [tag, setTag] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)

  useParamOnce('new', () => setEditing(newId()))
  useParamOnce('open', (id) => setEditing(id))

  useEffect(() => {
    try { localStorage.setItem('osama-hub:notes-view', view) } catch { /* A convenience only. */ }
  }, [view])

  const categories = useMemo(() => [...new Set(items.map((n) => n.category).filter(Boolean))], [items])
  const allTags = useMemo(() => [...new Set(items.flatMap((n) => n.tags))], [items])

  const shown = useMemo(() => {
    const list = items.filter((n) => {
      if (scope === 'archived' ? !n.archived : n.archived) return false
      if (scope === 'pinned' && !n.pinned) return false
      if (category && n.category !== category) return false
      if (tag && !n.tags.includes(tag)) return false
      return matches(`${n.title} ${n.plain} ${n.category} ${n.tags.join(' ')}`, q)
    })
    return list.sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt))
  }, [items, q, scope, category, tag])

  return (
    <div className="fade-in">
      <PageHeader
        title={tr('الملاحظات', 'Quick Notes')}
        subtitle={tr(`${items.filter((n) => !n.archived).length} ملاحظة`, `${items.filter((n) => !n.archived).length} notes`)}
        actions={<Button variant="primary" icon={Plus} capsule onClick={() => setEditing(newId())}>{tr('ملاحظة', 'Note')}</Button>}
      />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-56">
          <Search className="pointer-events-none absolute start-4 top-1/2 size-4.5 -translate-y-1/2 text-faint" />
          <input aria-label={tr('بحث في الملاحظات', 'Search notes')} value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr('ابحث في الملاحظات', 'Search notes')} className="field !rounded-full !px-11" dir={q ? 'auto' : undefined} />
        </div>
        <Segmented
          label={tr('طريقة العرض', 'View')}
          value={view}
          onChange={setView}
          options={[{ value: 'grid', label: '', icon: LayoutGrid }, { value: 'list', label: '', icon: List }]}
        />
      </div>
      <ChipRow className="mb-4">
        <Chip active={scope === 'active'} onClick={() => setScope('active')}>{tr('الكل', 'All')}</Chip>
        <Chip active={scope === 'pinned'} onClick={() => setScope('pinned')}>{tr('المثبتة', 'Pinned')}</Chip>
        <Chip active={scope === 'archived'} onClick={() => setScope('archived')}>{tr('الأرشيف', 'Archive')}</Chip>
        {categories.map((c) => <Chip key={c} active={category === c} onClick={() => setCategory(category === c ? null : c)}>{c}</Chip>)}
        {allTags.slice(0, 12).map((t) => <Chip key={t} active={tag === t} onClick={() => setTag(tag === t ? null : t)}>#{t}</Chip>)}
      </ChipRow>

      {loading ? <ListSkeleton /> : shown.length === 0 ? (
        <EmptyState
          icon={NotebookPen}
          title={q || category || tag ? tr('لا توجد نتائج', 'No results') : scope === 'archived' ? tr('الأرشيف فارغ', 'Archive is empty') : tr('لا توجد ملاحظات بعد', 'No notes yet')}
          body={q || category || tag ? tr('جرّب كلمات أو فلترًا آخر.', 'Try other words or another filter.') : tr('دوّن فكرة الآن قبل أن تطير.', 'Capture a thought before it slips away.')}
          action={!q && scope === 'active' ? <Button variant="primary" icon={Plus} onClick={() => setEditing(newId())}>{tr('أول ملاحظة', 'First note')}</Button> : undefined}
        />
      ) : (
        <div className={cx(view === 'grid' ? 'grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3' : 'space-y-2')}>
          {shown.map((n) => <NoteCard key={n.id} n={n} list={view === 'list'} dateFmt={settings.dateFormat} lang={lang} onOpen={() => setEditing(n.id)} />)}
        </div>
      )}

      {editing && <NoteEditor key={editing} noteId={editing} categories={categories} allTags={allTags} onClose={() => setEditing(null)} />}
    </div>
  )
}

function NoteCard({ n, list, onOpen, lang, dateFmt }: { n: Stored<Note>; list: boolean; onOpen: () => void; lang: 'ar' | 'en'; dateFmt: 'long' | 'dmy' | 'iso' }) {
  const { tr } = useI18n()
  return (
    <button type="button" onClick={onOpen} className={cx('card block w-full p-4 text-start transition hover:bg-raised', !list && 'min-h-40')}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 truncate font-bold" dir="auto">{n.title || tr('بدون عنوان', 'Untitled')}</h3>
        {n.pinned && <Pin className="size-4 shrink-0 fill-current text-accent" aria-label={tr('مثبتة', 'Pinned')} />}
      </div>
      <p className={cx('mt-1 text-[15px] text-muted', list ? 'line-clamp-1' : 'line-clamp-4')} dir="auto">{excerpt(n.plain, 220)}</p>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-faint">{formatDate(n.updatedAt, lang, dateFmt)}</span>
        {n.category && <Tag>{n.category}</Tag>}
        {n.tags.slice(0, 2).map((t) => <Tag key={t}>#{t}</Tag>)}
        <span className="ms-auto"><SyncBadge state={n._sync} compact /></span>
      </div>
    </button>
  )
}


import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarDays, Check, CheckCircle2, CheckSquare, Circle, Link2, List, Plus, Search } from 'lucide-react'
import { CalendarMonth } from '@/components/common/Calendar'
import { confirmDelete, toast } from '@/components/common/feedback'
import {
  Chip, ChipRow, ComboInput, cx, EmptyState, FormFooter, Input, ListSkeleton, PageHeader, Segmented, Select, Sheet, SyncBadge, Tag, TagInput, Textarea,
} from '@/components/common/ui'
import { useParamOnce } from '@/hooks/useParamOnce'
import { useSettings } from '@/hooks/useSettings'
import { useI18n } from '@/i18n'
import { taskPriorityLabel, taskPriorityOptions, taskStatusOptions } from '@/i18n/labels'
import { deleteTask, resolveRef, setTaskStatus } from '@/services/data/links'
import { repo, useCollection } from '@/services/data/store'
import type { RecordRef, Stored, Task, TaskPriority, TaskStatus } from '@/types/models'
import { addDays, formatDate, isValidDate, todayStr } from '@/utils/dates'
import { matches } from '@/utils/text'

type View = 'today' | 'upcoming' | 'overdue' | 'completed' | 'all'
const PRIORITY_RANK: Record<TaskPriority, number> = { urgent: 0, high: 1, medium: 2, low: 3 }
const isOpen = (t: Task) => t.status === 'pending' || t.status === 'inProgress'

export function TaskRow({ task }: { task: Stored<Task> }) {
  const { tr, lang } = useI18n()
  const { settings } = useSettings()
  const nav = useNavigate()
  const today = todayStr()
  const done = task.status === 'completed'
  const overdue = isOpen(task) && !!task.dueDate && task.dueDate < today
  const linked = resolveRef(task.related)
  return (
    <div className="card flex items-center gap-1 py-1.5 ps-1.5 pe-3">
      <button
        type="button"
        aria-label={done ? tr('إعادة فتح المهمة', 'Reopen task') : tr('إكمال المهمة', 'Complete task')}
        aria-pressed={done}
        onClick={() => void setTaskStatus(task, done ? 'pending' : 'completed')}
        className="grid size-11 shrink-0 place-items-center rounded-full hover:bg-raised"
      >
        {done ? <CheckCircle2 className="size-6 fill-lime text-charcoal" /> : <Circle className={cx('size-6', task.priority === 'urgent' ? 'text-negative' : 'text-faint')} />}
      </button>
      <button type="button" onClick={() => nav(`/tasks?open=${task.id}`)} className="min-w-0 flex-1 py-1 text-start">
        <div className={cx('truncate text-[15px] font-medium', done && 'text-faint line-through')} dir="auto">{task.title}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
          {task.dueDate && <Tag tone={overdue ? 'bad' : 'neutral'}>{formatDate(task.dueDate, lang, settings.dateFormat)}</Tag>}
          {(task.priority === 'urgent' || task.priority === 'high') && !done && <Tag tone={task.priority === 'urgent' ? 'bad' : 'warn'}>{taskPriorityLabel(task.priority)}</Tag>}
          {task.status === 'inProgress' && <Tag tone="accent">{tr('قيد التنفيذ', 'In progress')}</Tag>}
          {task.status === 'cancelled' && <Tag>{tr('ملغاة', 'Cancelled')}</Tag>}
          {task.category && <Tag>{task.category}</Tag>}
          {linked && <Tag tone="accent"><Link2 className="size-3" /> <span className="max-w-32 truncate">{linked.title}</span></Tag>}
        </div>
      </button>
      <SyncBadge state={task._sync} compact />
    </div>
  )
}

export function TaskForm({ task, initialDue, onClose }: { task?: Stored<Task>; initialDue?: string | null; onClose: () => void }) {
  const { tr } = useI18n()
  const nav = useNavigate()
  const tasks = useCollection('tasks').items
  const goals = useCollection('lifeGoals').items
  const milestones = useCollection('lifeMilestones').items
  const ideas = useCollection('contentIdeas').items
  const [title, setTitle] = useState(task?.title ?? '')
  const [description, setDescription] = useState(task?.description ?? '')
  const [dueDate, setDueDate] = useState(task?.dueDate ?? initialDue ?? '')
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? 'medium')
  const [status, setStatus] = useState<TaskStatus>(task?.status ?? 'pending')
  const [category, setCategory] = useState(task?.category ?? '')
  const [tags, setTags] = useState(task?.tags ?? [])
  const [relKind, setRelKind] = useState<RecordRef['collection'] | ''>(task?.related?.collection ?? '')
  const [relId, setRelId] = useState(task?.related?.id ?? '')
  const [errors, setErrors] = useState<{ title?: string; due?: string }>({})
  const linked = resolveRef(task?.related ?? null)

  const targets =
    relKind === 'lifeGoals' ? goals.map((g) => ({ value: g.id, label: g.title }))
    : relKind === 'lifeMilestones' ? milestones.map((m) => ({ value: m.id, label: m.title }))
    : relKind === 'contentIdeas' ? ideas.map((i) => ({ value: i.id, label: i.title }))
    : []

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const errs: typeof errors = {}
    if (!title.trim()) errs.title = tr('اكتب عنوان المهمة.', 'Enter a task title.')
    if (dueDate && !isValidDate(dueDate)) errs.due = tr('تاريخ غير صالح.', 'Invalid date.')
    setErrors(errs)
    if (Object.keys(errs).length) return
    const related = relKind && relId ? { collection: relKind, id: relId } : null
    const data = {
      title: title.trim(), description, dueDate: dueDate || null, priority, status, category: category.trim(), tags,
      completedAt: status === 'completed' ? (task?.completedAt ?? new Date().toISOString()) : null, related,
    }
    if (task) {
      await repo.update('tasks', task.id, data)
      if (status !== task.status) await setTaskStatus({ ...task, ...data }, status)
    } else {
      await repo.create('tasks', data)
    }
    toast(tr('حُفظت المهمة', 'Task saved'))
    onClose()
  }

  const del = async () => {
    if (task && (await confirmDelete(tr('هذه المهمة', 'this task')))) {
      await deleteTask(task)
      onClose()
    }
  }

  return (
    <Sheet open onClose={onClose} title={task ? tr('تعديل المهمة', 'Edit task') : tr('مهمة جديدة', 'New task')} footer={<FormFooter onCancel={onClose} onDelete={task ? () => void del() : undefined} />}>
      <form id="sheet-form" onSubmit={(e) => void submit(e)} className="space-y-3" noValidate>
        <Input label={tr('العنوان', 'Title')} value={title} onChange={(e) => setTitle(e.target.value)} error={errors.title} autoFocus={!task} />
        <Textarea label={tr('الوصف', 'Description')} value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
        <div className="grid grid-cols-2 gap-3">
          <Input label={tr('تاريخ الاستحقاق', 'Due date')} type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} error={errors.due} />
          <Select label={tr('الأولوية', 'Priority')} value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)} options={taskPriorityOptions()} />
          <Select label={tr('الحالة', 'Status')} value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)} options={taskStatusOptions()} />
          <ComboInput label={tr('التصنيف', 'Category')} value={category} onChange={setCategory} suggestions={[tr('مشروعات العيادة', 'Clinic projects'), ...tasks.map((t) => t.category).filter(Boolean)]} />
        </div>
        <TagInput value={tags} onChange={setTags} suggestions={[...new Set(tasks.flatMap((t) => t.tags))]} />
        <div className="grid grid-cols-2 gap-3">
          <Select
            label={tr('مرتبطة بـ', 'Linked to')}
            value={relKind}
            onChange={(e) => { setRelKind(e.target.value as typeof relKind); setRelId('') }}
            options={[
              { value: '', label: tr('لا شيء', 'Nothing') },
              { value: 'lifeGoals', label: tr('هدف حياة', 'Life goal') },
              { value: 'lifeMilestones', label: tr('معلم', 'Milestone') },
              { value: 'contentIdeas', label: tr('فكرة محتوى', 'Content idea') },
            ]}
          />
          {relKind && <Select label={tr('العنصر', 'Item')} value={relId} onChange={(e) => setRelId(e.target.value)} options={[{ value: '', label: '—' }, ...targets]} />}
        </div>
        {task?.related && !linked && <p className="text-sm text-faint">{tr('العنصر المرتبط لم يعد موجودًا.', 'The linked item no longer exists.')}</p>}
        {linked && (
          <button type="button" className="text-sm text-accent underline underline-offset-4" onClick={() => nav(linked.path)}>
            {tr('فتح', 'Open')}: {linked.title}
          </button>
        )}
      </form>
    </Sheet>
  )
}

export default function TasksPage() {
  const { tr } = useI18n()
  const { items, loading } = useCollection('tasks')
  // Referenced records must be loaded so link labels can resolve.
  useCollection('lifeGoals')
  useCollection('lifeMilestones')
  useCollection('contentIdeas')
  const nav = useNavigate()
  const [view, setView] = useState<View>('today')
  const [layout, setLayout] = useState<'list' | 'calendar'>('list')
  const [q, setQ] = useState('')
  const [priority, setPriority] = useState<TaskPriority | null>(null)
  const [sort, setSort] = useState<'due' | 'priority' | 'created'>('due')
  const [quick, setQuick] = useState('')
  const [formFor, setFormFor] = useState<{ task?: Stored<Task>; due?: string | null } | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)

  const today = todayStr()
  useParamOnce('new', () => setFormFor({ due: today }))
  useParamOnce('open', (id) => setOpenId(id))

  useEffect(() => {
    if (!openId || loading) return
    const t = items.find((x) => x.id === openId)
    if (t) setFormFor({ task: t })
    setOpenId(null)
  }, [openId, items, loading])

  const counts = useMemo(() => ({
    today: items.filter((t) => isOpen(t) && t.dueDate === today).length,
    upcoming: items.filter((t) => isOpen(t) && (!t.dueDate || t.dueDate > today)).length,
    overdue: items.filter((t) => isOpen(t) && !!t.dueDate && t.dueDate < today).length,
  }), [items, today])

  const shown = useMemo(() => {
    const list = items.filter((t) => {
      if (view === 'today' && !(isOpen(t) && t.dueDate === today)) return false
      if (view === 'upcoming' && !(isOpen(t) && (!t.dueDate || t.dueDate > today))) return false
      if (view === 'overdue' && !(isOpen(t) && !!t.dueDate && t.dueDate < today)) return false
      if (view === 'completed' && t.status !== 'completed') return false
      if (priority && t.priority !== priority) return false
      return matches(`${t.title} ${t.description} ${t.category} ${t.tags.join(' ')}`, q)
    })
    return list.sort((a, b) => {
      if (sort === 'priority') return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
      if (sort === 'created') return b.createdAt.localeCompare(a.createdAt)
      if (view === 'completed') return (b.completedAt ?? '').localeCompare(a.completedAt ?? '')
      return (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
    })
  }, [items, view, q, priority, sort, today])

  const addQuick = async (e: FormEvent) => {
    e.preventDefault()
    const title = quick.trim()
    if (!title) return
    await repo.create('tasks', {
      title, description: '', dueDate: view === 'today' ? today : view === 'upcoming' ? addDays(today, 1) : today, priority: 'medium', status: 'pending',
      category: '', tags: [], completedAt: null, related: null,
    })
    setQuick('')
  }

  return (
    <div className="fade-in">
      <PageHeader
        title={tr('المهام', 'Tasks')}
        subtitle={counts.overdue ? tr(`${counts.overdue} متأخرة تحتاج مراجعة`, `${counts.overdue} overdue need a look`) : undefined}
        actions={
          <Segmented
            label={tr('طريقة العرض', 'Layout')}
            value={layout}
            onChange={setLayout}
            options={[{ value: 'list', label: tr('قائمة', 'List'), icon: List }, { value: 'calendar', label: tr('تقويم', 'Calendar'), icon: CalendarDays }]}
          />
        }
      />

      <form onSubmit={(e) => void addQuick(e)} className="mb-3 flex items-center gap-2 rounded-full bg-raised p-1.5 ps-5">
        <input aria-label={tr('مهمة سريعة', 'Quick task')} value={quick} onChange={(e) => setQuick(e.target.value)} placeholder={tr('أضف مهمة ثم Enter', 'Add a task, press Enter')} className="min-w-0 flex-1 bg-transparent outline-none" dir={quick ? 'auto' : undefined} />
        <button type="submit" aria-label={tr('إضافة', 'Add')} className="grid size-10 shrink-0 place-items-center rounded-full bg-lime text-charcoal"><Plus className="size-5" /></button>
      </form>

      {layout === 'calendar' ? (
        <CalendarMonth
          items={items.filter((t) => t.dueDate && t.status !== 'cancelled').map((t) => ({ id: t.id, date: t.dueDate!, title: `${t.status === 'completed' ? '✓ ' : ''}${t.title}`, onClick: () => setFormFor({ task: t }) }))}
          renderExtra={(day) => (
            <button type="button" className="flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl text-sm text-accent hover:bg-raised" onClick={() => setFormFor({ due: day })}>
              <Plus className="size-4" /> {tr('مهمة في هذا اليوم', 'Task on this day')}
            </button>
          )}
        />
      ) : (
        <>
          <Segmented
            className="mb-3"
            label={tr('المهام حسب الوقت', 'Tasks by time')}
            value={view}
            onChange={setView}
            options={[
              { value: 'today', label: tr('اليوم', 'Today'), count: counts.today },
              { value: 'upcoming', label: tr('القادمة', 'Upcoming'), count: counts.upcoming },
              { value: 'overdue', label: tr('المتأخرة', 'Overdue'), count: counts.overdue },
              { value: 'completed', label: tr('المكتملة', 'Completed') },
              { value: 'all', label: tr('الكل', 'All') },
            ]}
          />
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 flex-1 basis-48">
              <Search className="pointer-events-none absolute start-4 top-1/2 size-4.5 -translate-y-1/2 text-faint" />
              <input aria-label={tr('بحث في المهام', 'Search tasks')} value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr('بحث', 'Search')} className="field !min-h-10 !rounded-full !py-1.5 !px-11" dir={q ? 'auto' : undefined} />
            </div>
            <select aria-label={tr('ترتيب', 'Sort')} value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="field !min-h-10 !w-auto !rounded-full !py-1.5">
              <option value="due">{tr('حسب الموعد', 'By due date')}</option>
              <option value="priority">{tr('حسب الأولوية', 'By priority')}</option>
              <option value="created">{tr('الأحدث', 'Newest')}</option>
            </select>
          </div>
          <ChipRow className="mb-4">
            {(['urgent', 'high', 'medium', 'low'] as TaskPriority[]).map((p) => (
              <Chip key={p} active={priority === p} onClick={() => setPriority(priority === p ? null : p)}>{taskPriorityLabel(p)}</Chip>
            ))}
          </ChipRow>
          {loading ? <ListSkeleton /> : shown.length === 0 ? (
            <EmptyState
              icon={view === 'overdue' ? Check : CheckSquare}
              title={view === 'today' ? tr('لا مهام لليوم', 'Nothing due today') : view === 'overdue' ? tr('لا شيء متأخر', 'Nothing overdue') : tr('لا توجد مهام هنا', 'No tasks here')}
              body={tr('أضف مهمة من الحقل بالأعلى.', 'Add one from the field above.')}
            />
          ) : (
            <div className="space-y-2">{shown.map((t) => <TaskRow key={t.id} task={t} />)}</div>
          )}
        </>
      )}

      {formFor && <TaskForm key={formFor.task?.id ?? 'new'} task={formFor.task} initialDue={formFor.due} onClose={() => { setFormFor(null); nav('/tasks', { replace: true }) }} />}
    </div>
  )
}

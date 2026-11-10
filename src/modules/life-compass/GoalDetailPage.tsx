import { useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  Archive, ArchiveRestore, BookHeart, CheckCircle2, Circle, Landmark, Link2, ListChecks, Pencil, Plus, Trash2, X,
} from 'lucide-react'
import { confirmAction, toast } from '@/components/common/feedback'
import {
  Button, cx, EmptyState, FormFooter, IconButton, Input, PageHeader, ProgressBar, SectionTitle, Select, Sheet, SyncBadge, Tag, Textarea,
} from '@/components/common/ui'
import { useSettings } from '@/hooks/useSettings'
import { useI18n } from '@/i18n'
import { goalPriorityLabel, goalStatusLabel, horizonLabel } from '@/i18n/labels'
import { deleteGoal, goalProgress, goalToTask, isGoalOverdue, milestoneToTask, resolveRef, setMilestoneCompleted, setTaskStatus } from '@/services/data/links'
import { repo, useCollection } from '@/services/data/store'
import type { CollectionName, GoalStatus, LifeGoal, LifeMilestone, RecordRef, Stored } from '@/types/models'
import { formatDate, isValidDate } from '@/utils/dates'
import { GoalForm } from './GoalForm'
import { DomainIcon } from './shared'

function MilestoneForm({ goalId, milestone, onClose }: { goalId: string; milestone?: Stored<LifeMilestone>; onClose: () => void }) {
  const { tr } = useI18n()
  const [title, setTitle] = useState(milestone?.title ?? '')
  const [description, setDescription] = useState(milestone?.description ?? '')
  const [dueDate, setDue] = useState(milestone?.dueDate ?? '')
  const [progress, setProgress] = useState(milestone?.progress ?? 0)
  const [errors, setErrors] = useState<{ title?: string; due?: string }>({})

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const errs: typeof errors = {}
    if (!title.trim()) errs.title = tr('اكتب عنوان المعلم.', 'Enter a title.')
    if (dueDate && !isValidDate(dueDate)) errs.due = tr('تاريخ غير صالح.', 'Invalid date.')
    setErrors(errs)
    if (Object.keys(errs).length) return
    const data = { title: title.trim(), description, dueDate: dueDate || null, progress }
    if (milestone) await repo.update('lifeMilestones', milestone.id, data)
    else await repo.create('lifeMilestones', { ...data, goalId, completed: false, taskId: null })
    onClose()
  }

  const del = async () => {
    if (!milestone) return
    if (await confirmAction({ title: tr('حذف هذا المعلم؟', 'Delete this milestone?'), body: tr('ستبقى مهمته المرتبطة إن وُجدت.', 'Its linked task, if any, stays.'), danger: true, confirmLabel: tr('حذف', 'Delete') })) {
      await repo.remove('lifeMilestones', milestone.id)
      if (milestone.taskId) await repo.update('tasks', milestone.taskId, { related: null }).catch(() => undefined)
      onClose()
    }
  }

  return (
    <Sheet open onClose={onClose} title={milestone ? tr('تعديل المعلم', 'Edit milestone') : tr('معلم جديد', 'New milestone')} footer={<FormFooter onCancel={onClose} onDelete={milestone ? () => void del() : undefined} />}>
      <form id="sheet-form" onSubmit={(e) => void submit(e)} className="space-y-3" noValidate>
        <Input label={tr('العنوان', 'Title')} value={title} onChange={(e) => setTitle(e.target.value)} error={errors.title} autoFocus={!milestone} />
        <Textarea label={tr('الوصف', 'Description')} value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
        <Input label={tr('الموعد', 'Due date')} type="date" value={dueDate} onChange={(e) => setDue(e.target.value)} error={errors.due} />
        <div>
          <label htmlFor="ms-progress" className="mb-1.5 flex justify-between text-sm font-medium text-muted">{tr('التقدم', 'Progress')} <span className="tnum">{progress}%</span></label>
          <input id="ms-progress" type="range" min={0} max={100} step={5} value={progress} onChange={(e) => setProgress(Number(e.target.value))} className="w-full accent-[var(--c-accent)]" dir="ltr" />
        </div>
      </form>
    </Sheet>
  )
}

function LinkPicker({ goal, onClose }: { goal: Stored<LifeGoal>; onClose: () => void }) {
  const { tr } = useI18n()
  const bookmarks = useCollection('bookmarks').items
  const notes = useCollection('notes').items
  const ideas = useCollection('contentIdeas').items
  const voice = useCollection('voiceNotes').items
  const [kind, setKind] = useState<CollectionName>('bookmarks')
  const options =
    kind === 'bookmarks' ? bookmarks.map((b) => ({ value: b.id, label: b.title || b.domain }))
    : kind === 'notes' ? notes.map((n) => ({ value: n.id, label: n.title || n.plain.slice(0, 50) }))
    : kind === 'contentIdeas' ? ideas.map((i) => ({ value: i.id, label: i.title }))
    : voice.map((v) => ({ value: v.id, label: v.title }))
  const [id, setId] = useState('')

  const add = async () => {
    if (!id) return
    const links = [...(goal.links ?? [])]
    if (!links.some((l) => l.id === id && l.collection === kind)) links.push({ collection: kind, id })
    await repo.update('lifeGoals', goal.id, { links })
    onClose()
  }

  return (
    <Sheet open onClose={onClose} title={tr('ربط عنصر بالهدف', 'Link an item to this goal')} footer={<><Button variant="ghost" onClick={onClose}>{tr('إلغاء', 'Cancel')}</Button><Button variant="primary" disabled={!id} onClick={() => void add()}>{tr('ربط', 'Link')}</Button></>}>
      <Select
        label={tr('النوع', 'Type')}
        value={kind}
        onChange={(e) => { setKind(e.target.value as CollectionName); setId('') }}
        options={[
          { value: 'bookmarks', label: tr('رابط محفوظ', 'Saved link') },
          { value: 'notes', label: tr('ملاحظة', 'Note') },
          { value: 'contentIdeas', label: tr('فكرة محتوى', 'Content idea') },
          { value: 'voiceNotes', label: tr('ملاحظة صوتية', 'Voice note') },
        ]}
      />
      <Select label={tr('العنصر', 'Item')} value={id} onChange={(e) => setId(e.target.value)} options={[{ value: '', label: '—' }, ...options]} />
    </Sheet>
  )
}

export default function GoalDetailPage() {
  const { id = '' } = useParams()
  const { tr, lang } = useI18n()
  const { settings } = useSettings()
  const nav = useNavigate()
  const goals = useCollection('lifeGoals')
  const milestones = useCollection('lifeMilestones').items
  const tasks = useCollection('tasks').items
  const domains = useCollection('lifeDomains').items
  const journal = useCollection('lifeJournal').items
  useCollection('bookmarks')
  useCollection('notes')
  useCollection('contentIdeas')
  useCollection('voiceNotes')
  const goal = goals.items.find((g) => g.id === id)
  const [editing, setEditing] = useState(false)
  const [childForm, setChildForm] = useState(false)
  const [msForm, setMsForm] = useState<{ m?: Stored<LifeMilestone> } | null>(null)
  const [linkForm, setLinkForm] = useState(false)
  const [taskToLink, setTaskToLink] = useState('')
  const [linkTaskOpen, setLinkTaskOpen] = useState(false)

  const own = useMemo(() => milestones.filter((m) => m.goalId === id).sort((a, b) => (a.dueDate ?? '9').localeCompare(b.dueDate ?? '9')), [milestones, id])
  const msIds = useMemo(() => new Set(own.map((m) => m.id)), [own])
  const linkedTasks = useMemo(() => tasks.filter((t) => (t.related?.collection === 'lifeGoals' && t.related.id === id) || (t.related?.collection === 'lifeMilestones' && msIds.has(t.related.id))), [tasks, id, msIds])
  const children = goals.items.filter((g) => g.parentId === id)
  const entries = journal.filter((j) => j.goalId === id)

  if (goals.loading) return <div className="skeleton h-64" />
  if (!goal) {
    return <EmptyState icon={Link2} title={tr('هذا الهدف لم يعد موجودًا', 'This goal no longer exists')} action={<Button onClick={() => nav('/compass/goals')}>{tr('كل الأهداف', 'All goals')}</Button>} />
  }

  const prog = goalProgress(goal, milestones)
  const parent = goals.items.find((g) => g.id === goal.parentId)
  const domain = domains.find((d) => d.id === goal.domainId)
  const fmt = (d: string | null) => formatDate(d, lang, settings.dateFormat)

  const setStatus = (status: GoalStatus) =>
    repo.update('lifeGoals', goal.id, { status, completedAt: status === 'completed' ? new Date().toISOString() : null })

  const del = async () => {
    const ok = await confirmAction({
      title: tr('حذف هذا الهدف؟', 'Delete this goal?'),
      body: tr('ستُحذف معالمه. تبقى الأهداف الفرعية كأهداف مستقلة، وتبقى المهام دون ربط. الأرشفة تحتفظ بكل شيء.', 'Its milestones are removed. Sub-goals become independent and tasks stay, unlinked. Archiving keeps everything.'),
      danger: true,
      confirmLabel: tr('حذف', 'Delete'),
    })
    if (ok) {
      await deleteGoal(goal)
      nav('/compass/goals')
    }
  }

  const linkTask = async () => {
    if (!taskToLink) return
    await repo.update('tasks', taskToLink, { related: { collection: 'lifeGoals', id: goal.id } satisfies RecordRef })
    setTaskToLink('')
    setLinkTaskOpen(false)
  }

  const addJournal = async () => {
    const j = await repo.create('lifeJournal', {
      title: '', content: '', plain: '', date: new Date().toISOString().slice(0, 10), mood: '', tags: [], domainId: goal.domainId, goalId: goal.id, favorite: false, archived: false, source: null,
    })
    nav(`/compass/journal?open=${j.id}`)
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <PageHeader
        title={goal.title}
        back={() => nav('/compass/goals')}
        actions={
          <>
            <IconButton icon={Pencil} tone="soft" label={tr('تعديل', 'Edit')} onClick={() => setEditing(true)} />
            <IconButton icon={goal.archived ? ArchiveRestore : Archive} tone="soft" label={goal.archived ? tr('إلغاء الأرشفة', 'Unarchive') : tr('أرشفة', 'Archive')} onClick={() => void repo.update('lifeGoals', goal.id, { archived: !goal.archived })} />
            <IconButton icon={Trash2} tone="soft" label={tr('حذف', 'Delete')} onClick={() => void del()} />
          </>
        }
      />

      {parent && (
        <Link to={`/compass/goals/${parent.id}`} className="inline-flex items-center gap-2 rounded-full bg-raised px-4 py-2 text-sm">
          <span className="text-muted">{tr('يخدم', 'Serves')}</span>
          <span className="font-medium" dir="auto">{parent.title}</span>
          <Tag tone="accent">{horizonLabel(parent.horizon)}</Tag>
        </Link>
      )}

      <section className="card p-5">
        <div className="flex flex-wrap items-center gap-1.5">
          <Tag tone="accent">{horizonLabel(goal.horizon)}</Tag>
          {domain && <Tag><DomainIcon name={domain.icon} className="size-3" />{domain.name}</Tag>}
          <Tag>{goalPriorityLabel(goal.priority)}</Tag>
          <SyncBadge state={goal._sync} />
        </div>
        <div className="mt-4 flex items-end justify-between gap-3">
          <span className="tnum text-5xl font-bold">{prog.value}%</span>
          <span className="text-end text-sm text-muted">
            {prog.source === 'milestones' ? tr('متوسط تقدم المعالم', 'Average of milestone progress') : prog.source === 'completed' ? tr('مكتمل', 'Completed') : tr('يُحدَّث يدويًا', 'Updated manually')}
          </span>
        </div>
        <div className="mt-2"><ProgressBar value={prog.value} tone="gold" label={goal.title} /></div>
        {prog.source === 'manual' && (
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={goal.progress}
            aria-label={tr('نسبة التقدم', 'Progress percentage')}
            onChange={(e) => void repo.update('lifeGoals', goal.id, { progress: Number(e.target.value) })}
            className="mt-3 w-full accent-[var(--c-accent)]"
            dir="ltr"
          />
        )}
        <div className="mt-4 flex flex-wrap gap-1.5">
          {(['notStarted', 'inProgress', 'onHold', 'completed', 'cancelled'] as GoalStatus[]).map((s) => (
            <button key={s} type="button" aria-pressed={goal.status === s} onClick={() => void setStatus(s)} className={cx('min-h-9 rounded-full px-3.5 text-sm font-medium transition', goal.status === s ? 'bg-ink text-canvas' : 'bg-raised text-muted hover:text-ink')}>
              {goalStatusLabel(s)}
            </button>
          ))}
        </div>
        {(goal.status === 'cancelled' || goal.status === 'onHold') && <p className="mt-2 text-sm text-muted">{tr('تغيير الأهداف جزء طبيعي من الحياة. يمكنك العودة إليه متى شئت.', 'Changing goals is a natural part of life. You can come back to it whenever you like.')}</p>}
        {isGoalOverdue(goal) && <p className="mt-2 text-sm text-caution">{tr('تجاوز موعده المستهدف. يمكنك تعديل الموعد إن تغيّرت الظروف.', 'It has passed its target date. Move the date if circumstances changed.')}</p>}
        <dl className="mt-4 grid grid-cols-1 gap-3 border-t border-line pt-4 text-[15px] sm:grid-cols-3">
          {goal.startDate && <div><dt className="text-sm text-muted">{tr('البدء', 'Start')}</dt><dd>{fmt(goal.startDate)}</dd></div>}
          {goal.targetDate && <div><dt className="text-sm text-muted">{tr('المستهدف', 'Target')}</dt><dd>{fmt(goal.targetDate)}</dd></div>}
          {goal.completedAt && <div><dt className="text-sm text-muted">{tr('أُنجز في', 'Completed')}</dt><dd>{fmt(goal.completedAt)}</dd></div>}
        </dl>
      </section>

      {(goal.description || goal.why || goal.expectedOutcome || goal.measurement || goal.notes) && (
        <section className="card space-y-3 p-5">
          {goal.why && <div><h3 className="text-sm font-medium text-muted">{tr('لماذا يهمني هذا', 'Why this matters')}</h3><p className="font-reading text-[1.08rem] whitespace-pre-line" dir="auto">{goal.why}</p></div>}
          {goal.description && <div><h3 className="text-sm font-medium text-muted">{tr('الوصف', 'Description')}</h3><p className="whitespace-pre-line" dir="auto">{goal.description}</p></div>}
          {goal.expectedOutcome && <div><h3 className="text-sm font-medium text-muted">{tr('النتيجة المتوقعة', 'Expected outcome')}</h3><p className="whitespace-pre-line" dir="auto">{goal.expectedOutcome}</p></div>}
          {goal.measurement && <div><h3 className="text-sm font-medium text-muted">{tr('معيار القياس', 'Measurement')}</h3><p className="whitespace-pre-line" dir="auto">{goal.measurement}</p></div>}
          {goal.notes && <div><h3 className="text-sm font-medium text-muted">{tr('ملاحظات', 'Notes')}</h3><p className="whitespace-pre-line" dir="auto">{goal.notes}</p></div>}
        </section>
      )}

      <section className="card p-5">
        <SectionTitle action={<Button size="sm" icon={Plus} onClick={() => setMsForm({})}>{tr('معلم', 'Milestone')}</Button>}>{tr('المعالم', 'Milestones')}</SectionTitle>
        {own.length === 0 ? <p className="text-[15px] text-faint">{tr('قسّم الهدف إلى معالم، وعندها يُحسب تقدمه تلقائيًا من متوسطها.', 'Split this goal into milestones, and its progress is then calculated from their average.')}</p> : (
          <ul className="divide-y divide-line">
            {own.map((m) => (
              <li key={m.id} className="flex items-center gap-1 py-1.5">
                <button type="button" aria-label={m.completed ? tr('إعادة فتح', 'Reopen') : tr('إكمال', 'Complete')} aria-pressed={m.completed} onClick={() => void setMilestoneCompleted(m, !m.completed)} className="grid size-11 shrink-0 place-items-center rounded-full hover:bg-raised">
                  {m.completed ? <CheckCircle2 className="size-6 fill-lime text-charcoal" /> : <Circle className="size-6 text-faint" />}
                </button>
                <button type="button" className="min-w-0 flex-1 text-start" onClick={() => setMsForm({ m })}>
                  <span className={cx('block truncate font-medium', m.completed && 'text-faint line-through')} dir="auto">{m.title}</span>
                  <span className="block text-sm text-faint">{m.dueDate ? fmt(m.dueDate) : ''}{!m.completed && m.progress > 0 ? ` · ${m.progress}%` : ''}</span>
                </button>
                {m.taskId ? (
                  <Link to={`/tasks?open=${m.taskId}`} className="shrink-0"><Tag tone="good"><ListChecks className="size-3" />{tr('مهمة', 'Task')}</Tag></Link>
                ) : (
                  <Button size="sm" variant="ghost" icon={ListChecks} onClick={async () => { await milestoneToTask(m); toast(tr('أُنشئت مهمة مرتبطة', 'Linked task created')) }}>{tr('إلى مهمة', 'To task')}</Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card p-5">
        <SectionTitle
          action={
            <div className="flex flex-wrap gap-1.5">
              <Button size="sm" variant="ghost" onClick={() => setLinkTaskOpen(true)}>{tr('ربط مهمة', 'Link task')}</Button>
              <Button size="sm" icon={Plus} onClick={async () => {
                const res = await goalToTask(goal)
                toast(res.created ? tr('أُنشئت مهمة مرتبطة', 'Linked task created') : tr('لهذا الهدف مهمة بنفس الاسم', 'A task with this name already exists'), res.created ? 'ok' : 'info')
              }}>{tr('مهمة من الهدف', 'Task from goal')}</Button>
            </div>
          }
        >
          {tr('المهام المرتبطة', 'Linked tasks')}
        </SectionTitle>
        {linkedTasks.length === 0 ? <p className="text-[15px] text-faint">{tr('لا مهام مرتبطة بعد.', 'No linked tasks yet.')}</p> : (
          <ul className="divide-y divide-line">
            {linkedTasks.map((t) => (
              <li key={t.id} className="flex items-center gap-1 py-1">
                <button type="button" aria-label={t.status === 'completed' ? tr('إعادة فتح', 'Reopen') : tr('إكمال', 'Complete')} onClick={() => void setTaskStatus(t, t.status === 'completed' ? 'pending' : 'completed')} className="grid size-11 shrink-0 place-items-center rounded-full hover:bg-raised">
                  {t.status === 'completed' ? <CheckCircle2 className="size-5 fill-lime text-charcoal" /> : <Circle className="size-5 text-faint" />}
                </button>
                <Link to={`/tasks?open=${t.id}`} className={cx('min-w-0 flex-1 truncate', t.status === 'completed' && 'text-faint line-through')} dir="auto">{t.title}</Link>
                {t.dueDate && <span className="shrink-0 text-sm text-muted">{fmt(t.dueDate)}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card p-5">
        <SectionTitle action={<Button size="sm" icon={Plus} onClick={() => setChildForm(true)}>{tr('هدف فرعي', 'Sub-goal')}</Button>}>{tr('الأهداف الفرعية', 'Sub-goals')}</SectionTitle>
        {children.length === 0 ? <p className="text-[15px] text-faint">{tr('لا أهداف فرعية.', 'No sub-goals.')}</p> : (
          <ul className="space-y-1">
            {children.map((c) => (
              <li key={c.id}>
                <Link to={`/compass/goals/${c.id}`} className="flex items-center justify-between gap-3 rounded-2xl px-2 py-2 hover:bg-raised">
                  <span className="min-w-0 truncate font-medium" dir="auto">{c.title}</span>
                  <span className="flex shrink-0 items-center gap-2"><Tag>{horizonLabel(c.horizon)}</Tag><span className="tnum text-sm text-muted">{goalProgress(c, milestones).value}%</span></span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card p-5">
        <SectionTitle action={<Button size="sm" icon={Link2} onClick={() => setLinkForm(true)}>{tr('ربط', 'Link')}</Button>}>{tr('مراجع مرتبطة', 'Linked references')}</SectionTitle>
        {goal.domainId === 'finance' && (
          <>
            <Link to="/clinic?tab=reports" className="mb-1 flex items-center gap-2 rounded-2xl px-2 py-2 text-accent hover:bg-raised"><Landmark className="size-4" />{tr('تقارير مالية العيادة', 'Clinic finance reports')}</Link>
            <Link to="/money" className="mb-1 flex items-center gap-2 rounded-2xl px-2 py-2 text-accent hover:bg-raised"><Landmark className="size-4" />{tr('المالية الشخصية', 'Personal finance')}</Link>
          </>
        )}
        {goal.domainId === 'deen' && (
          <Link to="/deen" className="mb-1 flex items-center gap-2 rounded-2xl px-2 py-2 text-accent hover:bg-raised"><DomainIcon name="BookOpen" className="size-4" />{tr('الزاد اليومي', 'Daily Deen')}</Link>
        )}
        {!goal.links?.length && goal.domainId !== 'finance' && goal.domainId !== 'deen' && <p className="text-[15px] text-faint">{tr('اربط روابط أو ملاحظات أو أفكار تخدم هذا الهدف. لا تُنسخ البيانات، بل يُشار إليها فقط.', 'Link bookmarks, notes or ideas that serve this goal. Nothing is copied, only referenced.')}</p>}
        <ul className="space-y-1">
          {goal.links?.map((l) => {
            const r = resolveRef(l)
            return (
              <li key={`${l.collection}/${l.id}`} className="flex items-center gap-1">
                {r ? <Link to={r.path} className="min-w-0 flex-1 truncate rounded-2xl px-2 py-2 hover:bg-raised" dir="auto">{r.title}</Link> : <span className="flex-1 px-2 py-2 text-faint">{tr('عنصر محذوف', 'Deleted item')}</span>}
                <IconButton size="sm" icon={X} label={tr('إزالة الربط', 'Unlink')} onClick={() => void repo.update('lifeGoals', goal.id, { links: goal.links.filter((x) => x !== l) })} />
              </li>
            )
          })}
        </ul>
        <p className="mt-2 text-xs text-faint">{tr('المرفقات تُضاف كروابط وملاحظات مرجعية، لأن رفع الملفات يتطلب خطة Blaze.', 'Attachments are added as linked references, because file uploads need the Blaze plan.')}</p>
      </section>

      <section className="card p-5">
        <SectionTitle action={<Button size="sm" icon={BookHeart} onClick={() => void addJournal()}>{tr('تدوينة', 'Entry')}</Button>}>{tr('تأملات', 'Reflections')}</SectionTitle>
        {entries.length === 0 ? <p className="text-[15px] text-faint">{tr('لا تدوينات مرتبطة بهذا الهدف.', 'No journal entries for this goal.')}</p> : (
          <ul className="space-y-1">
            {entries.map((j) => (
              <li key={j.id}><Link to={`/compass/journal?open=${j.id}`} className="block truncate rounded-2xl px-2 py-2 hover:bg-raised" dir="auto">{j.title || j.plain.slice(0, 60) || fmt(j.date)}</Link></li>
            ))}
          </ul>
        )}
      </section>

      {editing && <GoalForm goal={goal} onClose={() => setEditing(false)} />}
      {childForm && <GoalForm parentId={goal.id} horizon={goal.horizon} onClose={() => setChildForm(false)} onSaved={() => undefined} />}
      {msForm && <MilestoneForm key={msForm.m?.id ?? 'new'} goalId={goal.id} milestone={msForm.m} onClose={() => setMsForm(null)} />}
      {linkForm && <LinkPicker goal={goal} onClose={() => setLinkForm(false)} />}
      {linkTaskOpen && (
        <Sheet open onClose={() => setLinkTaskOpen(false)} title={tr('ربط مهمة موجودة', 'Link an existing task')} footer={<><Button variant="ghost" onClick={() => setLinkTaskOpen(false)}>{tr('إلغاء', 'Cancel')}</Button><Button variant="primary" disabled={!taskToLink} onClick={() => void linkTask()}>{tr('ربط', 'Link')}</Button></>}>
          <Select label={tr('المهمة', 'Task')} value={taskToLink} onChange={(e) => setTaskToLink(e.target.value)} options={[{ value: '', label: '—' }, ...tasks.filter((t) => !linkedTasks.includes(t)).map((t) => ({ value: t.id, label: t.title }))]} />
        </Sheet>
      )}
    </div>
  )
}

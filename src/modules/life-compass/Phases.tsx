/** A goal's phases as a numbered path, each with its own progress, plus quick add and reordering. */
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ArrowDown, ArrowUp, Check, ListChecks, Pencil, Plus } from 'lucide-react'
import { toast } from '@/components/common/feedback'
import { Button, cx, IconButton, Tag } from '@/components/common/ui'
import { useSettings } from '@/hooks/useSettings'
import { useI18n } from '@/i18n'
import { milestoneToTask, setMilestoneCompleted } from '@/services/data/links'
import { repo } from '@/services/data/store'
import type { LifeMilestone, Stored } from '@/types/models'
import { formatDate, todayStr } from '@/utils/dates'

/** Phases in their set order; older phases without an order follow their creation order. */
export function sortPhases<T extends Pick<LifeMilestone, 'order' | 'createdAt'>>(phases: T[]): T[] {
  return [...phases].sort((a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER) || a.createdAt.localeCompare(b.createdAt))
}

export const phaseValue = (m: Pick<LifeMilestone, 'completed' | 'progress'>) => (m.completed ? 100 : m.progress)

/** Summary for lists: how many phases are done and which one is current. */
export function phaseSummary<T extends Pick<LifeMilestone, 'completed' | 'progress' | 'order' | 'createdAt'>>(phases: T[]) {
  const sorted = sortPhases(phases)
  const done = sorted.filter((p) => p.completed).length
  const current = sorted.find((p) => !p.completed) ?? null
  return { total: sorted.length, done, current, currentIndex: current ? sorted.indexOf(current) : sorted.length }
}

async function reorder(phases: Stored<LifeMilestone>[], from: number, to: number) {
  const next = [...phases]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved!)
  // Every phase gets an explicit order so the new arrangement holds on all devices.
  await Promise.all(next.map((p, i) => (p.order === i ? null : repo.update('lifeMilestones', p.id, { order: i }))))
}

export function PhaseList({ goalId, phases, onEdit }: { goalId: string; phases: Stored<LifeMilestone>[]; onEdit: (m: Stored<LifeMilestone>) => void }) {
  const { tr, lang } = useI18n()
  const { settings } = useSettings()
  const [title, setTitle] = useState('')
  const sorted = sortPhases(phases)
  const { done, current } = phaseSummary(sorted)
  const today = todayStr()

  const add = async (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    const order = sorted.reduce((m, p) => Math.max(m, p.order ?? -1), sorted.length - 1) + 1
    await repo.create('lifeMilestones', { goalId, title: title.trim(), description: '', dueDate: null, completed: false, progress: 0, taskId: null, order })
    setTitle('')
  }

  return (
    <div>
      {sorted.length > 0 && (
        <div className="mb-4">
          <div className="mb-1.5 flex flex-wrap justify-between gap-2 text-sm">
            <span className="text-muted">
              {current
                ? tr(`المرحلة الحالية: ${sorted.indexOf(current) + 1} من ${sorted.length}`, `Current phase: ${sorted.indexOf(current) + 1} of ${sorted.length}`)
                : tr('اكتملت كل المراحل', 'All phases complete')}
            </span>
            <span className="tnum font-medium">{tr(`${done}/${sorted.length} مكتملة`, `${done}/${sorted.length} done`)}</span>
          </div>
          {/* One segment per phase, filled by that phase's own progress. */}
          <div className="flex gap-1" aria-hidden>
            {sorted.map((p) => (
              <div key={p.id} className="h-2.5 flex-1 overflow-hidden rounded-full bg-raised">
                <div className={cx('hatch h-full rounded-full', p.completed ? 'bg-lime-deep dark:bg-lime' : 'bg-gold')} style={{ width: `${phaseValue(p)}%` }} />
              </div>
            ))}
          </div>
        </div>
      )}

      {sorted.length === 0 ? (
        <p className="mb-3 text-[15px] text-faint">{tr('قسّم الهدف إلى مراحل متتالية. عندها يُحسب تقدم الهدف تلقائيًا من متوسط تقدم مراحله.', 'Split this goal into steps. Its progress is then the average of its phases.')}</p>
      ) : (
        <ol className="relative">
          {sorted.map((m, i) => {
            const isCurrent = m.id === current?.id
            const late = !m.completed && !!m.dueDate && m.dueDate < today
            return (
              <li key={m.id} className="relative flex gap-3 pb-4 last:pb-0">
                {i < sorted.length - 1 && <span aria-hidden className="absolute top-11 bottom-0 w-0.5 bg-line" style={{ insetInlineStart: '1.375rem' }} />}
                <button
                  type="button"
                  onClick={() => void setMilestoneCompleted(m, !m.completed)}
                  aria-pressed={m.completed}
                  aria-label={m.completed ? tr(`إعادة فتح المرحلة ${i + 1}`, `Reopen phase ${i + 1}`) : tr(`إكمال المرحلة ${i + 1}`, `Complete phase ${i + 1}`)}
                  className={cx(
                    'relative z-[1] grid size-11 shrink-0 place-items-center rounded-full border-2 font-bold transition',
                    m.completed ? 'border-transparent bg-lime text-charcoal' : isCurrent ? 'border-gold bg-surface text-ink' : 'border-line bg-surface text-faint',
                  )}
                >
                  {m.completed ? <Check className="size-5" /> : <span className="tnum">{i + 1}</span>}
                </button>
                <div className={cx('min-w-0 flex-1 rounded-3xl p-3', isCurrent ? 'bg-gold/12' : 'bg-raised/50')}>
                  <div className="flex items-start gap-1">
                    <button type="button" className="min-w-0 flex-1 text-start" onClick={() => onEdit(m)}>
                      <span className={cx('block font-medium', m.completed && 'text-faint line-through')} dir="auto">{m.title}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-faint">
                        {isCurrent && <Tag tone="accent">{tr('الحالية', 'Current')}</Tag>}
                        {m.dueDate && <span className={cx(late && 'text-caution')}>{formatDate(m.dueDate, lang, settings.dateFormat)}</span>}
                      </span>
                    </button>
                    <IconButton size="sm" icon={ArrowUp} label={tr('للأعلى', 'Move up')} disabled={i === 0} onClick={() => void reorder(sorted, i, i - 1)} />
                    <IconButton size="sm" icon={ArrowDown} label={tr('للأسفل', 'Move down')} disabled={i === sorted.length - 1} onClick={() => void reorder(sorted, i, i + 1)} />
                    <IconButton size="sm" icon={Pencil} label={tr('تعديل', 'Edit')} onClick={() => onEdit(m)} />
                  </div>
                  {!m.completed && (
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={10}
                        value={m.progress}
                        aria-label={tr(`تقدم المرحلة ${i + 1}`, `Phase ${i + 1} progress`)}
                        onChange={(e) => {
                          const v = Number(e.target.value)
                          void (v >= 100 ? setMilestoneCompleted(m, true) : repo.update('lifeMilestones', m.id, { progress: v }))
                        }}
                        className="min-w-0 flex-1 accent-[var(--color-gold)]"
                        dir="ltr"
                      />
                      <span className="tnum w-10 shrink-0 text-end text-sm font-medium">{m.progress}%</span>
                    </div>
                  )}
                  <div className="mt-1.5">
                    {m.taskId ? (
                      <Link to={`/tasks?open=${m.taskId}`}><Tag tone="good"><ListChecks className="size-3" />{tr('مرتبطة بمهمة', 'Linked task')}</Tag></Link>
                    ) : (
                      !m.completed && (
                        <button type="button" className="inline-flex min-h-8 items-center gap-1 text-xs text-accent" onClick={async () => { await milestoneToTask(m); toast(tr('أُنشئت مهمة للمرحلة', 'Task created for this phase')) }}>
                          <ListChecks className="size-3.5" />{tr('حوّلها إلى مهمة', 'Turn into a task')}
                        </button>
                      )
                    )}
                  </div>
                </div>
              </li>
            )
          })}
        </ol>
      )}

      <form onSubmit={(e) => void add(e)} className="mt-3 flex items-center gap-2 rounded-full bg-raised p-1.5 ps-4">
        <input aria-label={tr('مرحلة جديدة', 'New phase')} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={tr('أضف مرحلة ثم Enter', 'Add a phase, press Enter')} className="min-w-0 flex-1 bg-transparent outline-none" dir={title ? 'auto' : undefined} />
        <Button type="submit" size="sm" variant="ink" icon={Plus}>{tr('إضافة', 'Add')}</Button>
      </form>
    </div>
  )
}

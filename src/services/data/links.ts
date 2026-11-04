/**
 * Cross-module relationships. Modules reference each other by id, and every link is resolved
 * gracefully, so a record deleted elsewhere just shows as missing. Nothing is ever copied.
 */
import { getLang } from '@/i18n'
import type { ContentIdea, LifeGoal, LifeMilestone, RecordRef, Task, TaskStatus } from '@/types/models'
import { todayStr } from '@/utils/dates'
import { ensureLoaded, getAll, getOne, repo } from './store'

/** Task and milestone completion stay in step in both directions. */
export async function setTaskStatus(task: Task, status: TaskStatus) {
  const completedAt = status === 'completed' ? new Date().toISOString() : null
  await repo.update('tasks', task.id, { status, completedAt })
  if (task.related?.collection === 'lifeMilestones') {
    const m = getOne('lifeMilestones', task.related.id)
    const done = status === 'completed'
    if (m && m.completed !== done) await repo.update('lifeMilestones', m.id, { completed: done, progress: done ? 100 : m.progress })
  }
}

export async function setMilestoneCompleted(m: LifeMilestone, completed: boolean) {
  await repo.update('lifeMilestones', m.id, { completed, progress: completed ? 100 : Math.min(m.progress, 90) })
  if (m.taskId) {
    const t = getOne('tasks', m.taskId)
    if (t && (t.status === 'completed') !== completed) {
      await repo.update('tasks', t.id, {
        status: completed ? 'completed' : 'pending',
        completedAt: completed ? new Date().toISOString() : null,
      })
    }
  }
}

/** Converting an idea twice returns the existing task rather than creating a duplicate. */
export async function ideaToTask(idea: ContentIdea): Promise<{ id: string; created: boolean }> {
  await ensureLoaded('tasks')
  const existing = idea.taskId ? getOne('tasks', idea.taskId) : undefined
  if (existing) return { id: existing.id, created: false }
  const t = await repo.create('tasks', {
    title: idea.title, description: idea.description, dueDate: idea.plannedDate, priority: idea.priority === 'high' ? 'high' : idea.priority,
    status: 'pending', category: getLang() === 'ar' ? 'محتوى' : 'Content', tags: idea.tags, completedAt: null,
    related: { collection: 'contentIdeas', id: idea.id },
  })
  await repo.update('contentIdeas', idea.id, { taskId: t.id })
  return { id: t.id, created: true }
}

export async function milestoneToTask(m: LifeMilestone): Promise<{ id: string; created: boolean }> {
  await ensureLoaded('tasks')
  const existing = m.taskId ? getOne('tasks', m.taskId) : undefined
  if (existing) return { id: existing.id, created: false }
  const t = await repo.create('tasks', {
    title: m.title, description: m.description, dueDate: m.dueDate, priority: 'medium',
    status: m.completed ? 'completed' : 'pending', category: getLang() === 'ar' ? 'بوصلة الحياة' : 'Life Compass', tags: [],
    completedAt: m.completed ? new Date().toISOString() : null, related: { collection: 'lifeMilestones', id: m.id },
  })
  await repo.update('lifeMilestones', m.id, { taskId: t.id })
  return { id: t.id, created: true }
}

/** A goal can also become a single task, for instance a monthly objective. Returns any existing one. */
export async function goalToTask(goal: LifeGoal): Promise<{ id: string; created: boolean }> {
  await ensureLoaded('tasks')
  const existing = getAll('tasks').find((t) => t.related?.collection === 'lifeGoals' && t.related.id === goal.id && t.title === goal.title)
  if (existing) return { id: existing.id, created: false }
  const t = await repo.create('tasks', {
    title: goal.title, description: goal.description, dueDate: goal.targetDate, priority: goal.priority === 'critical' ? 'urgent' : goal.priority,
    status: 'pending', category: getLang() === 'ar' ? 'بوصلة الحياة' : 'Life Compass', tags: [], completedAt: null,
    related: { collection: 'lifeGoals', id: goal.id },
  })
  return { id: t.id, created: true }
}

/** Deleting a record clears references to it, while the other side's data stays. */
export async function deleteTask(task: Task) {
  await repo.remove('tasks', task.id)
  if (task.related?.collection === 'contentIdeas' && getOne('contentIdeas', task.related.id)?.taskId === task.id) {
    await repo.update('contentIdeas', task.related.id, { taskId: null })
  }
  if (task.related?.collection === 'lifeMilestones' && getOne('lifeMilestones', task.related.id)?.taskId === task.id) {
    await repo.update('lifeMilestones', task.related.id, { taskId: null })
  }
}

/** Removes a goal. Its child goals stay as independent goals, and linked tasks keep existing. */
export async function deleteGoal(goal: LifeGoal) {
  await Promise.all([ensureLoaded('lifeGoals'), ensureLoaded('lifeMilestones'), ensureLoaded('tasks'), ensureLoaded('lifeJournal')])
  for (const child of getAll('lifeGoals').filter((g) => g.parentId === goal.id)) {
    await repo.update('lifeGoals', child.id, { parentId: goal.parentId })
  }
  const ms = getAll('lifeMilestones').filter((m) => m.goalId === goal.id)
  const milestoneIds = new Set(ms.map((m) => m.id))
  await repo.removeMany('lifeMilestones', [...milestoneIds])
  for (const t of getAll('tasks')) {
    if ((t.related?.collection === 'lifeGoals' && t.related.id === goal.id) || (t.related?.collection === 'lifeMilestones' && milestoneIds.has(t.related.id))) {
      await repo.update('tasks', t.id, { related: null })
    }
  }
  for (const j of getAll('lifeJournal').filter((e) => e.goalId === goal.id)) await repo.update('lifeJournal', j.id, { goalId: null })
  await repo.remove('lifeGoals', goal.id)
}

/**
 * The goal progress rule. With milestones: the average of milestone progress, where a completed
 * milestone counts 100%. Without milestones: the manual percentage. Completed goals are always 100%.
 */
export function goalProgress(goal: LifeGoal, milestones: LifeMilestone[]): { value: number; source: 'milestones' | 'manual' | 'completed' } {
  if (goal.status === 'completed') return { value: 100, source: 'completed' }
  const own = milestones.filter((m) => m.goalId === goal.id)
  if (!own.length) return { value: goal.progress, source: 'manual' }
  const total = own.reduce((s, m) => s + (m.completed ? 100 : m.progress), 0)
  return { value: Math.round(total / own.length), source: 'milestones' }
}

export const isGoalOverdue = (g: LifeGoal, today = todayStr()) =>
  !!g.targetDate && g.targetDate < today && (g.status === 'notStarted' || g.status === 'inProgress')

/** A human label for a reference, or null when the target no longer exists. */
export function resolveRef(ref: RecordRef | null): { title: string; path: string } | null {
  if (!ref) return null
  switch (ref.collection) {
    case 'lifeGoals': {
      const g = getOne('lifeGoals', ref.id)
      return g ? { title: g.title, path: `/compass/goals/${g.id}` } : null
    }
    case 'lifeMilestones': {
      const m = getOne('lifeMilestones', ref.id)
      return m ? { title: m.title, path: `/compass/goals/${m.goalId}` } : null
    }
    case 'contentIdeas': {
      const i = getOne('contentIdeas', ref.id)
      return i ? { title: i.title, path: `/ideas?open=${i.id}` } : null
    }
    case 'notes': {
      const n = getOne('notes', ref.id)
      return n ? { title: n.title || n.plain.slice(0, 40), path: `/notes?open=${n.id}` } : null
    }
    case 'bookmarks': {
      const b = getOne('bookmarks', ref.id)
      return b ? { title: b.title || b.domain, path: `/links?open=${b.id}` } : null
    }
    case 'voiceNotes': {
      const v = getOne('voiceNotes', ref.id)
      return v ? { title: v.title, path: `/voice?open=${v.id}` } : null
    }
    case 'lifeReviews': {
      const r = getOne('lifeReviews', ref.id)
      return r ? { title: r.date, path: `/compass/reviews?open=${r.id}` } : null
    }
    default:
      return null
  }
}

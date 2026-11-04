import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { applyRestore, buildBackup, planRestore } from './backup'
import { deleteGoal, deleteTask, goalProgress, goalToTask, ideaToTask, milestoneToTask, resolveRef, setMilestoneCompleted, setTaskStatus } from './links'
import { closeUserData, ensureLoaded, getAll, getOne, listOutbox, loadAll, openUserData, repo } from './store'
import type { ContentIdea, LifeGoal, Task } from '@/types/models'

vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => undefined })

let n = 0
beforeEach(async () => {
  closeUserData()
  await openUserData(`i${++n}`)
  await loadAll()
})

const goalData = (over: Partial<LifeGoal> = {}): Omit<LifeGoal, 'id' | 'createdAt' | 'updatedAt'> => ({
  title: 'Goal', description: '', domainId: null, horizon: 'annual', why: '', expectedOutcome: '', measurement: '', startDate: null, targetDate: null, completedAt: null,
  priority: 'medium', status: 'inProgress', progress: 40, parentId: null, notes: '', archived: false, links: [], ...over,
})
const ideaData: Omit<ContentIdea, 'id' | 'createdAt' | 'updatedAt'> = {
  title: 'Idea', description: 'd', category: 'other', platform: 'reels', contentType: 'reel', tags: [], priority: 'high', status: 'new', plannedDate: null, links: [], notes: '', favorite: false, taskId: null, goalId: null,
}
const msData = (goalId: string) => ({ goalId, title: 'M', description: '', dueDate: null, completed: false, progress: 0, taskId: null })
const taskData: Omit<Task, 'id' | 'createdAt' | 'updatedAt'> = { title: 'T', description: '', dueDate: null, priority: 'medium', status: 'pending', category: '', tags: [], completedAt: null, related: null }

describe('converting to tasks never duplicates', () => {
  it('idea to task returns the same task the second time', async () => {
    const idea = await repo.create('contentIdeas', ideaData)
    const first = await ideaToTask(idea)
    const second = await ideaToTask(getOne('contentIdeas', idea.id)!)
    expect(first.created).toBe(true)
    expect(second).toEqual({ id: first.id, created: false })
    expect(getAll('tasks')).toHaveLength(1)
    expect(getOne('tasks', first.id)!.related).toEqual({ collection: 'contentIdeas', id: idea.id })
  })
  it('allows a new task after the linked one was deleted', async () => {
    const idea = await repo.create('contentIdeas', ideaData)
    const { id } = await ideaToTask(idea)
    await deleteTask(getOne('tasks', id)!)
    expect(getOne('contentIdeas', idea.id)!.taskId).toBeNull()
    expect((await ideaToTask(getOne('contentIdeas', idea.id)!)).created).toBe(true)
  })
  it('milestone and goal conversions are idempotent too', async () => {
    const goal = await repo.create('lifeGoals', goalData())
    const m = await repo.create('lifeMilestones', msData(goal.id))
    await milestoneToTask(m)
    await milestoneToTask(getOne('lifeMilestones', m.id)!)
    await goalToTask(goal)
    await goalToTask(goal)
    expect(getAll('tasks')).toHaveLength(2)
  })
})

describe('tasks and milestones stay in step', () => {
  it('completing the task completes the milestone, and the reverse', async () => {
    const goal = await repo.create('lifeGoals', goalData())
    const m = await repo.create('lifeMilestones', msData(goal.id))
    const { id } = await milestoneToTask(m)
    await setTaskStatus(getOne('tasks', id)!, 'completed')
    expect(getOne('lifeMilestones', m.id)!.completed).toBe(true)
    expect(getOne('lifeMilestones', m.id)!.progress).toBe(100)
    await setMilestoneCompleted(getOne('lifeMilestones', m.id)!, false)
    expect(getOne('tasks', id)!.status).toBe('pending')
    expect(getOne('tasks', id)!.completedAt).toBeNull()
  })
})

describe('goal progress', () => {
  it('uses the manual value without milestones', async () => {
    const goal = await repo.create('lifeGoals', goalData({ progress: 40 }))
    expect(goalProgress(goal, [])).toEqual({ value: 40, source: 'manual' })
  })
  it('averages milestones, counting completed as 100%', async () => {
    const goal = await repo.create('lifeGoals', goalData({ progress: 90 }))
    const ms = [
      await repo.create('lifeMilestones', { ...msData(goal.id), completed: true }),
      await repo.create('lifeMilestones', { ...msData(goal.id), progress: 50 }),
    ]
    expect(goalProgress(goal, ms)).toEqual({ value: 75, source: 'milestones' })
  })
  it('is 100% for a completed goal', async () => {
    const goal = await repo.create('lifeGoals', goalData({ status: 'completed', progress: 10 }))
    expect(goalProgress(goal, []).value).toBe(100)
  })
  it('is unaffected by domain satisfaction', async () => {
    const goal = await repo.create('lifeGoals', goalData({ domainId: 'career', progress: 90 }))
    await repo.seedLocal('lifeDomains', [{ id: 'career', createdAt: '', updatedAt: '', name: 'c', description: '', icon: 'x', satisfaction: 2, archived: false, order: 0 }])
    expect(goalProgress(goal, []).value).toBe(90)
    expect(getOne('lifeDomains', 'career')!.satisfaction).toBe(2)
  })
})

describe('deleting handles references gracefully', () => {
  it('a deleted goal frees its children and tasks, and removes its milestones', async () => {
    const parent = await repo.create('lifeGoals', goalData({ title: 'P' }))
    const goal = await repo.create('lifeGoals', goalData({ parentId: parent.id }))
    const child = await repo.create('lifeGoals', goalData({ parentId: goal.id }))
    const m = await repo.create('lifeMilestones', msData(goal.id))
    const t = await repo.create('tasks', { ...taskData, related: { collection: 'lifeGoals', id: goal.id } })
    await deleteGoal(goal)
    expect(getOne('lifeGoals', child.id)!.parentId).toBe(parent.id)
    expect(getOne('lifeMilestones', m.id)).toBeUndefined()
    expect(getOne('tasks', t.id)!.related).toBeNull()
  })
  it('a missing reference resolves to null instead of failing', () => {
    expect(resolveRef({ collection: 'lifeGoals', id: 'gone' })).toBeNull()
    expect(resolveRef(null)).toBeNull()
  })
})

describe('backup and restore', () => {
  const income = { amountMinor: 12345, date: '2026-01-01', patientName: 'أ', procedure: '', categoryId: 'other', description: '', paymentMethod: '', notes: '' }

  it('round-trips everything into an empty database, keeping relationships', async () => {
    const goal = await repo.create('lifeGoals', goalData())
    const task = await repo.create('tasks', { ...taskData, related: { collection: 'lifeGoals', id: goal.id } })
    const inc = await repo.create('income', income)
    const file = JSON.stringify(await buildBackup())
    expect(file).not.toContain('_sync')

    closeUserData()
    await openUserData(`restore-${n}`)
    const plan = await planRestore(file)
    expect(plan.errors).toEqual([])
    expect(plan.newCount).toBe(3)
    expect(await applyRestore(plan, 'keepNewer')).toBe(3)
    await ensureLoaded('tasks')
    expect(getOne('income', inc.id)!.amountMinor).toBe(12345)
    expect(getOne('tasks', task.id)!.related).toEqual({ collection: 'lifeGoals', id: goal.id })
    expect((await listOutbox()).length).toBe(3)
  })

  it('previews conflicts and honours each mode, without silent overwrites', async () => {
    const rec = await repo.create('income', income)
    const file = await buildBackup()
    const backupVersion = { ...file.data.income![0]!, amountMinor: 999, updatedAt: '2999-01-01T00:00:00.000Z' }
    const text = JSON.stringify({ ...file, data: { income: [backupVersion] } })

    const plan = await planRestore(text)
    expect(plan.conflictCount).toBe(1)
    await applyRestore(plan, 'addOnly')
    expect(getOne('income', rec.id)!.amountMinor).toBe(12345)
    await applyRestore(plan, 'keepNewer')
    expect(getOne('income', rec.id)!.amountMinor).toBe(999)
  })

  it('does not delete records missing from the backup', async () => {
    const keep = await repo.create('income', income)
    const empty = JSON.stringify({ format: 'osama-hub-backup', version: 1, exportedAt: 'x', data: { income: [] } })
    await applyRestore(await planRestore(empty), 'replace')
    expect(getOne('income', keep.id)).toBeDefined()
  })

  it('refuses bad files before anything is applied', async () => {
    await expect(planRestore('nonsense')).rejects.toThrow('not-json')
    await expect(planRestore('{"a":1}')).rejects.toThrow('not-backup')
    await expect(planRestore(JSON.stringify({ format: 'osama-hub-backup', version: 99, data: {} }))).rejects.toThrow('newer-version')
    const bad = { format: 'osama-hub-backup', version: 1, data: { income: [{ ...income, id: 'x', createdAt: 'a', updatedAt: 'b', amountMinor: 12.5 }], hackers: [] } }
    const plan = await planRestore(JSON.stringify(bad))
    expect(plan.errors.length).toBe(2)
  })
})

import { useState, type FormEvent } from 'react'
import { toast } from '@/components/common/feedback'
import { FormFooter, Input, Select, Sheet, Textarea } from '@/components/common/ui'
import { useI18n } from '@/i18n'
import { goalPriorityOptions, goalStatusOptions, horizonLabel, horizonOptions } from '@/i18n/labels'
import { repo, useCollection } from '@/services/data/store'
import type { GoalPriority, GoalStatus, Horizon, LifeGoal, Stored } from '@/types/models'
import { isValidDate } from '@/utils/dates'

/** A goal and everything beneath it. Moving a goal under one of these would create a loop. */
export function descendantIds(goals: LifeGoal[], id: string): Set<string> {
  const out = new Set<string>([id])
  let grew = true
  while (grew) {
    grew = false
    for (const g of goals) {
      if (g.parentId && out.has(g.parentId) && !out.has(g.id)) {
        out.add(g.id)
        grew = true
      }
    }
  }
  return out
}

export function GoalForm({ goal, parentId, horizon: initialHorizon, domainId, onClose, onSaved }: {
  goal?: Stored<LifeGoal>
  parentId?: string | null
  horizon?: Horizon
  domainId?: string | null
  onClose: () => void
  onSaved?: (id: string) => void
}) {
  const { tr } = useI18n()
  const goals = useCollection('lifeGoals').items
  const domains = useCollection('lifeDomains').items
  const parent = goals.find((g) => g.id === parentId)
  const [title, setTitle] = useState(goal?.title ?? '')
  const [description, setDescription] = useState(goal?.description ?? '')
  const [domain, setDomain] = useState(goal?.domainId ?? domainId ?? parent?.domainId ?? '')
  const [horizon, setHorizon] = useState<Horizon>(goal?.horizon ?? initialHorizon ?? 'annual')
  const [why, setWhy] = useState(goal?.why ?? '')
  const [expectedOutcome, setOutcome] = useState(goal?.expectedOutcome ?? '')
  const [measurement, setMeasurement] = useState(goal?.measurement ?? '')
  const [startDate, setStart] = useState(goal?.startDate ?? '')
  const [targetDate, setTarget] = useState(goal?.targetDate ?? '')
  const [priority, setPriority] = useState<GoalPriority>(goal?.priority ?? 'medium')
  const [status, setStatus] = useState<GoalStatus>(goal?.status ?? 'notStarted')
  const [parentSel, setParent] = useState(goal?.parentId ?? parentId ?? '')
  const [notes, setNotes] = useState(goal?.notes ?? '')
  const [phases, setPhases] = useState('')
  const [errors, setErrors] = useState<{ title?: string; target?: string }>({})

  const excluded = goal ? descendantIds(goals, goal.id) : new Set<string>()
  const parentOptions = goals.filter((g) => !excluded.has(g.id) && !g.archived)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const errs: typeof errors = {}
    if (!title.trim()) errs.title = tr('اكتب عنوان الهدف.', 'Enter a goal title.')
    if ((startDate && !isValidDate(startDate)) || (targetDate && !isValidDate(targetDate))) errs.target = tr('تاريخ غير صالح.', 'Invalid date.')
    else if (startDate && targetDate && targetDate < startDate) errs.target = tr('يجب أن يكون بعد تاريخ البدء.', 'Must be after the start date.')
    setErrors(errs)
    if (Object.keys(errs).length) return
    const data = {
      title: title.trim(), description, domainId: domain || null, horizon, why, expectedOutcome, measurement, startDate: startDate || null, targetDate: targetDate || null,
      priority, status, parentId: parentSel || null, notes,
      completedAt: status === 'completed' ? (goal?.completedAt ?? new Date().toISOString()) : null,
    }
    const saved = goal
      ? await repo.update('lifeGoals', goal.id, data)
      : await repo.create('lifeGoals', { ...data, progress: 0, archived: false, links: [] })
    if (!goal) {
      const titles = phases.split('\n').map((t) => t.trim()).filter(Boolean)
      for (const [order, t] of titles.entries()) {
        await repo.create('lifeMilestones', { goalId: saved.id, title: t, description: '', dueDate: null, completed: false, progress: 0, taskId: null, order })
      }
    }
    toast(tr('حُفظ الهدف', 'Goal saved'))
    onSaved?.(saved.id)
    onClose()
  }

  return (
    <Sheet open wide onClose={onClose} title={goal ? tr('تعديل الهدف', 'Edit goal') : tr('هدف جديد', 'New goal')} footer={<FormFooter onCancel={onClose} />}>
      <form id="sheet-form" onSubmit={(e) => void submit(e)} className="space-y-3" noValidate>
        <Input label={tr('العنوان', 'Title')} value={title} onChange={(e) => setTitle(e.target.value)} error={errors.title} autoFocus={!goal} />
        <Textarea label={tr('الوصف', 'Description')} value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
        <div className="grid grid-cols-2 gap-3">
          <Select label={tr('المدى الزمني', 'Time horizon')} value={horizon} onChange={(e) => setHorizon(e.target.value as Horizon)} options={horizonOptions()} />
          <Select label={tr('المجال', 'Domain')} value={domain} onChange={(e) => setDomain(e.target.value)} options={[{ value: '', label: '—' }, ...domains.filter((d) => !d.archived || d.id === domain).map((d) => ({ value: d.id, label: d.name }))]} />
          <Select label={tr('الأولوية', 'Priority')} value={priority} onChange={(e) => setPriority(e.target.value as GoalPriority)} options={goalPriorityOptions()} />
          <Select label={tr('الحالة', 'Status')} value={status} onChange={(e) => setStatus(e.target.value as GoalStatus)} options={goalStatusOptions()} />
          <Input label={tr('تاريخ البدء', 'Start date')} type="date" value={startDate} onChange={(e) => setStart(e.target.value)} />
          <Input label={tr('التاريخ المستهدف', 'Target date')} type="date" value={targetDate} onChange={(e) => setTarget(e.target.value)} error={errors.target} />
        </div>
        <Select
          label={tr('يتبع هدفًا أكبر (اختياري)', 'Under a bigger goal (optional)')}
          value={parentSel}
          onChange={(e) => setParent(e.target.value)}
          options={[{ value: '', label: tr('هدف مستقل', 'Independent goal') }, ...parentOptions.map((g) => ({ value: g.id, label: `${g.title} · ${horizonLabel(g.horizon)}` }))]}
        />
        <Textarea label={tr('لماذا يهمك هذا؟', 'Why does this matter?')} value={why} onChange={(e) => setWhy(e.target.value)} rows={2} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Textarea label={tr('النتيجة المتوقعة', 'Expected outcome')} value={expectedOutcome} onChange={(e) => setOutcome(e.target.value)} rows={2} />
          <Textarea label={tr('كيف ستقيس النجاح؟', 'How will you measure it?')} value={measurement} onChange={(e) => setMeasurement(e.target.value)} rows={2} />
        </div>
        <Textarea label={tr('ملاحظات', 'Notes')} value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        {!goal && (
          <Textarea
            label={tr('المراحل (اختياري، مرحلة في كل سطر)', 'Phases (optional, one per line)')}
            value={phases}
            onChange={(e) => setPhases(e.target.value)}
            rows={4}
            placeholder={tr('مثال:\nكتابة المنهج\nتصوير الوحدات\nالإطلاق', 'e.g.\nWrite the syllabus\nFilm the lessons\nLaunch')}
            hint={tr('يُحسب تقدم الهدف من متوسط تقدم مراحله.', "The goal's progress is the average of its phases.")}
          />
        )}
      </form>
    </Sheet>
  )
}

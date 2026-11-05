import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarRange, Goal, ListTree, Plus, Search } from 'lucide-react'
import { Button, Chip, ChipRow, cx, EmptyState, ListSkeleton, PageHeader, ProgressBar, Segmented, SyncBadge, Tag } from '@/components/common/ui'
import { useParamOnce } from '@/hooks/useParamOnce'
import { useSettings } from '@/hooks/useSettings'
import { useI18n } from '@/i18n'
import { goalStatusLabel, HORIZONS, horizonLabel } from '@/i18n/labels'
import { goalProgress, isGoalOverdue } from '@/services/data/links'
import { useCollection } from '@/services/data/store'
import type { Horizon, LifeGoal, LifeMilestone, Stored } from '@/types/models'
import { formatDate, todayStr } from '@/utils/dates'
import { matches } from '@/utils/text'
import { GoalForm } from './GoalForm'

const HORIZON_RANK = Object.fromEntries(HORIZONS.map((h, i) => [h, i])) as Record<Horizon, number>

function GoalRow({ goal, milestones, childCount, lang, dateFmt }: { goal: Stored<LifeGoal>; milestones: LifeMilestone[]; childCount: number; lang: 'ar' | 'en'; dateFmt: 'long' | 'dmy' | 'iso' }) {
  const { tr } = useI18n()
  const { value } = goalProgress(goal, milestones)
  const overdue = isGoalOverdue(goal)
  return (
    <Link to={`/compass/goals/${goal.id}`} className={cx('card block p-4 transition hover:bg-raised', (goal.status === 'cancelled' || goal.archived) && 'opacity-60')}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap gap-1">
            <Tag tone="accent">{horizonLabel(goal.horizon)}</Tag>
            {goal.status !== 'inProgress' && goal.status !== 'notStarted' && <Tag tone={goal.status === 'completed' ? 'good' : 'neutral'}>{goalStatusLabel(goal.status)}</Tag>}
            {overdue && <Tag tone="warn">{tr('تجاوز الموعد', 'Past target')}</Tag>}
            {childCount > 0 && <Tag>{tr(`${childCount} فرعي`, `${childCount} sub-goals`)}</Tag>}
          </div>
          <h3 className="font-bold" dir="auto">{goal.title}</h3>
          {goal.targetDate && <p className="text-sm text-faint">{formatDate(goal.targetDate, lang, dateFmt)}</p>}
        </div>
        <span className="tnum shrink-0 text-lg font-bold">{value}%</span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <ProgressBar value={value} tone="gold" height="h-2" label={goal.title} />
        <SyncBadge state={goal._sync} compact />
      </div>
    </Link>
  )
}

/** Each level hangs from the one above, with a visible connector line. */
function Tree({ nodes, all, milestones, lang, dateFmt, depth = 0 }: { nodes: Stored<LifeGoal>[]; all: Stored<LifeGoal>[]; milestones: LifeMilestone[]; lang: 'ar' | 'en'; dateFmt: 'long' | 'dmy' | 'iso'; depth?: number }) {
  return (
    <ul className={cx('space-y-2', depth > 0 && 'mt-2 ms-3 border-s-2 border-gold/50 ps-3 sm:ms-5 sm:ps-4')}>
      {nodes.map((g) => {
        const kids = all.filter((c) => c.parentId === g.id).sort((a, b) => HORIZON_RANK[a.horizon] - HORIZON_RANK[b.horizon] || (a.targetDate ?? '').localeCompare(b.targetDate ?? ''))
        return (
          <li key={g.id}>
            <GoalRow goal={g} milestones={milestones} childCount={kids.length} lang={lang} dateFmt={dateFmt} />
            {kids.length > 0 && <Tree nodes={kids} all={all} milestones={milestones} lang={lang} dateFmt={dateFmt} depth={depth + 1} />}
          </li>
        )
      })}
    </ul>
  )
}

export default function GoalsPage() {
  const { tr, lang } = useI18n()
  const { settings } = useSettings()
  const { items, loading } = useCollection('lifeGoals')
  const milestones = useCollection('lifeMilestones').items
  const domains = useCollection('lifeDomains').items
  const [view, setView] = useState<'tree' | 'timeline'>('tree')
  const [domain, setDomain] = useState<string | null>(null)
  const [scope, setScope] = useState<'active' | 'completed' | 'overdue' | 'archived'>('active')
  const [q, setQ] = useState('')
  const [form, setForm] = useState(false)
  useParamOnce('new', () => setForm(true))

  const filtered = useMemo(() => items.filter((g) => {
    if (scope === 'archived') { if (!g.archived) return false } else if (g.archived) return false
    if (scope === 'active' && (g.status === 'completed' || g.status === 'cancelled')) return false
    if (scope === 'completed' && g.status !== 'completed') return false
    if (scope === 'overdue' && !isGoalOverdue(g)) return false
    if (domain && g.domainId !== domain) return false
    return matches(`${g.title} ${g.description} ${g.why} ${g.notes}`, q)
  }), [items, scope, domain, q])

  const roots = useMemo(() => {
    const ids = new Set(filtered.map((g) => g.id))
    return filtered.filter((g) => !g.parentId || !ids.has(g.parentId)).sort((a, b) => HORIZON_RANK[a.horizon] - HORIZON_RANK[b.horizon])
  }, [filtered])

  const timeline = useMemo(() => {
    const m = new Map<string, Stored<LifeGoal>[]>()
    for (const g of [...filtered].sort((a, b) => (a.targetDate ?? '9999').localeCompare(b.targetDate ?? '9999'))) {
      const y = g.targetDate?.slice(0, 4) ?? tr('بدون موعد', 'No date')
      m.set(y, [...(m.get(y) ?? []), g])
    }
    return [...m.entries()]
  }, [filtered, tr])

  return (
    <div>
      <PageHeader
        title={tr('خطة الحياة', 'Life plan')}
        subtitle={tr('من رؤية العشر سنوات إلى خطوة هذا الأسبوع.', "From a ten-year vision to this week's step.")}
        actions={
          <>
            <Segmented label={tr('طريقة العرض', 'View')} value={view} onChange={setView} options={[{ value: 'tree', label: tr('شجرة', 'Tree'), icon: ListTree }, { value: 'timeline', label: tr('زمني', 'Timeline'), icon: CalendarRange }]} />
            <Button variant="primary" icon={Plus} capsule onClick={() => setForm(true)}>{tr('هدف', 'Goal')}</Button>
          </>
        }
      />
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute start-4 top-1/2 size-4.5 -translate-y-1/2 text-faint" />
        <input aria-label={tr('بحث في الأهداف', 'Search goals')} value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr('ابحث في الأهداف', 'Search goals')} className="field !rounded-full !px-11" dir={q ? 'auto' : undefined} />
      </div>
      <ChipRow className="mb-2">
        <Chip active={scope === 'active'} onClick={() => setScope('active')}>{tr('النشطة', 'Active')}</Chip>
        <Chip active={scope === 'completed'} onClick={() => setScope('completed')}>{tr('المكتملة', 'Completed')}</Chip>
        <Chip active={scope === 'overdue'} onClick={() => setScope('overdue')}>{tr('تجاوزت الموعد', 'Past target')}</Chip>
        <Chip active={scope === 'archived'} onClick={() => setScope('archived')}>{tr('الأرشيف', 'Archive')}</Chip>
      </ChipRow>
      <ChipRow className="mb-4">
        {domains.filter((d) => !d.archived).sort((a, b) => a.order - b.order).map((d) => <Chip key={d.id} active={domain === d.id} onClick={() => setDomain(domain === d.id ? null : d.id)}>{d.name}</Chip>)}
      </ChipRow>

      {loading ? <ListSkeleton /> : filtered.length === 0 ? (
        <EmptyState
          icon={Goal}
          title={q || domain || scope !== 'active' ? tr('لا توجد أهداف هنا', 'No goals here') : tr('ابدأ من البعيد', 'Start from far away')}
          body={q || domain || scope !== 'active' ? undefined : tr('أضف رؤية العشر سنوات، ثم فرّعها إلى خطوات أقرب كلما اتضحت.', 'Add a ten-year vision, then branch it into nearer steps as they become clear.')}
          action={!q && !domain && scope === 'active' ? <Button variant="primary" icon={Plus} onClick={() => setForm(true)}>{tr('أول هدف', 'First goal')}</Button> : undefined}
        />
      ) : view === 'tree' ? (
        <Tree nodes={roots} all={filtered} milestones={milestones} lang={lang} dateFmt={settings.dateFormat} />
      ) : (
        <div className="space-y-5">
          {timeline.map(([year, goals]) => (
            <section key={year}>
              <h2 className="mb-2 flex items-center gap-2 font-display text-2xl font-bold"><span className="tnum">{year}</span> {year === todayStr().slice(0, 4) && <Tag tone="accent">{tr('هذه السنة', 'This year')}</Tag>}</h2>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{goals.map((g) => <GoalRow key={g.id} goal={g} milestones={milestones} childCount={items.filter((c) => c.parentId === g.id).length} lang={lang} dateFmt={settings.dateFormat} />)}</div>
            </section>
          ))}
        </div>
      )}
      {form && <GoalForm onClose={() => setForm(false)} />}
    </div>
  )
}

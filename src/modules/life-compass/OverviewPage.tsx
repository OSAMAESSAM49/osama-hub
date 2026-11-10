import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ArrowRight, CalendarClock, Eye, Plus } from 'lucide-react'
import { Button, cx, EmptyState, ProgressBar, SectionTitle, Tag } from '@/components/common/ui'
import { useSettings } from '@/hooks/useSettings'
import { useI18n } from '@/i18n'
import { goalProgress, isGoalOverdue } from '@/services/data/links'
import { repo, useCollection } from '@/services/data/store'
import { formatDate, todayStr } from '@/utils/dates'
import { DomainIcon } from './shared'

export default function OverviewPage() {
  const { tr, lang } = useI18n()
  const { settings } = useSettings()
  const domains = useCollection('lifeDomains').items
  const goals = useCollection('lifeGoals').items
  const milestones = useCollection('lifeMilestones').items
  const vision = useCollection('lifeVision').items
  const today = todayStr()
  const Arrow = lang === 'ar' ? ArrowLeft : ArrowRight

  const active = domains.filter((d) => !d.archived).sort((a, b) => a.order - b.order)
  const liveGoals = goals.filter((g) => !g.archived)
  const stats = useMemo(() => active.map((d) => {
    const own = liveGoals.filter((g) => g.domainId === d.id)
    const running = own.filter((g) => g.status === 'inProgress' || g.status === 'notStarted')
    const counted = own.filter((g) => g.status !== 'cancelled')
    const progress = counted.length ? Math.round(counted.reduce((s, g) => s + goalProgress(g, milestones).value, 0) / counted.length) : 0
    return {
      domain: d,
      active: running.length,
      completed: own.filter((g) => g.status === 'completed').length,
      overdue: own.filter((g) => isGoalOverdue(g, today)).length,
      progress,
      hasGoals: counted.length > 0,
    }
  }), [active, liveGoals, milestones, today])

  const upcoming = useMemo(() => milestones.filter((m) => !m.completed && m.dueDate && m.dueDate >= today).sort((a, b) => a.dueDate!.localeCompare(b.dueDate!)).slice(0, 5), [milestones, today])
  const recent = useMemo(() => [...liveGoals].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5), [liveGoals])
  const goalTitle = (id: string) => goals.find((g) => g.id === id)?.title ?? ''
  const hasVision = vision.some((v) => v.plain.trim())

  return (
    <div className="space-y-5">
      {/* The question at the centre of the module */}
      <Link to="/compass/vision" className="block rounded-[2.25rem] bg-gold p-6 text-charcoal transition hover:opacity-95 sm:p-8">
        <p className="flex items-center gap-1.5 text-sm font-medium opacity-70"><Eye className="size-4" />{tr('رؤية الحياة', 'Life vision')}</p>
        <h1 className="mt-6 max-w-2xl font-display text-[2.1rem] leading-tight font-bold sm:text-5xl">{tr('أين تريد أن تكون حياتك في 2036؟', 'Where do you want your life to be in 2036?')}</h1>
        <span className="mt-5 inline-flex items-center gap-2 text-[15px] font-medium">
          {hasVision ? tr('اقرأ رؤيتك وعدّلها', 'Read and refine your vision') : tr('ابدأ بكتابة رؤيتك', 'Start writing your vision')} <Arrow className="size-4" />
        </span>
      </Link>

      <section>
        <SectionTitle action={<Link to="/compass/domains" className="text-sm text-accent">{tr('إدارة المجالات', 'Manage domains')}</Link>}>{tr('ميزان الحياة', 'Life balance')}</SectionTitle>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {stats.map(({ domain: d, active: a, completed, overdue, progress, hasGoals }) => (
            <article key={d.id} className="card p-5">
              <div className="flex items-center gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-full bg-raised"><DomainIcon name={d.icon} className="size-5" /></span>
                <h3 className="min-w-0 font-bold" dir="auto">{d.name}</h3>
              </div>
              {/* Objective progress and subjective satisfaction are shown apart, and never combined. */}
              <div className="mt-4">
                <div className="mb-1 flex justify-between text-sm text-muted">
                  <span>{tr('تقدم الأهداف', 'Goal progress')}</span>
                  <span className="tnum">{hasGoals ? `${progress}%` : '—'}</span>
                </div>
                <ProgressBar value={progress} tone="gold" label={`${d.name} ${tr('تقدم الأهداف', 'goal progress')}`} />
                <div className="mt-2 flex flex-wrap gap-1">
                  <Tag>{tr(`${a} نشطة`, `${a} active`)}</Tag>
                  {completed > 0 && <Tag tone="good">{tr(`${completed} مكتملة`, `${completed} done`)}</Tag>}
                  {overdue > 0 && <Tag tone="warn">{tr(`${overdue} تجاوزت موعدها`, `${overdue} past target`)}</Tag>}
                </div>
              </div>
              <div className="mt-4 border-t border-line pt-3">
                <div className="mb-1.5 flex justify-between text-sm text-muted">
                  <span>{tr('رضاك الشخصي', 'Your satisfaction')}</span>
                  <span className="tnum font-medium text-ink">{d.satisfaction ?? '—'}<span className="text-faint">/10</span></span>
                </div>
                <div role="radiogroup" aria-label={`${d.name}: ${tr('رضاك الشخصي', 'your satisfaction')}`} className="grid grid-cols-10 gap-0.5" dir="ltr">
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                    <button
                      key={n}
                      type="button"
                      role="radio"
                      aria-checked={d.satisfaction === n}
                      aria-label={String(n)}
                      onClick={() => void repo.update('lifeDomains', d.id, { satisfaction: d.satisfaction === n ? null : n })}
                      className={cx('h-9 rounded-md text-xs transition', d.satisfaction !== null && n <= d.satisfaction ? 'bg-ink text-canvas' : 'bg-raised text-faint hover:bg-line')}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            </article>
          ))}
        </div>
        <p className="mt-2 px-1 text-xs text-faint">{tr('الرضا تقدير شخصي منفصل تمامًا عن الإنجاز، ولا يُحسب من المهام أو الأهداف.', 'Satisfaction is a personal rating, fully separate from achievement. It is never calculated from tasks or goals.')}</p>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="card p-5">
          <SectionTitle>{tr('المراحل القادمة', 'Upcoming phases')}</SectionTitle>
          {upcoming.length === 0 ? <p className="text-[15px] text-faint">{tr('لا مراحل بمواعيد قريبة.', 'No phases with upcoming dates.')}</p> : (
            <ul className="space-y-1">
              {upcoming.map((m) => (
                <li key={m.id}>
                  <Link to={`/compass/goals/${m.goalId}`} className="flex items-center gap-3 rounded-2xl px-2 py-2 hover:bg-raised">
                    <CalendarClock className="size-4.5 shrink-0 text-muted" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium" dir="auto">{m.title}</span>
                      <span className="block truncate text-sm text-faint" dir="auto">{goalTitle(m.goalId)}</span>
                    </span>
                    <span className="shrink-0 text-sm text-muted">{formatDate(m.dueDate, lang, settings.dateFormat)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="card p-5">
          <SectionTitle action={<Link to="/compass/goals" className="text-sm text-accent">{tr('كل الأهداف', 'All goals')}</Link>}>{tr('تغييرات حديثة', 'Recent changes')}</SectionTitle>
          {recent.length === 0 ? (
            <EmptyState icon={Plus} title={tr('لم تضع أهدافًا بعد', 'No goals yet')} action={<Link to="/compass/goals?new=1"><Button variant="primary" size="sm" icon={Plus}>{tr('أول هدف', 'First goal')}</Button></Link>} />
          ) : (
            <ul className="space-y-1">
              {recent.map((g) => (
                <li key={g.id}>
                  <Link to={`/compass/goals/${g.id}`} className="flex items-center justify-between gap-3 rounded-2xl px-2 py-2 hover:bg-raised">
                    <span className="min-w-0 truncate font-medium" dir="auto">{g.title}</span>
                    <span className="tnum shrink-0 text-sm text-muted">{goalProgress(g, milestones).value}%</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}

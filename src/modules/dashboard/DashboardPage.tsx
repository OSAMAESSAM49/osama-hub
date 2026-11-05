import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, BookOpen, Check, Compass, Lightbulb, Link2, ListChecks, Mic, NotebookPen, SlidersHorizontal, Stethoscope, Target } from 'lucide-react'
import { Button, cardNumberClass, cx, heroNumberClass, IconButton, ProgressBar, Sheet, Toggle } from '@/components/common/ui'
import { QuickActionGrid } from '@/components/layout/QuickAdd'
import { useAuth } from '@/contexts/AuthContext'
import { useSettings } from '@/hooks/useSettings'
import { useI18n } from '@/i18n'
import { ALL_WIDGETS } from '@/services/data/defaults'
import { bookName, dailySelection, loadHadith, loadVerse, type Hadith, type Verse } from '@/services/data/deen'
import { goalProgress, isGoalOverdue, setTaskStatus } from '@/services/data/links'
import { useCollection } from '@/services/data/store'
import type { Task, WidgetId } from '@/types/models'
import { formatDate, formatDayLong, inRange, rangeFor, todayStr } from '@/utils/dates'
import { formatMoney, summarize } from '@/utils/money'
import { excerpt } from '@/utils/text'
import { catName } from '../clinic-finance/finance'
import { DomainIcon } from '../life-compass/shared'

const isOpen = (t: Task) => t.status === 'pending' || t.status === 'inProgress'

function Greeting() {
  const { tr, lang } = useI18n()
  const { settings } = useSettings()
  const { user } = useAuth()
  const { items: tasks } = useCollection('tasks')
  const today = todayStr()
  const name = settings.displayName || user?.displayName || ''
  const hour = new Date().getHours()
  const hello = hour < 12 ? tr('صباح الخير', 'Good morning') : tr('مساء الخير', 'Good evening')
  const dueToday = tasks.filter((t) => isOpen(t) && t.dueDate === today).length
  const overdue = tasks.filter((t) => isOpen(t) && !!t.dueDate && t.dueDate < today).length
  // A message drawn from the day's real state, never a generic slogan.
  const message = overdue
    ? tr(`لديك ${overdue} مهام متأخرة. ابدأ بأصغرها.`, `You have ${overdue} overdue tasks. Start with the smallest.`)
    : dueToday
      ? tr(`أمامك ${dueToday} مهام اليوم. خطوة خطوة.`, `${dueToday} tasks today. One step at a time.`)
      : tr('يومك مفتوح. ما الأهم الآن؟', 'Your day is open. What matters most now?')
  return (
    <header className="mb-4">
      <p className="text-[15px] text-muted">{formatDayLong(today, lang)}</p>
      <h1 className="mt-1 font-display text-[2.1rem] leading-tight font-bold sm:text-5xl">{hello}{name ? tr(`، ${name}`, `, ${name}`) : ''}</h1>
      <p className="mt-1.5 text-[15px] text-muted">{message}</p>
    </header>
  )
}

function WidgetCard({ title, icon: Icon, to, children, className }: { title: string; icon: typeof Compass; to: string; children: ReactNode; className?: string }) {
  const { lang } = useI18n()
  const Arrow = lang === 'ar' ? ArrowLeft : ArrowRight
  return (
    <section className={cx('card flex flex-col p-5', className)}>
      <Link to={to} className="-m-1 mb-2 flex items-center justify-between gap-2 rounded-2xl p-1 hover:opacity-75">
        <h2 className="flex items-center gap-2 font-bold"><Icon className="size-4.5 text-muted" />{title}</h2>
        <Arrow className="size-4 text-faint" />
      </Link>
      <div className="min-w-0 flex-1">{children}</div>
    </section>
  )
}

const Empty = ({ children }: { children: ReactNode }) => <p className="py-2 text-[15px] text-faint">{children}</p>

// ── Widgets ──
function FinanceHero() {
  const { tr, lang } = useI18n()
  const { settings } = useSettings()
  const income = useCollection('income').items
  const expenses = useCollection('expenses').items
  const today = todayStr()
  const { day, month } = useMemo(() => {
    const dr = rangeFor('today', settings.weekStart, today)
    const mr = rangeFor('month', settings.weekStart, today)
    return {
      day: summarize(income.filter((i) => inRange(i.date, dr)), expenses.filter((e) => inRange(e.date, dr)), settings.partnerRates),
      month: summarize(income.filter((i) => inRange(i.date, mr)), expenses.filter((e) => inRange(e.date, mr)), settings.partnerRates),
    }
  }, [income, expenses, settings, today])
  return (
    <Link to="/clinic" className="block overflow-hidden rounded-[2.25rem] bg-lime p-6 text-charcoal transition hover:bg-lime-deep lg:col-span-2 lg:row-span-2 lg:flex lg:flex-col lg:justify-between lg:p-8">
      <div className="flex items-center justify-between">
        <p className="text-[15px] font-medium opacity-70">{tr('صافي هذا الشهر', "This month's net")}</p>
        <span className="grid size-11 place-items-center rounded-full bg-charcoal/10"><Stethoscope className="size-5" /></span>
      </div>
      <p className={cx('tnum mt-4 leading-none font-bold', heroNumberClass(formatMoney(month.net, 'en', false)))} dir="ltr" style={{ textAlign: lang === 'ar' ? 'right' : 'left' }}>{formatMoney(month.net, 'en', false)}</p>
      <p className="mt-1 text-sm opacity-70">{tr('جنيه مصري، بعد المصروفات وحصة الشريك', 'EGP, after expenses and partner share')}</p>
      <div className="mt-6 grid grid-cols-1 gap-3 min-[340px]:grid-cols-2">
        <div className="rounded-3xl bg-charcoal px-4 py-3 text-white">
          <div className="text-sm opacity-70">{tr('إيراد اليوم', "Today's income")}</div>
          <div className={cx('tnum font-bold', cardNumberClass(formatMoney(day.income, lang, false)))}>{formatMoney(day.income, lang, false)}</div>
        </div>
        <div className="rounded-3xl bg-white/55 px-4 py-3">
          <div className="text-sm opacity-70">{tr('مصروف اليوم', "Today's expenses")}</div>
          <div className={cx('tnum font-bold', cardNumberClass(formatMoney(day.expenses, lang, false)))}>{formatMoney(day.expenses, lang, false)}</div>
        </div>
      </div>
    </Link>
  )
}

function OverviewWidget() {
  const { tr } = useI18n()
  const { items: tasks } = useCollection('tasks')
  const { items: goals } = useCollection('lifeGoals')
  const today = todayStr()
  const pending = tasks.filter(isOpen).length
  const overdue = tasks.filter((t) => isOpen(t) && !!t.dueDate && t.dueDate < today).length
  const active = goals.filter((g) => !g.archived && (g.status === 'inProgress' || g.status === 'notStarted')).length
  return (
    <div className="grid grid-cols-2 gap-3 lg:col-span-2 lg:grid-cols-2">
      <Link to="/tasks" className="flex min-h-36 flex-col justify-between rounded-[1.75rem] bg-cobalt p-5 text-white transition hover:opacity-95">
        <ListChecks className="size-6" />
        <div>
          <div className="tnum text-4xl font-bold">{pending}</div>
          <div className="text-sm opacity-80">{tr('مهمة مفتوحة', 'open tasks')}{overdue ? tr(` · ${overdue} متأخرة`, ` · ${overdue} overdue`) : ''}</div>
        </div>
      </Link>
      <Link to="/compass/goals" className="flex min-h-36 flex-col justify-between rounded-[1.75rem] bg-charcoal p-5 text-white transition hover:opacity-95 dark:bg-raised">
        <Target className="size-6" />
        <div>
          <div className="tnum text-4xl font-bold">{active}</div>
          <div className="text-sm opacity-80">{tr('هدف نشط', 'active goals')}</div>
        </div>
      </Link>
    </div>
  )
}

function TasksWidget() {
  const { tr, lang } = useI18n()
  const { settings } = useSettings()
  const { items } = useCollection('tasks')
  const today = todayStr()
  const upcoming = useMemo(() => items.filter(isOpen).sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999')).slice(0, 5), [items])
  return (
    <WidgetCard title={tr('المهام القادمة', 'Upcoming tasks')} icon={ListChecks} to="/tasks">
      {upcoming.length === 0 ? <Empty>{tr('لا مهام مفتوحة.', 'No open tasks.')}</Empty> : (
        <ul className="divide-y divide-line">
          {upcoming.map((t) => (
            <li key={t.id} className="flex items-center gap-1 py-0.5">
              <button type="button" aria-label={tr('إكمال', 'Complete')} onClick={() => void setTaskStatus(t, 'completed')} className="grid size-10 shrink-0 place-items-center rounded-full hover:bg-raised">
                <span className="size-5 rounded-full border-2 border-faint" />
              </button>
              <Link to={`/tasks?open=${t.id}`} className="min-w-0 flex-1 truncate" dir="auto">{t.title}</Link>
              {t.dueDate && <span className={cx('shrink-0 text-sm', t.dueDate < today ? 'text-negative' : 'text-faint')}>{formatDate(t.dueDate, lang, settings.dateFormat === 'long' ? 'dmy' : settings.dateFormat).slice(0, 5)}</span>}
            </li>
          ))}
        </ul>
      )}
    </WidgetCard>
  )
}

function TransactionsWidget() {
  const { tr, lang } = useI18n()
  const { settings } = useSettings()
  const income = useCollection('income').items
  const expenses = useCollection('expenses').items
  const recent = useMemo(() => [
    ...income.map((i) => ({ id: i.id, sign: 1, amount: i.amountMinor, date: i.date, at: i.createdAt, title: i.procedure || i.description || catName(settings.incomeCategories, i.categoryId), path: `/clinic?tab=income&open=${i.id}` })),
    ...expenses.map((e) => ({ id: e.id, sign: -1, amount: e.amountMinor, date: e.date, at: e.createdAt, title: e.description || e.supplier || catName(settings.expenseCategories, e.categoryId), path: `/clinic?tab=expenses&open=${e.id}` })),
  ].sort((a, b) => b.date.localeCompare(a.date) || b.at.localeCompare(a.at)).slice(0, 5), [income, expenses, settings])
  return (
    <WidgetCard title={tr('آخر المعاملات', 'Recent transactions')} icon={Stethoscope} to="/clinic">
      {recent.length === 0 ? <Empty>{tr('لم تُسجل معاملات بعد.', 'No transactions yet.')}</Empty> : (
        <ul className="divide-y divide-line">
          {recent.map((r) => (
            <li key={r.id}>
              <Link to={r.path} className="flex items-center gap-3 py-2">
                <span className={cx('grid size-8 shrink-0 place-items-center rounded-full bg-raised', r.sign > 0 ? 'text-positive' : 'text-muted')}>{r.sign > 0 ? <ArrowDown className="size-4" /> : <ArrowUp className="size-4" />}</span>
                <span className="min-w-0 flex-1 truncate" dir="auto">{r.title}</span>
                <span className="tnum shrink-0 font-bold">{formatMoney(r.sign * r.amount, lang, false)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </WidgetCard>
  )
}

function NotesWidget() {
  const { tr } = useI18n()
  const { items } = useCollection('notes')
  const recent = useMemo(() => items.filter((n) => !n.archived).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 4), [items])
  return (
    <WidgetCard title={tr('أحدث الملاحظات', 'Recent notes')} icon={NotebookPen} to="/notes">
      {recent.length === 0 ? <Empty>{tr('لا ملاحظات بعد.', 'No notes yet.')}</Empty> : (
        <ul className="space-y-1">
          {recent.map((n) => (
            <li key={n.id}>
              <Link to={`/notes?open=${n.id}`} className="block rounded-2xl px-2 py-1.5 hover:bg-raised">
                <span className="block truncate font-medium" dir="auto">{n.title || tr('بدون عنوان', 'Untitled')}</span>
                <span className="block truncate text-sm text-muted" dir="auto">{excerpt(n.plain, 70)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </WidgetCard>
  )
}

function IdeasWidget() {
  const { tr } = useI18n()
  const { items } = useCollection('contentIdeas')
  const recent = useMemo(() => items.filter((i) => i.status !== 'archived' && i.status !== 'published').sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 4), [items])
  return (
    <WidgetCard title={tr('أفكار حديثة', 'Recent ideas')} icon={Lightbulb} to="/ideas">
      {recent.length === 0 ? <Empty>{tr('لا أفكار بعد.', 'No ideas yet.')}</Empty> : (
        <ul className="space-y-1">{recent.map((i) => <li key={i.id}><Link to={`/ideas?open=${i.id}`} className="block truncate rounded-2xl px-2 py-1.5 font-medium hover:bg-raised" dir="auto">{i.title}</Link></li>)}</ul>
      )}
    </WidgetCard>
  )
}

function BookmarksWidget() {
  const { tr } = useI18n()
  const { items } = useCollection('bookmarks')
  const recent = useMemo(() => [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 4), [items])
  return (
    <WidgetCard title={tr('روابط محفوظة', 'Saved links')} icon={Link2} to="/links">
      {recent.length === 0 ? <Empty>{tr('لا روابط بعد.', 'No links yet.')}</Empty> : (
        <ul className="space-y-1">
          {recent.map((b) => (
            <li key={b.id}>
              <a href={b.url} target="_blank" rel="noopener noreferrer" className="block rounded-2xl px-2 py-1.5 hover:bg-raised">
                <span className="block truncate font-medium" dir="auto">{b.title}</span>
                <span className="block truncate text-sm text-faint" dir="ltr">{b.domain}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </WidgetCard>
  )
}

function VoiceWidget() {
  const { tr } = useI18n()
  const { items } = useCollection('voiceNotes')
  const recent = useMemo(() => [...items].sort((a, b) => b.recordedAt.localeCompare(a.recordedAt)).slice(0, 3), [items])
  return (
    <WidgetCard title={tr('تسجيلات حديثة', 'Recent recordings')} icon={Mic} to="/voice">
      {recent.length === 0 ? <Empty>{tr('لا تسجيلات بعد.', 'No recordings yet.')}</Empty> : (
        <ul className="space-y-1">{recent.map((v) => <li key={v.id}><Link to={`/voice?open=${v.id}`} className="block truncate rounded-2xl px-2 py-1.5 font-medium hover:bg-raised" dir="auto">{v.title}</Link></li>)}</ul>
      )}
    </WidgetCard>
  )
}

function DeenWidget() {
  const { tr, lang } = useI18n()
  const [verse, setVerse] = useState<Verse | null>(null)
  const [hadith, setHadith] = useState<Hadith | null>(null)
  const today = todayStr()
  useEffect(() => {
    let live = true
    void dailySelection(today).then(async (s) => {
      const [v, h] = await Promise.all([loadVerse(s.surah, s.ayah), loadHadith(s.hadithPoolIndex)])
      if (live) {
        setVerse(v)
        setHadith(h)
      }
    }).catch(() => undefined)
    return () => { live = false }
  }, [today])
  return (
    <Link to="/deen" className="block rounded-[1.75rem] bg-forest p-5 text-cream transition hover:opacity-95 lg:col-span-2">
      <p className="flex items-center gap-2 text-sm text-gold"><BookOpen className="size-4" />{tr('الزاد اليومي', 'Daily Deen')}</p>
      {verse ? (
        <>
          <p lang="ar" dir="rtl" className="mt-2 line-clamp-3 font-reading text-[1.2rem] leading-loose">{verse.text}</p>
          <p className="mt-1 text-sm text-cream/70" dir="auto">{verse.surahName} ({verse.surah}:{verse.ayah})</p>
        </>
      ) : <p className="mt-2 text-sm text-cream/70">{tr('يُحمَّل محتوى اليوم عند توفر الاتصال.', "Today's content loads when online.")}</p>}
      {hadith && (
        <div className="mt-3 border-t border-cream/15 pt-3 text-sm">
          <span className="text-gold">{tr('حديث اليوم', 'Hadith of the day')}</span> <span className="text-cream/70">· {bookName(hadith.book, lang)} ({hadith.number})</span>
        </div>
      )}
    </Link>
  )
}

function CompassWidget() {
  const { tr } = useI18n()
  const domains = useCollection('lifeDomains').items
  const goals = useCollection('lifeGoals').items
  const milestones = useCollection('lifeMilestones').items
  const rows = useMemo(() => domains.filter((d) => !d.archived).sort((a, b) => a.order - b.order).map((d) => {
    const own = goals.filter((g) => g.domainId === d.id && !g.archived && g.status !== 'cancelled')
    return { d, count: own.length, value: own.length ? Math.round(own.reduce((s, g) => s + goalProgress(g, milestones).value, 0) / own.length) : 0, overdue: own.filter((g) => isGoalOverdue(g)).length }
  }), [domains, goals, milestones])
  return (
    <WidgetCard title={tr('بوصلة الحياة', 'Life Compass')} icon={Compass} to="/compass" className="lg:col-span-2">
      {goals.length === 0 ? (
        <Empty>{tr('أين تريد أن تكون حياتك في 2036؟ ابدأ من الرؤية.', 'Where do you want your life to be in 2036? Start from the vision.')}</Empty>
      ) : (
        <ul className="grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2">
          {rows.map(({ d, value, count }) => (
            <li key={d.id}>
              <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                <span className="flex min-w-0 items-center gap-1.5 truncate"><DomainIcon name={d.icon} className="size-3.5 shrink-0 text-muted" /><span className="truncate" dir="auto">{d.name}</span></span>
                <span className="tnum shrink-0 text-muted">{count ? `${value}%` : '—'}</span>
              </div>
              <ProgressBar value={value} tone="gold" height="h-2" label={d.name} />
            </li>
          ))}
        </ul>
      )}
    </WidgetCard>
  )
}

const WIDGETS: Record<WidgetId, { ar: string; en: string; render: () => ReactNode; wide?: boolean }> = {
  finance: { ar: 'صافي الشهر', en: "Month's net", render: () => <FinanceHero />, wide: true },
  overview: { ar: 'المهام والأهداف', en: 'Tasks and goals', render: () => <OverviewWidget />, wide: true },
  tasks: { ar: 'المهام القادمة', en: 'Upcoming tasks', render: () => <TasksWidget /> },
  transactions: { ar: 'آخر المعاملات', en: 'Recent transactions', render: () => <TransactionsWidget /> },
  deen: { ar: 'الزاد اليومي', en: 'Daily Deen', render: () => <DeenWidget />, wide: true },
  compass: { ar: 'بوصلة الحياة', en: 'Life Compass', render: () => <CompassWidget />, wide: true },
  notes: { ar: 'أحدث الملاحظات', en: 'Recent notes', render: () => <NotesWidget /> },
  ideas: { ar: 'أفكار حديثة', en: 'Recent ideas', render: () => <IdeasWidget /> },
  bookmarks: { ar: 'روابط محفوظة', en: 'Saved links', render: () => <BookmarksWidget /> },
  voice: { ar: 'تسجيلات حديثة', en: 'Recent recordings', render: () => <VoiceWidget /> },
}

function CustomizeSheet({ onClose }: { onClose: () => void }) {
  const { tr, lang } = useI18n()
  const { settings, save } = useSettings()
  const order = settings.widgets.filter((w) => WIDGETS[w])
  for (const w of ALL_WIDGETS) if (!order.includes(w)) order.push(w)
  const move = (i: number, d: number) => {
    const next = [...order]
    const [item] = next.splice(i, 1)
    next.splice(i + d, 0, item!)
    void save({ widgets: next })
  }
  return (
    <Sheet open onClose={onClose} title={tr('تخصيص الرئيسية', 'Customize home')} footer={<Button variant="ink" icon={Check} onClick={onClose}>{tr('تم', 'Done')}</Button>}>
      <ul className="divide-y divide-line">
        {order.map((w, i) => (
          <li key={w} className="flex items-center gap-1 py-1">
            <div className="min-w-0 flex-1">
              <Toggle
                label={lang === 'ar' ? WIDGETS[w].ar : WIDGETS[w].en}
                checked={!settings.hiddenWidgets.includes(w)}
                onChange={(on) => void save({ hiddenWidgets: on ? settings.hiddenWidgets.filter((x) => x !== w) : [...settings.hiddenWidgets, w] })}
              />
            </div>
            <IconButton size="sm" icon={ArrowUp} label={tr('للأعلى', 'Move up')} disabled={i === 0} onClick={() => move(i, -1)} />
            <IconButton size="sm" icon={ArrowDown} label={tr('للأسفل', 'Move down')} disabled={i === order.length - 1} onClick={() => move(i, 1)} />
          </li>
        ))}
      </ul>
    </Sheet>
  )
}

export default function DashboardPage() {
  const { tr } = useI18n()
  const { settings } = useSettings()
  const [customize, setCustomize] = useState(false)
  const order = useMemo(() => {
    const list = settings.widgets.filter((w) => WIDGETS[w])
    for (const w of ALL_WIDGETS) if (!list.includes(w)) list.push(w)
    return list.filter((w) => !settings.hiddenWidgets.includes(w))
  }, [settings.widgets, settings.hiddenWidgets])

  return (
    <div className="fade-in">
      <Greeting />
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
        {order.map((w) => <div key={w} className="contents">{WIDGETS[w].wide ? WIDGETS[w].render() : <div className="grid min-w-0 grid-cols-1 lg:col-span-2">{WIDGETS[w].render()}</div>}</div>)}
      </div>
      <section className="card mt-3 p-4 lg:hidden" aria-label={tr('إجراءات سريعة', 'Quick actions')}>
        <QuickActionGrid />
      </section>
      <div className="mt-3 flex justify-center">
        <Button variant="ghost" size="sm" icon={SlidersHorizontal} onClick={() => setCustomize(true)}>{tr('تخصيص الرئيسية', 'Customize home')}</Button>
      </div>
      {customize && <CustomizeSheet onClose={() => setCustomize(false)} />}
    </div>
  )
}

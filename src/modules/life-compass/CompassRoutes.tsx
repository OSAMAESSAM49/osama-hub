import { lazy, Suspense } from 'react'
import { NavLink, Route, Routes } from 'react-router-dom'
import { BookHeart, Compass, Eye, Layers, ListTree, MessageCircleQuestion } from 'lucide-react'
import { cx, ListSkeleton } from '@/components/common/ui'
import { useI18n } from '@/i18n'

const Overview = lazy(() => import('./OverviewPage'))
const Vision = lazy(() => import('./VisionPage'))
const Domains = lazy(() => import('./DomainsPage'))
const Goals = lazy(() => import('./GoalsPage'))
const GoalDetail = lazy(() => import('./GoalDetailPage'))
const Reviews = lazy(() => import('./ReviewsPage'))
const Journal = lazy(() => import('./JournalPage'))

export default function CompassRoutes() {
  const { tr } = useI18n()
  const items = [
    { to: '/compass', end: true, icon: Compass, label: tr('الميزان', 'Balance') },
    { to: '/compass/vision', icon: Eye, label: tr('الرؤية', 'Vision') },
    { to: '/compass/goals', icon: ListTree, label: tr('الأهداف', 'Goals') },
    { to: '/compass/domains', icon: Layers, label: tr('المجالات', 'Domains') },
    { to: '/compass/reviews', icon: MessageCircleQuestion, label: tr('المراجعات', 'Reviews') },
    { to: '/compass/journal', icon: BookHeart, label: tr('المذكرات', 'Journal') },
  ]
  return (
    <div className="fade-in">
      <nav aria-label={tr('أقسام بوصلة الحياة', 'Life Compass sections')} className="no-scrollbar -mx-4 mb-5 flex gap-1 overflow-x-auto px-4 lg:mx-0 lg:px-0">
        {items.map((i) => (
          <NavLink
            key={i.to}
            to={i.to}
            end={i.end}
            className={({ isActive }) => cx('inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-medium whitespace-nowrap transition', isActive ? 'bg-gold text-charcoal' : 'bg-raised text-muted hover:text-ink')}
          >
            <i.icon className="size-4" /> {i.label}
          </NavLink>
        ))}
      </nav>
      <Suspense fallback={<ListSkeleton />}>
        <Routes>
          <Route index element={<Overview />} />
          <Route path="vision" element={<Vision />} />
          <Route path="domains" element={<Domains />} />
          <Route path="goals" element={<Goals />} />
          <Route path="goals/:id" element={<GoalDetail />} />
          <Route path="reviews" element={<Reviews />} />
          <Route path="journal" element={<Journal />} />
        </Routes>
      </Suspense>
    </div>
  )
}

import { useNavigate } from 'react-router-dom'
import { ArrowDownCircle, ArrowUpCircle, Coins, Compass, ShoppingBag, Lightbulb, Link2, ListChecks, Mic, NotebookPen, type LucideIcon } from 'lucide-react'
import { Sheet } from '@/components/common/ui'
import { useI18n } from '@/i18n'

interface Action {
  icon: LucideIcon
  ar: string
  en: string
  to: string
  bg: string
  fg: string
}

export const QUICK_ACTIONS: Action[] = [
  { icon: NotebookPen, ar: 'ملاحظة', en: 'Note', to: '/notes?new=1', bg: '#EE8A4B', fg: '#111114' },
  { icon: ArrowDownCircle, ar: 'إيراد العيادة', en: 'Clinic income', to: '/clinic?add=income', bg: '#C8FF2E', fg: '#111114' },
  { icon: ArrowUpCircle, ar: 'مصروف العيادة', en: 'Clinic expense', to: '/clinic?add=expense', bg: '#3A3FF0', fg: '#fff' },
  { icon: ShoppingBag, ar: 'مصروف شخصي', en: 'My expense', to: '/money?add=expense', bg: '#A8E6CF', fg: '#111114' },
  { icon: Coins, ar: 'دخل شخصي', en: 'My income', to: '/money?add=income', bg: '#DDF5E7', fg: '#111114' },
  { icon: ListChecks, ar: 'مهمة', en: 'Task', to: '/tasks?new=1', bg: '#111114', fg: '#fff' },
  { icon: Mic, ar: 'تسجيل صوتي', en: 'Voice note', to: '/voice?record=1', bg: '#D94A7B', fg: '#fff' },
  { icon: Link2, ar: 'حفظ رابط', en: 'Save link', to: '/links?new=1', bg: '#2E9C8F', fg: '#fff' },
  { icon: Lightbulb, ar: 'فكرة محتوى', en: 'Content idea', to: '/ideas?new=1', bg: '#7D5CE6', fg: '#fff' },
  { icon: Compass, ar: 'هدف حياة', en: 'Life goal', to: '/compass/goals?new=1', bg: '#CDA94F', fg: '#111114' },
]

export function QuickActionGrid({ onPick }: { onPick?: () => void }) {
  const { lang } = useI18n()
  const nav = useNavigate()
  return (
    <div className="grid grid-cols-4 gap-2">
      {QUICK_ACTIONS.map((a) => (
        <button
          key={a.to}
          type="button"
          onClick={() => {
            onPick?.()
            nav(a.to)
          }}
          className="flex flex-col items-center gap-2 rounded-3xl p-2 text-center text-[13px] font-medium transition hover:bg-raised"
        >
          <span className="grid size-14 place-items-center rounded-full" style={{ background: a.bg, color: a.fg }}>
            <a.icon className="size-6" />
          </span>
          {lang === 'ar' ? a.ar : a.en}
        </button>
      ))}
    </div>
  )
}

export function QuickAddSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { tr } = useI18n()
  return (
    <Sheet open={open} onClose={onClose} title={tr('إضافة سريعة', 'Quick add')}>
      <QuickActionGrid onPick={onClose} />
    </Sheet>
  )
}

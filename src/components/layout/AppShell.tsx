import { Suspense, useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  ChevronsLeft, ChevronsRight, CloudOff, Grid2x2, Languages, LogOut, Moon, Plus, RefreshCw, Search, Sun, User, WifiOff,
} from 'lucide-react'
import { MODULES, moduleById, type ModuleDef } from '@/app/modules'
import { IconButton, ListSkeleton, cx } from '@/components/common/ui'
import { confirmAction, toast } from '@/components/common/feedback'
import { useAuth } from '@/contexts/AuthContext'
import { useSettings } from '@/hooks/useSettings'
import { getPrefs, setPrefs, useI18n, usePrefs } from '@/i18n'
import { signOutUser } from '@/services/firebase/auth'
import { syncNow, useSyncStatus } from '@/services/sync/engine'
import { QuickAddSheet } from './QuickAdd'
import { SearchSheet } from '@/modules/global-search/SearchSheet'
import { UpdateBanner } from './UpdateBanner'

const MOBILE_NAV = ['home', 'tasks', 'clinic'] as const

function SyncPill() {
  const { tr } = useI18n()
  const s = useSyncStatus()
  const nav = useNavigate()
  const { localMode } = useAuth()
  let Icon = RefreshCw
  let text = tr('متزامن', 'Synced')
  let cls = 'text-positive'
  if (localMode) {
    Icon = CloudOff
    text = tr('على هذا الجهاز', 'On this device')
    cls = 'text-muted'
  } else if (!s.online) {
    Icon = WifiOff
    text = s.pending ? tr(`غير متصل · ${s.pending} محفوظ محليًا`, `Offline · ${s.pending} saved locally`) : tr('غير متصل', 'Offline')
    cls = 'text-caution'
  } else if (s.failed) {
    text = tr(`فشل ${s.failed}`, `${s.failed} failed`)
    cls = 'text-negative'
  } else if (s.running) {
    text = tr('جارٍ المزامنة', 'Syncing')
    cls = 'text-caution'
  } else if (s.lastError) {
    // Never claim "synced" when the server could not be reached, even with nothing queued.
    Icon = WifiOff
    text = s.pending ? tr(`تعذر الاتصال · ${s.pending} في الانتظار`, `Can't reach server · ${s.pending} waiting`) : tr('تعذر الاتصال بالخادم', "Can't reach server")
    cls = 'text-caution'
  } else if (s.pending) {
    text = tr(`${s.pending} في الانتظار`, `${s.pending} waiting`)
    cls = 'text-caution'
  }
  return (
    <button
      type="button"
      onClick={() => {
        if (localMode || s.failed) nav('/settings?section=data')
        else void syncNow()
      }}
      aria-label={`${tr('حالة المزامنة', 'Sync status')}: ${text}`}
      className={cx('inline-flex min-h-10 items-center gap-1.5 rounded-full bg-raised px-3 text-[13px] font-medium whitespace-nowrap', cls)}
    >
      <Icon className={cx('size-3.5', s.running && 'animate-spin')} />
      {text}
    </button>
  )
}

function UserMenu() {
  const { tr } = useI18n()
  const { user, localMode } = useAuth()
  const { settings } = useSettings()
  const [open, setOpen] = useState(false)
  const nav = useNavigate()
  const { pending } = useSyncStatus()
  const name = settings.displayName || user?.displayName || user?.email || tr('أنت', 'You')
  const out = async () => {
    const ok = await confirmAction({
      title: tr('تسجيل الخروج؟', 'Sign out?'),
      body: pending
        ? tr(`لديك ${pending} تغييرات لم تُرفع بعد. ستبقى محفوظة على هذا الجهاز وتُرفع عند دخولك مجددًا.`, `You have ${pending} changes not yet uploaded. They stay on this device and upload when you sign in again.`)
        : undefined,
      confirmLabel: tr('خروج', 'Sign out'),
    })
    if (ok) await signOutUser()
  }
  return (
    <div className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={tr('قائمة الحساب', 'Account menu')}
        onClick={() => setOpen((v) => !v)}
        className="grid size-11 place-items-center rounded-full bg-ink font-bold text-canvas"
      >
        {name.trim().charAt(0).toUpperCase() || <User className="size-5" />}
      </button>
      {open && (
        <>
          <button type="button" aria-hidden tabIndex={-1} className="fixed inset-0 z-30 cursor-default" onClick={() => setOpen(false)} />
          <div role="menu" className="card fade-in absolute end-0 z-40 mt-2 w-60 p-2 shadow-xl">
            <div className="truncate px-3 py-2 text-sm text-muted" dir="auto">{name}</div>
            <button role="menuitem" type="button" className="flex min-h-11 w-full items-center gap-2.5 rounded-2xl px-3 hover:bg-raised" onClick={() => { setOpen(false); nav('/settings') }}>
              <User className="size-4.5" /> {tr('الملف والإعدادات', 'Profile & settings')}
            </button>
            {!localMode && (
              <button role="menuitem" type="button" className="flex min-h-11 w-full items-center gap-2.5 rounded-2xl px-3 text-negative hover:bg-raised" onClick={() => { setOpen(false); void out() }}>
                <LogOut className="size-4.5" /> {tr('تسجيل الخروج', 'Sign out')}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function SideItem({ m, collapsed }: { m: ModuleDef; collapsed: boolean }) {
  const { lang } = useI18n()
  const label = lang === 'ar' ? m.ar : m.en
  return (
    <NavLink
      to={m.path}
      end={m.path === '/'}
      title={collapsed ? label : undefined}
      aria-label={label}
      className={({ isActive }) =>
        cx(
          'flex min-h-11 items-center gap-3 rounded-full px-3 text-[15px] font-medium whitespace-nowrap transition',
          collapsed && 'justify-center !px-0',
          isActive ? 'bg-ink text-canvas' : 'text-muted hover:bg-raised hover:text-ink',
        )
      }
    >
      <m.icon className="size-5 shrink-0" />
      {!collapsed && label}
    </NavLink>
  )
}

export function AppShell() {
  const { tr, lang } = useI18n()
  const prefs = usePrefs()
  const nav = useNavigate()
  const location = useLocation()
  const [searchOpen, setSearchOpen] = useState(false)
  const [quickOpen, setQuickOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('osama-hub:sidebar') === '1'
    } catch {
      return false
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem('osama-hub:sidebar', collapsed ? '1' : '0')
    } catch {
      /* A convenience only. */
    }
  }, [collapsed])

  useEffect(() => {
    window.scrollTo(0, 0)
    setSearchOpen(false)
    setQuickOpen(false)
  }, [location.pathname])

  useEffect(() => {
    const GO: Record<string, string> = { h: '/', t: '/tasks', c: '/clinic', p: '/money', n: '/notes', i: '/ideas', v: '/voice', l: '/links', d: '/deen', m: '/compass' }
    let pendingG = 0
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearchOpen(true)
        return
      }
      const target = e.target as HTMLElement
      if (target.closest('input, textarea, select, [contenteditable="true"], dialog') || e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key === '/') {
        e.preventDefault()
        setSearchOpen(true)
      } else if (e.key === '+' || e.key === 'a') {
        setQuickOpen(true)
      } else if (e.key === 'g') {
        pendingG = Date.now()
      } else if (Date.now() - pendingG < 1200 && GO[e.key]) {
        pendingG = 0
        nav(GO[e.key]!)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [nav])

  const toggleTheme = () => {
    const isDark = document.documentElement.classList.contains('dark')
    setPrefs({ theme: isDark ? 'light' : 'dark' })
  }
  const toggleLang = () => {
    setPrefs({ language: getPrefs().language === 'ar' ? 'en' : 'ar' })
    toast(prefs.language === 'ar' ? 'Language: English' : 'اللغة: العربية', 'info')
  }

  const CollapseIcon = (lang === 'ar') === collapsed ? ChevronsLeft : ChevronsRight
  const mobileItems = MOBILE_NAV.map(moduleById)

  return (
    <div className="flex min-h-dvh overflow-x-clip">
      {/* Desktop sidebar */}
      <aside className={cx('sticky top-0 hidden h-dvh shrink-0 flex-col gap-1 border-e border-line p-3 transition-[width] duration-200 lg:flex', collapsed ? 'w-[4.75rem]' : 'w-64')}>
        <div className={cx('mb-3 flex items-center gap-2.5 px-1.5 pt-1', collapsed && 'justify-center !px-0')}>
          <img src={`${import.meta.env.BASE_URL}icons/icon.svg`} alt="" className="size-9 rounded-xl" />
          {!collapsed && <span className="font-bold tracking-tight whitespace-nowrap">OSAMA HUB</span>}
        </div>
        <button
          type="button"
          onClick={() => setQuickOpen(true)}
          aria-label={tr('إضافة سريعة', 'Quick add')}
          className={cx('mb-2 flex min-h-11 items-center gap-3 rounded-full bg-lime px-3 font-medium whitespace-nowrap text-charcoal transition hover:bg-lime-deep', collapsed && 'justify-center !px-0')}
        >
          <Plus className="size-5 shrink-0" /> {!collapsed && tr('إضافة سريعة', 'Quick add')}
        </button>
        <nav aria-label={tr('التنقل الرئيسي', 'Main navigation')} className="no-scrollbar flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
          {MODULES.map((m) => <SideItem key={m.id} m={m} collapsed={collapsed} />)}
        </nav>
        <IconButton icon={CollapseIcon} label={collapsed ? tr('توسيع القائمة', 'Expand sidebar') : tr('طي القائمة', 'Collapse sidebar')} className="self-center" onClick={() => setCollapsed((v) => !v)} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="safe-top sticky top-0 z-20 bg-canvas/85 backdrop-blur-md">
          <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-2.5 lg:px-8">
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="hidden h-11 min-w-0 flex-1 items-center gap-2.5 rounded-full bg-raised px-4 text-start text-[15px] text-faint sm:flex sm:max-w-md"
            >
              <Search className="size-4.5 shrink-0" />
              <span className="truncate">{tr('ابحث في كل شيء', 'Search everything')}</span>
              <kbd dir="ltr" className="ms-auto hidden rounded-md bg-surface px-1.5 py-0.5 text-xs lg:block">Ctrl K</kbd>
            </button>
            <img src={`${import.meta.env.BASE_URL}icons/icon.svg`} alt="OSAMA HUB" className="size-10 rounded-[0.8rem] sm:hidden" />
            <div className="ms-auto flex items-center gap-1">
              <SyncPill />
              <IconButton icon={Search} label={tr('بحث', 'Search')} className="sm:hidden" onClick={() => setSearchOpen(true)} />
              <IconButton icon={Languages} label={tr('English', 'العربية')} className="max-sm:hidden" onClick={toggleLang} />
              <IconButton icon={document.documentElement.classList.contains('dark') ? Sun : Moon} label={tr('تبديل المظهر', 'Toggle theme')} className="max-sm:hidden" onClick={toggleTheme} />
              <UserMenu />
            </div>
          </div>
        </header>

        <UpdateBanner />

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-2 pb-28 lg:px-8 lg:pb-10">
          <Suspense fallback={<div className="pt-6"><ListSkeleton /></div>}>
            <Outlet />
          </Suspense>
        </main>
      </div>

      {/* Mobile bottom navigation */}
      <nav aria-label={tr('التنقل الرئيسي', 'Main navigation')} className="safe-bottom fixed inset-x-0 bottom-0 z-20 bg-canvas/90 backdrop-blur-md lg:hidden">
        <div className="mx-auto grid max-w-md grid-cols-5 items-center px-2 pt-1.5 pb-1.5">
          {mobileItems.slice(0, 2).map((m) => <BottomLink key={m.id} m={m} />)}
          <button
            type="button"
            onClick={() => setQuickOpen(true)}
            aria-label={tr('إضافة سريعة', 'Quick add')}
            className="mx-auto grid size-14 place-items-center rounded-full bg-lime text-charcoal shadow-lg transition active:scale-95"
          >
            <Plus className="size-6" />
          </button>
          {mobileItems.slice(2).map((m) => <BottomLink key={m.id} m={m} />)}
          <NavLink to="/more" className={({ isActive }) => cx('flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-2xl text-[11px] font-medium', isActive ? 'text-accent' : 'text-muted')}>
            <Grid2x2 className="size-5" />
            {tr('الكل', 'All')}
          </NavLink>
        </div>
      </nav>

      <SearchSheet open={searchOpen} onClose={() => setSearchOpen(false)} />
      <QuickAddSheet open={quickOpen} onClose={() => setQuickOpen(false)} />
    </div>
  )
}

function BottomLink({ m }: { m: ModuleDef }) {
  const { lang } = useI18n()
  return (
    <NavLink to={m.path} end={m.path === '/'} className={({ isActive }) => cx('flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-2xl text-[11px] font-medium', isActive ? 'text-accent' : 'text-muted')}>
      <m.icon className="size-5" />
      <span className="max-w-full truncate">{lang === 'ar' ? m.ar.split(' ')[0] : m.en.split(' ')[0]}</span>
    </NavLink>
  )
}

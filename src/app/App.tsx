import { Component, lazy, Suspense, type ReactNode } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Button } from '@/components/common/ui'
import { ConfirmHost, Toaster } from '@/components/common/feedback'
import { AppShell } from '@/components/layout/AppShell'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { tr } from '@/i18n'

const AuthPage = lazy(() => import('@/modules/auth/AuthPage'))
const DashboardPage = lazy(() => import('@/modules/dashboard/DashboardPage'))
const MorePage = lazy(() => import('@/modules/dashboard/MorePage'))
const NotesPage = lazy(() => import('@/modules/notes/NotesPage'))
const ClinicPage = lazy(() => import('@/modules/clinic-finance/ClinicPage'))
const IdeasPage = lazy(() => import('@/modules/content-ideas/IdeasPage'))
const VaultPage = lazy(() => import('@/modules/data-vault/VaultPage'))
const TasksPage = lazy(() => import('@/modules/tasks/TasksPage'))
const DeenPage = lazy(() => import('@/modules/daily-deen/DeenPage'))
const VoicePage = lazy(() => import('@/modules/voice-notes/VoicePage'))
const LinksPage = lazy(() => import('@/modules/link-vault/LinksPage'))
const CompassRoutes = lazy(() => import('@/modules/life-compass/CompassRoutes'))
const SettingsPage = lazy(() => import('@/modules/settings/SettingsPage'))

class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    if (!this.state.failed) return this.props.children
    return (
      <main className="grid min-h-dvh place-items-center p-6 text-center">
        <div>
          <h1 className="font-display text-3xl font-bold">{tr('حدث خطأ غير متوقع', 'Something went wrong')}</h1>
          <p className="mt-2 text-muted">{tr('بياناتك محفوظة. أعد تحميل الصفحة للمتابعة.', 'Your data is safe. Reload the page to continue.')}</p>
          <Button variant="primary" className="mt-5" onClick={() => location.reload()}>{tr('إعادة التحميل', 'Reload')}</Button>
        </div>
      </main>
    )
  }
}

function Splash() {
  return (
    <div className="grid min-h-dvh place-items-center" aria-busy="true" aria-label="loading">
      <img src={`${import.meta.env.BASE_URL}icons/icon.svg`} alt="" className="size-[72px] animate-pulse rounded-[1.1rem]" />
    </div>
  )
}

function Gate() {
  const { status } = useAuth()
  if (status === 'loading') return <Splash />
  if (status === 'error') {
    return (
      <main className="grid min-h-dvh place-items-center p-6 text-center">
        <div className="max-w-md">
          <h1 className="font-display text-3xl font-bold">{tr('تعذر فتح التخزين المحلي', 'Could not open local storage')}</h1>
          <p className="mt-2 text-muted">{tr('قد يكون التصفح الخاص يمنع التخزين. جرّب نافذة عادية.', 'Private browsing may block storage. Try a normal window.')}</p>
        </div>
      </main>
    )
  }
  if (status === 'signedOut') {
    return (
      <Suspense fallback={<Splash />}>
        <AuthPage />
      </Suspense>
    )
  }
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<DashboardPage />} />
        <Route path="more" element={<MorePage />} />
        <Route path="notes" element={<NotesPage />} />
        <Route path="clinic" element={<ClinicPage />} />
        <Route path="ideas" element={<IdeasPage />} />
        <Route path="vault" element={<VaultPage />} />
        <Route path="tasks" element={<TasksPage />} />
        <Route path="deen" element={<DeenPage />} />
        <Route path="voice" element={<VoicePage />} />
        <Route path="links" element={<LinksPage />} />
        <Route path="compass/*" element={<CompassRoutes />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export function App() {
  return (
    <ErrorBoundary>
      <HashRouter>
        <AuthProvider>
          <Gate />
          <Toaster />
          <ConfirmHost />
        </AuthProvider>
      </HashRouter>
    </ErrorBoundary>
  )
}

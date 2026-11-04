import { useState, type FormEvent } from 'react'
import { ArrowLeft, ArrowRight, Languages } from 'lucide-react'
import { Button, Input, Segmented } from '@/components/common/ui'
import { setPrefs, useI18n } from '@/i18n'
import { authErrorMessage, resetPassword, signIn, signUp } from '@/services/firebase/auth'

type Mode = 'signin' | 'signup' | 'reset'

export default function AuthPage() {
  const { tr, lang } = useI18n()
  const [mode, setMode] = useState<Mode>('signin')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setInfo(null)
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError(tr('أدخل بريدًا إلكترونيًا صحيحًا.', 'Enter a valid email address.'))
    if (mode !== 'reset' && password.length < 6) return setError(tr('كلمة المرور 6 أحرف على الأقل.', 'Password must be at least 6 characters.'))
    setBusy(true)
    try {
      if (mode === 'signin') await signIn(email.trim(), password)
      if (mode === 'signup') await signUp(email.trim(), password, name.trim())
      if (mode === 'reset') {
        await resetPassword(email.trim())
        setInfo(tr('أرسلنا رابط إعادة التعيين إلى بريدك إن كان مسجلًا.', 'If that email is registered, a reset link is on its way.'))
      }
    } catch (err) {
      setError(authErrorMessage((err as { code?: string }).code ?? '', lang))
    } finally {
      setBusy(false)
    }
  }

  const Arrow = lang === 'ar' ? ArrowLeft : ArrowRight

  return (
    <main className="safe-top safe-bottom mx-auto grid min-h-dvh max-w-5xl grid-cols-1 items-center gap-6 p-4 lg:grid-cols-2 lg:gap-10">
      <section className="deck" aria-hidden="true">
        <div className="bg-charcoal p-7 pb-14 text-white">
          <p className="text-sm text-white/60">OSAMA HUB</p>
          <h1 className="mt-10 font-display text-5xl font-bold lg:text-6xl">{tr('مقرّك الشخصي', 'Your personal headquarters')}</h1>
        </div>
        <div className="bg-cobalt p-7 pb-12 text-white">
          <p className="text-lg">{tr('العيادة، الأفكار، المهام، والبوصلة.', 'Clinic, ideas, tasks and compass.')}</p>
        </div>
        <div className="bg-lime p-7 text-charcoal">
          <p className="text-lg font-medium">{tr('كل شيء في مكان واحد. بهدوء.', 'Everything in one place. Calmly.')}</p>
        </div>
      </section>

      <section className="card p-6 sm:p-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
          <Segmented<Mode>
            label={tr('الحساب', 'Account')}
            value={mode === 'reset' ? 'signin' : mode}
            onChange={(m) => {
              setMode(m)
              setError(null)
              setInfo(null)
            }}
            options={[
              { value: 'signin', label: tr('تسجيل الدخول', 'Sign in') },
              { value: 'signup', label: tr('حساب جديد', 'Sign up') },
            ]}
          />
          <Button variant="ghost" size="sm" icon={Languages} onClick={() => setPrefs({ language: lang === 'ar' ? 'en' : 'ar' })}>
            {lang === 'ar' ? 'English' : 'العربية'}
          </Button>
        </div>
        <form onSubmit={submit} className="space-y-4" noValidate>
          {mode === 'reset' && <p className="text-[15px] text-muted">{tr('أدخل بريدك وسنرسل لك رابطًا لإعادة تعيين كلمة المرور.', 'Enter your email and we will send a link to reset your password.')}</p>}
          {mode === 'signup' && <Input label={tr('الاسم', 'Name')} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />}
          <Input label={tr('البريد الإلكتروني', 'Email')} type="email" dir="ltr" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          {mode !== 'reset' && (
            <Input label={tr('كلمة المرور', 'Password')} type="password" dir="ltr" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} />
          )}
          {error && <p role="alert" className="rounded-2xl bg-negative/10 px-4 py-3 text-[15px] text-negative">{error}</p>}
          {info && <p role="status" className="rounded-2xl bg-positive/10 px-4 py-3 text-[15px] text-positive">{info}</p>}
          <Button type="submit" variant="primary" icon={Arrow} capsule busy={busy} className="w-full !justify-between ps-6">
            {mode === 'signin' ? tr('دخول', 'Sign in') : mode === 'signup' ? tr('إنشاء الحساب', 'Create account') : tr('إرسال الرابط', 'Send link')}
          </Button>
          <div className="text-center">
            {mode === 'signin' && (
              <button type="button" onClick={() => { setMode('reset'); setError(null) }} className="text-sm text-muted underline underline-offset-4">
                {tr('نسيت كلمة المرور؟', 'Forgot your password?')}
              </button>
            )}
            {mode === 'reset' && (
              <button type="button" onClick={() => { setMode('signin'); setError(null); setInfo(null) }} className="text-sm text-muted underline underline-offset-4">
                {tr('العودة لتسجيل الدخول', 'Back to sign in')}
              </button>
            )}
          </div>
        </form>
      </section>
    </main>
  )
}

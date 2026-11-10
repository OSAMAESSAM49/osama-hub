import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  AlertTriangle, CheckCircle2, Clock, Download, FileSpreadsheet, Target, Languages, LogOut, Plus, RefreshCw, RotateCcw, Share, Smartphone, Trash2, Upload, XCircle,
} from 'lucide-react'
import { confirmAction, toast } from '@/components/common/feedback'
import { Button, cx, IconButton, Input, PageHeader, SectionTitle, Segmented, Select, Sheet, Tag } from '@/components/common/ui'
import { GoalsSheet, type GoalScope } from '@/components/finance/Goals'
import { useAuth } from '@/contexts/AuthContext'
import { useSettings } from '@/hooks/useSettings'
import { setPrefs, useI18n, usePrefs, type ThemePref } from '@/i18n'
import { applyRestore, exportBackup, planRestore, type RestoreMode, type RestorePlan } from '@/services/data/backup'
import { listConflicts, listOutbox, resolveConflict, useCollection } from '@/services/data/store'
import { isCloudStorageEnabled, isFirebaseConfigured, useEmulators } from '@/services/firebase/config'
import { authErrorMessage, resetPassword, signOutUser } from '@/services/firebase/auth'
import { isIos, isStandalone, promptInstall, usePwa } from '@/services/pwa'
import { storageReport } from '@/services/storage/blobs'
import { refreshCounts, retryNow, syncNow, useSyncStatus } from '@/services/sync/engine'
import type { ConflictCopy, FinanceCategory, OutboxOp } from '@/types/models'
import { formatDate, isValidDate, todayStr } from '@/utils/dates'
import { bpToPercent, percentToBp, rateOn } from '@/utils/money'
import { newId } from '@/utils/text'
import { exportMonthly, exportPartnerStatement, exportTransactions, exportYearly } from '../clinic-finance/finance'

type Section = 'account' | 'general' | 'clinic' | 'personal' | 'data' | 'app'

const Block = ({ title, children, hint }: { title: string; children: ReactNode; hint?: string }) => (
  <section className="card space-y-3 p-5">
    <SectionTitle>{title}</SectionTitle>
    {hint && <p className="-mt-2 text-sm text-muted">{hint}</p>}
    {children}
  </section>
)

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-11 flex-wrap items-center justify-between gap-2 border-t border-line pt-3 first:border-t-0 first:pt-0">
      <span className="text-[15px] text-muted">{label}</span>
      <span className="min-w-0 text-[15px] font-medium">{children}</span>
    </div>
  )
}

/** Text field that saves when it loses focus. */
function SavedInput({ label, value, onSave, ...rest }: { label: string; value: string; onSave: (v: string) => void } & Omit<React.ComponentProps<typeof Input>, 'value' | 'onChange' | 'label'>) {
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value])
  return <Input label={label} value={v} onChange={(e) => setV(e.target.value)} onBlur={() => v !== value && onSave(v)} {...rest} />
}

// ── Account ──
function AccountSection() {
  const { tr, lang } = useI18n()
  const { user, localMode } = useAuth()
  const { settings, save } = useSettings()
  const { pending } = useSyncStatus()
  return (
    <div className="space-y-4">
      <Block title={tr('الملف الشخصي', 'Profile')}>
        <SavedInput label={tr('الاسم', 'Name')} value={settings.displayName} onSave={(displayName) => void save({ displayName })} placeholder={user?.displayName ?? ''} />
        {!localMode && <Row label={tr('البريد الإلكتروني', 'Email')}><span dir="ltr">{user?.email}</span></Row>}
      </Block>
      {localMode ? (
        <Block title={tr('الحساب', 'Account')}>
          <p className="flex items-start gap-2 text-[15px] text-muted"><Smartphone className="mt-0.5 size-4.5 shrink-0" />{tr('لم يُربط مشروع Firebase بعد، لذلك لا يوجد حساب وتبقى البيانات على هذا الجهاز فقط. اتبع دليل الإعداد في README لتفعيل الحساب والمزامنة.', 'No Firebase project is connected yet, so there is no account and data stays on this device only. Follow the setup guide in the README to enable accounts and sync.')}</p>
        </Block>
      ) : (
        <Block title={tr('الأمان', 'Security')}>
          <div className="flex flex-wrap gap-2">
            <Button
              icon={RotateCcw}
              onClick={async () => {
                if (!user?.email) return
                try {
                  await resetPassword(user.email)
                  toast(tr('أُرسل رابط إعادة التعيين إلى بريدك', 'A reset link was sent to your email'))
                } catch (e) {
                  toast(authErrorMessage((e as { code?: string }).code ?? '', lang), 'error')
                }
              }}
            >
              {tr('إعادة تعيين كلمة المرور', 'Reset password')}
            </Button>
            <Button
              icon={LogOut}
              className="!text-negative"
              onClick={async () => {
                const ok = await confirmAction({
                  title: tr('تسجيل الخروج؟', 'Sign out?'),
                  body: pending ? tr(`لديك ${pending} تغييرات لم تُرفع بعد، وستبقى محفوظة على هذا الجهاز.`, `You have ${pending} changes not uploaded yet. They stay saved on this device.`) : undefined,
                  confirmLabel: tr('خروج', 'Sign out'),
                })
                if (ok) await signOutUser()
              }}
            >
              {tr('تسجيل الخروج', 'Sign out')}
            </Button>
          </div>
        </Block>
      )}
    </div>
  )
}

// ── General ──
function GeneralSection() {
  const { tr, lang } = useI18n()
  const prefs = usePrefs()
  const { settings, save } = useSettings()
  return (
    <Block title={tr('عام', 'General')}>
      <Select
        label={tr('اللغة', 'Language')}
        value={prefs.language}
        onChange={(e) => {
          const language = e.target.value as 'ar' | 'en'
          setPrefs({ language })
          void save({ language })
        }}
        options={[{ value: 'ar', label: 'العربية' }, { value: 'en', label: 'English' }]}
      />
      <Select
        label={tr('المظهر', 'Theme')}
        value={prefs.theme}
        onChange={(e) => {
          const theme = e.target.value as ThemePref
          setPrefs({ theme })
          void save({ theme })
        }}
        options={[{ value: 'system', label: tr('حسب النظام', 'System') }, { value: 'light', label: tr('فاتح', 'Light') }, { value: 'dark', label: tr('داكن', 'Dark') }]}
      />
      <Select
        label={tr('صيغة التاريخ', 'Date format')}
        value={settings.dateFormat}
        onChange={(e) => void save({ dateFormat: e.target.value as typeof settings.dateFormat })}
        options={(['long', 'dmy', 'iso'] as const).map((f) => ({ value: f, label: formatDate(todayStr(), lang, f) }))}
      />
      <Select
        label={tr('صيغة الوقت', 'Time format')}
        value={settings.timeFormat}
        onChange={(e) => void save({ timeFormat: e.target.value as '12' | '24' })}
        options={[{ value: '12', label: tr('12 ساعة', '12-hour') }, { value: '24', label: tr('24 ساعة', '24-hour') }]}
      />
      <Select
        label={tr('بداية الأسبوع', 'Week starts on')}
        value={String(settings.weekStart)}
        onChange={(e) => void save({ weekStart: Number(e.target.value) as 0 | 1 | 6 })}
        options={[{ value: '6', label: tr('السبت', 'Saturday') }, { value: '0', label: tr('الأحد', 'Sunday') }, { value: '1', label: tr('الاثنين', 'Monday') }]}
      />
    </Block>
  )
}

// ── Clinic ──
function CategoryEditor({ title, list, used, onChange }: { title: string; list: FinanceCategory[]; used: Set<string>; onChange: (l: FinanceCategory[]) => void }) {
  const { tr, lang } = useI18n()
  const [name, setName] = useState('')
  const rename = (id: string, v: string) => onChange(list.map((c) => (c.id === id ? (lang === 'ar' ? { ...c, ar: v } : { ...c, en: v }) : c)))
  const add = () => {
    if (!name.trim()) return
    onChange([...list, { id: newId(), ar: name.trim(), en: name.trim() }])
    setName('')
  }
  return (
    <Block title={title} hint={tr('تغيير الاسم لا يؤثر في المعاملات السابقة. التصنيف المستخدم يُخفى بدل حذفه.', 'Renaming does not affect past transactions. A category in use is hidden rather than deleted.')}>
      <ul className="space-y-1.5">
        {list.filter((c) => !c.archived).map((c) => (
          <li key={c.id} className="flex items-center gap-1.5">
            <input aria-label={tr('اسم التصنيف', 'Category name')} defaultValue={lang === 'ar' ? c.ar : c.en} onBlur={(e) => { if (e.target.value.trim() && e.target.value !== (lang === 'ar' ? c.ar : c.en)) rename(c.id, e.target.value.trim()) }} className="field" dir="auto" />
            <IconButton
              size="sm"
              icon={Trash2}
              label={tr('إزالة', 'Remove')}
              disabled={list.filter((x) => !x.archived).length <= 1}
              onClick={() => onChange(used.has(c.id) ? list.map((x) => (x.id === c.id ? { ...x, archived: true } : x)) : list.filter((x) => x.id !== c.id))}
            />
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <input aria-label={tr('تصنيف جديد', 'New category')} value={name} onChange={(e) => setName(e.target.value)} placeholder={tr('تصنيف جديد', 'New category')} className="field" dir="auto" onKeyDown={(e) => { if (e.key === 'Enter') add() }} />
        <Button icon={Plus} onClick={add}>{tr('إضافة', 'Add')}</Button>
      </div>
    </Block>
  )
}

function PartnerRateEditor() {
  const { tr, lang } = useI18n()
  const { settings, save } = useSettings()
  const today = todayStr()
  const current = rateOn(today, settings.partnerRates)
  const [pct, setPct] = useState(bpToPercent(current))
  const [from, setFrom] = useState(today)
  const [error, setError] = useState<string | null>(null)
  const sorted = [...settings.partnerRates].sort((a, b) => b.from.localeCompare(a.from))
  const isEpoch = (d: string) => d === '0001-01-01'

  const apply = async () => {
    const bp = percentToBp(pct)
    if (bp === null) return setError(tr('أدخل نسبة بين 0 و100.', 'Enter a percentage from 0 to 100.'))
    if (!isValidDate(from)) return setError(tr('تاريخ غير صالح.', 'Invalid date.'))
    setError(null)
    const ok = await confirmAction({
      title: tr(`تغيير نسبة الشريك إلى ${bpToPercent(bp)}%؟`, `Change partner rate to ${bpToPercent(bp)}%?`),
      body: tr(`تسري على الإيرادات من ${formatDate(from, 'ar', 'long')} فصاعدًا، وتبقى الفترات السابقة بنسبتها القديمة.`, `It applies to income from ${formatDate(from, 'en', 'long')} onwards. Earlier periods keep their old rate.`),
    })
    if (!ok) return
    await save({ partnerRates: [...settings.partnerRates.filter((r) => r.from !== from), { from, bp }] })
    toast(tr('حُدّثت النسبة', 'Rate updated'))
  }

  return (
    <Block title={tr('نسبة الشريك', 'Partner percentage')} hint={tr('تُحسب من الصافي (الإيرادات − المصروفات) لكل شهر. الشهر الخاسر لا تُحسب عنه حصة.', 'Calculated on net (income − expenses) for each month. A month that ends in a loss earns no share.')}>
      <div className="grid grid-cols-2 gap-3">
        <Input label={tr('النسبة %', 'Rate %')} inputMode="decimal" dir="ltr" value={pct} onChange={(e) => setPct(e.target.value)} error={error} />
        <Input label={tr('تسري من', 'Applies from')} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
      </div>
      <Button variant="ink" onClick={() => void apply()}>{tr('تطبيق النسبة', 'Apply rate')}</Button>
      <ul className="space-y-1 text-[15px]">
        {sorted.map((r) => (
          <li key={r.from} className="flex items-center justify-between gap-2 rounded-2xl bg-raised px-4 py-2">
            <span className="tnum font-bold">{bpToPercent(r.bp)}%</span>
            <span className="text-sm text-muted">{isEpoch(r.from) ? tr('من البداية', 'From the start') : `${tr('من', 'From')} ${formatDate(r.from, lang, 'long')}`}</span>
            {!isEpoch(r.from) && <IconButton size="sm" icon={Trash2} label={tr('حذف هذه النسبة', 'Remove this rate')} onClick={() => void save({ partnerRates: settings.partnerRates.filter((x) => x.from !== r.from) })} />}
          </li>
        ))}
      </ul>
    </Block>
  )
}

function PersonalSection() {
  const { tr } = useI18n()
  const { settings, save } = useSettings()
  const [goals, setGoals] = useState<GoalScope | null>(null)
  const rows = useCollection('personalTransactions').items
  const usedIn = useMemo(() => new Set(rows.filter((r) => r.kind === 'income').map((r) => r.categoryId)), [rows])
  const usedEx = useMemo(() => new Set(rows.filter((r) => r.kind === 'expense').map((r) => r.categoryId)), [rows])
  return (
    <div className="space-y-4">
      <Block title={tr('البادجت الشهري', 'Monthly budget')}>
        <Button icon={Target} onClick={() => setGoals('personal')}>{tr('تعديل البادجت', 'Edit budget')}</Button>
      </Block>
      {goals && <GoalsSheet scope={goals} onClose={() => setGoals(null)} />}
      <CategoryEditor title={tr('تصنيفات مصروفك الشخصي', 'Personal spending categories')} list={settings.personalExpenseCategories} used={usedEx} onChange={(personalExpenseCategories) => void save({ personalExpenseCategories })} />
      <CategoryEditor title={tr('مصادر دخلك الشخصي', 'Personal income sources')} list={settings.personalIncomeCategories} used={usedIn} onChange={(personalIncomeCategories) => void save({ personalIncomeCategories })} />
    </div>
  )
}

function ClinicSection() {
  const { tr } = useI18n()
  const { settings, save } = useSettings()
  const [goals, setGoals] = useState<GoalScope | null>(null)
  const income = useCollection('income').items
  const expenses = useCollection('expenses').items
  const usedIn = useMemo(() => new Set(income.map((i) => i.categoryId)), [income])
  const usedEx = useMemo(() => new Set(expenses.map((e) => e.categoryId)), [expenses])
  return (
    <div className="space-y-4">
      <Block title={tr('العيادة', 'Clinic')}>
        <SavedInput label={tr('اسم العيادة', 'Clinic name')} value={settings.clinicName} onSave={(clinicName) => void save({ clinicName })} />
        <SavedInput label={tr('اسم الشريك (اختياري)', 'Partner name (optional)')} value={settings.partnerName} onSave={(partnerName) => void save({ partnerName })} />
        <Row label={tr('العملة', 'Currency')}>{tr('جنيه مصري (EGP)', 'Egyptian pound (EGP)')}</Row>
      </Block>
      <Block title={tr('الهدف والبادجت الشهري', 'Monthly target and budget')}>
        <Button icon={Target} onClick={() => setGoals('clinic')}>{tr('تعديل الهدف والبادجت', 'Edit target and budget')}</Button>
      </Block>
      {goals && <GoalsSheet scope={goals} onClose={() => setGoals(null)} />}
      <PartnerRateEditor />
      <CategoryEditor title={tr('تصنيفات الإيرادات', 'Income categories')} list={settings.incomeCategories} used={usedIn} onChange={(incomeCategories) => void save({ incomeCategories })} />
      <CategoryEditor title={tr('تصنيفات المصروفات', 'Expense categories')} list={settings.expenseCategories} used={usedEx} onChange={(expenseCategories) => void save({ expenseCategories })} />
    </div>
  )
}

// ── Data ──
const fmtBytes = (n: number | null) => {
  if (n === null) return '—'
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  if (n < 1024 ** 3) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 ** 3).toFixed(2)} GB`
}

function RestoreFlow() {
  const { tr } = useI18n()
  const inputRef = useRef<HTMLInputElement>(null)
  const [plan, setPlan] = useState<RestorePlan | null>(null)
  const [mode, setMode] = useState<RestoreMode>('keepNewer')
  const [busy, setBusy] = useState(false)

  const pick = async (file?: File) => {
    if (!file) return
    try {
      setPlan(await planRestore(await file.text()))
    } catch (e) {
      const m = (e as Error).message
      toast(
        m === 'newer-version' ? tr('هذه النسخة من إصدار أحدث من التطبيق.', 'This backup is from a newer app version.')
        : tr('هذا الملف ليس نسخة احتياطية صالحة.', 'This file is not a valid backup.'),
        'error',
      )
    }
  }

  const apply = async () => {
    if (!plan) return
    setBusy(true)
    try {
      const n = await applyRestore(plan, mode)
      toast(tr(`استُعيد ${n} سجل`, `${n} records restored`))
      setPlan(null)
      void refreshCounts()
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Button icon={Upload} onClick={() => inputRef.current?.click()}>{tr('استعادة من ملف', 'Restore from file')}</Button>
      <input ref={inputRef} type="file" accept="application/json,.json" className="hidden" aria-label={tr('ملف النسخة الاحتياطية', 'Backup file')} onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = '' }} />
      {plan && (
        <Sheet
          open
          onClose={() => setPlan(null)}
          title={tr('مراجعة الاستعادة', 'Review restore')}
          footer={<><Button variant="ghost" onClick={() => setPlan(null)}>{tr('إلغاء', 'Cancel')}</Button><Button variant="ink" busy={busy} disabled={plan.errors.length > 0} onClick={() => void apply()}>{tr('تطبيق', 'Apply')}</Button></>}
        >
          <p className="text-[15px] text-muted">{tr('نسخة بتاريخ', 'Backup from')} {plan.exportedAt.slice(0, 10)}</p>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-3xl bg-raised p-3"><div className="tnum text-2xl font-bold">{plan.newCount}</div><div className="text-sm text-muted">{tr('جديد', 'New')}</div></div>
            <div className="rounded-3xl bg-raised p-3"><div className="tnum text-2xl font-bold">{plan.conflictCount}</div><div className="text-sm text-muted">{tr('مختلف', 'Different')}</div></div>
            <div className="rounded-3xl bg-raised p-3"><div className="tnum text-2xl font-bold">{plan.sameCount}</div><div className="text-sm text-muted">{tr('مطابق', 'Identical')}</div></div>
          </div>
          {plan.errors.length > 0 ? (
            <div role="alert" className="rounded-2xl bg-negative/10 p-4 text-sm text-negative">
              <p className="font-bold">{tr('الملف يحتوي على بيانات غير صالحة ولن يُطبق:', 'The file holds invalid data and will not be applied:')}</p>
              <ul className="mt-1 list-disc ps-4" dir="ltr">{plan.errors.slice(0, 5).map((e) => <li key={e}>{e}</li>)}</ul>
            </div>
          ) : plan.conflictCount > 0 ? (
            <Select
              label={tr('عند وجود نسختين مختلفتين من سجل', 'When a record differs between the two')}
              value={mode}
              onChange={(e) => setMode(e.target.value as RestoreMode)}
              options={[
                { value: 'keepNewer', label: tr('احتفظ بالأحدث', 'Keep the newer one') },
                { value: 'addOnly', label: tr('احتفظ بالموجود هنا، وأضف الجديد فقط', 'Keep what is here, only add new') },
                { value: 'replace', label: tr('استخدم نسخة الملف دائمًا', 'Always use the file’s version') },
              ]}
            />
          ) : null}
          <p className="text-sm text-faint">{tr('الاستعادة لا تحذف أي سجل موجود. ملفات الصوت لا تُضمَّن في النسخة الاحتياطية، فنزّل المهم منها من صفحة التسجيلات.', 'Restoring never deletes existing records. Audio files are not included in backups, so download important ones from the Voice page.')}</p>
        </Sheet>
      )}
    </>
  )
}

function DataSection() {
  const { tr, lang } = useI18n()
  const { settings } = useSettings()
  const { localMode } = useAuth()
  const status = useSyncStatus()
  const income = useCollection('income').items
  const expenses = useCollection('expenses').items
  const payments = useCollection('partnerPayments').items
  const [report, setReport] = useState<Awaited<ReturnType<typeof storageReport>> | null>(null)
  const [ops, setOps] = useState<OutboxOp[]>([])
  const [conflicts, setConflicts] = useState<ConflictCopy[]>([])

  const reload = async () => {
    setReport(await storageReport())
    setOps(await listOutbox())
    setConflicts(await listConflicts())
  }
  useEffect(() => void reload(), [status.pending, status.failed, status.conflicts, status.running]) // eslint-disable-line react-hooks/exhaustive-deps

  const failed = ops.filter((o) => o.errorStatus)
  const year = todayStr().slice(0, 4)

  return (
    <div className="space-y-4">
      <Block title={tr('حالة المزامنة', 'Sync status')}>
        {localMode ? (
          <p className="text-[15px] text-muted">{tr(`لا يوجد مشروع Firebase مربوط. كل شيء محفوظ على هذا الجهاز، و${status.pending} تغييرًا ينتظر حتى تربط حسابًا.`, `No Firebase project is connected. Everything is saved on this device, and ${status.pending} changes wait until an account is connected.`)}</p>
        ) : (
          <>
            <Row label={tr('الاتصال', 'Connection')}>{status.online ? <Tag tone="good">{tr('متصل', 'Online')}</Tag> : <Tag tone="warn">{tr('غير متصل', 'Offline')}</Tag>}</Row>
            <Row label={tr('في انتظار الرفع', 'Waiting to upload')}><span className="tnum">{status.pending}</span></Row>
            <Row label={tr('فشل الرفع', 'Failed')}><span className={cx('tnum', status.failed > 0 && 'text-negative')}>{status.failed}</span></Row>
            <Row label={tr('آخر مزامنة ناجحة', 'Last successful sync')}>{status.lastSyncAt ? new Date(status.lastSyncAt).toLocaleString(lang === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB') : '—'}</Row>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button icon={RefreshCw} busy={status.running} onClick={() => void syncNow()}>{tr('مزامنة الآن', 'Sync now')}</Button>
              {status.failed > 0 && <Button variant="ink" icon={RotateCcw} onClick={() => void retryNow()}>{tr('إعادة محاولة الفاشل', 'Retry failed')}</Button>}
            </div>
            {failed.length > 0 && (
              <ul className="space-y-1 text-sm" dir="ltr">
                {failed.slice(0, 10).map((o) => <li key={o.key} className="truncate rounded-xl bg-negative/10 px-3 py-1.5 text-negative">{o.collection}/{o.docId.slice(0, 8)}: {o.errorStatus} (×{o.retryCount})</li>)}
              </ul>
            )}
          </>
        )}
        {conflicts.length > 0 && (
          <div className="rounded-2xl bg-caution/12 p-4">
            <p className="flex items-center gap-2 font-medium text-caution"><AlertTriangle className="size-4" />{tr('نسخ محفوظة من تعارضات', 'Saved copies from conflicts')}</p>
            <p className="mt-1 text-sm text-muted">{tr('عُدّلت هذه السجلات على جهازين. اعتُمد التعديل الأحدث وحُفظت نسختك هنا كي لا تضيع.', 'These records were edited on two devices. The later edit won, and your version was kept here so it is not lost.')}</p>
            <ul className="mt-2 space-y-1.5">
              {conflicts.map((c) => (
                <li key={c.key} className="flex flex-wrap items-center gap-2 rounded-2xl bg-surface px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">{String(c.local.title ?? c.local.description ?? c.docId)}</span>
                  <Button size="sm" onClick={() => void resolveConflict(c.key, true).then(reload)}>{tr('استعادة نسختي', 'Restore mine')}</Button>
                  <Button size="sm" variant="ghost" onClick={() => void resolveConflict(c.key, false).then(reload)}>{tr('تجاهل', 'Dismiss')}</Button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Block>

      <Block title={tr('النسخ الاحتياطي', 'Backup')} hint={tr('ملف JSON كامل يحافظ على العلاقات بين السجلات. احتفظ به في مكان آمن، فهو غير مشفر.', 'A complete JSON file that keeps relationships between records. Keep it somewhere safe: it is not encrypted.')}>
        <div className="flex flex-wrap gap-2">
          <Button variant="ink" icon={Download} onClick={() => void exportBackup().then(() => toast(tr('نُزلت النسخة الاحتياطية', 'Backup downloaded')))}>{tr('تصدير نسخة كاملة', 'Export full backup')}</Button>
          <RestoreFlow />
        </div>
      </Block>

      <Block title={tr('تقارير CSV', 'CSV reports')}>
        <div className="flex flex-wrap gap-2">
          <Button icon={FileSpreadsheet} onClick={() => exportTransactions(income, expenses, settings, { from: '0001-01-01', to: '9999-12-31' })}>{tr('كل المعاملات', 'All transactions')}</Button>
          <Button icon={FileSpreadsheet} onClick={() => exportMonthly(income, expenses, settings, year)}>{tr(`شهري ${year}`, `Monthly ${year}`)}</Button>
          <Button icon={FileSpreadsheet} onClick={() => exportYearly(income, expenses, settings)}>{tr('سنوي', 'Yearly')}</Button>
          <Button icon={FileSpreadsheet} onClick={() => exportPartnerStatement(income, expenses, payments, settings)}>{tr('كشف الشريك', 'Partner statement')}</Button>
        </div>
      </Block>

      <Block title={tr('التخزين على هذا الجهاز', 'Storage on this device')}>
        <Row label={tr('المستخدم', 'Used')}><span className="tnum" dir="ltr">{fmtBytes(report?.usage ?? null)}</span></Row>
        <Row label={tr('المتاح للمتصفح', 'Browser quota')}><span className="tnum" dir="ltr">{fmtBytes(report?.quota ?? null)}</span></Row>
        <Row label={tr('ملفات الصوت والصور', 'Audio and images')}><span className="tnum" dir="ltr">{report?.blobCount ?? 0} · {fmtBytes(report?.blobBytes ?? 0)}</span></Row>
        <Row label={tr('تخزين دائم', 'Persistent storage')}>{report?.persisted ? <Tag tone="good">{tr('مفعّل', 'On')}</Tag> : <Tag tone="warn">{tr('غير مضمون', 'Not guaranteed')}</Tag>}</Row>
        {!report?.persisted && <p className="text-sm text-faint">{tr('قد يمسح المتصفح البيانات المحلية عند امتلاء الجهاز. ثبّت التطبيق واحتفظ بنسخ احتياطية.', 'The browser may clear local data when the device runs out of space. Install the app and keep backups.')}</p>}
      </Block>
    </div>
  )
}

// ── Application ──
function StatusLine({ ok, children }: { ok: boolean | null; children: ReactNode }) {
  const Icon = ok === null ? Clock : ok ? CheckCircle2 : XCircle
  return <span className={cx('inline-flex items-center gap-1.5', ok === null ? 'text-muted' : ok ? 'text-positive' : 'text-muted')}><Icon className="size-4" />{children}</span>
}

function AppSection() {
  const { tr } = useI18n()
  const { canInstall, offlineReady } = usePwa()
  const status = useSyncStatus()
  const standalone = isStandalone()
  return (
    <div className="space-y-4">
      <Block title={tr('التطبيق', 'Application')}>
        <Row label={tr('الإصدار', 'Version')}><span className="tnum">{import.meta.env.VITE_APP_VERSION ?? '1.0.0'}</span></Row>
        <Row label={tr('الاتصال', 'Connection')}><StatusLine ok={status.online}>{status.online ? tr('متصل', 'Online') : tr('غير متصل', 'Offline')}</StatusLine></Row>
        <Row label="Firebase"><StatusLine ok={isFirebaseConfigured}>{isFirebaseConfigured ? (useEmulators ? tr('محاكيات محلية', 'Local emulators') : tr('مُعدّ', 'Configured')) : tr('غير مُعدّ: وضع محلي', 'Not configured: local mode')}</StatusLine></Row>
        <Row label={tr('تخزين الصوت السحابي', 'Cloud audio storage')}><StatusLine ok={isCloudStorageEnabled}>{isCloudStorageEnabled ? tr('مفعّل', 'On') : tr('معطل: الصوت على الجهاز', 'Off: audio stays on device')}</StatusLine></Row>
        <Row label={tr('جاهز دون إنترنت', 'Offline ready')}><StatusLine ok={offlineReady || standalone ? true : null}>{offlineReady || standalone ? tr('نعم', 'Yes') : tr('بعد أول تحميل كامل', 'After first full load')}</StatusLine></Row>
      </Block>
      <Block title={tr('تثبيت التطبيق', 'Install the app')}>
        {standalone ? <p className="text-[15px] text-positive">{tr('التطبيق مثبت وتعمل الآن من نسخته المثبتة.', 'The app is installed and you are using it now.')}</p> : canInstall ? (
          <Button variant="primary" icon={Download} capsule onClick={() => void promptInstall()}>{tr('تثبيت', 'Install')}</Button>
        ) : isIos() ? (
          <p className="flex items-start gap-2 text-[15px] text-muted"><Share className="mt-0.5 size-4.5 shrink-0" />{tr('في Safari: اضغط زر المشاركة، ثم «إضافة إلى الشاشة الرئيسية».', 'In Safari: tap the Share button, then “Add to Home Screen”.')}</p>
        ) : (
          <p className="text-[15px] text-muted">{tr('من قائمة المتصفح اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».', 'From the browser menu choose “Install app” or “Add to Home Screen”.')}</p>
        )}
      </Block>
      <Block title={tr('اختصارات لوحة المفاتيح', 'Keyboard shortcuts')}>
        <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 text-[15px]">
          {([
            ['Ctrl K', tr('بحث شامل', 'Search everything')],
            ['/', tr('بحث شامل', 'Search everything')],
            ['A', tr('إضافة سريعة', 'Quick add')],
            ['G H', tr('الرئيسية', 'Home')],
            ['G C', tr('مالية العيادة', 'Clinic Finance')],
            ['G P', tr('المالية الشخصية', 'Personal Finance')],
            ['G T', tr('المهام', 'Tasks')],
            ['G N', tr('الملاحظات', 'Notes')],
            ['G I', tr('أفكار المحتوى', 'Content Ideas')],
            ['G V', tr('الملاحظات الصوتية', 'Voice Notes')],
            ['G L', tr('خزنة الروابط', 'Link Vault')],
            ['G D', tr('الزاد اليومي', 'Daily Deen')],
            ['G M', tr('بوصلة الحياة', 'Life Compass')],
          ] as const).map(([keys, label]) => (
            <div key={keys} className="contents">
              <dt><kbd dir="ltr" className="rounded-md bg-raised px-2 py-0.5 text-sm">{keys}</kbd></dt>
              <dd className="text-muted">{label}</dd>
            </div>
          ))}
        </dl>
      </Block>
      <Block title={tr('الخصوصية', 'Privacy')}>
        <ul className="list-disc space-y-1 ps-4 text-[15px] text-muted">
          <li>{tr('بياناتك في حسابك فقط، وتحميها قواعد أمان Firebase على الخادم.', 'Your data lives only in your account, protected by Firebase Security Rules on the server.')}</li>
          <li>{tr('لا تحليلات، ولا إعلانات، ولا تتبع.', 'No analytics, no ads, no tracking.')}</li>
          <li>{tr('المحفوظ على الجهاز غير مشفر، فلا تستخدم حسابك على أجهزة مشتركة.', 'Data saved on the device is not encrypted, so avoid using your account on shared devices.')}</li>
          <li>{tr('خزنة البيانات ليست مدير كلمات مرور.', 'The Data Vault is not a password manager.')}</li>
          <li>{tr('أيقونات الروابط تُطلب من الموقع المحفوظ نفسه، لا من طرف ثالث.', 'Link icons are requested from the saved site itself, not a third party.')}</li>
        </ul>
      </Block>
      <Block title={tr('الاعتمادات', 'Credits')}>
        <p className="text-sm text-muted">{tr('خط ثمانية من ثمانية للنشر والتوزيع. القرآن من AlQuran Cloud بالرسم العثماني، والتفسير الميسر من مجمع الملك فهد، والحديث من مشروعي hadith-api وhadith-json. خط Amiri Quran برخصة OFL.', 'Thmanyah typeface by thmanyah Publishing and Distribution. Quran in Uthmani script via AlQuran Cloud, Al-Tafsir Al-Muyassar by King Fahd Complex, hadith from the hadith-api and hadith-json projects. Amiri Quran font under the OFL.')}</p>
      </Block>
    </div>
  )
}

export default function SettingsPage() {
  const { tr } = useI18n()
  const [params, setParams] = useSearchParams()
  const section = (params.get('section') as Section) || 'account'
  return (
    <div className="fade-in mx-auto max-w-3xl">
      <PageHeader title={tr('الإعدادات', 'Settings')} />
      <Segmented
        className="mb-4"
        label={tr('أقسام الإعدادات', 'Settings sections')}
        value={section}
        onChange={(s) => setParams({ section: s }, { replace: true })}
        options={[
          { value: 'account', label: tr('الحساب', 'Account') },
          { value: 'general', label: tr('عام', 'General'), icon: Languages },
          { value: 'clinic', label: tr('العيادة', 'Clinic') },
          { value: 'personal', label: tr('الشخصية', 'Personal') },
          { value: 'data', label: tr('البيانات', 'Data') },
          { value: 'app', label: tr('التطبيق', 'App') },
        ]}
      />
      {section === 'account' && <AccountSection />}
      {section === 'general' && <GeneralSection />}
      {section === 'clinic' && <ClinicSection />}
      {section === 'personal' && <PersonalSection />}
      {section === 'data' && <DataSection />}
      {section === 'app' && <AppSection />}
    </div>
  )
}

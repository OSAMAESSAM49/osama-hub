import {
  useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode,
  type SelectHTMLAttributes, type TextareaHTMLAttributes,
} from 'react'
import { AlertCircle, Check, CheckCheck, ChevronLeft, Clock, CloudOff, Loader2, X, type LucideIcon } from 'lucide-react'
import { useI18n } from '@/i18n'
import type { SyncState } from '@/types/models'
import { isFirebaseConfigured } from '@/services/firebase/config'

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

// ── Buttons ──
type BtnVariant = 'primary' | 'ink' | 'soft' | 'ghost' | 'danger'
const VARIANTS: Record<BtnVariant, string> = {
  primary: 'bg-lime text-charcoal hover:bg-lime-deep',
  ink: 'bg-ink text-canvas hover:opacity-90',
  soft: 'bg-raised text-ink hover:bg-line',
  ghost: 'text-ink hover:bg-raised',
  danger: 'bg-negative text-white hover:opacity-90 dark:text-charcoal',
}

interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: BtnVariant
  icon?: LucideIcon
  /** The signature pill from the references: the icon sits in a dark circle at the end. */
  capsule?: boolean
  size?: 'sm' | 'md'
  busy?: boolean
}

export function Button({ variant = 'soft', icon: Icon, capsule, size = 'md', busy, className, children, disabled, ...rest }: BtnProps) {
  return (
    <button
      type="button"
      disabled={disabled || busy}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-full font-medium whitespace-nowrap transition select-none disabled:opacity-50',
        size === 'md' ? 'min-h-12 px-5 text-[15px]' : 'min-h-10 px-4 text-sm',
        capsule && 'pe-1.5',
        VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {busy ? <Loader2 className="size-4 animate-spin" /> : !capsule && Icon ? <Icon className="size-4.5" /> : null}
      {children}
      {capsule && Icon && (
        <span className={cx('grid place-items-center rounded-full bg-charcoal text-white', size === 'md' ? 'size-9' : 'size-7')}>
          <Icon className="size-4.5" />
        </span>
      )}
    </button>
  )
}

interface IconBtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon
  label: string
  active?: boolean
  tone?: 'plain' | 'soft' | 'surface'
  size?: 'sm' | 'md'
}

export function IconButton({ icon: Icon, label, active, tone = 'plain', size = 'md', className, ...rest }: IconBtnProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx(
        'grid shrink-0 place-items-center rounded-full transition disabled:opacity-40',
        size === 'md' ? 'size-11' : 'size-9',
        tone === 'soft' && 'bg-raised hover:bg-line',
        tone === 'surface' && 'bg-surface hover:bg-raised',
        tone === 'plain' && 'hover:bg-raised',
        active && 'text-accent',
        className,
      )}
      {...rest}
    >
      <Icon className={cx(size === 'md' ? 'size-5' : 'size-4.5', active && 'fill-current')} />
    </button>
  )
}

// ── Form fields ──
export function Field({ label, error, hint, children, className }: {
  label?: string
  error?: string | null
  hint?: string
  children: (id: string) => ReactNode
  className?: string
}) {
  const id = useId()
  return (
    <div className={cx('min-w-0', className)}>
      {label && (
        <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-muted">
          {label}
        </label>
      )}
      {children(id)}
      {hint && !error && <p className="mt-1.5 text-xs text-faint">{hint}</p>}
      {error && (
        <p role="alert" className="mt-1.5 flex items-center gap-1 text-sm text-negative">
          <AlertCircle className="size-3.5 shrink-0" />
          {error}
        </p>
      )}
    </div>
  )
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & { label?: string; error?: string | null; hint?: string }
export function Input({ label, error, hint, className, ...rest }: InputProps) {
  return (
    <Field label={label} error={error} hint={hint} className={className}>
      {(id) => <input id={id} className="field" aria-invalid={!!error} dir={rest.value ? 'auto' : undefined} data-autofocus={rest.autoFocus ? '' : undefined} {...rest} />}
    </Field>
  )
}

type AreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string; error?: string | null; hint?: string }
export function Textarea({ label, error, hint, className, rows = 3, ...rest }: AreaProps) {
  return (
    <Field label={label} error={error} hint={hint} className={className}>
      {(id) => <textarea id={id} rows={rows} className="field resize-y" dir={rest.value ? 'auto' : undefined} {...rest} />}
    </Field>
  )
}

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string
  error?: string | null
  options: { value: string; label: string }[]
}
export function Select({ label, error, options, className, ...rest }: SelectProps) {
  return (
    <Field label={label} error={error} className={className}>
      {(id) => (
        <select id={id} className="field" {...rest}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  )
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3">
      <span className="text-[15px]">{label}</span>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span className="relative h-7 w-12 shrink-0 rounded-full bg-raised transition peer-checked:bg-accent peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent after:absolute after:inset-y-1 after:start-1 after:size-5 after:rounded-full after:bg-white after:shadow after:transition-all peer-checked:after:start-6" />
    </label>
  )
}

/** Free tags: Enter or comma adds one, and existing tags are offered as suggestions. */
export function TagInput({ value, onChange, label, suggestions = [] }: {
  value: string[]
  onChange: (v: string[]) => void
  label?: string
  suggestions?: string[]
}) {
  const { tr } = useI18n()
  const [draft, setDraft] = useState('')
  const listId = useId()
  const add = () => {
    const t = draft.trim().replace(/^#/, '')
    if (t && !value.includes(t)) onChange([...value, t])
    setDraft('')
  }
  return (
    <Field label={label ?? tr('الوسوم', 'Tags')}>
      {(id) => (
        <div className="field flex flex-wrap items-center gap-1.5 !py-2">
          {value.map((t) => (
            <span key={t} className="inline-flex items-center gap-1 rounded-full bg-surface py-1 ps-3 pe-1 text-sm">
              {t}
              <button type="button" aria-label={`${tr('إزالة', 'Remove')} ${t}`} onClick={() => onChange(value.filter((x) => x !== t))} className="grid size-5 place-items-center rounded-full hover:bg-raised">
                <X className="size-3" />
              </button>
            </span>
          ))}
          <input
            id={id}
            list={listId}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',' || e.key === '،') {
                e.preventDefault()
                add()
              } else if (e.key === 'Backspace' && !draft && value.length) onChange(value.slice(0, -1))
            }}
            onBlur={add}
            placeholder={value.length ? '' : tr('اكتب ثم Enter', 'Type, then Enter')}
            className="min-w-24 flex-1 bg-transparent outline-none"
            dir={draft ? 'auto' : undefined}
          />
          <datalist id={listId}>
            {suggestions.filter((s) => !value.includes(s)).map((s) => <option key={s} value={s} />)}
          </datalist>
        </div>
      )}
    </Field>
  )
}

/** Free text with suggestions from values already used. */
export function ComboInput({ label, value, onChange, suggestions, placeholder }: {
  label: string
  value: string
  onChange: (v: string) => void
  suggestions: string[]
  placeholder?: string
}) {
  const listId = useId()
  return (
    <Field label={label}>
      {(id) => (
        <>
          <input id={id} list={listId} className="field" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} dir={value ? 'auto' : undefined} />
          <datalist id={listId}>{[...new Set(suggestions)].map((s) => <option key={s} value={s} />)}</datalist>
        </>
      )}
    </Field>
  )
}

// ── Selection ──
export function Segmented<T extends string>({ value, onChange, options, label, className }: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string; icon?: LucideIcon; count?: number }[]
  label: string
  className?: string
}) {
  return (
    <div role="tablist" aria-label={label} className={cx('no-scrollbar flex max-w-full gap-1 overflow-x-auto rounded-full bg-raised p-1', className)}>
      {options.map((o) => {
        const on = o.value === value
        const Icon = o.icon
        return (
          <button
            key={o.value}
            role="tab"
            type="button"
            aria-selected={on}
            aria-label={Icon && !o.label ? o.value : undefined}
            onClick={() => onChange(o.value)}
            className={cx(
              'inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-full px-3.5 text-sm font-medium whitespace-nowrap transition',
              on ? 'bg-ink text-canvas' : 'text-muted hover:text-ink',
            )}
          >
            {Icon && <Icon className="size-4" />}
            {o.label}
            {o.count !== undefined && <span className="tnum text-xs opacity-70">{o.count}</span>}
          </button>
        )
      })}
    </div>
  )
}

export function Chip({ children, active, onClick, className }: { children: ReactNode; active?: boolean; onClick?: () => void; className?: string }) {
  const cls = cx(
    'inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium whitespace-nowrap transition',
    active ? 'bg-ink text-canvas' : 'bg-raised text-muted',
    onClick && !active && 'hover:text-ink',
    className,
  )
  return onClick ? (
    <button type="button" aria-pressed={!!active} onClick={onClick} className={cls}>
      {children}
    </button>
  ) : (
    <span className={cls}>{children}</span>
  )
}

export function Tag({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'good' | 'bad' | 'warn' | 'accent' }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap',
        tone === 'neutral' && 'bg-raised text-muted',
        tone === 'good' && 'bg-positive/12 text-positive',
        tone === 'bad' && 'bg-negative/12 text-negative',
        tone === 'warn' && 'bg-caution/14 text-caution',
        tone === 'accent' && 'bg-accent/12 text-accent',
      )}
    >
      {children}
    </span>
  )
}

export function ChipRow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0', className)}>{children}</div>
}

// ── Layout helpers ──
export function PageHeader({ title, subtitle, actions, back }: { title: string; subtitle?: string; actions?: ReactNode; back?: () => void }) {
  const { tr } = useI18n()
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        {back && <IconButton icon={ChevronLeft} label={tr('رجوع', 'Back')} tone="soft" onClick={back} className="ltr:rotate-0 rtl:rotate-180" />}
        <div className="min-w-0">
          <h1 className="font-display text-[1.9rem] leading-tight font-bold sm:text-[2.4rem]">{title}</h1>
          {subtitle && <p className="mt-1 text-[15px] text-muted">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="text-lg font-bold">{children}</h2>
      {action}
    </div>
  )
}

export function EmptyState({ icon: Icon, title, body, action }: { icon: LucideIcon; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="card fade-in flex flex-col items-center gap-3 px-6 py-12 text-center">
      <span className="grid size-16 place-items-center rounded-full bg-raised">
        <Icon className="size-7 text-muted" />
      </span>
      <h3 className="text-lg font-bold">{title}</h3>
      {body && <p className="max-w-sm text-[15px] text-muted">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton h-20 !rounded-3xl" />
      ))}
    </div>
  )
}

export function ProgressBar({ value, label, tone = 'lime', height = 'h-3' }: { value: number; label?: string; tone?: 'lime' | 'cobalt' | 'gold' | 'ink'; height?: string }) {
  const v = Math.max(0, Math.min(100, Math.round(value)))
  return (
    <div role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100} aria-label={label} className={cx('w-full overflow-hidden rounded-full bg-raised', height)}>
      <div
        className={cx(
          'hatch h-full rounded-full transition-all duration-500',
          tone === 'lime' && 'bg-lime-deep dark:bg-lime',
          tone === 'cobalt' && 'bg-cobalt',
          tone === 'gold' && 'bg-gold',
          tone === 'ink' && 'bg-ink',
        )}
        style={{ width: `${v}%` }}
      />
    </div>
  )
}

// ── Sync status ──
export function SyncBadge({ state, compact }: { state: SyncState; compact?: boolean }) {
  const { tr } = useI18n()
  // Without Firebase, data cannot leave the device, so it is only ever saved locally.
  const s: SyncState = !isFirebaseConfigured ? 'local' : state
  const map: Record<SyncState, { icon: LucideIcon; text: string; cls: string }> = {
    local: { icon: CloudOff, text: tr('محفوظ محليًا', 'Saved locally'), cls: 'text-faint' },
    pending: { icon: Clock, text: tr('في انتظار المزامنة', 'Waiting to sync'), cls: 'text-caution' },
    synced: { icon: CheckCheck, text: tr('تمت المزامنة', 'Synced'), cls: 'text-positive' },
    failed: { icon: AlertCircle, text: tr('فشلت المزامنة', 'Sync failed'), cls: 'text-negative' },
  }
  const { icon: Icon, text, cls } = map[s]
  return (
    <span className={cx('relative inline-flex shrink-0 items-center gap-1 text-xs', cls)} title={text}>
      <Icon className="size-3.5" />
      {compact ? <span className="sr-only">{text}</span> : text}
    </span>
  )
}

// ── Sheet: a native dialog gives focus trapping, Esc handling and the top layer for free ──
export function Sheet({ open, onClose, title, children, footer, wide }: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const { tr } = useI18n()

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) {
      d.showModal()
      // showModal would focus the first control (the close button), so focus is moved deliberately:
      // to the field that asked for it, otherwise to the sheet itself.
      const target = d.querySelector<HTMLElement>('[data-autofocus]') ?? d.querySelector<HTMLElement>('[data-sheet-body]')
      target?.focus()
    }
    if (!open && d.open) d.close()
  }, [open])

  if (!open) return null
  return (
    <dialog
      ref={ref}
      className={cx(
        'sheet safe-bottom m-0 mt-auto max-h-[92dvh] w-full max-w-none overflow-hidden rounded-t-[2rem] bg-surface shadow-2xl sm:m-auto sm:rounded-[2rem]',
        wide ? 'sm:max-w-3xl' : 'sm:max-w-xl',
      )}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose()
      }}
    >
      <div className="flex max-h-[92dvh] flex-col outline-none" data-sheet-body tabIndex={-1}>
        <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-3">
          <h2 className="text-xl font-bold">{title}</h2>
          <IconButton icon={X} label={tr('إغلاق', 'Close')} tone="soft" size="sm" onClick={onClose} />
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 pb-5">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </dialog>
  )
}

export function FormFooter({ onCancel, saveLabel, busy, onDelete, deleteLabel }: {
  onCancel: () => void
  saveLabel?: string
  busy?: boolean
  onDelete?: () => void
  deleteLabel?: string
}) {
  const { tr } = useI18n()
  return (
    <>
      {onDelete && (
        <Button variant="ghost" className="me-auto !text-negative" onClick={onDelete}>
          {deleteLabel ?? tr('حذف', 'Delete')}
        </Button>
      )}
      <Button variant="ghost" onClick={onCancel}>
        {tr('إلغاء', 'Cancel')}
      </Button>
      <Button variant="primary" type="submit" form="sheet-form" icon={Check} capsule busy={busy}>
        {saveLabel ?? tr('حفظ', 'Save')}
      </Button>
    </>
  )
}

export function Stat({ label, value, tone, sub }: { label: string; value: string; tone?: 'good' | 'bad'; sub?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-sm text-muted">{label}</div>
      <div className={cx('tnum truncate text-xl font-bold', tone === 'good' && 'text-positive', tone === 'bad' && 'text-negative')}>{value}</div>
      {sub && <div className="text-xs text-faint">{sub}</div>}
    </div>
  )
}

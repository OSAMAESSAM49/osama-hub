import { useEffect, useRef, useSyncExternalStore } from 'react'
import { AlertCircle, CheckCircle2, Info } from 'lucide-react'
import { tr, useI18n } from '@/i18n'
import { newId } from '@/utils/text'
import { Button, cx, Sheet } from './ui'

// ── Toasts ──
type ToastKind = 'ok' | 'error' | 'info'
interface ToastItem {
  id: string
  kind: ToastKind
  text: string
  action?: { label: string; run: () => void }
}
let toasts: ToastItem[] = []
const toastListeners = new Set<() => void>()
const emitToasts = () => toastListeners.forEach((l) => l())

export function toast(text: string, kind: ToastKind = 'ok', action?: ToastItem['action']) {
  const id = newId()
  toasts = [...toasts.slice(-2), { id, kind, text, action }]
  emitToasts()
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id)
    emitToasts()
  }, action ? 7000 : kind === 'error' ? 6000 : 3000)
}

export function Toaster() {
  const items = useSyncExternalStore(
    (l) => {
      toastListeners.add(l)
      return () => toastListeners.delete(l)
    },
    () => toasts,
  )
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    // Re-entering the top layer keeps toasts above any open dialog.
    const el = ref.current
    if (!el) return
    if (el.matches(':popover-open')) el.hidePopover()
    if (items.length) el.showPopover()
  }, [items])
  return (
    <div
      ref={ref}
      popover="manual"
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-auto bottom-24 m-0 w-full bg-transparent p-0 lg:bottom-6"
    >
      <div className="flex flex-col items-center gap-2 px-4">
        {items.map((t) => {
          const Icon = t.kind === 'ok' ? CheckCircle2 : t.kind === 'error' ? AlertCircle : Info
          return (
            <div key={t.id} className="fade-in pointer-events-auto flex max-w-md items-center gap-2.5 rounded-full bg-ink py-2.5 ps-4 pe-5 text-[15px] text-canvas shadow-xl">
              <Icon className={cx('size-5 shrink-0', t.kind === 'error' && 'text-negative')} />
              <span className="min-w-0">{t.text}</span>
              {t.action && (
                <button type="button" onClick={t.action.run} className="ms-1 font-bold underline underline-offset-2">
                  {t.action.label}
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Confirmation ──
interface ConfirmRequest {
  title: string
  body?: string
  confirmLabel?: string
  danger?: boolean
  resolve: (ok: boolean) => void
}
let confirmReq: ConfirmRequest | null = null
const confirmListeners = new Set<() => void>()

/** A promise-based confirmation dialog for destructive actions. */
export function confirmAction(opts: Omit<ConfirmRequest, 'resolve'>): Promise<boolean> {
  return new Promise((resolve) => {
    confirmReq = { ...opts, resolve }
    confirmListeners.forEach((l) => l())
  })
}

export const confirmDelete = (what: string, body?: string) =>
  confirmAction({ title: tr(`حذف ${what}؟`, `Delete ${what}?`), body, confirmLabel: tr('حذف', 'Delete'), danger: true })

export function ConfirmHost() {
  const { tr: t } = useI18n()
  const req = useSyncExternalStore(
    (l) => {
      confirmListeners.add(l)
      return () => confirmListeners.delete(l)
    },
    () => confirmReq,
  )
  const close = (ok: boolean) => {
    req?.resolve(ok)
    confirmReq = null
    confirmListeners.forEach((l) => l())
  }
  return (
    <Sheet
      open={!!req}
      onClose={() => close(false)}
      title={req?.title ?? ''}
      footer={
        <>
          <Button variant="ghost" onClick={() => close(false)}>
            {t('إلغاء', 'Cancel')}
          </Button>
          <Button variant={req?.danger ? 'danger' : 'ink'} onClick={() => close(true)}>
            {req?.confirmLabel ?? t('تأكيد', 'Confirm')}
          </Button>
        </>
      }
    >
      {req?.body && <p className="text-[15px] text-muted">{req.body}</p>}
    </Sheet>
  )
}

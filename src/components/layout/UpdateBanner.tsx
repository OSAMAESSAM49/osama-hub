import { RefreshCw, X } from 'lucide-react'
import { IconButton } from '@/components/common/ui'
import { useI18n } from '@/i18n'
import { dismissUpdate, installUpdate, usePwa } from '@/services/pwa'

/** Updates never reload on their own, because that could interrupt a recording or an unsaved form. */
export function UpdateBanner() {
  const { tr } = useI18n()
  const { updateReady } = usePwa()
  if (!updateReady) return null
  return (
    <div role="status" className="mx-auto w-full max-w-6xl px-4 pb-2 lg:px-8">
      <div className="flex items-center gap-3 rounded-full bg-cobalt py-1.5 ps-5 pe-1.5 text-white">
        <span className="min-w-0 flex-1 text-[15px]">{tr('نسخة جديدة جاهزة.', 'A new version is ready.')}</span>
        <button type="button" onClick={() => void installUpdate()} className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-white px-4 text-sm font-medium text-charcoal">
          <RefreshCw className="size-4" /> {tr('تحديث', 'Update')}
        </button>
        <IconButton icon={X} label={tr('لاحقًا', 'Later')} size="sm" className="hover:!bg-white/20" onClick={dismissUpdate} />
      </div>
    </div>
  )
}

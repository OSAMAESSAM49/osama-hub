import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { History, ImagePlus, Trash2 } from 'lucide-react'
import { confirmDelete, toast } from '@/components/common/feedback'
import { Button, Sheet, SyncBadge } from '@/components/common/ui'
import { useSettings } from '@/hooks/useSettings'
import { useI18n } from '@/i18n'
import { repo, useCollection, getOne, ensureLoaded } from '@/services/data/store'
import { deleteBlob, getBlob, putBlob } from '@/services/storage/blobs'
import type { LifeVision, Stored, VisionRevision } from '@/types/models'
import { formatDate } from '@/utils/dates'
import { htmlToPlain } from '@/utils/text'

const RichText = lazy(() => import('@/components/forms/RichText'))

const SECTIONS: [string, string, string][] = [
  ['lifestyle', 'نمط الحياة المثالي', 'Ideal lifestyle'],
  ['identity', 'الهوية المهنية', 'Professional identity'],
  ['ambitions', 'طموحات المهنة والأعمال', 'Career and business ambitions'],
  ['family', 'العلاقة مع الزوجة والأبناء', 'Relationship with wife and children'],
  ['experiences', 'التجارب الأسرية', 'Family experiences'],
  ['spiritual', 'التطلعات الروحية', 'Spiritual aspirations'],
  ['financial', 'الطموحات المالية', 'Financial ambitions'],
  ['growth', 'النمو الشخصي', 'Personal growth'],
  ['health', 'الصحة ونمط الحياة', 'Health and lifestyle'],
  ['values', 'القيم الجوهرية', 'Core values'],
  ['legacy', 'بماذا تريد أن تُذكر؟', 'What you want to be remembered for'],
]

const HISTORY_GAP_MS = 60 * 60 * 1000
const MAX_HISTORY = 12

/** Resizes an image in the browser, so that a phone photo does not fill local storage. */
async function shrinkImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode'))), 'image/jpeg', 0.82))
}

function SectionEditor({ sectionKey, title, record }: { sectionKey: string; title: string; record?: Stored<LifeVision> }) {
  const { tr, lang } = useI18n()
  const { settings } = useSettings()
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pending = useRef<{ content: string; plain: string } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const imageKey = record?.imageKey ?? null
  const id = `vision-${sectionKey}`

  const defaults = (): LifeVision => ({ id, createdAt: '', updatedAt: '', sectionKey, content: '', plain: '', imageKey: null, history: [] })

  const flush = async () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    const p = pending.current
    if (!p) return
    pending.current = null
    await ensureLoaded('lifeVision')
    const current = getOne('lifeVision', id)
    let history: VisionRevision[] = current?.history ?? []
    // Keeps a dated snapshot at most once an hour, so that history stays small and meaningful.
    if (current?.content && current.content !== p.content) {
      const lastAt = history[0]?.at ? new Date(history[0].at).getTime() : 0
      if (Date.now() - lastAt > HISTORY_GAP_MS) history = [{ at: current.updatedAt, content: current.content }, ...history].slice(0, MAX_HISTORY)
    }
    await repo.upsert('lifeVision', id, { ...p, history }, defaults())
  }

  useEffect(() => () => void flush(), []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let url: string | null = null
    let live = true
    if (imageKey) {
      void getBlob(imageKey).then((b) => {
        if (b && live) {
          url = URL.createObjectURL(b)
          setImageUrl(url)
        }
      })
    } else setImageUrl(null)
    return () => {
      live = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [imageKey])

  const pickImage = async (file?: File) => {
    if (!file) return
    try {
      const key = `image:${id}`
      await putBlob(key, await shrinkImage(file))
      await repo.upsert('lifeVision', id, { imageKey: key }, defaults())
    } catch {
      toast(tr('تعذرت إضافة الصورة', 'Could not add the image'), 'error')
    }
  }

  const removeImage = async () => {
    if (!imageKey || !(await confirmDelete(tr('الصورة', 'the image')))) return
    await deleteBlob(imageKey)
    await repo.upsert('lifeVision', id, { imageKey: null }, defaults())
  }

  return (
    <section className="border-t border-line pt-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-2xl font-bold">{title}</h2>
        <div className="flex items-center gap-1">
          {record && <SyncBadge state={record._sync} compact />}
          {!!record?.history.length && <Button size="sm" variant="ghost" icon={History} onClick={() => setShowHistory(true)}>{tr('السجل', 'History')}</Button>}
          {!imageKey && <Button size="sm" variant="ghost" icon={ImagePlus} onClick={() => inputRef.current?.click()}>{tr('صورة', 'Image')}</Button>}
          <input ref={inputRef} type="file" accept="image/*" className="hidden" aria-label={tr('إضافة صورة', 'Add image')} onChange={(e) => { void pickImage(e.target.files?.[0]); e.target.value = '' }} />
        </div>
      </div>
      {imageUrl && (
        <figure className="relative mb-3">
          <img src={imageUrl} alt={title} className="max-h-80 w-full rounded-3xl object-cover" />
          <Button size="sm" className="absolute end-2 top-2 !bg-charcoal/70 !text-white" icon={Trash2} onClick={() => void removeImage()}>{tr('إزالة', 'Remove')}</Button>
        </figure>
      )}
      <Suspense fallback={<div className="skeleton h-40" />}>
        <RichText
          serif
          value={record?.content ?? ''}
          placeholder={tr('اكتب بحرية…', 'Write freely…')}
          onChange={(content, plain) => {
            pending.current = { content, plain }
            if (timer.current) clearTimeout(timer.current)
            timer.current = setTimeout(() => void flush(), 800)
          }}
        />
      </Suspense>
      {showHistory && record && (
        <Sheet open onClose={() => setShowHistory(false)} title={`${tr('سجل', 'History of')} ${title}`} wide>
          <ul className="space-y-3">
            {record.history.map((h) => (
              <li key={h.at} className="rounded-3xl bg-raised p-4">
                <div className="mb-1 text-sm text-faint">{formatDate(h.at, lang, settings.dateFormat)}</div>
                <p className="font-reading whitespace-pre-line" dir="auto">{htmlToPlain(h.content)}</p>
                <Button
                  size="sm"
                  className="mt-2"
                  onClick={() => {
                    void repo.upsert('lifeVision', id, { content: h.content, plain: htmlToPlain(h.content) }, defaults())
                    setShowHistory(false)
                    toast(tr('استُعيدت هذه النسخة', 'This version was restored'))
                  }}
                >
                  {tr('استعادة هذه النسخة', 'Restore this version')}
                </Button>
              </li>
            ))}
          </ul>
        </Sheet>
      )}
    </section>
  )
}

export default function VisionPage() {
  const { tr, lang } = useI18n()
  const { items, loading } = useCollection('lifeVision')
  return (
    <div className="mx-auto max-w-3xl">
      <header className="pt-2 pb-8 text-center sm:pt-6">
        <p className="text-sm font-medium text-muted">{tr('رؤية الحياة', 'Life vision')}</p>
        <h1 className="mx-auto mt-3 max-w-2xl font-display text-4xl leading-tight font-bold sm:text-6xl">{tr('أين تريد أن تكون حياتك في 2036؟', 'Where do you want your life to be in 2036?')}</h1>
        <p className="mx-auto mt-4 max-w-lg text-[15px] text-muted">{tr('لا إجابات جاهزة هنا. اكتب ما تريده أنت، وعدّله متى تغيّرت. يُحفظ كل شيء تلقائيًا.', 'There are no ready answers here. Write what you want, and change it whenever you change. Everything saves automatically.')}</p>
      </header>
      {loading ? <div className="skeleton h-64" /> : (
        <div className="space-y-8">
          {SECTIONS.map(([key, ar, en]) => (
            <SectionEditor key={key} sectionKey={key} title={lang === 'ar' ? ar : en} record={items.find((v) => v.sectionKey === key)} />
          ))}
        </div>
      )}
    </div>
  )
}

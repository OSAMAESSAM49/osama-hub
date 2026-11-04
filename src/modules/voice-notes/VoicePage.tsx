import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertCircle, BookHeart, Cloud, CloudOff, CloudUpload, Download, Mic, Pause, Pencil, Play, Plus, Search, Smartphone, Star } from 'lucide-react'
import { confirmDelete, toast } from '@/components/common/feedback'
import {
  Button, Chip, ChipRow, EmptyState, FormFooter, IconButton, Input, ListSkeleton, PageHeader, Select, Sheet, SyncBadge, Tag, TagInput, Textarea,
} from '@/components/common/ui'
import { useParamOnce } from '@/hooks/useParamOnce'
import { useSettings } from '@/hooks/useSettings'
import { useI18n } from '@/i18n'
import { voiceCategoryLabel, voiceCategoryOptions } from '@/i18n/labels'
import { repo, useCollection } from '@/services/data/store'
import { isCloudStorageEnabled } from '@/services/firebase/config'
import { deleteBlob, deleteCloudFile, getBlob, hasBlob, putBlob, resumeUploads, uploadVoice, useUploadProgress, voiceDownloadUrl, voiceKey } from '@/services/storage/blobs'
import type { Stored, VoiceNote } from '@/types/models'
import { downloadBlob } from '@/utils/csv'
import { formatDate, formatDuration, formatTime, todayStr } from '@/utils/dates'
import { matches, newId } from '@/utils/text'
import { Recorder, type Recording } from './Recorder'

/** Audio reaches IndexedDB first. Metadata is only written once the local copy exists. */
async function persistRecording(recording: Recording, data: Pick<VoiceNote, 'title' | 'description' | 'category' | 'tags'>) {
  const id = newId()
  await putBlob(voiceKey(id), recording.blob)
  const saved = await repo.create('voiceNotes', {
    ...data, id, durationSec: recording.durationSec, recordedAt: new Date().toISOString(), favorite: false, mimeType: recording.mimeType, sizeBytes: recording.blob.size,
    storagePath: null, uploadState: isCloudStorageEnabled ? 'queued' : 'localOnly', uploadError: null,
  })
  if (isCloudStorageEnabled && navigator.onLine) void uploadVoice(saved)
}

function Player({ note }: { note: Stored<VoiceNote> }) {
  const { tr } = useI18n()
  const audio = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [src, setSrc] = useState<string | null>(null)
  const [state, setState] = useState<'idle' | 'loading' | 'missing'>('idle')
  const urlRef = useRef<string | null>(null)
  const duration = note.durationSec

  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current) }, [])

  const load = async () => {
    setState('loading')
    const blob = await getBlob(voiceKey(note.id))
    if (blob) {
      urlRef.current = URL.createObjectURL(blob)
      setSrc(urlRef.current)
      setState('idle')
      return urlRef.current
    }
    if (note.storagePath && isCloudStorageEnabled) {
      try {
        const url = await voiceDownloadUrl(note.storagePath)
        setSrc(url)
        setState('idle')
        return url
      } catch {
        /* Falls through to the missing state. */
      }
    }
    setState('missing')
    return null
  }

  const toggle = async () => {
    const a = audio.current
    if (!a) return
    if (playing) {
      a.pause()
      return
    }
    if (!src) {
      const url = await load()
      if (!url) return
      a.src = url
    }
    await a.play().catch(() => undefined)
  }

  return (
    <div className="flex items-center gap-2">
      <button type="button" aria-label={playing ? tr('إيقاف مؤقت', 'Pause') : tr('تشغيل', 'Play')} onClick={() => void toggle()} className="grid size-12 shrink-0 place-items-center rounded-full bg-ink text-canvas transition active:scale-95">
        {playing ? <Pause className="size-5 fill-current" /> : <Play className="size-5 fill-current" />}
      </button>
      <input
        type="range"
        min={0}
        max={Math.max(duration, 1)}
        step={0.1}
        value={Math.min(time, duration)}
        aria-label={tr('موضع التشغيل', 'Playback position')}
        onChange={(e) => {
          const v = Number(e.target.value)
          setTime(v)
          if (audio.current && src) audio.current.currentTime = v
        }}
        className="min-w-0 flex-1 accent-[var(--c-accent)]"
        dir="ltr"
      />
      <span className="tnum shrink-0 text-sm text-muted">{formatDuration(playing || time ? time : duration)}</span>
      <audio
        ref={audio}
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setTime(0) }}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
      />
      {state === 'missing' && <span className="text-sm text-negative">{tr('الملف غير متاح هنا', 'File not on this device')}</span>}
    </div>
  )
}

/** States exactly where the audio lives. A recording only counts as cloud-synced after confirmation. */
function LocationBadge({ note }: { note: Stored<VoiceNote> }) {
  const { tr } = useI18n()
  const progress = useUploadProgress()[note.id]
  if (note.uploadState === 'uploading') return <Tag tone="warn"><CloudUpload className="size-3" />{progress !== undefined ? `${progress}%` : tr('جارٍ الرفع', 'Uploading')}</Tag>
  if (note.uploadState === 'uploaded') return <Tag tone="good"><Cloud className="size-3" />{tr('في السحابة', 'In the cloud')}</Tag>
  if (note.uploadState === 'failed') return <Tag tone="bad"><AlertCircle className="size-3" />{tr('فشل الرفع', 'Upload failed')}</Tag>
  if (note.uploadState === 'queued') return <Tag tone="warn"><CloudOff className="size-3" />{tr('في انتظار الرفع', 'Waiting to upload')}</Tag>
  return <Tag><Smartphone className="size-3" />{tr('على هذا الجهاز فقط', 'This device only')}</Tag>
}

function DetailsForm({ note, recording, initialCategory, onClose, allTags }: {
  note?: Stored<VoiceNote>
  recording?: Recording
  initialCategory?: string
  onClose: () => void
  allTags: string[]
}) {
  const { tr, lang } = useI18n()
  const nav = useNavigate()
  const [title, setTitle] = useState(note?.title ?? `${tr('تسجيل', 'Recording')} ${formatDate(todayStr(), lang, 'dmy')}`)
  const [description, setDescription] = useState(note?.description ?? '')
  const [category, setCategory] = useState(note?.category ?? initialCategory ?? 'personal')
  const [tags, setTags] = useState(note?.tags ?? [])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return setError(tr('اكتب عنوانًا.', 'Enter a title.'))
    setBusy(true)
    const data = { title: title.trim(), description, category, tags }
    try {
      if (note) {
        await repo.update('voiceNotes', note.id, data)
      } else if (recording) {
        await persistRecording(recording, data)
      }
      toast(tr('حُفظ التسجيل على هذا الجهاز', 'Recording saved on this device'))
      onClose()
    } catch {
      setError(tr('تعذر الحفظ. قد تكون مساحة التخزين ممتلئة.', 'Could not save. Storage may be full.'))
    } finally {
      setBusy(false)
    }
  }

  const del = async () => {
    if (!note) return
    if (!(await confirmDelete(tr('هذا التسجيل', 'this recording'), tr('سيُحذف الصوت نهائيًا من هذا الجهاز ومن السحابة إن وُجد.', 'The audio is permanently removed from this device and from the cloud, if it is there.')))) return
    await repo.remove('voiceNotes', note.id)
    await deleteBlob(voiceKey(note.id))
    if (note.storagePath) await deleteCloudFile(note.storagePath).catch(() => undefined)
    onClose()
  }

  const toJournal = async () => {
    if (!note) return
    const j = await repo.create('lifeJournal', {
      title: note.title, content: note.description ? `<p>${note.description.replace(/[<>&]/g, '')}</p>` : '', plain: note.description, date: todayStr(), mood: '', tags: note.tags, domainId: null, goalId: null,
      favorite: false, archived: false, source: { collection: 'voiceNotes', id: note.id },
    })
    onClose()
    nav(`/compass/journal?open=${j.id}`)
  }

  const save = async () => {
    if (!note) return
    const blob = await getBlob(voiceKey(note.id))
    if (blob) {
      const ext = note.mimeType.includes('mp4') || note.mimeType.includes('aac') ? 'm4a' : note.mimeType.includes('ogg') ? 'ogg' : 'webm'
      downloadBlob(blob, `${note.title}.${ext}`)
    } else {
      toast(tr('الملف ليس على هذا الجهاز', 'The file is not on this device'), 'error')
    }
  }

  return (
    <Sheet open onClose={onClose} title={note ? tr('تفاصيل التسجيل', 'Recording details') : tr('حفظ التسجيل', 'Save recording')} footer={<FormFooter onCancel={onClose} busy={busy} onDelete={note ? () => void del() : undefined} />}>
      <form id="sheet-form" onSubmit={(e) => void submit(e)} className="space-y-3" noValidate>
        <Input label={tr('العنوان', 'Title')} value={title} onChange={(e) => setTitle(e.target.value)} error={error} />
        <Textarea label={tr('الوصف', 'Description')} value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
        <Select label={tr('التصنيف', 'Category')} value={category} onChange={(e) => setCategory(e.target.value)} options={voiceCategoryOptions()} />
        <TagInput value={tags} onChange={setTags} suggestions={allTags} />
        {note && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" icon={Download} onClick={() => void save()}>{tr('تنزيل الملف', 'Download file')}</Button>
            <Button size="sm" icon={BookHeart} onClick={() => void toJournal()}>{tr('تدوينة من التسجيل', 'Journal entry from this')}</Button>
          </div>
        )}
      </form>
    </Sheet>
  )
}

export default function VoicePage() {
  const { tr, lang } = useI18n()
  const { settings } = useSettings()
  const { items, loading } = useCollection('voiceNotes')
  const [recording, setRecording] = useState<'off' | 'manual' | 'auto'>('off')
  const [captured, setCaptured] = useState<Recording | null>(null)
  const [editing, setEditing] = useState<Stored<VoiceNote> | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [category, setCategory] = useState<string | null>(null)
  const [favOnly, setFavOnly] = useState(false)
  const [sort, setSort] = useState<'date' | 'duration'>('date')
  useParamOnce('record', () => setRecording('auto'))
  useParamOnce('open', setOpenId)

  useEffect(() => {
    if (!openId || loading) return
    const n = items.find((x) => x.id === openId)
    if (n) setEditing(n)
    setOpenId(null)
  }, [openId, items, loading])

  useEffect(() => {
    void resumeUploads()
    const on = () => void resumeUploads()
    window.addEventListener('online', on)
    return () => window.removeEventListener('online', on)
  }, [])

  const allTags = useMemo(() => [...new Set(items.flatMap((n) => n.tags))], [items])
  const shown = useMemo(() => items
    .filter((n) => (!category || n.category === category) && (!favOnly || n.favorite) && matches(`${n.title} ${n.description} ${n.tags.join(' ')}`, q))
    .sort((a, b) => (sort === 'duration' ? b.durationSec - a.durationSec : b.recordedAt.localeCompare(a.recordedAt))), [items, category, favOnly, q, sort])

  return (
    <div className="fade-in">
      <PageHeader
        title={tr('الملاحظات الصوتية', 'Voice Notes')}
        subtitle={isCloudStorageEnabled ? tr('تُحفظ على الجهاز أولًا ثم تُرفع إلى السحابة.', 'Saved on the device first, then uploaded to the cloud.') : tr('تُحفظ التسجيلات على هذا الجهاز.', 'Recordings are stored on this device.')}
        actions={recording === 'off' && !captured ? <Button variant="primary" icon={Mic} capsule onClick={() => setRecording('manual')}>{tr('تسجيل', 'Record')}</Button> : undefined}
      />

      {recording !== 'off' && !captured && (
        <div className="mb-4">
          <Recorder
            autoStart={recording === 'auto'}
            onCancel={() => setRecording('off')}
            onSave={(r) => { setCaptured(r); setRecording('off') }}
            onAutoSave={(r) => {
              void persistRecording(r, { title: `${tr('تسجيل', 'Recording')} ${formatDate(todayStr(), lang, 'dmy')}`, description: '', category: 'other', tags: [] })
                .then(() => toast(tr('حُفظ التسجيل تلقائيًا', 'Recording saved automatically')))
                .catch(() => toast(tr('تعذر حفظ التسجيل', 'Could not save the recording'), 'error'))
            }}
          />
        </div>
      )}

      {!isCloudStorageEnabled && items.length > 0 && (
        <p className="mb-3 flex items-start gap-2 rounded-2xl bg-raised px-4 py-3 text-sm text-muted">
          <Smartphone className="mt-0.5 size-4 shrink-0" />
          {tr('التخزين السحابي للصوت غير مفعّل لأنه يتطلب خطة Blaze في Firebase. العناوين تُزامَن، أما الصوت فيبقى هنا. نزّل الملفات المهمة لتحتفظ بنسخة.', 'Cloud audio storage is off because it needs the Firebase Blaze plan. Titles sync, while the audio stays here. Download important files to keep a copy.')}
        </p>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-56">
          <Search className="pointer-events-none absolute start-4 top-1/2 size-4.5 -translate-y-1/2 text-faint" />
          <input aria-label={tr('بحث في التسجيلات', 'Search recordings')} value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr('ابحث في العناوين والأوصاف', 'Search titles and descriptions')} className="field !rounded-full !px-11" dir={q ? 'auto' : undefined} />
        </div>
        <select aria-label={tr('ترتيب', 'Sort')} value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="field !w-auto !rounded-full">
          <option value="date">{tr('الأحدث', 'Newest')}</option>
          <option value="duration">{tr('الأطول', 'Longest')}</option>
        </select>
      </div>
      <ChipRow className="mb-4">
        <Chip active={favOnly} onClick={() => setFavOnly(!favOnly)}><Star className="size-3.5" />{tr('المفضلة', 'Favorites')}</Chip>
        {voiceCategoryOptions().map((c) => <Chip key={c.value} active={category === c.value} onClick={() => setCategory(category === c.value ? null : c.value)}>{c.label}</Chip>)}
      </ChipRow>

      {loading ? <ListSkeleton /> : shown.length === 0 ? (
        <EmptyState
          icon={Mic}
          title={q || category || favOnly ? tr('لا توجد نتائج', 'No results') : tr('فكّر بصوت عالٍ', 'Think out loud')}
          body={q || category || favOnly ? undefined : tr('سجّل خواطرك وأفكارك وتذكيراتك بلمسة واحدة.', 'Record thoughts, ideas and reminders with one tap.')}
          action={!q && !category && !favOnly ? <Button variant="primary" icon={Plus} onClick={() => setRecording('manual')}>{tr('أول تسجيل', 'First recording')}</Button> : undefined}
        />
      ) : (
        <div className="space-y-2">
          {shown.map((n) => (
            <article key={n.id} className="card p-4">
              <div className="mb-2 flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-bold" dir="auto">{n.title}</h3>
                  <p className="text-sm text-faint">{formatDate(n.recordedAt, lang, settings.dateFormat)} · {formatTime(n.recordedAt, lang, settings.timeFormat)}</p>
                </div>
                <IconButton size="sm" icon={Star} label={tr('مفضلة', 'Favorite')} active={n.favorite} onClick={() => void repo.update('voiceNotes', n.id, { favorite: !n.favorite })} />
                <IconButton size="sm" icon={Pencil} label={tr('تعديل', 'Edit')} onClick={() => setEditing(n)} />
              </div>
              {n.description && <p className="mb-2 line-clamp-2 text-[15px] text-muted" dir="auto">{n.description}</p>}
              <Player note={n} />
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <Tag>{voiceCategoryLabel(n.category)}</Tag>
                <LocationBadge note={n} />
                {n.tags.slice(0, 3).map((t) => <Tag key={t}>#{t}</Tag>)}
                {n.uploadState === 'failed' && <RetryUpload note={n} />}
                <span className="ms-auto"><SyncBadge state={n._sync} compact /></span>
              </div>
            </article>
          ))}
        </div>
      )}

      {captured && <DetailsForm recording={captured} allTags={allTags} onClose={() => setCaptured(null)} />}
      {editing && <DetailsForm key={editing.id} note={editing} allTags={allTags} onClose={() => setEditing(null)} />}
    </div>
  )
}

function RetryUpload({ note }: { note: Stored<VoiceNote> }) {
  const { tr } = useI18n()
  const [canRetry, setCanRetry] = useState(false)
  useEffect(() => {
    void hasBlob(voiceKey(note.id)).then(setCanRetry)
  }, [note.id])
  if (!canRetry) return null
  return <Button size="sm" onClick={() => void uploadVoice(note)}>{tr('إعادة الرفع', 'Retry upload')}</Button>
}

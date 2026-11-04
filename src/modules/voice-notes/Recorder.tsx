import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Mic, Pause, Play, RotateCcw, Square, Trash2 } from 'lucide-react'
import { Button, cx, IconButton } from '@/components/common/ui'
import { useI18n } from '@/i18n'
import { formatDuration } from '@/utils/dates'

export interface Recording {
  blob: Blob
  durationSec: number
  mimeType: string
}

/** Safari records MP4/AAC while Chrome and Firefox record WebM or Ogg, so the first supported type wins. */
function pickMimeType(): string {
  const types = ['audio/webm;codecs=opus', 'audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/aac', 'audio/ogg;codecs=opus', 'audio/webm']
  if (typeof MediaRecorder === 'undefined') return ''
  return types.find((t) => MediaRecorder.isTypeSupported(t)) ?? ''
}

type Phase = 'idle' | 'requesting' | 'recording' | 'paused' | 'preview' | 'denied' | 'unsupported' | 'error'

export function Recorder({ autoStart, onSave, onCancel, onAutoSave }: {
  autoStart?: boolean
  onSave: (r: Recording) => void
  onCancel: () => void
  /** Keeps a take that would otherwise be lost, for example when leaving with the back button. */
  onAutoSave: (r: Recording) => void
}) {
  const { tr } = useI18n()
  const [phase, setPhase] = useState<Phase>(() => (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices ? 'unsupported' : 'idle'))
  const [elapsed, setElapsed] = useState(0)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  const recorder = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  const stream = useRef<MediaStream | null>(null)
  const audioCtx = useRef<AudioContext | null>(null)
  const raf = useRef(0)
  const canvas = useRef<HTMLCanvasElement>(null)
  const startedAt = useRef(0)
  const accumulated = useRef(0)
  const result = useRef<Recording | null>(null)
  const phaseRef = useRef(phase)
  phaseRef.current = phase

  const cleanupStream = useCallback(() => {
    cancelAnimationFrame(raf.current)
    stream.current?.getTracks().forEach((t) => t.stop())
    stream.current = null
    void audioCtx.current?.close().catch(() => undefined)
    audioCtx.current = null
  }, [])

  const autoSaveRef = useRef(onAutoSave)
  autoSaveRef.current = onAutoSave

  useEffect(() => {
    return () => {
      const rec = recorder.current
      if (rec && rec.state !== 'inactive') {
        // Leaving mid-take: finish the recording and keep it rather than losing it.
        if (rec.state === 'recording') accumulated.current += (Date.now() - startedAt.current) / 1000
        rec.onstop = () => {
          const type = rec.mimeType || 'audio/webm'
          autoSaveRef.current({ blob: new Blob(chunks.current, { type }), durationSec: accumulated.current, mimeType: type })
        }
        rec.stop()
      } else if (phaseRef.current === 'preview' && result.current) {
        autoSaveRef.current(result.current)
      }
      cleanupStream()
    }
  }, [cleanupStream])

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }, [previewUrl])

  // Warn before leaving while a take is in progress or not yet saved.
  useEffect(() => {
    if (phase !== 'recording' && phase !== 'paused' && phase !== 'preview') return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [phase])

  // Links inside the app do not trigger beforeunload, so they get their own warning.
  useEffect(() => {
    if (phase !== 'recording' && phase !== 'paused') return
    const guard = (e: MouseEvent) => {
      const link = (e.target as HTMLElement).closest('a[href]')
      if (link && !window.confirm(tr('التسجيل جارٍ. سيُحفظ ما سُجل حتى الآن إذا غادرت. هل تريد المغادرة؟', 'Recording is in progress. What was recorded so far is saved if you leave. Leave?'))) {
        e.preventDefault()
        e.stopPropagation()
      }
    }
    document.addEventListener('click', guard, true)
    return () => document.removeEventListener('click', guard, true)
  }, [phase, tr])

  // Timer.
  useEffect(() => {
    if (phase !== 'recording') return
    const t = setInterval(() => setElapsed(accumulated.current + (Date.now() - startedAt.current) / 1000), 250)
    return () => clearInterval(t)
  }, [phase])

  const drawLevels = (analyser: AnalyserNode) => {
    const data = new Uint8Array(analyser.frequencyBinCount)
    const draw = () => {
      raf.current = requestAnimationFrame(draw)
      const c = canvas.current
      if (!c) return
      const ctx = c.getContext('2d')
      if (!ctx) return
      analyser.getByteFrequencyData(data)
      const w = c.width
      const h = c.height
      ctx.clearRect(0, 0, w, h)
      const bars = 36
      const gap = 4
      const bw = (w - gap * (bars - 1)) / bars
      ctx.fillStyle = getComputedStyle(c).color
      for (let i = 0; i < bars; i++) {
        const v = phaseRef.current === 'paused' ? 0 : (data[Math.floor((i / bars) * (data.length * 0.6))] ?? 0) / 255
        const bh = Math.max(4, v * h)
        ctx.beginPath()
        ctx.roundRect(i * (bw + gap), (h - bh) / 2, bw, bh, bw / 2)
        ctx.fill()
      }
    }
    draw()
  }

  const start = async () => {
    setPhase('requesting')
    try {
      // The microphone is only requested here, when the owner chooses to record.
      const media = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
      stream.current = media
      const mimeType = pickMimeType()
      const rec = new MediaRecorder(media, mimeType ? { mimeType } : undefined)
      recorder.current = rec
      chunks.current = []
      rec.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data) }
      rec.onstop = () => {
        const type = rec.mimeType || mimeType || 'audio/webm'
        const blob = new Blob(chunks.current, { type })
        const durationSec = accumulated.current
        result.current = { blob, durationSec, mimeType: type }
        setPreviewUrl(URL.createObjectURL(blob))
        setElapsed(durationSec)
        cleanupStream()
        setPhase('preview')
      }
      rec.onerror = () => {
        cleanupStream()
        setPhase('error')
      }
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      const ctx = new Ctx()
      audioCtx.current = ctx
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      ctx.createMediaStreamSource(media).connect(analyser)
      accumulated.current = 0
      startedAt.current = Date.now()
      setElapsed(0)
      rec.start(1000)
      setPhase('recording')
      drawLevels(analyser)
    } catch (e) {
      cleanupStream()
      const name = (e as DOMException).name
      setPhase(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'error')
    }
  }

  const startedOnce = useRef(false)
  useEffect(() => {
    if (autoStart && !startedOnce.current && phase === 'idle') {
      startedOnce.current = true
      void start()
    }
  }, [autoStart]) // eslint-disable-line react-hooks/exhaustive-deps

  const pause = () => {
    recorder.current?.pause()
    accumulated.current += (Date.now() - startedAt.current) / 1000
    setElapsed(accumulated.current)
    setPhase('paused')
  }
  const resume = () => {
    recorder.current?.resume()
    startedAt.current = Date.now()
    setPhase('recording')
  }
  const stop = () => {
    if (recorder.current?.state === 'recording') accumulated.current += (Date.now() - startedAt.current) / 1000
    recorder.current?.stop()
  }
  const accept = () => {
    const take = result.current
    if (!take) return
    // Handed over to the save form, so unmounting must not save it a second time.
    result.current = null
    onSave(take)
  }
  const discard = () => {
    result.current = null
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(null)
    setElapsed(0)
    setPhase('idle')
  }

  if (phase === 'unsupported') {
    return <Notice title={tr('هذا المتصفح لا يدعم التسجيل', 'This browser cannot record audio')} body={tr('جرّب أحدث إصدار من Chrome أو Safari.', 'Try the latest Chrome or Safari.')} onCancel={onCancel} />
  }
  if (phase === 'denied') {
    return (
      <Notice
        title={tr('لا يوجد إذن لاستخدام الميكروفون', 'Microphone permission is off')}
        body={tr('اسمح بالميكروفون من إعدادات المتصفح لهذا الموقع ثم حاول مجددًا. على iPhone: الإعدادات ← Safari ← الميكروفون.', 'Allow the microphone for this site in your browser settings, then try again. On iPhone: Settings → Safari → Microphone.')}
        onRetry={() => void start()}
        onCancel={onCancel}
      />
    )
  }
  if (phase === 'error') {
    return <Notice title={tr('تعذر بدء التسجيل', 'Could not start recording')} body={tr('تأكد من توصيل ميكروفون وعدم استخدامه في تطبيق آخر.', 'Check that a microphone is connected and not used by another app.')} onRetry={() => void start()} onCancel={onCancel} />
  }

  const active = phase === 'recording' || phase === 'paused'
  return (
    <section aria-label={tr('المسجل', 'Recorder')} className="rounded-[2.25rem] bg-charcoal p-6 text-white">
      <div className="text-center">
        <div role="timer" aria-live="off" className="tnum text-6xl font-bold">{formatDuration(elapsed)}</div>
        <p className="mt-1 text-sm text-white/60">
          {phase === 'recording' ? tr('جارٍ التسجيل…', 'Recording…') : phase === 'paused' ? tr('متوقف مؤقتًا', 'Paused') : phase === 'preview' ? tr('استمع قبل الحفظ', 'Listen before saving') : phase === 'requesting' ? tr('في انتظار إذن الميكروفون…', 'Waiting for microphone permission…') : tr('جاهز للتسجيل', 'Ready to record')}
        </p>
      </div>
      <canvas ref={canvas} width={560} height={64} aria-hidden className={cx('mx-auto mt-4 h-16 w-full max-w-md text-lime', !active && 'hidden')} />
      {phase === 'preview' && previewUrl && <audio src={previewUrl} controls className="mt-4 w-full" />}
      <div className="mt-5 flex items-center justify-center gap-3">
        {(phase === 'idle' || phase === 'requesting') && (
          <>
            <button type="button" onClick={() => void start()} disabled={phase === 'requesting'} aria-label={tr('بدء التسجيل', 'Start recording')} className="grid size-20 place-items-center rounded-full bg-lime text-charcoal transition active:scale-95 disabled:opacity-60">
              <Mic className="size-8" />
            </button>
            <Button variant="ghost" className="!text-white hover:!bg-white/10" onClick={onCancel}>{tr('إلغاء', 'Cancel')}</Button>
          </>
        )}
        {active && (
          <>
            <IconButton icon={Trash2} label={tr('إلغاء التسجيل', 'Cancel recording')} className="size-14 bg-white/10 hover:!bg-white/20" onClick={() => { cleanupStream(); if (recorder.current) { recorder.current.onstop = null; recorder.current.stop() } onCancel() }} />
            <button type="button" onClick={stop} aria-label={tr('إيقاف', 'Stop')} className="grid size-20 place-items-center rounded-full bg-lime text-charcoal transition active:scale-95">
              <Square className="size-7 fill-current" />
            </button>
            {phase === 'recording'
              ? <IconButton icon={Pause} label={tr('إيقاف مؤقت', 'Pause')} className="size-14 bg-white/10 hover:!bg-white/20" onClick={pause} />
              : <IconButton icon={Play} label={tr('متابعة', 'Resume')} className="size-14 bg-white/10 hover:!bg-white/20" onClick={resume} />}
          </>
        )}
        {phase === 'preview' && (
          <>
            <Button variant="ghost" className="!text-white hover:!bg-white/10" icon={RotateCcw} onClick={discard}>{tr('إعادة', 'Redo')}</Button>
            <Button variant="primary" icon={Check} capsule onClick={accept}>{tr('متابعة للحفظ', 'Continue to save')}</Button>
          </>
        )}
      </div>
    </section>
  )
}

function Notice({ title, body, onRetry, onCancel }: { title: string; body: string; onRetry?: () => void; onCancel: () => void }) {
  const { tr } = useI18n()
  return (
    <section role="alert" className="card p-6 text-center">
      <h2 className="text-lg font-bold">{title}</h2>
      <p className="mx-auto mt-1 max-w-md text-[15px] text-muted">{body}</p>
      <div className="mt-4 flex justify-center gap-2">
        {onRetry && <Button variant="ink" onClick={onRetry}>{tr('حاول مجددًا', 'Try again')}</Button>}
        <Button variant="ghost" onClick={onCancel}>{tr('إغلاق', 'Close')}</Button>
      </div>
    </section>
  )
}

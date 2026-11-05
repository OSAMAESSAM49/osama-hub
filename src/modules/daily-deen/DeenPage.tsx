import '@fontsource/amiri-quran/400.css'
import { useEffect, useMemo, useState } from 'react'
import { BookOpen, ChevronDown, Copy, Heart, Share2, WifiOff } from 'lucide-react'
import { toast } from '@/components/common/feedback'
import { Button, cx, IconButton, Input, Segmented, Textarea, Toggle } from '@/components/common/ui'
import { useSettings } from '@/hooks/useSettings'
import { useI18n } from '@/i18n'
import {
  bookName, dailySelection, hadithShareText, loadHadith, loadIndex, loadVerse, shareOrCopy, verseShareText, type Hadith, type Verse,
} from '@/services/data/deen'
import { getOne, repo, useCollection } from '@/services/data/store'
import type { DeenTracking } from '@/types/models'
import { formatDate, formatDayLong, todayStr } from '@/utils/dates'
import { normalizeDigits } from '@/utils/money'
import { copyText } from '@/utils/text'

/** A hairline ornament in gold. Quiet by design. */
const Ornament = () => (
  <div aria-hidden className="my-4 flex items-center justify-center gap-2 text-gold">
    <span className="h-px w-12 bg-gold/50" />
    <span className="size-1.5 rotate-45 bg-gold" />
    <span className="h-px w-12 bg-gold/50" />
  </div>
)

function useDaily(date: string) {
  const [verse, setVerse] = useState<Verse | null>(null)
  const [hadith, setHadith] = useState<Hadith | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let live = true
    setFailed(false)
    dailySelection(date)
      .then(async (s) => {
        const [v, h] = await Promise.all([loadVerse(s.surah, s.ayah), loadHadith(s.hadithPoolIndex)])
        if (!live) return
        setVerse(v)
        setHadith(h)
      })
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [date])
  return { verse, hadith, failed }
}

function CardActions({ text, favorite, onFavorite }: { text: string; favorite: boolean; onFavorite: () => void }) {
  const { tr } = useI18n()
  const cls = 'text-cream hover:!bg-white/10'
  return (
    <div className="flex items-center gap-1">
      <IconButton icon={Heart} label={favorite ? tr('إزالة من المفضلة', 'Remove from favorites') : tr('إضافة للمفضلة', 'Add to favorites')} active={favorite} className={cx(cls, favorite && '!text-gold')} onClick={onFavorite} />
      <IconButton icon={Copy} label={tr('نسخ', 'Copy')} className={cls} onClick={async () => toast((await copyText(text)) ? tr('نُسخ', 'Copied') : tr('تعذر النسخ', 'Could not copy'), 'info')} />
      <IconButton
        icon={Share2}
        label={tr('مشاركة', 'Share')}
        className={cls}
        onClick={async () => {
          const res = await shareOrCopy(text)
          if (res === 'copied') toast(tr('نُسخ للمشاركة', 'Copied for sharing'), 'info')
          if (res === 'failed') toast(tr('تعذرت المشاركة', 'Could not share'), 'error')
        }}
      />
    </div>
  )
}

export function VerseCard({ verse, favorite, onFavorite }: { verse: Verse; favorite: boolean; onFavorite: () => void }) {
  const { tr, lang } = useI18n()
  return (
    <section aria-label={tr('آية اليوم', 'Verse of the day')} className="overflow-hidden rounded-[2.25rem] bg-forest text-cream">
      <div className="p-6 sm:p-8">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-gold">{tr('آية اليوم', 'Verse of the day')}</p>
          <CardActions text={verseShareText(verse, lang)} favorite={favorite} onFavorite={onFavorite} />
        </div>
        {/* Quran text renders exactly as stored, in a font made for Uthmani script. */}
        <p lang="ar" dir="rtl" className="mt-4 text-center font-quran text-[1.65rem] leading-[2.6] sm:text-[2.1rem]">
          {verse.text} <span className="whitespace-nowrap text-gold">﴿{verse.ayah.toLocaleString('ar-EG')}﴾</span>
        </p>
        <Ornament />
        <p className="text-center text-[15px]" dir="auto">
          {verse.surahName} <span className="text-cream/70">· {tr(`سورة رقم ${verse.surah}، الآية ${verse.ayah}`, `Surah ${verse.surah} (${verse.surahEn}), Ayah ${verse.ayah}`)}</span>
        </p>
      </div>
      <div className="bg-forest-soft p-6 sm:px-8">
        <h3 className="text-sm text-gold">{tr('التفسير، وهو كلام البشر وليس نص القرآن', 'Tafsir: human commentary, not Quran text')}</h3>
        <p lang="ar" dir="rtl" className="mt-2 font-reading text-[1.05rem] leading-loose">{verse.tafsir}</p>
        <p className="mt-2 text-xs text-cream/70">{tr('المصدر: التفسير الميسر، مجمع الملك فهد لطباعة المصحف الشريف.', 'Source: Al-Tafsir Al-Muyassar, King Fahd Complex for the Printing of the Holy Quran.')}</p>
      </div>
    </section>
  )
}

export function HadithCard({ hadith, favorite, onFavorite }: { hadith: Hadith; favorite: boolean; onFavorite: () => void }) {
  const { tr, lang } = useI18n()
  const [open, setOpen] = useState(false)
  return (
    <section aria-label={tr('حديث اليوم', 'Hadith of the day')} className="rounded-[2.25rem] bg-cream p-6 text-forest sm:p-8 [&_button]:text-forest">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-[#8a6c2c]">{tr('حديث اليوم', 'Hadith of the day')}</p>
        <div className="[&_button:hover]:!bg-forest/10"><CardActions text={hadithShareText(hadith, lang)} favorite={favorite} onFavorite={onFavorite} /></div>
      </div>
      <p lang="ar" dir="rtl" className="mt-3 font-reading text-[1.15rem] leading-[2.1]">{hadith.text}</p>
      <Ornament />
      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-[15px] sm:grid-cols-2">
        <div><dt className="text-sm text-forest/70">{tr('الكتاب', 'Book')}</dt><dd className="font-medium">{bookName(hadith.book, lang)}</dd></div>
        {hadith.chapter && <div><dt className="text-sm text-forest/70">{tr('الباب', 'Chapter')}</dt><dd className="font-medium" dir="auto">{lang === 'ar' ? hadith.chapter : hadith.chapterEn ?? hadith.chapter}</dd></div>}
        <div><dt className="text-sm text-forest/70">{tr('رقم الحديث', 'Hadith number')}</dt><dd className="tnum font-medium">{hadith.number}</dd></div>
        <div>
          <dt className="text-sm text-forest/70">{tr('درجة الصحة', 'Authenticity')}</dt>
          <dd className="font-medium">{tr(`صحيح، لوروده مسندًا في ${bookName(hadith.book, 'ar')}`, `Sahih, as a full-chain narration in ${bookName(hadith.book, 'en')}`)}</dd>
        </div>
      </dl>
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="mt-3 inline-flex min-h-10 items-center gap-1 text-sm underline-offset-4 hover:underline">
        <ChevronDown className={cx('size-4 transition', open && 'rotate-180')} /> {tr('عن المصدر والترقيم', 'About the source and numbering')}
      </button>
      {open && (
        <p className="text-sm text-forest/80">
          {tr(
            `المرجع: القسم ${hadith.bookSection}، الحديث ${hadith.sectionHadith}. الترقيم حسب إصدار hadith-api، وقد يختلف عن طبعات أخرى. النص متطابق بين مصدرين مستقلين منشورين. لا يتضمن التطبيق شرحًا للحديث حتى لا يُنسب نص غير موثق.`,
            `Reference: section ${hadith.bookSection}, hadith ${hadith.sectionHadith}. Numbered per the hadith-api edition, which may differ from other printings. The text matches across two independently published sources. No explanation is shown, so that nothing unverified is attached to it.`,
          )}
        </p>
      )}
    </section>
  )
}

function Tracking({ date }: { date: string }) {
  const { tr, lang } = useI18n()
  const { settings } = useSettings()
  const { items } = useCollection('deenTracking')
  const today = items.find((t) => t.id === date)
  const [reflection, setReflection] = useState(today?.reflection ?? '')
  const [memorization, setMemorization] = useState(today?.memorization ?? '')
  const [pages, setPages] = useState(today?.quranReadPages ? String(today.quranReadPages) : '')

  useEffect(() => {
    setReflection(today?.reflection ?? '')
    setMemorization(today?.memorization ?? '')
    setPages(today?.quranReadPages ? String(today.quranReadPages) : '')
  }, [today?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const save = (patch: Partial<DeenTracking>) => {
    const defaults: DeenTracking = {
      id: date, createdAt: '', updatedAt: '', date, quranReadPages: 0, memorization: '', remembrance: false, reflection: '',
    }
    return repo.upsert('deenTracking', date, patch, defaults)
  }
  const recent = useMemo(() => [...items].filter((t) => t.id !== date && (t.reflection || t.memorization || t.quranReadPages || t.remembrance)).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 7), [items, date])

  return (
    <section className="card space-y-3 p-5">
      <div>
        <h2 className="font-display text-xl font-bold">{tr('وردك اليوم', 'Your day')}</h2>
        <p className="text-sm text-muted">{tr('اختياري تمامًا. للمداومة، لا للمقارنة.', 'Entirely optional. For consistency, not comparison.')}</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Input label={tr('صفحات التلاوة', 'Pages read')} inputMode="numeric" value={pages} onChange={(e) => setPages(e.target.value)} onBlur={() => void save({ quranReadPages: Math.max(0, Math.floor(Number(normalizeDigits(pages)) || 0)) })} />
        <Input label={tr('الحفظ', 'Memorization')} value={memorization} onChange={(e) => setMemorization(e.target.value)} onBlur={() => void save({ memorization })} placeholder={tr('مثل: سورة الملك', 'e.g. Surah Al-Mulk')} />
      </div>
      <Toggle label={tr('أذكار اليوم', "Today's remembrance")} checked={today?.remembrance ?? false} onChange={(remembrance) => void save({ remembrance })} />
      <Textarea label={tr('تأمل شخصي', 'Personal reflection')} value={reflection} onChange={(e) => setReflection(e.target.value)} onBlur={() => void save({ reflection })} rows={3} />
      {recent.length > 0 && (
        <details className="group">
          <summary className="min-h-10 py-2 text-sm text-muted">{tr('الأيام السابقة', 'Previous days')}</summary>
          <ul className="space-y-2 pt-1">
            {recent.map((t) => (
              <li key={t.id} className="rounded-2xl bg-raised px-4 py-2.5 text-[15px]">
                <div className="text-sm text-faint">{formatDate(t.date, lang, settings.dateFormat)}</div>
                {t.quranReadPages > 0 && <div>{tr(`${t.quranReadPages} صفحة`, `${t.quranReadPages} pages`)}</div>}
                {t.memorization && <div dir="auto">{t.memorization}</div>}
                {t.reflection && <div className="whitespace-pre-line" dir="auto">{t.reflection}</div>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}

function SavedList({ kind }: { kind: 'verses' | 'hadith' | 'history' }) {
  const { tr, lang } = useI18n()
  const { settings } = useSettings()
  const favV = useCollection('favoriteVerses').items
  const favH = useCollection('favoriteHadith').items
  const hist = useCollection('deenHistory').items
  const [verses, setVerses] = useState<Record<string, Verse>>({})
  const [hadiths, setHadiths] = useState<Record<number, Hadith>>({})

  const wantV = useMemo(() => (kind === 'verses' ? favV.map((f) => [f.surah, f.ayah] as const) : kind === 'history' ? hist.map((h) => [h.surah, h.ayah] as const) : []), [kind, favV, hist])
  const wantH = useMemo(() => (kind === 'hadith' ? favH.map((f) => f.poolIndex) : kind === 'history' ? hist.map((h) => h.hadithPoolIndex) : []), [kind, favH, hist])

  useEffect(() => {
    for (const [s, a] of wantV) {
      const k = `${s}:${a}`
      if (!verses[k]) void loadVerse(s, a).then((v) => setVerses((m) => ({ ...m, [k]: v }))).catch(() => undefined)
    }
    for (const i of wantH) {
      if (!hadiths[i]) void loadHadith(i).then((h) => setHadiths((m) => ({ ...m, [i]: h }))).catch(() => undefined)
    }
  }, [wantV, wantH]) // eslint-disable-line react-hooks/exhaustive-deps

  const empty = <p className="card p-6 text-center text-[15px] text-muted">{tr('لا شيء هنا بعد.', 'Nothing here yet.')}</p>

  if (kind === 'verses') {
    if (!favV.length) return empty
    return <div className="space-y-2">{favV.map((f) => <VerseRow key={f.id} v={verses[`${f.surah}:${f.ayah}`]} />)}</div>
  }
  if (kind === 'hadith') {
    if (!favH.length) return empty
    return <div className="space-y-2">{favH.map((f) => <HadithRow key={f.id} h={hadiths[f.poolIndex]} lang={lang} />)}</div>
  }
  const sorted = [...hist].sort((a, b) => b.date.localeCompare(a.date))
  if (!sorted.length) return empty
  return (
    <div className="space-y-4">
      {sorted.slice(0, 60).map((h) => (
        <section key={h.id}>
          <h3 className="mb-1 px-2 text-sm text-faint">{formatDate(h.date, lang, settings.dateFormat)}</h3>
          <div className="space-y-2">
            <VerseRow v={verses[`${h.surah}:${h.ayah}`]} />
            <HadithRow h={hadiths[h.hadithPoolIndex]} lang={lang} />
          </div>
        </section>
      ))}
    </div>
  )
}

function VerseRow({ v }: { v?: Verse }) {
  if (!v) return <div className="skeleton h-24 !rounded-3xl" />
  return (
    <article className="card p-4">
      <p lang="ar" dir="rtl" className="font-quran text-xl leading-[2.3]">{v.text}</p>
      <p className="mt-1 text-sm text-muted" dir="auto">{v.surahName} ({v.surah}:{v.ayah})</p>
    </article>
  )
}

function HadithRow({ h, lang }: { h?: Hadith; lang: 'ar' | 'en' }) {
  if (!h) return <div className="skeleton h-24 !rounded-3xl" />
  return (
    <article className="card p-4">
      <p lang="ar" dir="rtl" className="line-clamp-5 font-reading leading-loose">{h.text}</p>
      <p className="mt-1 text-sm text-muted">{bookName(h.book, lang)} ({h.number})</p>
    </article>
  )
}

export default function DeenPage() {
  const { tr, lang } = useI18n()
  const date = todayStr()
  const { verse, hadith, failed } = useDaily(date)
  const favV = useCollection('favoriteVerses').items
  const favH = useCollection('favoriteHadith').items
  useCollection('deenHistory')
  const [tab, setTab] = useState<'today' | 'verses' | 'hadith' | 'history'>('today')
  const verseId = verse ? `${verse.surah}-${verse.ayah}` : ''
  const hadithId = hadith ? `h${hadith.poolIndex}` : ''

  // One small record per day that the page is opened, so the history reflects what was actually seen.
  useEffect(() => {
    if (!verse || !hadith) return
    if (getOne('deenHistory', date)) return
    void repo.upsert('deenHistory', date, {}, {
      id: date, createdAt: '', updatedAt: '', date, surah: verse.surah, ayah: verse.ayah, hadithPoolIndex: hadith.poolIndex,
    })
  }, [verse, hadith, date])

  const toggleV = () => {
    if (!verse) return
    if (favV.some((f) => f.id === verseId)) void repo.remove('favoriteVerses', verseId)
    else void repo.upsert('favoriteVerses', verseId, {}, { id: verseId, createdAt: '', updatedAt: '', surah: verse.surah, ayah: verse.ayah })
  }
  const toggleH = () => {
    if (!hadith) return
    if (favH.some((f) => f.id === hadithId)) void repo.remove('favoriteHadith', hadithId)
    else void repo.upsert('favoriteHadith', hadithId, {}, { id: hadithId, createdAt: '', updatedAt: '', book: hadith.book, number: hadith.number, poolIndex: hadith.poolIndex })
  }

  return (
    <div className="fade-in mx-auto max-w-3xl">
      <header className="mb-5">
        <h1 className="font-display text-[1.9rem] font-bold sm:text-[2.4rem]">{tr('الزاد اليومي', 'Daily Deen')}</h1>
        <p className="mt-1 text-[15px] text-muted">{formatDayLong(date, lang)}</p>
      </header>
      <Segmented
        className="mb-4"
        label={tr('أقسام الزاد اليومي', 'Daily Deen sections')}
        value={tab}
        onChange={setTab}
        options={[
          { value: 'today', label: tr('اليوم', 'Today') },
          { value: 'verses', label: tr('آيات مفضلة', 'Saved verses') },
          { value: 'hadith', label: tr('أحاديث مفضلة', 'Saved hadith') },
          { value: 'history', label: tr('السجل', 'History') },
        ]}
      />
      {tab === 'today' && (
        <div className="space-y-4">
          {failed ? (
            <div className="card flex flex-col items-center gap-2 p-8 text-center">
              <WifiOff className="size-7 text-muted" />
              <p className="font-bold">{tr('محتوى اليوم غير محمّل بعد', "Today's content is not loaded yet")}</p>
              <p className="max-w-sm text-[15px] text-muted">{tr('يحتاج إلى اتصال مرة واحدة، ثم يبقى متاحًا دون إنترنت.', 'It needs a connection once, then stays available offline.')}</p>
              <Button onClick={() => location.reload()}>{tr('حاول مجددًا', 'Try again')}</Button>
            </div>
          ) : !verse || !hadith ? (
            <>
              <div className="skeleton h-96 !rounded-[2.25rem]" />
              <div className="skeleton h-72 !rounded-[2.25rem]" />
            </>
          ) : (
            <>
              <VerseCard verse={verse} favorite={favV.some((f) => f.id === verseId)} onFavorite={toggleV} />
              <HadithCard hadith={hadith} favorite={favH.some((f) => f.id === hadithId)} onFavorite={toggleH} />
            </>
          )}
          <Tracking date={date} />
          <SourceNote />
        </div>
      )}
      {tab !== 'today' && <SavedList kind={tab} />}
    </div>
  )
}

function SourceNote() {
  const { tr } = useI18n()
  const [at, setAt] = useState<string | null>(null)
  useEffect(() => {
    void loadIndex().then((i) => setAt(i.generatedAt.slice(0, 10))).catch(() => undefined)
  }, [])
  return (
    <p className="flex items-start gap-2 px-2 text-xs text-faint">
      <BookOpen className="mt-0.5 size-3.5 shrink-0" />
      {tr(
        `النصوص منقولة من مصادر منشورة، ولا يولّد التطبيق أي نص ديني. القرآن: الرسم العثماني من AlQuran Cloud، مطابَق مع quran-json. الحديث: hadith-api، مطابَق مع hadith-json.${at ? ` آخر تحقق ${at}.` : ''}`,
        `All text comes from published sources; the app never generates religious text. Quran: Uthmani script from AlQuran Cloud, checked against quran-json. Hadith: hadith-api, checked against hadith-json.${at ? ` Last verified ${at}.` : ''}`,
      )}
    </p>
  )
}

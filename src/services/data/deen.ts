/**
 * Daily Deen content. Nothing is generated. All text is read as-is from the verified dataset built
 * by scripts/fetch-deen-data.mjs, and the daily pick is a pure function of the local date.
 */
import { daysBetween } from '@/utils/dates'

export interface DeenIndex {
  generatedAt: string
  sources: Record<string, string>
  surahs: [string, string, number][]
  quranPool: [number, number][]
  hadithCount: number
  hadithShard: number
}
export interface Verse {
  surah: number
  ayah: number
  surahName: string
  surahEn: string
  text: string
  tafsir: string
}
export interface Hadith {
  poolIndex: number
  book: 'bukhari' | 'muslim'
  number: number
  bookSection: number
  sectionHadith: number
  chapter: string | null
  chapterEn: string | null
  text: string
}

const base = import.meta.env.BASE_URL
const fetchJson = async <T,>(path: string): Promise<T> => {
  const res = await fetch(`${base}data/deen/${path}`)
  if (!res.ok) throw new Error(`deen ${path} ${res.status}`)
  return res.json() as Promise<T>
}

let indexPromise: Promise<DeenIndex> | null = null
export function loadIndex() {
  indexPromise ??= fetchJson<DeenIndex>('index.json').catch((e) => {
    indexPromise = null
    throw e
  })
  return indexPromise
}

/** Step sizes coprime with any pool size that does not share these primes. See `step`. */
const EPOCH = '2024-01-01'
export const dayNumber = (date: string) => Math.max(0, daysBetween(EPOCH, date))

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a)
/**
 * Walks the pool with a stride coprime to its length. This visits every item exactly once before
 * any repeat, so nothing returns for as many days as there are items, with no stored state.
 */
function step(poolSize: number, seed: number): number {
  let s = seed
  while (gcd(s, poolSize) !== 1) s++
  return s
}
export const dailyPoolIndex = (date: string, poolSize: number, seed: number) => (dayNumber(date) * step(poolSize, seed)) % poolSize

export async function loadVerse(surah: number, ayah: number): Promise<Verse> {
  const shard = await fetchJson<{ name: string; en: string; ayahs: [number, string, string][] }>(`quran/${surah}.json`)
  const row = shard.ayahs[ayah - 1]
  if (!row) throw new Error('verse not found')
  return { surah, ayah, surahName: shard.name, surahEn: shard.en, text: row[1], tafsir: row[2] }
}

export async function loadHadith(poolIndex: number): Promise<Hadith> {
  const idx = await loadIndex()
  const shard = await fetchJson<{ b: 'bukhari' | 'muslim'; n: number; bk: number; h: number; c: string | null; ce: string | null; t: string }[]>(
    `hadith/${Math.floor(poolIndex / idx.hadithShard)}.json`,
  )
  const row = shard[poolIndex % idx.hadithShard]
  if (!row) throw new Error('hadith not found')
  return { poolIndex, book: row.b, number: row.n, bookSection: row.bk, sectionHadith: row.h, chapter: row.c, chapterEn: row.ce, text: row.t }
}

export async function dailySelection(date: string) {
  const idx = await loadIndex()
  const [surah, ayah] = idx.quranPool[dailyPoolIndex(date, idx.quranPool.length, 2399)]!
  return { surah, ayah, hadithPoolIndex: dailyPoolIndex(date, idx.hadithCount, 1847) }
}

export const bookName = (b: 'bukhari' | 'muslim', lang: 'ar' | 'en') =>
  b === 'bukhari' ? (lang === 'ar' ? 'صحيح البخاري' : 'Sahih al-Bukhari') : lang === 'ar' ? 'صحيح مسلم' : 'Sahih Muslim'

/** Strips markup-like marks from the source for plain sharing, without changing any words. */
export const verseShareText = (v: Verse, lang: 'ar' | 'en') =>
  `${v.text}\n\n${v.surahName} (${v.surah}:${v.ayah})${lang === 'ar' ? '' : ` · ${v.surahEn}`}`

export const hadithShareText = (h: Hadith, lang: 'ar' | 'en') =>
  `${h.text}\n\n${bookName(h.book, lang)}${h.chapter ? `، ${h.chapter}` : ''} (${h.number})`

export async function shareOrCopy(text: string): Promise<'shared' | 'copied' | 'failed'> {
  if (navigator.share) {
    try {
      await navigator.share({ text })
      return 'shared'
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return 'shared'
    }
  }
  try {
    await navigator.clipboard.writeText(text)
    return 'copied'
  } catch {
    return 'failed'
  }
}

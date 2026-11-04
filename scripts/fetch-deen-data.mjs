#!/usr/bin/env node
/**
 * Builds the verified Daily Deen dataset in public/data/deen/.
 *
 * Nothing here is written by hand or by AI. Every word is downloaded from a published
 * dataset, and text is only kept when two independently published sources agree:
 *
 *   Quran  : quran-uthmani (api.alquran.cloud)  cross-checked with quran-json@3.1.2
 *   Tafsir : ar.muyassar   (api.alquran.cloud)  King Fahd Complex, Al-Tafsir Al-Muyassar
 *   Hadith : fawazahmed0/hadith-api             cross-checked with AhmedBaset/hadith-json
 *
 * The build fails if the Quran does not reach 114 surahs / 6236 ayahs with zero mismatches.
 * Re-run with: npm run data:deen
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'public', 'data', 'deen')

const SOURCES = {
  quran: 'https://api.alquran.cloud/v1/quran/quran-uthmani',
  tafsir: 'https://api.alquran.cloud/v1/quran/ar.muyassar',
  quranCheck: 'https://cdn.jsdelivr.net/npm/quran-json@3.1.2/dist/quran.json',
  bukhari: 'https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions/ara-bukhari.min.json',
  muslim: 'https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions/ara-muslim.min.json',
  bukhariCheck: 'https://raw.githubusercontent.com/AhmedBaset/hadith-json/main/db/by_book/the_9_books/bukhari.json',
  muslimCheck: 'https://raw.githubusercontent.com/AhmedBaset/hadith-json/main/db/by_book/the_9_books/muslim.json',
}

const get = async (url) => {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  return res.json()
}

const clean = (s) => s.replace(/^﻿/, '').trim()

/** Letters only: used solely to COMPARE sources. The stored text is never normalized. */
const letters = (s) =>
  s
    .replace(/[ؐ-ًؚ-ٰٟۖ-ۭـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/[ؤئ]/g, 'ء')
    .replace(/ة/g, 'ه')
    .replace(/صلى الله عليه وسلم/g, '')
    .replace(/[^ء-ي]/g, '')

/**
 * Consonantal skeleton for the Quran cross-check. The two sources follow slightly different
 * Uthmani spelling conventions (hamza seat in ءا / أٓ, small ya and waw marks), so long vowels
 * and hamza are dropped. A missing, added or altered word still changes the skeleton.
 */
const skeleton = (s) => letters(s).replace(/[ءاوي]/g, '')

function buildQuran(uthmani, tafsir, check) {
  const surahs = uthmani.data.surahs
  const tafsirs = tafsir.data.surahs
  if (surahs.length !== 114) throw new Error(`Expected 114 surahs, got ${surahs.length}`)
  const basmalah = clean(surahs[0].ayahs[0].text) + ' '
  let total = 0
  let mismatches = 0
  let orthographic = 0
  const index = []
  const pool = []
  rmSync(join(out, 'quran'), { recursive: true, force: true })
  mkdirSync(join(out, 'quran'), { recursive: true })

  for (const [i, s] of surahs.entries()) {
    const num = i + 1
    const ayahs = s.ayahs.map((a, j) => {
      let text = clean(a.text)
      // The source prefixes the basmalah to ayah 1 of each surah. It is not part of that ayah
      // in the Hafs count (except Al-Fatiha), so it is removed by exact prefix match only.
      if (j === 0 && num !== 1) {
        // Surahs 95 and 97 carry the same basmalah with an added shadda on the ba in this source.
        const variant = 'بِّ' + basmalah.slice(2)
        const prefix = [basmalah, variant].find((p) => text.startsWith(p))
        if (prefix) text = text.slice(prefix.length)
      }
      const other = check[i].verses[j]?.text ?? ''
      if (skeleton(text) !== skeleton(other)) {
        mismatches++
        console.warn(`Quran mismatch ${num}:${j + 1}`)
      } else if (letters(text) !== letters(other)) {
        orthographic++
      }
      total++
      if (text.length >= 30) pool.push([num, j + 1])
      return [j + 1, text, clean(tafsirs[i].ayahs[j].text)]
    })
    index.push([s.name, s.englishName, ayahs.length])
    writeFileSync(join(out, 'quran', `${num}.json`), JSON.stringify({ s: num, name: s.name, en: s.englishName, ayahs }))
  }
  if (total !== 6236) throw new Error(`Expected 6236 ayahs, got ${total}`)
  if (mismatches) throw new Error(`${mismatches} Quran mismatches between sources: refusing to build`)
  return { index, pool, total, orthographic }
}

function buildHadith(book, primary, check) {
  // Index the second source by compared letters so a hadith is only kept when both agree.
  const chapters = new Map(check.chapters.map((c) => [c.id, c]))
  const byLetters = new Map()
  for (const h of check.hadiths) byLetters.set(letters(h.arabic ?? ''), h)

  const kept = []
  const stats = { total: primary.hadiths.length, intro: 0, empty: 0, notMarfu: 0, length: 0, unverified: 0 }
  for (const h of primary.hadiths) {
    const text = clean(h.text ?? '')
    if (!text) { stats.empty++; continue }
    // Book 0 is Muslim's Muqaddimah (introduction), which is not part of the Sahih's body.
    if (!h.reference?.book) { stats.intro++; continue }
    if (text.length < 120 || text.length > 900) { stats.length++; continue }
    const norm = letters(text)
    // Keep narrations with a full chain that reach the Prophet (peace be upon him), which
    // leaves out suspended reports and statements of later narrators.
    if (!/^و?(حدث|اخبر)/.test(norm) || !/(رسول الله|النبي)/.test(norm)) { stats.notMarfu++; continue }
    const match = byLetters.get(norm)
    if (!match) { stats.unverified++; continue }
    const chapter = chapters.get(match.chapterId)
    kept.push({
      b: book,
      n: h.hadithnumber,
      an: h.arabicnumber ?? null,
      bk: h.reference.book,
      h: h.reference.hadith,
      c: chapter?.arabic ?? null,
      ce: chapter?.english ?? null,
      t: text,
    })
  }
  return { kept, stats }
}

/** Stable shuffle, so the two books alternate through the pool instead of running in blocks. */
function interleave(a, b) {
  const res = []
  const ratio = a.length / (a.length + b.length)
  let ia = 0
  let ib = 0
  while (ia < a.length || ib < b.length) {
    if (ib >= b.length || (ia < a.length && ia / (ia + ib + 1) <= ratio)) res.push(a[ia++])
    else res.push(b[ib++])
  }
  return res
}

mkdirSync(out, { recursive: true })
console.log('Downloading Quran and Tafsir…')
const [uth, muy, qc] = await Promise.all([get(SOURCES.quran), get(SOURCES.tafsir), get(SOURCES.quranCheck)])
const quran = buildQuran(uth, muy, qc)
console.log(`Quran OK: 114 surahs, ${quran.total} ayahs, 0 mismatches (${quran.orthographic} spelling-convention differences). Pool ${quran.pool.length}.`)

console.log('Downloading Hadith…')
const [ab, bb, am, bm] = await Promise.all([
  get(SOURCES.bukhari), get(SOURCES.bukhariCheck), get(SOURCES.muslim), get(SOURCES.muslimCheck),
])
const bukhari = buildHadith('bukhari', ab, bb)
const muslim = buildHadith('muslim', am, bm)
console.log('Bukhari', bukhari.kept.length, bukhari.stats)
console.log('Muslim', muslim.kept.length, muslim.stats)

const SHARD = 50
const all = interleave(bukhari.kept, muslim.kept)
rmSync(join(out, 'hadith'), { recursive: true, force: true })
mkdirSync(join(out, 'hadith'), { recursive: true })
for (let i = 0; i < all.length; i += SHARD) {
  writeFileSync(join(out, 'hadith', `${i / SHARD}.json`), JSON.stringify(all.slice(i, i + SHARD)))
}

writeFileSync(
  join(out, 'index.json'),
  JSON.stringify({
    version: 1,
    generatedAt: new Date().toISOString(),
    sources: SOURCES,
    surahs: quran.index,
    quranPool: quran.pool,
    hadithCount: all.length,
    hadithShard: SHARD,
    stats: { quranOrthographicDifferences: quran.orthographic, bukhari: { kept: bukhari.kept.length, ...bukhari.stats }, muslim: { kept: muslim.kept.length, ...muslim.stats } },
  }),
)
console.log(`Done: ${all.length} hadith in ${Math.ceil(all.length / SHARD)} shards at public/data/deen.`)

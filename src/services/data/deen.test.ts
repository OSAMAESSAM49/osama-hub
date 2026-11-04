import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { dailyPoolIndex } from './deen'

const dir = join(process.cwd(), 'public', 'data', 'deen')
const index = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8'))

describe('daily selection', () => {
  it('is stable for a date', () => {
    expect(dailyPoolIndex('2026-11-05', 6000, 2399)).toBe(dailyPoolIndex('2026-11-05', 6000, 2399))
  })
  it('changes between days and does not repeat for the whole pool', () => {
    const n = index.quranPool.length
    const seen = new Set<number>()
    const d = new Date('2024-01-01T12:00:00')
    for (let i = 0; i < n; i++) {
      const s = d.toISOString().slice(0, 10)
      seen.add(dailyPoolIndex(s, n, 2399))
      d.setDate(d.getDate() + 1)
    }
    expect(seen.size).toBe(n)
  })
})

describe('verified dataset', () => {
  it('holds the complete Quran with Tafsir on every ayah', () => {
    let ayahs = 0
    for (let s = 1; s <= 114; s++) {
      const shard = JSON.parse(readFileSync(join(dir, 'quran', `${s}.json`), 'utf8'))
      for (const [, text, tafsir] of shard.ayahs) {
        ayahs++
        expect(text.length).toBeGreaterThan(0)
        expect(tafsir.length).toBeGreaterThan(0)
      }
    }
    expect(ayahs).toBe(6236)
  })
  it('does not attach the basmalah to the first ayah of any surah after Al-Fatiha', () => {
    for (let s = 2; s <= 114; s++) {
      const first: string = JSON.parse(readFileSync(join(dir, 'quran', `${s}.json`), 'utf8')).ayahs[0][1]
      expect(first.startsWith('بِسْمِ ٱللَّهِ')).toBe(false)
      expect(first.startsWith('بِّسْمِ ٱللَّهِ')).toBe(false)
    }
  })
  it('only holds hadith from the two Sahih collections, with reference numbers', () => {
    const files = readdirSync(join(dir, 'hadith'))
    let count = 0
    for (const f of files) {
      for (const h of JSON.parse(readFileSync(join(dir, 'hadith', f), 'utf8'))) {
        count++
        expect(['bukhari', 'muslim']).toContain(h.b)
        expect(h.n).toBeGreaterThan(0)
        expect(h.bk).toBeGreaterThan(0)
        expect(h.t.length).toBeGreaterThanOrEqual(120)
      }
    }
    expect(count).toBe(index.hadithCount)
  })
})

/**
 * Translations are written side by side at the call site: tr('إضافة', 'Add').
 * With one owner and two languages this keeps both strings next to their context, and a language
 * can never be missing a key.
 */
import { useSyncExternalStore } from 'react'

export type Lang = 'ar' | 'en'
export type ThemePref = 'light' | 'dark' | 'system'

const KEY = 'osama-hub:prefs'

interface Prefs {
  language: Lang
  theme: ThemePref
}

function read(): Prefs {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Prefs>
    return { language: p.language === 'en' ? 'en' : 'ar', theme: p.theme ?? 'system' }
  } catch {
    return { language: 'ar', theme: 'system' }
  }
}

let prefs: Prefs = typeof localStorage === 'undefined' ? { language: 'ar', theme: 'system' } : read()
const listeners = new Set<() => void>()

function apply() {
  const dark = prefs.theme === 'dark' || (prefs.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
  const html = document.documentElement
  html.classList.toggle('dark', dark)
  html.lang = prefs.language
  html.dir = prefs.language === 'ar' ? 'rtl' : 'ltr'
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', dark ? '#0E0E10' : '#F4F2EC'))
}

export function initPrefs() {
  apply()
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', apply)
}

export function setPrefs(patch: Partial<Prefs>) {
  prefs = { ...prefs, ...patch }
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs))
  } catch {
    /* Storage can be blocked. The choice still applies for this session. */
  }
  apply()
  listeners.forEach((l) => l())
}

export const getPrefs = () => prefs
export const getLang = () => prefs.language

export function tr(ar: string, en: string): string {
  return prefs.language === 'ar' ? ar : en
}

export function usePrefs(): Prefs {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => prefs,
  )
}

/** Re-renders the caller on language change and returns the translate helper. */
export function useI18n() {
  const { language } = usePrefs()
  return { lang: language, isRtl: language === 'ar', tr: (ar: string, en: string) => (language === 'ar' ? ar : en) }
}

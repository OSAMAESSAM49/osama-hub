export const newId = () => crypto.randomUUID()

/** Normalizes Arabic and English text so a search finds "احمد" for "أَحْمَد" and "مدرسة" for "مدرسه". */
export function normalizeSearch(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[ؐ-ًؚ-ٰٟۖ-ۭـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
}

/** Every space-separated term must appear somewhere in the text. */
export function matches(haystack: string, query: string): boolean {
  const q = normalizeSearch(query).trim()
  if (!q) return true
  const h = normalizeSearch(haystack)
  return q.split(/\s+/).every((term) => h.includes(term))
}

/** Reads text from editor HTML without executing it: DOMParser documents are inert. */
export function htmlToPlain(html: string): string {
  if (!html) return ''
  if (typeof DOMParser === 'undefined') return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  const doc = new DOMParser().parseFromString(html.replace(/<\/(p|h\d|li|blockquote)>/g, '$& '), 'text/html')
  return (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim()
}

export function excerpt(text: string, n = 120): string {
  return text.length > n ? `${text.slice(0, n).trimEnd()}…` : text
}

/** Splits text into segments so matches can be highlighted, tolerating Arabic normalization. */
export function highlightParts(text: string, query: string): { text: string; hit: boolean }[] {
  const terms = normalizeSearch(query).trim().split(/\s+/).filter(Boolean)
  if (!terms.length || !text) return [{ text, hit: false }]
  // Build a normalized copy that maps each normalized char back to its source index.
  const map: number[] = []
  let norm = ''
  for (let i = 0; i < text.length; i++) {
    const n = normalizeSearch(text[i]!)
    for (const c of n) {
      norm += c
      map.push(i)
    }
  }
  const spans: [number, number][] = []
  for (const term of terms) {
    let at = norm.indexOf(term)
    while (at !== -1) {
      spans.push([map[at]!, (map[at + term.length - 1] ?? text.length - 1) + 1])
      at = norm.indexOf(term, at + term.length)
    }
  }
  if (!spans.length) return [{ text, hit: false }]
  spans.sort((a, b) => a[0] - b[0])
  const parts: { text: string; hit: boolean }[] = []
  let pos = 0
  for (const [s, e] of spans) {
    if (e <= pos) continue
    const from = Math.max(s, pos)
    if (from > pos) parts.push({ text: text.slice(pos, from), hit: false })
    parts.push({ text: text.slice(from, e), hit: true })
    pos = e
  }
  if (pos < text.length) parts.push({ text: text.slice(pos), hit: false })
  return parts
}

/** Validates and normalizes a pasted URL. Only http and https are allowed. */
export function parseUrl(input: string): URL | null {
  const raw = input.trim()
  if (!raw) return null
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    if (!u.hostname.includes('.') && u.hostname !== 'localhost') return null
    return u
  } catch {
    return null
  }
}

/** A comparison key that treats www, the scheme, a trailing slash and tracking parameters as the same link. */
export function urlKey(input: string): string {
  const u = parseUrl(input)
  if (!u) return input.trim().toLowerCase()
  for (const p of [...u.searchParams.keys()]) {
    if (/^(utm_|fbclid|gclid|igshid)/i.test(p)) u.searchParams.delete(p)
  }
  const host = u.hostname.replace(/^www\./, '').toLowerCase()
  const path = u.pathname.replace(/\/+$/, '')
  const search = u.searchParams.toString()
  return `${host}${path}${search ? `?${search}` : ''}${u.hash}`
}

export const domainOf = (url: string) => parseUrl(url)?.hostname.replace(/^www\./, '') ?? ''

/** Words that suggest someone is about to store a secret in the reference vault. */
export function looksLikeSecret(text: string): boolean {
  return /(password|passcode|\bpin\b|cvv|otp|secret|api[ _-]?key|token|كلمة (ال)?(سر|مرور)|باسورد|الرقم السري|رقم سري|رمز (ال)?تحقق)/i.test(text)
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

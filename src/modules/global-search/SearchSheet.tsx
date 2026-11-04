import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search } from 'lucide-react'
import { MODULES } from '@/app/modules'
import { cx, Sheet } from '@/components/common/ui'
import { useI18n } from '@/i18n'
import { getAll, loadAll } from '@/services/data/store'
import { formatMoney } from '@/utils/money'
import { excerpt, highlightParts, matches, normalizeSearch } from '@/utils/text'

interface Hit {
  id: string
  title: string
  detail: string
  path: string
  /** Title matches rank above body matches. */
  rank: number
}
interface Group {
  key: string
  label: string
  hits: Hit[]
}

const MAX_PER_GROUP = 6

/** Scans the local IndexedDB copy, so search is instant, works offline and costs no Firestore reads. */
function runSearch(query: string, lang: 'ar' | 'en'): Group[] {
  const t = (ar: string, en: string) => (lang === 'ar' ? ar : en)
  const nq = normalizeSearch(query).trim()
  const groups: Group[] = []
  const add = (key: string, label: string, entries: { id: string; title: string; body: string; detail: string; path: string }[]) => {
    const hits = entries
      .filter((e) => matches(`${e.title} ${e.body}`, query))
      .map((e) => ({ id: e.id, title: e.title, detail: e.detail, path: e.path, rank: normalizeSearch(e.title).includes(nq) ? 0 : 1 }))
      .sort((a, b) => a.rank - b.rank)
    if (hits.length) groups.push({ key, label, hits })
  }
  const live = <T extends { archived?: boolean }>(a: T[]) => a

  add('notes', t('الملاحظات', 'Notes'), live(getAll('notes')).map((n) => ({
    id: n.id, title: n.title || t('بدون عنوان', 'Untitled'), body: `${n.plain} ${n.category} ${n.tags.join(' ')}`, detail: excerpt(n.plain, 80), path: `/notes?open=${n.id}`,
  })))
  add('tasks', t('المهام', 'Tasks'), getAll('tasks').map((x) => ({
    id: x.id, title: x.title, body: `${x.description} ${x.category} ${x.tags.join(' ')}`, detail: x.dueDate ?? '', path: `/tasks?open=${x.id}`,
  })))
  add('income', t('الإيرادات', 'Income'), getAll('income').map((x) => ({
    id: x.id, title: x.procedure || x.patientName || x.description || formatMoney(x.amountMinor, lang),
    body: `${x.patientName} ${x.description} ${x.notes} ${x.paymentMethod}`, detail: `${formatMoney(x.amountMinor, lang)} · ${x.date}`, path: `/clinic?tab=income&open=${x.id}`,
  })))
  add('expenses', t('المصروفات', 'Expenses'), getAll('expenses').map((x) => ({
    id: x.id, title: x.description || x.supplier || formatMoney(x.amountMinor, lang),
    body: `${x.supplier} ${x.notes}`, detail: `${formatMoney(x.amountMinor, lang)} · ${x.date}`, path: `/clinic?tab=expenses&open=${x.id}`,
  })))
  add('ideas', t('أفكار المحتوى', 'Content ideas'), getAll('contentIdeas').map((x) => ({
    id: x.id, title: x.title, body: `${x.description} ${x.notes} ${x.tags.join(' ')}`, detail: excerpt(x.description, 80), path: `/ideas?open=${x.id}`,
  })))
  add('vault', t('البيانات المهمة', 'Data Vault'), getAll('vaultItems').map((x) => ({
    id: x.id, title: x.title, body: `${x.content} ${x.category} ${x.tags.join(' ')} ${x.url}`, detail: excerpt(x.content, 80), path: `/vault?open=${x.id}`,
  })))
  add('voice', t('الملاحظات الصوتية', 'Voice notes'), getAll('voiceNotes').map((x) => ({
    id: x.id, title: x.title, body: `${x.description} ${x.tags.join(' ')}`, detail: excerpt(x.description, 80), path: `/voice?open=${x.id}`,
  })))
  add('links', t('خزنة الروابط', 'Bookmarks'), getAll('bookmarks').map((x) => ({
    id: x.id, title: x.title || x.domain, body: `${x.url} ${x.domain} ${x.description} ${x.notes} ${x.tags.join(' ')}`, detail: x.domain, path: `/links?open=${x.id}`,
  })))
  add('goals', t('أهداف الحياة', 'Life goals'), getAll('lifeGoals').map((x) => ({
    id: x.id, title: x.title, body: `${x.description} ${x.why} ${x.expectedOutcome} ${x.notes}`, detail: excerpt(x.description, 80), path: `/compass/goals/${x.id}`,
  })))
  add('journal', t('المذكرات', 'Journal'), getAll('lifeJournal').map((x) => ({
    id: x.id, title: x.title || x.date, body: `${x.plain} ${x.tags.join(' ')}`, detail: excerpt(x.plain, 80), path: `/compass/journal?open=${x.id}`,
  })))
  add('reviews', t('المراجعات', 'Reviews'), getAll('lifeReviews').map((x) => ({
    id: x.id, title: `${x.date}`, body: Object.values(x.answers).join(' '), detail: excerpt(Object.values(x.answers).find(Boolean) ?? '', 80), path: `/compass/reviews?open=${x.id}`,
  })))
  return groups
}

function Highlighted({ text, q }: { text: string; q: string }) {
  return (
    <>
      {highlightParts(text, q).map((p, i) =>
        p.hit ? <mark key={i} className="rounded bg-lime px-0.5 text-charcoal">{p.text}</mark> : <span key={i}>{p.text}</span>,
      )}
    </>
  )
}

export function SearchSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { tr, lang } = useI18n()
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [ready, setReady] = useState(false)
  const [cursor, setCursor] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    setQ('')
    setCursor(0)
    void loadAll().then(() => setReady(true))
  }, [open])

  const groups = useMemo(() => (ready && q.trim() ? runSearch(q, lang) : []), [q, ready, lang])
  const flat = useMemo(() => groups.flatMap((g) => g.hits.slice(0, MAX_PER_GROUP)), [groups])
  const go = (path: string) => {
    onClose()
    nav(path)
  }

  useEffect(() => setCursor(0), [q])
  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [cursor])

  let index = -1
  return (
    <Sheet open={open} onClose={onClose} title={tr('بحث شامل', 'Search everything')} wide>
      <div className="relative">
        <Search className="pointer-events-none absolute start-4 top-1/2 size-5 -translate-y-1/2 text-faint" />
        <input
          data-autofocus=""
          role="combobox"
          aria-expanded={flat.length > 0}
          aria-controls="search-results"
          aria-label={tr('بحث', 'Search')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(c + 1, flat.length - 1)) }
            if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)) }
            if (e.key === 'Enter' && flat[cursor]) go(flat[cursor]!.path)
          }}
          placeholder={tr('ملاحظة، مريض، مهمة، رابط…', 'A note, patient, task, link…')}
          className="field !rounded-full !px-12"
          dir={q ? 'auto' : undefined}
        />
      </div>
      <div id="search-results" ref={listRef} className="min-h-[40dvh] space-y-4">
        {!q.trim() && (
          <div className="flex flex-wrap gap-1.5 pt-2">
            {MODULES.filter((m) => m.id !== 'home').map((m) => (
              <button key={m.id} type="button" onClick={() => go(m.path)} className="inline-flex min-h-10 items-center gap-2 rounded-full bg-raised px-4 text-sm hover:bg-line">
                <m.icon className="size-4" /> {lang === 'ar' ? m.ar : m.en}
              </button>
            ))}
          </div>
        )}
        {q.trim() && ready && groups.length === 0 && <p className="py-10 text-center text-muted">{tr('لا توجد نتائج مطابقة.', 'No matching results.')}</p>}
        {groups.map((g) => (
          <section key={g.key} aria-label={g.label}>
            <h3 className="mb-1.5 px-2 text-sm font-medium text-faint">{g.label} <span className="tnum">({g.hits.length})</span></h3>
            <div className="space-y-1">
              {g.hits.slice(0, MAX_PER_GROUP).map((h) => {
                index++
                const active = index === cursor
                return (
                  <button key={h.id} type="button" data-active={active} onClick={() => go(h.path)} className={cx('block w-full rounded-2xl px-4 py-2.5 text-start transition', active ? 'bg-raised' : 'hover:bg-raised')}>
                    <div className="truncate font-medium" dir="auto"><Highlighted text={h.title} q={q} /></div>
                    {h.detail && <div className="truncate text-sm text-muted" dir="auto"><Highlighted text={h.detail} q={q} /></div>}
                  </button>
                )
              })}
            </div>
          </section>
        ))}
      </div>
    </Sheet>
  )
}

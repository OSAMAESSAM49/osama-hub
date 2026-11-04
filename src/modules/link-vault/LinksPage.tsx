import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Copy, ExternalLink, FolderCog, LayoutGrid, Link2, List, Pencil, Pin, Plus, Search, Star, Trash2 } from 'lucide-react'
import { confirmDelete, toast } from '@/components/common/feedback'
import {
  Button, Chip, ChipRow, cx, EmptyState, FormFooter, IconButton, Input, ListSkeleton, PageHeader, Segmented, Select, Sheet, SyncBadge, Tag, TagInput, Textarea,
} from '@/components/common/ui'
import { useParamOnce } from '@/hooks/useParamOnce'
import { useI18n } from '@/i18n'
import { repo, useCollection } from '@/services/data/store'
import type { Bookmark, BookmarkCollection, Stored } from '@/types/models'
import { copyText, domainOf, matches, parseUrl, urlKey } from '@/utils/text'

/** The icon comes straight from the bookmarked site, so no third-party service learns your links. */
function SiteIcon({ domain, size = 'md' }: { domain: string; size?: 'md' | 'lg' }) {
  const [failed, setFailed] = useState(false)
  const cls = size === 'lg' ? 'size-12' : 'size-10'
  useEffect(() => setFailed(false), [domain])
  if (failed || !domain) {
    return <span className={cx('grid shrink-0 place-items-center rounded-2xl bg-raised font-bold uppercase', cls)}>{domain.charAt(0) || '•'}</span>
  }
  return (
    <span className={cx('grid shrink-0 place-items-center rounded-2xl bg-raised', cls)}>
      <img src={`https://${domain}/favicon.ico`} alt="" loading="lazy" referrerPolicy="no-referrer" className="size-6 rounded" onError={() => setFailed(true)} />
    </span>
  )
}

function BookmarkForm({ bookmark, collections, bookmarks, onClose, onOpenExisting }: {
  bookmark?: Stored<Bookmark>
  collections: BookmarkCollection[]
  bookmarks: Stored<Bookmark>[]
  onClose: () => void
  onOpenExisting: (b: Stored<Bookmark>) => void
}) {
  const { tr } = useI18n()
  const [url, setUrl] = useState(bookmark?.url ?? '')
  const [title, setTitle] = useState(bookmark?.title ?? '')
  const [description, setDescription] = useState(bookmark?.description ?? '')
  const [collectionId, setCollectionId] = useState(bookmark?.collectionId ?? '')
  const [tags, setTags] = useState(bookmark?.tags ?? [])
  const [notes, setNotes] = useState(bookmark?.notes ?? '')
  const [error, setError] = useState<string | null>(null)
  const parsed = parseUrl(url)
  const domain = parsed ? domainOf(url) : ''
  const duplicate = useMemo(() => {
    if (!parsed) return undefined
    const key = urlKey(url)
    return bookmarks.find((b) => b.id !== bookmark?.id && urlKey(b.url) === key)
  }, [url, parsed, bookmarks, bookmark])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!parsed) return setError(tr('أدخل رابطًا صحيحًا يبدأ بـ http أو https.', 'Enter a valid http or https link.'))
    if (duplicate) return setError(tr('هذا الرابط محفوظ بالفعل.', 'This link is already saved.'))
    const data = { url: parsed.href, domain, title: title.trim() || domain, description, collectionId: collectionId || null, tags, notes }
    if (bookmark) await repo.update('bookmarks', bookmark.id, data)
    else await repo.create('bookmarks', { ...data, favorite: false, pinned: false, lastOpenedAt: null })
    toast(tr('حُفظ الرابط', 'Link saved'))
    onClose()
  }

  const del = async () => {
    if (bookmark && (await confirmDelete(tr('هذا الرابط', 'this link')))) {
      await repo.remove('bookmarks', bookmark.id)
      onClose()
    }
  }

  return (
    <Sheet open onClose={onClose} title={bookmark ? tr('تعديل الرابط', 'Edit link') : tr('حفظ رابط', 'Save a link')} footer={<FormFooter onCancel={onClose} onDelete={bookmark ? () => void del() : undefined} />}>
      <form id="sheet-form" onSubmit={(e) => void submit(e)} className="space-y-3" noValidate>
        <div className="flex items-end gap-2">
          {domain && <SiteIcon domain={domain} size="lg" />}
          <Input label={tr('الرابط', 'URL')} className="flex-1" dir="ltr" inputMode="url" value={url} onChange={(e) => { setUrl(e.target.value); setError(null) }} error={error} placeholder="https://" autoFocus={!bookmark} />
        </div>
        {duplicate && (
          <p role="alert" className="rounded-2xl bg-caution/12 px-4 py-3 text-sm text-caution">
            {tr('محفوظ بالفعل باسم:', 'Already saved as:')}{' '}
            <button type="button" className="font-bold underline underline-offset-2" onClick={() => onOpenExisting(duplicate)}>{duplicate.title}</button>
          </p>
        )}
        <Input label={tr('العنوان', 'Title')} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={domain} hint={tr('لا يجلب التطبيق بيانات الصفحة تلقائيًا، حفاظًا على الخصوصية ولأنه يعمل بلا خادم.', 'Page details are not fetched automatically: the app has no server, and this protects your privacy.')} />
        <Textarea label={tr('الوصف', 'Description')} value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
        <Select label={tr('المجموعة', 'Collection')} value={collectionId} onChange={(e) => setCollectionId(e.target.value)} options={[{ value: '', label: tr('بدون مجموعة', 'No collection') }, ...collections.map((c) => ({ value: c.id, label: c.name }))]} />
        <TagInput value={tags} onChange={setTags} suggestions={[...new Set(bookmarks.flatMap((b) => b.tags))]} />
        <Textarea label={tr('ملاحظات', 'Notes')} value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
      </form>
    </Sheet>
  )
}

function CollectionsSheet({ collections, bookmarks, onClose }: { collections: Stored<BookmarkCollection>[]; bookmarks: Stored<Bookmark>[]; onClose: () => void }) {
  const { tr } = useI18n()
  const [name, setName] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [deleting, setDeleting] = useState<Stored<BookmarkCollection> | null>(null)
  const [moveTo, setMoveTo] = useState('')
  const countIn = (id: string) => bookmarks.filter((b) => b.collectionId === id).length

  const add = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    await repo.create('bookmarkCollections', { name: name.trim(), order: collections.length })
    setName('')
  }

  const finishDelete = async (mode: 'move' | 'delete') => {
    if (!deleting) return
    const inside = bookmarks.filter((b) => b.collectionId === deleting.id)
    if (mode === 'move') for (const b of inside) await repo.update('bookmarks', b.id, { collectionId: moveTo || null })
    else await repo.removeMany('bookmarks', inside.map((b) => b.id))
    await repo.remove('bookmarkCollections', deleting.id)
    setDeleting(null)
    toast(tr('حُذفت المجموعة', 'Collection deleted'))
  }

  const startDelete = (c: Stored<BookmarkCollection>) => {
    setMoveTo('')
    setDeleting(c)
  }

  return (
    <Sheet open onClose={onClose} title={tr('إدارة المجموعات', 'Manage collections')}>
      {deleting ? (
        <div className="space-y-3">
          <h3 className="font-bold">{tr(`حذف «${deleting.name}»`, `Delete “${deleting.name}”`)}</h3>
          {countIn(deleting.id) === 0 ? (
            <>
              <p className="text-[15px] text-muted">{tr('هذه المجموعة فارغة.', 'This collection is empty.')}</p>
              <div className="flex gap-2">
                <Button variant="danger" onClick={() => void finishDelete('move')}>{tr('حذف المجموعة', 'Delete collection')}</Button>
                <Button variant="ghost" onClick={() => setDeleting(null)}>{tr('إلغاء', 'Cancel')}</Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-[15px] text-muted">{tr(`فيها ${countIn(deleting.id)} رابط. ماذا تريد أن تفعل بها؟`, `It holds ${countIn(deleting.id)} links. What should happen to them?`)}</p>
              <Select label={tr('نقلها إلى', 'Move them to')} value={moveTo} onChange={(e) => setMoveTo(e.target.value)} options={[{ value: '', label: tr('بدون مجموعة', 'No collection') }, ...collections.filter((c) => c.id !== deleting.id).map((c) => ({ value: c.id, label: c.name }))]} />
              <div className="flex flex-wrap gap-2">
                <Button variant="ink" onClick={() => void finishDelete('move')}>{tr('نقل الروابط وحذف المجموعة', 'Move links, delete collection')}</Button>
                <Button variant="danger" onClick={() => void finishDelete('delete')}>{tr('حذف الروابط أيضًا', 'Delete the links too')}</Button>
                <Button variant="ghost" onClick={() => setDeleting(null)}>{tr('إلغاء', 'Cancel')}</Button>
              </div>
            </>
          )}
        </div>
      ) : (
        <>
          <form onSubmit={(e) => void add(e)} className="flex items-end gap-2">
            <Input label={tr('مجموعة جديدة', 'New collection')} className="flex-1" value={name} onChange={(e) => setName(e.target.value)} />
            <Button type="submit" variant="ink" icon={Plus}>{tr('إضافة', 'Add')}</Button>
          </form>
          <ul className="divide-y divide-line">
            {collections.map((c) => (
              <li key={c.id} className="flex min-h-14 items-center gap-2 py-1">
                {editing === c.id ? (
                  <form
                    className="flex flex-1 gap-2"
                    onSubmit={(e) => {
                      e.preventDefault()
                      if (editName.trim()) void repo.update('bookmarkCollections', c.id, { name: editName.trim() })
                      setEditing(null)
                    }}
                  >
                    <input aria-label={tr('الاسم', 'Name')} value={editName} onChange={(e) => setEditName(e.target.value)} className="field" autoFocus dir="auto" />
                    <Button type="submit" size="sm" variant="ink">{tr('حفظ', 'Save')}</Button>
                  </form>
                ) : (
                  <>
                    <span className="min-w-0 flex-1 truncate" dir="auto">{c.name} <span className="tnum text-sm text-faint">({countIn(c.id)})</span></span>
                    <IconButton size="sm" icon={Pencil} label={tr('إعادة تسمية', 'Rename')} onClick={() => { setEditing(c.id); setEditName(c.name) }} />
                    <IconButton size="sm" icon={Trash2} label={tr('حذف', 'Delete')} onClick={() => startDelete(c)} />
                  </>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </Sheet>
  )
}

export default function LinksPage() {
  const { tr } = useI18n()
  const { items, loading } = useCollection('bookmarks')
  const { items: collections } = useCollection('bookmarkCollections')
  const sortedCollections = useMemo(() => [...collections].sort((a, b) => a.order - b.order), [collections])
  const [q, setQ] = useState('')
  const [collection, setCollection] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'favorites'>('all')
  const [sort, setSort] = useState<'added' | 'opened'>('added')
  const [view, setView] = useState<'cards' | 'list'>('cards')
  const [form, setForm] = useState<{ bookmark?: Stored<Bookmark> } | null>(null)
  const [manage, setManage] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  useParamOnce('new', () => setForm({}))
  useParamOnce('open', setOpenId)

  useEffect(() => {
    if (!openId || loading) return
    const b = items.find((x) => x.id === openId)
    if (b) setForm({ bookmark: b })
    setOpenId(null)
  }, [openId, items, loading])

  const shown = useMemo(() => items
    .filter((b) => (!collection || b.collectionId === collection) && (filter === 'all' || b.favorite) && matches(`${b.title} ${b.url} ${b.domain} ${b.description} ${b.notes} ${b.tags.join(' ')}`, q))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || (sort === 'opened' ? (b.lastOpenedAt ?? '').localeCompare(a.lastOpenedAt ?? '') : b.createdAt.localeCompare(a.createdAt))), [items, collection, filter, q, sort])

  const open = (b: Stored<Bookmark>) => void repo.update('bookmarks', b.id, { lastOpenedAt: new Date().toISOString() })
  const collectionName = (id: string | null) => collections.find((c) => c.id === id)?.name

  const actions = (b: Stored<Bookmark>) => (
    <>
      <IconButton size="sm" icon={Star} label={tr('مفضلة', 'Favorite')} active={b.favorite} onClick={() => void repo.update('bookmarks', b.id, { favorite: !b.favorite })} />
      <IconButton size="sm" icon={Pin} label={tr('تثبيت', 'Pin')} active={b.pinned} onClick={() => void repo.update('bookmarks', b.id, { pinned: !b.pinned })} />
      <IconButton size="sm" icon={Copy} label={tr('نسخ الرابط', 'Copy URL')} onClick={async () => toast((await copyText(b.url)) ? tr('نُسخ الرابط', 'Link copied') : tr('تعذر النسخ', 'Could not copy'), 'info')} />
      <IconButton size="sm" icon={Pencil} label={tr('تعديل', 'Edit')} onClick={() => setForm({ bookmark: b })} />
      <a href={b.url} target="_blank" rel="noopener noreferrer" onClick={() => open(b)} aria-label={tr('فتح الرابط', 'Open link')} className="grid size-9 shrink-0 place-items-center rounded-full bg-ink text-canvas transition hover:opacity-85">
        <ExternalLink className="size-4" />
      </a>
    </>
  )

  return (
    <div className="fade-in">
      <PageHeader
        title={tr('خزنة الروابط', 'Link Vault')}
        subtitle={tr(`${items.length} رابط محفوظ`, `${items.length} saved links`)}
        actions={
          <>
            <Button icon={FolderCog} onClick={() => setManage(true)}>{tr('المجموعات', 'Collections')}</Button>
            <Button variant="primary" icon={Plus} capsule onClick={() => setForm({})}>{tr('رابط', 'Link')}</Button>
          </>
        }
      />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-56">
          <Search className="pointer-events-none absolute start-4 top-1/2 size-4.5 -translate-y-1/2 text-faint" />
          <input aria-label={tr('بحث في الروابط', 'Search links')} value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr('عنوان، نطاق، وسم…', 'Title, domain, tag…')} className="field !rounded-full !px-11" dir={q ? 'auto' : undefined} />
        </div>
        <select aria-label={tr('ترتيب', 'Sort')} value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="field !w-auto !rounded-full">
          <option value="added">{tr('أضيف حديثًا', 'Recently added')}</option>
          <option value="opened">{tr('فُتح حديثًا', 'Recently opened')}</option>
        </select>
        <Segmented label={tr('طريقة العرض', 'View')} value={view} onChange={setView} options={[{ value: 'cards', label: '', icon: LayoutGrid }, { value: 'list', label: '', icon: List }]} />
      </div>
      <ChipRow className="mb-4">
        <Chip active={filter === 'favorites'} onClick={() => setFilter(filter === 'favorites' ? 'all' : 'favorites')}><Star className="size-3.5" />{tr('المفضلة', 'Favorites')}</Chip>
        {sortedCollections.map((c) => <Chip key={c.id} active={collection === c.id} onClick={() => setCollection(collection === c.id ? null : c.id)}>{c.name}</Chip>)}
      </ChipRow>

      {loading ? <ListSkeleton /> : shown.length === 0 ? (
        <EmptyState
          icon={q || collection ? Search : Link2}
          title={q || collection || filter === 'favorites' ? tr('لا توجد نتائج', 'No results') : tr('احفظ أول رابط', 'Save your first link')}
          body={q || collection ? undefined : tr('مراجع طب الأسنان، أدوات الذكاء الاصطناعي، ومصادر الإلهام.', 'Dental references, AI tools and sources of inspiration.')}
          action={!q && !collection ? <Button variant="primary" icon={Plus} onClick={() => setForm({})}>{tr('حفظ رابط', 'Save a link')}</Button> : undefined}
        />
      ) : view === 'cards' ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((b) => (
            <article key={b.id} className="card flex flex-col p-4">
              <div className="flex items-start gap-3">
                <SiteIcon domain={b.domain} size="lg" />
                <div className="min-w-0 flex-1">
                  <h3 className="line-clamp-2 font-bold" dir="auto">{b.title}</h3>
                  <p className="truncate text-sm text-faint" dir="ltr">{b.domain}</p>
                </div>
                <SyncBadge state={b._sync} compact />
              </div>
              {b.description && <p className="mt-2 line-clamp-2 text-[15px] text-muted" dir="auto">{b.description}</p>}
              <div className="mt-2 flex flex-wrap gap-1">
                {collectionName(b.collectionId) && <Tag>{collectionName(b.collectionId)}</Tag>}
                {b.tags.slice(0, 3).map((t) => <Tag key={t}>#{t}</Tag>)}
              </div>
              <div className="mt-auto flex items-center justify-end gap-0.5 pt-2">{actions(b)}</div>
            </article>
          ))}
        </div>
      ) : (
        <div className="card divide-y divide-line overflow-hidden">
          {shown.map((b) => (
            <div key={b.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
              <SiteIcon domain={b.domain} />
              <div className="min-w-0 flex-1 basis-40">
                <div className="truncate font-medium" dir="auto">{b.title}</div>
                <div className="truncate text-sm text-faint" dir="ltr">{b.domain}</div>
              </div>
              <div className="ms-auto flex items-center gap-0.5">{actions(b)}</div>
            </div>
          ))}
        </div>
      )}
      {form && <BookmarkForm key={form.bookmark?.id ?? 'new'} bookmark={form.bookmark} collections={sortedCollections} bookmarks={items} onClose={() => setForm(null)} onOpenExisting={(b) => setForm({ bookmark: b })} />}
      {manage && <CollectionsSheet collections={sortedCollections} bookmarks={items} onClose={() => setManage(false)} />}
    </div>
  )
}

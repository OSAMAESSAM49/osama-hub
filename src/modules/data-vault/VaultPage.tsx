import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Archive, ArchiveRestore, Copy, ExternalLink, Pin, Plus, Search, Shield, ShieldAlert } from 'lucide-react'
import { confirmDelete, toast } from '@/components/common/feedback'
import {
  Button, Chip, ChipRow, ComboInput, EmptyState, FormFooter, IconButton, Input, ListSkeleton, PageHeader, Sheet, SyncBadge, Tag, TagInput, Textarea,
} from '@/components/common/ui'
import { useParamOnce } from '@/hooks/useParamOnce'
import { useI18n } from '@/i18n'
import { repo, useCollection } from '@/services/data/store'
import type { Stored, VaultItem } from '@/types/models'
import { copyText, looksLikeSecret, matches, parseUrl } from '@/utils/text'

function VaultForm({ item, categories, tags: allTags, onClose }: { item?: Stored<VaultItem>; categories: string[]; tags: string[]; onClose: () => void }) {
  const { tr } = useI18n()
  const [title, setTitle] = useState(item?.title ?? '')
  const [content, setContent] = useState(item?.content ?? '')
  const [category, setCategory] = useState(item?.category ?? '')
  const [tags, setTags] = useState(item?.tags ?? [])
  const [url, setUrl] = useState(item?.url ?? '')
  const [errors, setErrors] = useState<{ title?: string; url?: string }>({})
  const secret = looksLikeSecret(`${title} ${content}`)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const errs: typeof errors = {}
    if (!title.trim()) errs.title = tr('اكتب عنوانًا.', 'Enter a title.')
    if (url.trim() && !parseUrl(url)) errs.url = tr('رابط غير صالح.', 'Invalid link.')
    setErrors(errs)
    if (Object.keys(errs).length) return
    const data = { title: title.trim(), content, category: category.trim(), tags, url: url.trim() ? parseUrl(url)!.href : '' }
    if (item) await repo.update('vaultItems', item.id, data)
    else await repo.create('vaultItems', { ...data, pinned: false, archived: false })
    toast(tr('تم الحفظ', 'Saved'))
    onClose()
  }

  const del = async () => {
    if (item && (await confirmDelete(tr('هذا العنصر', 'this item')))) {
      await repo.remove('vaultItems', item.id)
      onClose()
    }
  }

  return (
    <Sheet open onClose={onClose} title={item ? tr('تعديل', 'Edit item') : tr('عنصر جديد', 'New item')} footer={<FormFooter onCancel={onClose} onDelete={item ? () => void del() : undefined} />}>
      <form id="sheet-form" onSubmit={(e) => void submit(e)} className="space-y-3" noValidate>
        <Input label={tr('العنوان', 'Title')} value={title} onChange={(e) => setTitle(e.target.value)} error={errors.title} autoFocus={!item} />
        <Textarea label={tr('المحتوى', 'Content')} value={content} onChange={(e) => setContent(e.target.value)} rows={4} />
        {secret && (
          <p role="alert" className="flex items-start gap-2 rounded-2xl bg-caution/12 px-4 py-3 text-sm text-caution">
            <ShieldAlert className="mt-0.5 size-4 shrink-0" />
            {tr('هذه الخزنة ليست لكلمات المرور أو البيانات البنكية أو رموز الدخول. استخدم مدير كلمات مرور لها.', 'This vault is not for passwords, banking details or login codes. Use a password manager for those.')}
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <ComboInput label={tr('التصنيف', 'Category')} value={category} onChange={setCategory} suggestions={[tr('موردون', 'Suppliers'), tr('أرقام مهمة', 'Important numbers'), tr('العيادة', 'Clinic'), tr('إداري', 'Administrative'), tr('نصوص جاهزة', 'Saved text'), ...categories]} />
          <Input label={tr('رابط (اختياري)', 'URL (optional)')} value={url} onChange={(e) => setUrl(e.target.value)} error={errors.url} dir="ltr" inputMode="url" />
        </div>
        <TagInput value={tags} onChange={setTags} suggestions={allTags} />
      </form>
    </Sheet>
  )
}

export default function VaultPage() {
  const { tr } = useI18n()
  const { items, loading } = useCollection('vaultItems')
  const [q, setQ] = useState('')
  const [category, setCategory] = useState<string | null>(null)
  const [archived, setArchived] = useState(false)
  const [form, setForm] = useState<{ item?: Stored<VaultItem> } | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  useParamOnce('new', () => setForm({}))
  useParamOnce('open', setOpenId)

  useEffect(() => {
    if (!openId || loading) return
    const it = items.find((i) => i.id === openId)
    if (it) setForm({ item: it })
    setOpenId(null)
  }, [openId, items, loading])

  const categories = useMemo(() => [...new Set(items.map((i) => i.category).filter(Boolean))], [items])
  const allTags = useMemo(() => [...new Set(items.flatMap((i) => i.tags))], [items])
  const shown = useMemo(
    () =>
      items
        .filter((i) => i.archived === archived && (!category || i.category === category) && matches(`${i.title} ${i.content} ${i.category} ${i.tags.join(' ')} ${i.url}`, q))
        .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt)),
    [items, archived, category, q],
  )

  return (
    <div className="fade-in">
      <PageHeader
        title={tr('البيانات المهمة', 'Data Vault')}
        subtitle={tr('أرقام ومعلومات مرجعية. ليست لكلمات المرور.', 'Reference information. Not for passwords.')}
        actions={<Button variant="primary" icon={Plus} capsule onClick={() => setForm({})}>{tr('عنصر', 'Item')}</Button>}
      />
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute start-4 top-1/2 size-4.5 -translate-y-1/2 text-faint" />
        <input aria-label={tr('بحث في البيانات', 'Search the vault')} value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr('ابحث عن رقم، مورد، معلومة…', 'Find a number, supplier, detail…')} className="field !rounded-full !px-11" dir={q ? 'auto' : undefined} />
      </div>
      <ChipRow className="mb-4">
        <Chip active={!archived && !category} onClick={() => { setArchived(false); setCategory(null) }}>{tr('الكل', 'All')}</Chip>
        {categories.map((c) => <Chip key={c} active={category === c} onClick={() => { setCategory(category === c ? null : c); setArchived(false) }}>{c}</Chip>)}
        <Chip active={archived} onClick={() => { setArchived(!archived); setCategory(null) }}>{tr('الأرشيف', 'Archive')}</Chip>
      </ChipRow>

      {loading ? <ListSkeleton /> : shown.length === 0 ? (
        <EmptyState
          icon={Shield}
          title={q ? tr('لا توجد نتائج', 'No results') : archived ? tr('الأرشيف فارغ', 'Archive is empty') : tr('لا شيء محفوظ بعد', 'Nothing saved yet')}
          body={q ? undefined : tr('احفظ أرقام الموردين، البيانات الإدارية، والنصوص المتكررة.', 'Save supplier numbers, admin details and text you reuse.')}
          action={!q && !archived ? <Button variant="primary" icon={Plus} onClick={() => setForm({})}>{tr('أضف عنصرًا', 'Add an item')}</Button> : undefined}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {shown.map((i) => (
            <article key={i.id} className="card flex flex-col p-4">
              <button type="button" className="min-w-0 flex-1 text-start" onClick={() => setForm({ item: i })}>
                <h3 className="truncate font-bold" dir="auto">{i.title}</h3>
                <p className="mt-1 line-clamp-3 text-[15px] whitespace-pre-line text-muted" dir="auto">{i.content}</p>
              </button>
              <div className="mt-2 flex flex-wrap items-center gap-1">
                {i.category && <Tag>{i.category}</Tag>}
                {i.tags.slice(0, 2).map((t) => <Tag key={t}>#{t}</Tag>)}
                <SyncBadge state={i._sync} compact />
                <span className="ms-auto flex items-center">
                  <IconButton icon={Pin} size="sm" label={tr('تثبيت', 'Pin')} active={i.pinned} onClick={() => void repo.update('vaultItems', i.id, { pinned: !i.pinned })} />
                  <IconButton icon={i.archived ? ArchiveRestore : Archive} size="sm" label={i.archived ? tr('إلغاء الأرشفة', 'Unarchive') : tr('أرشفة', 'Archive')} onClick={() => void repo.update('vaultItems', i.id, { archived: !i.archived })} />
                  {i.url && <a href={i.url} target="_blank" rel="noopener noreferrer" aria-label={tr('فتح الرابط', 'Open link')} className="grid size-9 place-items-center rounded-full hover:bg-raised"><ExternalLink className="size-4.5" /></a>}
                  <IconButton
                    icon={Copy}
                    size="sm"
                    label={tr('نسخ المحتوى', 'Copy content')}
                    onClick={async () => toast((await copyText(i.content)) ? tr('نُسخ', 'Copied') : tr('تعذر النسخ', 'Could not copy'), 'info')}
                  />
                </span>
              </div>
            </article>
          ))}
        </div>
      )}
      {form && <VaultForm key={form.item?.id ?? 'new'} item={form.item} categories={categories} tags={allTags} onClose={() => setForm(null)} />}
    </div>
  )
}

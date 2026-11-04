import { useState, type FormEvent } from 'react'
import { Archive, ArchiveRestore, Pencil, Plus } from 'lucide-react'
import { toast } from '@/components/common/feedback'
import { Button, cx, FormFooter, IconButton, Input, PageHeader, Sheet, Textarea } from '@/components/common/ui'
import { useI18n } from '@/i18n'
import { repo, useCollection } from '@/services/data/store'
import type { LifeDomain, Stored } from '@/types/models'
import { DOMAIN_ICONS, DomainIcon } from './shared'

function DomainForm({ domain, nextOrder, onClose }: { domain?: Stored<LifeDomain>; nextOrder: number; onClose: () => void }) {
  const { tr } = useI18n()
  const [name, setName] = useState(domain?.name ?? '')
  const [description, setDescription] = useState(domain?.description ?? '')
  const [icon, setIcon] = useState(domain?.icon ?? 'Compass')
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return setError(tr('اكتب اسم المجال.', 'Enter a name.'))
    const data = { name: name.trim(), description, icon }
    if (domain) await repo.update('lifeDomains', domain.id, data)
    else await repo.create('lifeDomains', { ...data, satisfaction: null, archived: false, order: nextOrder })
    toast(tr('تم الحفظ', 'Saved'))
    onClose()
  }

  return (
    <Sheet open onClose={onClose} title={domain ? tr('تعديل المجال', 'Edit domain') : tr('مجال جديد', 'New domain')} footer={<FormFooter onCancel={onClose} />}>
      <form id="sheet-form" onSubmit={(e) => void submit(e)} className="space-y-3" noValidate>
        <Input label={tr('الاسم', 'Name')} value={name} onChange={(e) => setName(e.target.value)} error={error} />
        <Textarea label={tr('الوصف', 'Description')} value={description} onChange={(e) => setDescription(e.target.value)} />
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-muted">{tr('الأيقونة', 'Icon')}</legend>
          <div className="flex flex-wrap gap-1.5">
            {Object.keys(DOMAIN_ICONS).map((k) => (
              <button key={k} type="button" aria-label={k} aria-pressed={icon === k} onClick={() => setIcon(k)} className={cx('grid size-11 place-items-center rounded-full transition', icon === k ? 'bg-ink text-canvas' : 'bg-raised hover:bg-line')}>
                <DomainIcon name={k} className="size-5" />
              </button>
            ))}
          </div>
        </fieldset>
      </form>
    </Sheet>
  )
}

export default function DomainsPage() {
  const { tr } = useI18n()
  const { items } = useCollection('lifeDomains')
  const goals = useCollection('lifeGoals').items
  const [form, setForm] = useState<{ domain?: Stored<LifeDomain> } | null>(null)
  const sorted = [...items].sort((a, b) => a.order - b.order)
  const active = sorted.filter((d) => !d.archived)
  const archived = sorted.filter((d) => d.archived)

  const row = (d: Stored<LifeDomain>) => (
    <article key={d.id} className="card flex items-start gap-3 p-4">
      <span className="grid size-12 shrink-0 place-items-center rounded-full bg-raised"><DomainIcon name={d.icon} className="size-5" /></span>
      <div className="min-w-0 flex-1">
        <h3 className="font-bold" dir="auto">{d.name}</h3>
        <p className="text-[15px] text-muted" dir="auto">{d.description}</p>
        <p className="mt-1 text-xs text-faint">{tr(`${goals.filter((g) => g.domainId === d.id).length} هدف`, `${goals.filter((g) => g.domainId === d.id).length} goals`)}</p>
      </div>
      <IconButton size="sm" icon={Pencil} label={tr('تعديل', 'Edit')} onClick={() => setForm({ domain: d })} />
      <IconButton
        size="sm"
        icon={d.archived ? ArchiveRestore : Archive}
        label={d.archived ? tr('استعادة', 'Restore') : tr('أرشفة', 'Archive')}
        onClick={() => void repo.update('lifeDomains', d.id, { archived: !d.archived })}
      />
    </article>
  )

  return (
    <div>
      <PageHeader
        title={tr('مجالات الحياة', 'Life domains')}
        subtitle={tr('الأركان التي تبني عليها حياتك.', 'The pillars your life is built on.')}
        actions={<Button variant="primary" icon={Plus} capsule onClick={() => setForm({})}>{tr('مجال', 'Domain')}</Button>}
      />
      <div className="grid gap-3 lg:grid-cols-2">{active.map(row)}</div>
      {archived.length > 0 && (
        <details className="mt-6">
          <summary className="min-h-10 py-2 font-medium text-muted">{tr(`المؤرشفة (${archived.length})`, `Archived (${archived.length})`)}</summary>
          <div className="mt-2 grid gap-3 lg:grid-cols-2">{archived.map(row)}</div>
        </details>
      )}
      {form && <DomainForm key={form.domain?.id ?? 'new'} domain={form.domain} nextOrder={items.length} onClose={() => setForm(null)} />}
    </div>
  )
}

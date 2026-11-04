/**
 * Full JSON backup and validated restore. Record ids are preserved, so relationships between
 * records survive. A restore always previews its effects first and never silently overwrites.
 */
import { COLLECTIONS, type BaseRecord, type CollectionMap, type CollectionName } from '@/types/models'
import { isValidDate } from '@/utils/dates'
import { downloadBlob } from '@/utils/csv'
import { allRowsFor, repo } from './store'

const FORMAT = 'osama-hub-backup'
const VERSION = 1

export interface BackupFile {
  format: typeof FORMAT
  version: number
  exportedAt: string
  data: Partial<Record<CollectionName, Record<string, unknown>[]>>
}

export async function buildBackup(): Promise<BackupFile> {
  const data: BackupFile['data'] = {}
  for (const c of COLLECTIONS) {
    const rows = await allRowsFor(c)
    // Tombstones are not needed in a backup, and neither is local sync state.
    data[c] = rows.filter((r) => !r.deletedAt).map(({ _sync: _ignored, ...rest }) => rest as unknown as Record<string, unknown>)
  }
  return { format: FORMAT, version: VERSION, exportedAt: new Date().toISOString(), data }
}

export async function exportBackup() {
  const backup = await buildBackup()
  const blob = new Blob([JSON.stringify(backup, null, 1)], { type: 'application/json' })
  downloadBlob(blob, `osama-hub-backup-${backup.exportedAt.slice(0, 10)}.json`)
}

export interface RestorePlan {
  backup: BackupFile
  exportedAt: string
  /** Records in the backup that do not exist here. */
  newCount: number
  /** Records that exist on both sides and differ. */
  conflictCount: number
  sameCount: number
  errors: string[]
  byCollection: { name: CollectionName; fresh: number; conflicting: number }[]
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

function validateRecord(c: CollectionName, r: Record<string, unknown>): string | null {
  if (typeof r.id !== 'string' || !r.id || r.id.includes('/')) return 'invalid id'
  if (typeof r.createdAt !== 'string' || typeof r.updatedAt !== 'string') return 'missing timestamps'
  if (c === 'income' || c === 'expenses' || c === 'partnerPayments') {
    if (!Number.isSafeInteger(r.amountMinor) || (r.amountMinor as number) <= 0) return 'invalid amount'
    if (typeof r.date !== 'string' || !isValidDate(r.date)) return 'invalid date'
  }
  return null
}

/** Checks the whole file before anything is applied. Any invalid record blocks the restore. */
export async function planRestore(text: string): Promise<RestorePlan> {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('not-json')
  }
  if (!isObj(parsed) || parsed.format !== FORMAT || !isObj(parsed.data)) throw new Error('not-backup')
  if (typeof parsed.version !== 'number' || parsed.version > VERSION) throw new Error('newer-version')
  const backup = parsed as unknown as BackupFile
  const errors: string[] = []
  const byCollection: RestorePlan['byCollection'] = []
  let newCount = 0
  let conflictCount = 0
  let sameCount = 0
  for (const [name, rows] of Object.entries(backup.data)) {
    if (!COLLECTIONS.includes(name as CollectionName)) {
      errors.push(`${name}: unknown collection`)
      continue
    }
    if (!Array.isArray(rows)) {
      errors.push(`${name}: not a list`)
      continue
    }
    const c = name as CollectionName
    const existing = new Map((await allRowsFor(c)).map((r) => [r.id, r]))
    let fresh = 0
    let conflicting = 0
    for (const r of rows) {
      const problem = isObj(r) ? validateRecord(c, r) : 'not an object'
      if (problem) {
        errors.push(`${name}/${isObj(r) ? String(r.id) : '?'}: ${problem}`)
        continue
      }
      const current = existing.get(r.id as string)
      if (!current || current.deletedAt) fresh++
      else if (current.updatedAt === r.updatedAt) sameCount++
      else conflicting++
    }
    newCount += fresh
    conflictCount += conflicting
    if (fresh || conflicting) byCollection.push({ name: c, fresh, conflicting })
  }
  return { backup, exportedAt: String(parsed.exportedAt ?? ''), newCount, conflictCount, sameCount, errors, byCollection }
}

export type RestoreMode = 'addOnly' | 'keepNewer' | 'replace'

/**
 * addOnly: only adds records missing here. keepNewer: also updates a record when the backup's copy
 * is newer. replace: the backup's copy always wins for records it contains. No mode deletes anything.
 */
export async function applyRestore(plan: RestorePlan, mode: RestoreMode): Promise<number> {
  let applied = 0
  for (const [name, rows] of Object.entries(plan.backup.data)) {
    const c = name as CollectionName
    const existing = new Map((await allRowsFor(c)).map((r) => [r.id, r]))
    const toWrite: BaseRecord[] = []
    for (const r of rows as unknown as BaseRecord[]) {
      const current = existing.get(r.id)
      if (!current || current.deletedAt) toWrite.push(r)
      else if (current.updatedAt === r.updatedAt) continue
      else if (mode === 'replace') toWrite.push(r)
      else if (mode === 'keepNewer' && r.updatedAt > current.updatedAt) toWrite.push(r)
    }
    if (toWrite.length) {
      const stamped = toWrite.map((r) => ({ ...r, deletedAt: null })) as unknown as CollectionMap[typeof c][]
      await repo.putMany(c, stamped)
      applied += toWrite.length
    }
  }
  return applied
}

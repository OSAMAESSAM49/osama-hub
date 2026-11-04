/**
 * The local-first data layer. IndexedDB is the source of truth for the UI.
 * Every write commits the record and its outbox entry in ONE transaction, so a refresh or crash
 * can never leave an edit without its pending sync operation.
 */
import { useSyncExternalStore } from 'react'
import { newId } from '@/utils/text'
import {
  COLLECTIONS, type BaseRecord, type CollectionMap, type CollectionName, type ConflictCopy, type OutboxOp, type Stored,
  type SyncState,
} from '@/types/models'
import { openLocalDb, recordKey, type LocalDb, type RecordRow } from '@/services/storage/localDb'

type Rec<K extends CollectionName> = Stored<CollectionMap[K]>

interface Cache {
  byId: Map<string, Stored<BaseRecord>>
  /** Stable snapshot of live (non-deleted) records for useSyncExternalStore. */
  snapshot: Stored<BaseRecord>[]
  loaded: boolean
  loading: Promise<void> | null
  listeners: Set<() => void>
}

let db: LocalDb | null = null
let currentUid: string | null = null
const caches = new Map<CollectionName, Cache>()
const changeListeners = new Set<() => void>()
const EMPTY: never[] = []

function cacheOf(name: CollectionName): Cache {
  let c = caches.get(name)
  if (!c) {
    c = { byId: new Map(), snapshot: EMPTY, loaded: false, loading: null, listeners: new Set() }
    caches.set(name, c)
  }
  return c
}

function publish(name: CollectionName) {
  const c = cacheOf(name)
  c.snapshot = [...c.byId.values()].filter((r) => !r.deletedAt)
  c.listeners.forEach((l) => l())
}

export function getDb(): LocalDb {
  if (!db) throw new Error('Local database is not open')
  return db
}
export const getUid = () => currentUid

/** Opens the signed-in user's database and resets all in-memory caches. */
export async function openUserData(uid: string) {
  if (currentUid === uid && db) return
  db?.close()
  db = await openLocalDb(uid)
  currentUid = uid
  for (const c of caches.values()) {
    c.byId.clear()
    c.snapshot = EMPTY
    c.loaded = false
    c.loading = null
    c.listeners.forEach((l) => l())
  }
}

export function closeUserData() {
  db?.close()
  db = null
  currentUid = null
  for (const c of caches.values()) {
    c.byId.clear()
    c.snapshot = EMPTY
    c.loaded = false
    c.loading = null
  }
}

export function ensureLoaded(name: CollectionName): Promise<void> {
  const c = cacheOf(name)
  if (c.loaded) return Promise.resolve()
  if (!db) return Promise.resolve()
  if (!c.loading) {
    const source = db
    c.loading = source.getAllFromIndex('records', 'collection', name).then((rows) => {
      if (source !== db) return
      c.byId = new Map(rows.map((r) => [r.rec.id, r.rec as unknown as Stored<BaseRecord>]))
      c.loaded = true
      publish(name)
    })
  }
  return c.loading
}

export const loadAll = () => Promise.all(COLLECTIONS.map(ensureLoaded))

/** Subscribes a component to a collection and returns live records. Loads lazily on first use. */
export function useCollection<K extends CollectionName>(name: K): { items: Rec<K>[]; loading: boolean } {
  const c = cacheOf(name)
  const items = useSyncExternalStore(
    (l) => {
      c.listeners.add(l)
      void ensureLoaded(name)
      return () => c.listeners.delete(l)
    },
    () => c.snapshot,
  ) as Rec<K>[]
  return { items, loading: !c.loaded }
}

export function getAll<K extends CollectionName>(name: K): Rec<K>[] {
  return cacheOf(name).snapshot as Rec<K>[]
}
export function getOne<K extends CollectionName>(name: K, id: string): Rec<K> | undefined {
  const r = cacheOf(name).byId.get(id)
  return r && !r.deletedAt ? (r as Rec<K>) : undefined
}

/** Fires after any local write so the sync engine can schedule a push. */
export function onLocalChange(fn: () => void) {
  changeListeners.add(fn)
  return () => changeListeners.delete(fn)
}

const stripLocal = (rec: Record<string, unknown>) => {
  const { _sync: _ignored, ...rest } = rec
  // A JSON round trip removes undefined values, which Firestore rejects.
  return JSON.parse(JSON.stringify(rest)) as Record<string, unknown>
}

function buildOp(name: CollectionName, rec: Stored<BaseRecord>, type: OutboxOp['type']): OutboxOp {
  return {
    key: recordKey(name, rec.id),
    opId: newId(),
    collection: name,
    docId: rec.id,
    type,
    payload: stripLocal(rec as unknown as Record<string, unknown>),
    timestamp: new Date().toISOString(),
    retryCount: 0,
    errorStatus: null,
    nextAttemptAt: 0,
  }
}

async function writeLocal<K extends CollectionName>(name: K, recs: Rec<K>[], type: OutboxOp['type'], queue = true) {
  const tx = getDb().transaction(['records', 'outbox'], 'readwrite')
  const records = tx.objectStore('records')
  const outbox = tx.objectStore('outbox')
  const ops: Promise<unknown>[] = []
  for (const rec of recs) {
    const row: RecordRow = { key: recordKey(name, rec.id), collection: name, rec: rec as unknown as RecordRow['rec'] }
    ops.push(records.put(row))
    if (queue) ops.push(outbox.put(buildOp(name, rec as unknown as Stored<BaseRecord>, type)))
  }
  await Promise.all(ops)
  await tx.done
  // Memory updates only after the transaction has committed.
  const c = cacheOf(name)
  for (const rec of recs) c.byId.set(rec.id, rec as unknown as Stored<BaseRecord>)
  publish(name)
  if (queue) changeListeners.forEach((l) => l())
}

export const repo = {
  async create<K extends CollectionName>(
    name: K,
    data: Omit<CollectionMap[K], keyof BaseRecord> & { id?: string },
  ): Promise<Rec<K>> {
    await ensureLoaded(name)
    const now = new Date().toISOString()
    const rec = { ...data, id: data.id ?? newId(), createdAt: now, updatedAt: now, _sync: 'local' as SyncState } as unknown as Rec<K>
    await writeLocal(name, [rec], 'upsert')
    return rec
  },

  async update<K extends CollectionName>(name: K, id: string, patch: Partial<CollectionMap[K]>): Promise<Rec<K>> {
    await ensureLoaded(name)
    const current = cacheOf(name).byId.get(id)
    if (!current) throw new Error(`Record not found: ${name}/${id}`)
    const rec = { ...current, ...patch, id, updatedAt: new Date().toISOString(), _sync: 'local' as SyncState } as unknown as Rec<K>
    await writeLocal(name, [rec], 'upsert')
    return rec
  },

  /** Writes a record with a fixed id whether or not it already exists (used for singletons). */
  async upsert<K extends CollectionName>(name: K, id: string, patch: Partial<CollectionMap[K]>, defaults: CollectionMap[K]): Promise<Rec<K>> {
    await ensureLoaded(name)
    const current = cacheOf(name).byId.get(id)
    const now = new Date().toISOString()
    const rec = {
      ...defaults, ...(current ?? {}), ...patch, id,
      createdAt: current?.createdAt ?? now, updatedAt: now, deletedAt: null, _sync: 'local' as SyncState,
    } as unknown as Rec<K>
    await writeLocal(name, [rec], 'upsert')
    return rec
  },

  /** Soft delete. Other devices learn of the removal when the tombstone syncs. */
  async remove(name: CollectionName, id: string) {
    await ensureLoaded(name)
    const current = cacheOf(name).byId.get(id)
    if (!current) return
    const now = new Date().toISOString()
    const rec = { ...current, deletedAt: now, updatedAt: now, _sync: 'local' as SyncState }
    await writeLocal(name, [rec as never], 'delete')
  },

  async removeMany(name: CollectionName, ids: string[]) {
    await ensureLoaded(name)
    const now = new Date().toISOString()
    const recs = ids
      .map((id) => cacheOf(name).byId.get(id))
      .filter(Boolean)
      .map((r) => ({ ...r!, deletedAt: now, updatedAt: now, _sync: 'local' as SyncState }))
    if (recs.length) await writeLocal(name, recs as never[], 'delete')
  },

  async putMany<K extends CollectionName>(name: K, recs: CollectionMap[K][]) {
    await ensureLoaded(name)
    await writeLocal(name, recs.map((r) => ({ ...r, _sync: 'local' as SyncState })) as never[], 'upsert')
  },

  /** Default content with stable ids. It stays local until edited, so seeding never costs cloud writes. */
  async seedLocal<K extends CollectionName>(name: K, recs: CollectionMap[K][]) {
    await ensureLoaded(name)
    const fresh = recs.filter((r) => !cacheOf(name).byId.has(r.id))
    if (fresh.length) await writeLocal(name, fresh.map((r) => ({ ...r, _sync: 'synced' as SyncState })) as never[], 'upsert', false)
  },
}

// ── Sync engine hooks ──

export async function applyRemote(name: CollectionName, docs: Record<string, unknown>[]) {
  if (!docs.length) return { conflicts: 0 }
  await ensureLoaded(name)
  const tx = getDb().transaction(['records', 'outbox', 'conflicts'], 'readwrite')
  const applied: Stored<BaseRecord>[] = []
  let conflicts = 0
  for (const raw of docs) {
    const remote = raw as unknown as BaseRecord
    const key = recordKey(name, remote.id)
    const row = await tx.objectStore('records').get(key)
    const pending = await tx.objectStore('outbox').get(key)
    const local = row?.rec as unknown as Stored<BaseRecord> | undefined
    if (pending && local) {
      // Both sides changed. The later edit wins; the losing local version is kept, never discarded.
      if (remote.updatedAt > local.updatedAt) {
        const copy: ConflictCopy = {
          key, collection: name, docId: remote.id, savedAt: new Date().toISOString(), local: pending.payload,
        }
        await tx.objectStore('conflicts').put(copy)
        await tx.objectStore('outbox').delete(key)
        conflicts++
      } else {
        continue // Local is newer or the same: the queued push will win.
      }
    } else if (local && local.updatedAt === remote.updatedAt) {
      if (local._sync === 'synced') continue
    } else if (local && local.updatedAt > remote.updatedAt) {
      continue
    }
    const rec = { ...remote, _sync: 'synced' as SyncState }
    await tx.objectStore('records').put({ key, collection: name, rec: rec as unknown as RecordRow['rec'] })
    applied.push(rec)
  }
  await tx.done
  const c = cacheOf(name)
  for (const rec of applied) c.byId.set(rec.id, rec)
  if (applied.length) publish(name)
  return { conflicts }
}

export async function setRecordSyncState(ops: OutboxOp[], state: SyncState) {
  if (!ops.length) return
  const tx = getDb().transaction('records', 'readwrite')
  const touched = new Set<CollectionName>()
  for (const op of ops) {
    const row = await tx.store.get(op.key)
    if (!row) continue
    const rec = { ...row.rec, _sync: state }
    await tx.store.put({ ...row, rec })
    const c = cacheOf(op.collection)
    if (c.loaded) {
      c.byId.set(op.docId, rec as unknown as Stored<BaseRecord>)
      touched.add(op.collection)
    }
  }
  await tx.done
  touched.forEach(publish)
}

/** Marks operations as confirmed by Firebase. An edit made during the upload stays queued. */
export async function completeOps(ops: OutboxOp[]) {
  const tx = getDb().transaction(['records', 'outbox'], 'readwrite')
  const touched = new Set<CollectionName>()
  for (const op of ops) {
    const current = await tx.objectStore('outbox').get(op.key)
    if (current?.opId !== op.opId) continue
    await tx.objectStore('outbox').delete(op.key)
    const row = await tx.objectStore('records').get(op.key)
    if (row) {
      const rec = { ...row.rec, _sync: 'synced' }
      await tx.objectStore('records').put({ ...row, rec })
      const c = cacheOf(op.collection)
      if (c.loaded) {
        c.byId.set(op.docId, rec as unknown as Stored<BaseRecord>)
        touched.add(op.collection)
      }
    }
  }
  await tx.done
  touched.forEach(publish)
}

export async function failOp(op: OutboxOp, status: string) {
  const tx = getDb().transaction('outbox', 'readwrite')
  const current = await tx.store.get(op.key)
  if (current?.opId === op.opId) {
    const retryCount = current.retryCount + 1
    // Exponential backoff, capped at one hour.
    const delay = Math.min(3_600_000, 30_000 * 2 ** Math.min(retryCount, 7))
    await tx.store.put({ ...current, retryCount, errorStatus: status, nextAttemptAt: Date.now() + delay })
  }
  await tx.done
}

export const listOutbox = () => getDb().getAll('outbox')
export const listConflicts = () => getDb().getAll('conflicts')

export async function retryFailed() {
  const tx = getDb().transaction('outbox', 'readwrite')
  for (const op of await tx.store.getAll()) {
    if (op.errorStatus) await tx.store.put({ ...op, nextAttemptAt: 0, errorStatus: null, retryCount: 0 })
  }
  await tx.done
}

/** Restores the saved local copy of a conflict as a new edit, or dismisses it. */
export async function resolveConflict(key: string, restore: boolean) {
  const copy = await getDb().get('conflicts', key)
  if (!copy) return
  if (restore) {
    const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = copy.local as unknown as BaseRecord & Record<string, unknown>
    await repo.update(copy.collection, copy.docId, rest as never)
  }
  await getDb().delete('conflicts', key)
}

export const metaGet = <T>(key: string) => getDb().get('meta', key) as Promise<T | undefined>
export const metaSet = (key: string, value: unknown) => getDb().put('meta', value, key)

export async function allRowsFor(name: CollectionName) {
  await ensureLoaded(name)
  return [...cacheOf(name).byId.values()]
}

import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { CollectionName, ConflictCopy, OutboxOp } from '@/types/models'

export interface StoredBlob {
  key: string
  /** Stored as an ArrayBuffer because Blobs in IndexedDB are unreliable on some iOS versions. */
  data: ArrayBuffer
  mime: string
  size: number
  savedAt: string
}

export interface RecordRow {
  key: string
  collection: CollectionName
  rec: Record<string, unknown> & { id: string; _sync: string }
}

interface HubDB extends DBSchema {
  records: { key: string; value: RecordRow; indexes: { collection: string } }
  outbox: { key: string; value: OutboxOp }
  blobs: { key: string; value: StoredBlob }
  conflicts: { key: string; value: ConflictCopy }
  meta: { key: string; value: unknown }
}

export type LocalDb = IDBPDatabase<HubDB>

/** Each account gets its own database, so two users of one device never see each other's data. */
export function openLocalDb(uid: string): Promise<LocalDb> {
  return openDB<HubDB>(`osama-hub-${uid}`, 1, {
    upgrade(db) {
      db.createObjectStore('records', { keyPath: 'key' }).createIndex('collection', 'collection')
      db.createObjectStore('outbox', { keyPath: 'key' })
      db.createObjectStore('blobs', { keyPath: 'key' })
      db.createObjectStore('conflicts', { keyPath: 'key' })
      db.createObjectStore('meta')
    },
  })
}

export const recordKey = (collection: string, id: string) => `${collection}/${id}`

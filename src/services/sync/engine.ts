/**
 * Sync engine: pull changed documents, then push the outbox.
 *
 * It uses Firestore Lite (plain request/response). There are no real-time listeners and no SDK
 * offline cache, so a write is only reported as synced after Firebase has answered. Reads stay low
 * because each collection only fetches documents changed since its stored cursor.
 *
 * Conflict rule: the later client edit wins. A losing local edit is saved to the conflicts store.
 */
import { useSyncExternalStore } from 'react'
import { COLLECTIONS, type CollectionName, type OutboxOp } from '@/types/models'
import {
  applyRemote, completeOps, failOp, getUid, listConflicts, listOutbox, metaGet, metaSet, onLocalChange, retryFailed,
  setRecordSyncState,
} from '@/services/data/store'
import { getFirebaseApp, isFirebaseConfigured, useEmulators } from '@/services/firebase/config'

export interface SyncStatus {
  mode: 'local-only' | 'cloud'
  online: boolean
  running: boolean
  pending: number
  failed: number
  conflicts: number
  lastSyncAt: string | null
  lastError: string | null
}

let status: SyncStatus = {
  mode: isFirebaseConfigured ? 'cloud' : 'local-only',
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  running: false,
  pending: 0,
  failed: 0,
  conflicts: 0,
  lastSyncAt: null,
  lastError: null,
}
const listeners = new Set<() => void>()

function setStatus(patch: Partial<SyncStatus>) {
  status = { ...status, ...patch }
  listeners.forEach((l) => l())
}

export const useSyncStatus = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => status,
  )

export async function refreshCounts() {
  if (!getUid()) return
  const [ops, conflicts] = await Promise.all([listOutbox(), listConflicts()])
  setStatus({ pending: ops.filter((o) => !o.errorStatus).length, failed: ops.filter((o) => o.errorStatus).length, conflicts: conflicts.length })
}

type Lite = typeof import('firebase/firestore/lite')
let lite: { sdk: Lite; db: import('firebase/firestore/lite').Firestore } | null = null

async function getLite() {
  if (!lite) {
    const [sdk, app] = await Promise.all([import('firebase/firestore/lite'), getFirebaseApp()])
    const db = sdk.getFirestore(app)
    if (useEmulators) sdk.connectFirestoreEmulator(db, '127.0.0.1', 8080)
    lite = { sdk, db }
  }
  return lite
}

const PAGE = 300
/** Re-read a small window, because commit timestamps may land slightly out of order. */
const CURSOR_OVERLAP_MS = 15_000
const PULL_THROTTLE_MS = 5 * 60_000
const PUSH_DEBOUNCE_MS = 2500
const BATCH = 200
const TRANSIENT = new Set(['unavailable', 'deadline-exceeded', 'resource-exhausted', 'aborted', 'internal', 'cancelled'])

/** Requests can hang forever on captive portals and bad networks, which would block all later syncs. */
export const networkConfig = { timeoutMs: 20_000 }

function withTimeout<T>(work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error('timeout'), { code: 'deadline-exceeded' })), networkConfig.timeoutMs)
  })
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer))
}

const errorCode = (e: unknown) => {
  const code = (e as { code?: string })?.code ?? ''
  return code.replace(/^firestore\//, '') || 'unavailable'
}

async function pullCollection(uid: string, name: CollectionName) {
  const { sdk, db } = await getLite()
  const cursor = (await metaGet<number>(`cursor:${name}`)) ?? 0
  const col = sdk.collection(db, 'users', uid, name)
  let last: import('firebase/firestore/lite').QueryDocumentSnapshot | null = null
  let maxMs = cursor
  for (;;) {
    const constraints = [
      sdk.where('serverUpdatedAt', '>', sdk.Timestamp.fromMillis(Math.max(0, cursor - CURSOR_OVERLAP_MS))),
      sdk.orderBy('serverUpdatedAt'),
      ...(last ? [sdk.startAfter(last)] : []),
      sdk.limit(PAGE),
    ]
    const snap: import('firebase/firestore/lite').QuerySnapshot = await withTimeout(sdk.getDocs(sdk.query(col, ...constraints)))
    const docs = snap.docs.map((d) => {
      const { serverUpdatedAt, ...rest } = d.data()
      const ms = (serverUpdatedAt as import('firebase/firestore/lite').Timestamp | undefined)?.toMillis() ?? 0
      if (ms > maxMs) maxMs = ms
      return { ...rest, id: d.id }
    })
    await applyRemote(name, docs)
    if (snap.docs.length < PAGE) break
    last = snap.docs[snap.docs.length - 1] ?? null
  }
  if (maxMs > cursor) await metaSet(`cursor:${name}`, maxMs)
}

async function commitOps(ops: OutboxOp[]) {
  const { sdk, db } = await getLite()
  const uid = getUid()!
  const batch = sdk.writeBatch(db)
  for (const op of ops) {
    batch.set(sdk.doc(db, 'users', uid, op.collection, op.docId), { ...op.payload, serverUpdatedAt: sdk.serverTimestamp() })
  }
  // A commit that timed out may still have landed. Retrying is safe because document ids are stable.
  await withTimeout(batch.commit())
}

async function push(): Promise<boolean> {
  const now = Date.now()
  const ops = (await listOutbox()).filter((o) => o.nextAttemptAt <= now)
  for (let i = 0; i < ops.length; i += BATCH) {
    const chunk = ops.slice(i, i + BATCH)
    await setRecordSyncState(chunk, 'pending')
    try {
      await commitOps(chunk)
      await completeOps(chunk)
    } catch (e) {
      const code = errorCode(e)
      if (TRANSIENT.has(code)) {
        // Network trouble: nothing is lost. Everything stays queued for the next attempt.
        await setRecordSyncState(ops.slice(i), 'local')
        setStatus({ lastError: code })
        return false
      }
      // One rejected document must not block the rest, so isolate them one at a time.
      for (const op of chunk) {
        try {
          await commitOps([op])
          await completeOps([op])
        } catch (inner) {
          const innerCode = errorCode(inner)
          if (TRANSIENT.has(innerCode)) {
            await setRecordSyncState([op], 'local')
          } else {
            await failOp(op, innerCode)
            await setRecordSyncState([op], 'failed')
          }
        }
      }
    }
  }
  return true
}

let running = false
let again = false
let lastPullAt = 0
let timer: ReturnType<typeof setTimeout> | null = null

/** Runs one sync pass. Pull comes first so that conflicts are resolved before anything is overwritten. */
export async function syncNow({ pull = true }: { pull?: boolean } = {}) {
  if (!isFirebaseConfigured || !getUid()) {
    await refreshCounts()
    return
  }
  if (!navigator.onLine) {
    setStatus({ online: false })
    await refreshCounts()
    return
  }
  if (running) {
    again = true
    return
  }
  running = true
  setStatus({ running: true, online: true })
  const uid = getUid()!
  try {
    if (pull) {
      await Promise.all(COLLECTIONS.map((c) => pullCollection(uid, c)))
      lastPullAt = Date.now()
    }
    if (getUid() !== uid) return
    const ok = await push()
    await refreshCounts()
    if (ok) {
      const at = new Date().toISOString()
      await metaSet('lastSyncAt', at)
      setStatus({ lastSyncAt: at, lastError: status.failed ? status.lastError : null })
    }
  } catch (e) {
    setStatus({ lastError: errorCode(e) })
    await refreshCounts().catch(() => undefined)
  } finally {
    running = false
    setStatus({ running: false })
    if (again) {
      again = false
      schedulePush()
    }
  }
}

function schedulePush() {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => void syncNow({ pull: false }), PUSH_DEBOUNCE_MS)
}

export async function retryNow() {
  await retryFailed()
  await syncNow()
}

let unsub: (() => void) | null = null

/** Starts automatic sync for the open user. Returns a stop function. */
export function startSync() {
  stopSync()
  const onOnline = () => {
    setStatus({ online: true })
    void syncNow()
  }
  const onOffline = () => setStatus({ online: false })
  const onVisible = () => {
    if (document.visibilityState === 'visible' && Date.now() - lastPullAt > PULL_THROTTLE_MS) void syncNow()
  }
  window.addEventListener('online', onOnline)
  window.addEventListener('offline', onOffline)
  document.addEventListener('visibilitychange', onVisible)
  const off = onLocalChange(() => {
    void refreshCounts()
    schedulePush()
  })
  const retryTimer = setInterval(() => void syncNow({ pull: false }), 60_000)
  void metaGet<string>('lastSyncAt').then((at) => setStatus({ lastSyncAt: at ?? null }))
  void syncNow()
  unsub = () => {
    window.removeEventListener('online', onOnline)
    window.removeEventListener('offline', onOffline)
    document.removeEventListener('visibilitychange', onVisible)
    off()
    clearInterval(retryTimer)
    if (timer) clearTimeout(timer)
  }
  return stopSync
}

export function stopSync() {
  unsub?.()
  unsub = null
  lastPullAt = 0
}

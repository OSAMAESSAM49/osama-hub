/**
 * Local-first blob storage. Audio and images are written to IndexedDB first, always.
 * Cloud Storage (Blaze plan only) is an optional extra copy, and the local copy is never deleted
 * before Firebase has confirmed the upload.
 */
import { useSyncExternalStore } from 'react'
import { ensureLoaded, getAll, getDb, getUid, repo } from '@/services/data/store'
import { getFirebaseApp, isCloudStorageEnabled, useEmulators } from '@/services/firebase/config'
import type { VoiceNote } from '@/types/models'

export async function putBlob(key: string, blob: Blob) {
  await getDb().put('blobs', { key, data: await blob.arrayBuffer(), mime: blob.type, size: blob.size, savedAt: new Date().toISOString() })
}
export async function getBlob(key: string): Promise<Blob | null> {
  const row = await getDb().get('blobs', key)
  return row ? new Blob([row.data], { type: row.mime }) : null
}
export const hasBlob = async (key: string) => !!(await getDb().getKey('blobs', key))
export const deleteBlob = (key: string) => getDb().delete('blobs', key)
export const voiceKey = (id: string) => `voice:${id}`

type StorageSdk = typeof import('firebase/storage')
let storage: { sdk: StorageSdk; inst: import('firebase/storage').FirebaseStorage } | null = null

async function getStorageSdk() {
  if (!isCloudStorageEnabled) throw new Error('Cloud Storage is not enabled')
  if (!storage) {
    const [sdk, app] = await Promise.all([import('firebase/storage'), getFirebaseApp()])
    const inst = sdk.getStorage(app)
    if (useEmulators) sdk.connectStorageEmulator(inst, '127.0.0.1', 9199)
    storage = { sdk, inst }
  }
  return storage
}

// ── Upload progress, for the UI ──
let progress: Record<string, number> = {}
const listeners = new Set<() => void>()
const setProgress = (id: string, value: number | null) => {
  const next = { ...progress }
  if (value === null) delete next[id]
  else next[id] = value
  progress = next
  listeners.forEach((l) => l())
}
export const useUploadProgress = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => progress,
  )

const active = new Set<string>()

/** Uploads one voice note. Metadata only records the path after Firebase confirms the upload. */
export async function uploadVoice(note: VoiceNote): Promise<void> {
  if (!isCloudStorageEnabled || active.has(note.id)) return
  const uid = getUid()
  if (!uid) return
  const blob = await getBlob(voiceKey(note.id))
  if (!blob) return
  active.add(note.id)
  const path = `users/${uid}/voice/${note.id}`
  try {
    await repo.update('voiceNotes', note.id, { uploadState: 'uploading', uploadError: null })
    const { sdk, inst } = await getStorageSdk()
    const task = sdk.uploadBytesResumable(sdk.ref(inst, path), blob, { contentType: blob.type || 'audio/webm' })
    await new Promise<void>((resolve, reject) => {
      task.on(
        'state_changed',
        (s) => setProgress(note.id, s.totalBytes ? Math.round((s.bytesTransferred / s.totalBytes) * 100) : 0),
        reject,
        resolve,
      )
    })
    await repo.update('voiceNotes', note.id, { uploadState: 'uploaded', storagePath: path, uploadError: null })
  } catch (e) {
    const code = (e as { code?: string }).code ?? 'storage/unknown'
    await repo.update('voiceNotes', note.id, { uploadState: 'failed', uploadError: code })
  } finally {
    active.delete(note.id)
    setProgress(note.id, null)
  }
}

/** Resumes anything queued or interrupted. Runs at startup and when the connection returns. */
export async function resumeUploads() {
  if (!isCloudStorageEnabled || !navigator.onLine || !getUid()) return
  await ensureLoaded('voiceNotes')
  for (const n of getAll('voiceNotes')) {
    if (n.uploadState !== 'uploaded' && n.uploadState !== 'localOnly' && !active.has(n.id) && (await hasBlob(voiceKey(n.id)))) {
      await uploadVoice(n)
    }
  }
}

export async function voiceDownloadUrl(path: string): Promise<string> {
  const { sdk, inst } = await getStorageSdk()
  return sdk.getDownloadURL(sdk.ref(inst, path))
}

/** Cloud deletes that could not run now are remembered and retried when back online. */
export async function deleteCloudFile(path: string) {
  const list = ((await getDb().get('meta', 'pendingCloudDeletes')) as string[] | undefined) ?? []
  await getDb().put('meta', [...list, path], 'pendingCloudDeletes')
  await flushCloudDeletes()
}

export async function flushCloudDeletes() {
  if (!isCloudStorageEnabled || !navigator.onLine || !getUid()) return
  const list = ((await getDb().get('meta', 'pendingCloudDeletes')) as string[] | undefined) ?? []
  if (!list.length) return
  const { sdk, inst } = await getStorageSdk()
  const remaining: string[] = []
  for (const path of list) {
    try {
      await sdk.deleteObject(sdk.ref(inst, path))
    } catch (e) {
      if ((e as { code?: string }).code !== 'storage/object-not-found') remaining.push(path)
    }
  }
  await getDb().put('meta', remaining, 'pendingCloudDeletes')
}

/** Local storage use and browser quota, for the Settings page. */
export async function storageReport() {
  const blobs = await getDb().getAll('blobs')
  const est = await navigator.storage?.estimate?.().catch(() => undefined)
  const persisted = await navigator.storage?.persisted?.().catch(() => false)
  return {
    blobBytes: blobs.reduce((s, b) => s + b.size, 0),
    blobCount: blobs.length,
    usage: est?.usage ?? null,
    quota: est?.quota ?? null,
    persisted: !!persisted,
  }
}


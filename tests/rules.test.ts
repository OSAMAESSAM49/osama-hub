/**
 * Security rules tests. They run against the Firebase Emulator Suite only, on a demo project that
 * cannot touch real data:
 *   npm run test:rules
 * Requires Java 11+ (used by the emulators).
 */
import { readFileSync } from 'node:fs'
import {
  assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore'
import { getBytes, ref, uploadBytes } from 'firebase/storage'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'

let env: RulesTestEnvironment

const envelope = (id: string) => ({
  id, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', serverUpdatedAt: serverTimestamp(),
})
const income = (id: string, amountMinor: unknown = 10000) => ({ ...envelope(id), amountMinor, date: '2026-01-01', categoryId: 'other' })
const note = (id: string) => ({ ...envelope(id), title: 'x' })

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-osama-hub',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
    storage: { rules: readFileSync('storage.rules', 'utf8'), host: '127.0.0.1', port: 9199 },
  })
})
afterAll(() => env.cleanup())
beforeEach(async () => {
  await env.clearFirestore()
  await env.clearStorage()
})

const db = (uid?: string) => (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).firestore()
const seed = (path: string, data: Record<string, unknown>) =>
  env.withSecurityRulesDisabled((c) => setDoc(doc(c.firestore(), path), data))

describe('access control', () => {
  it('denies all access when signed out', async () => {
    await seed('users/alice/notes/n1', { id: 'n1' })
    await assertFails(getDoc(doc(db(), 'users/alice/notes/n1')))
    await assertFails(getDocs(collection(db(), 'users/alice/notes')))
    await assertFails(setDoc(doc(db(), 'users/alice/notes/n2'), note('n2')))
  })

  it('lets an owner read and write their own data', async () => {
    const d = db('alice')
    await assertSucceeds(setDoc(doc(d, 'users/alice/notes/n1'), note('n1')))
    await assertSucceeds(getDoc(doc(d, 'users/alice/notes/n1')))
    await assertSucceeds(getDocs(collection(d, 'users/alice/notes')))
  })

  it("never exposes another user's documents", async () => {
    await seed('users/alice/income/i1', { id: 'i1', amountMinor: 100 })
    await seed('users/alice/notes/n1', { id: 'n1' })
    const bob = db('bob')
    await assertFails(getDoc(doc(bob, 'users/alice/income/i1')))
    await assertFails(getDocs(collection(bob, 'users/alice/income')))
    await assertFails(getDoc(doc(bob, 'users/alice/notes/n1')))
    await assertFails(setDoc(doc(bob, 'users/alice/notes/n9'), note('n9')))
    await assertFails(setDoc(doc(bob, 'users/alice/income/i9'), income('i9')))
  })

  it('denies collections outside the known list and the user root document', async () => {
    const d = db('alice')
    await assertFails(setDoc(doc(d, 'users/alice/secrets/s1'), note('s1')))
    await assertFails(getDocs(collection(d, 'users/alice/secrets')))
    await assertFails(setDoc(doc(d, 'users/alice'), { a: 1 }))
    await assertFails(getDoc(doc(d, 'users/alice')))
    await assertFails(setDoc(doc(d, 'somewhere/else'), { a: 1 }))
  })
})

describe('record validation', () => {
  it('requires the id to match the document path', async () => {
    await assertFails(setDoc(doc(db('alice'), 'users/alice/notes/n1'), note('different')))
  })

  it('requires a server commit timestamp', async () => {
    const { serverUpdatedAt: _s, ...noStamp } = note('n1')
    await assertFails(setDoc(doc(db('alice'), 'users/alice/notes/n1'), noStamp))
    await assertFails(setDoc(doc(db('alice'), 'users/alice/notes/n1'), { ...noStamp, serverUpdatedAt: new Date('2000-01-01') }))
  })

  it('accepts money only as positive whole piastres with a valid date', async () => {
    const d = db('alice')
    await assertSucceeds(setDoc(doc(d, 'users/alice/income/ok'), income('ok', 125050)))
    await assertFails(setDoc(doc(d, 'users/alice/income/a'), income('a', 12.5)))
    await assertFails(setDoc(doc(d, 'users/alice/income/b'), income('b', -100)))
    await assertFails(setDoc(doc(d, 'users/alice/income/c'), income('c', 0)))
    await assertFails(setDoc(doc(d, 'users/alice/income/d'), income('d', '100')))
    await assertFails(setDoc(doc(d, 'users/alice/expenses/e'), { ...income('e'), date: '05/11/2026' }))
    await assertFails(setDoc(doc(d, 'users/alice/partnerPayments/f'), { ...income('f'), date: null }))
    await assertSucceeds(setDoc(doc(d, 'users/alice/partnerPayments/g'), income('g')))
  })

  it('allows soft deletion by tombstone and refuses hard deletion', async () => {
    const d = db('alice')
    await assertSucceeds(setDoc(doc(d, 'users/alice/income/i1'), income('i1')))
    await assertSucceeds(setDoc(doc(d, 'users/alice/income/i1'), { ...envelope('i1'), deletedAt: '2026-02-01T00:00:00.000Z' }))
    await assertFails(deleteDoc(doc(d, 'users/alice/income/i1')))
    await assertFails(deleteDoc(doc(d, 'users/alice/notes/n1')))
  })
})

describe('cloud storage', () => {
  const audio = new Uint8Array([1, 2, 3])
  const st = (uid?: string) => (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).storage()

  it('keeps audio private to its owner', async () => {
    await assertSucceeds(uploadBytes(ref(st('alice'), 'users/alice/voice/v1'), audio, { contentType: 'audio/webm;codecs=opus' }))
    await assertSucceeds(getBytes(ref(st('alice'), 'users/alice/voice/v1')))
    await assertFails(getBytes(ref(st('bob'), 'users/alice/voice/v1')))
    await assertFails(getBytes(ref(st(), 'users/alice/voice/v1')))
    await assertFails(uploadBytes(ref(st('bob'), 'users/alice/voice/v2'), audio, { contentType: 'audio/webm' }))
  })

  it('accepts iOS audio types and rejects other file types and paths', async () => {
    await assertSucceeds(uploadBytes(ref(st('alice'), 'users/alice/voice/ios'), audio, { contentType: 'audio/mp4' }))
    await assertFails(uploadBytes(ref(st('alice'), 'users/alice/voice/x'), audio, { contentType: 'text/html' }))
    await assertFails(uploadBytes(ref(st('alice'), 'public/x'), audio, { contentType: 'audio/webm' }))
  })
})

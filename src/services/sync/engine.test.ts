import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/** An in-memory stand-in for Firestore Lite, so the engine's real logic runs end to end. */
const server = vi.hoisted(() => {
  const state = {
    docs: new Map<string, Record<string, unknown>>(),
    clock: 1000,
    /** Decides whether a commit fails: return an error code, or null to accept. */
    fail: (() => null) as (paths: string[]) => string | null,
    commits: 0,
    reads: 0,
    hang: false,
    calls: [] as string[],
  }
  return state
})

vi.mock('@/services/firebase/config', () => ({
  isFirebaseConfigured: true,
  isCloudStorageEnabled: false,
  useEmulators: false,
  getFirebaseApp: async () => ({}),
}))

vi.mock('firebase/firestore/lite', () => {
  const SERVER_TS = { __serverTs: true }
  const Timestamp = {
    fromMillis: (ms: number) => ({ ms, toMillis: () => ms }),
  }
  return {
    getFirestore: () => ({}),
    connectFirestoreEmulator: () => undefined,
    serverTimestamp: () => SERVER_TS,
    Timestamp,
    collection: (_db: unknown, ...path: string[]) => ({ path: path.join('/') }),
    doc: (_db: unknown, ...path: string[]) => ({ path: path.join('/') }),
    where: (field: string, op: string, value: { ms: number }) => ({ kind: 'where', field, op, value }),
    orderBy: (field: string) => ({ kind: 'orderBy', field }),
    startAfter: (snap: { ms: number }) => ({ kind: 'startAfter', snap }),
    limit: (n: number) => ({ kind: 'limit', n }),
    query: (col: { path: string }, ...constraints: { kind: string }[]) => ({ col, constraints }),
    getDocs: async (q: { col: { path: string }; constraints: { kind: string }[] }) => {
      server.reads++
      server.calls.push('pull')
      if (server.hang) await new Promise(() => undefined)
      const after = (q.constraints.find((c) => c.kind === 'where') as unknown as { value: { ms: number } }).value.ms
      const start = q.constraints.find((c) => c.kind === 'startAfter') as unknown as { snap: { ms: number } } | undefined
      const docs = [...server.docs.entries()]
        .filter(([path]) => path.startsWith(`${q.col.path}/`))
        .map(([path, data]) => ({ path, data, ms: (data.serverUpdatedAt as { ms: number }).ms }))
        .filter((d) => d.ms > after && (!start || d.ms > start.snap.ms))
        .sort((a, b) => a.ms - b.ms)
        .slice(0, 300)
        .map((d) => ({ id: d.path.split('/').pop(), ms: d.ms, data: () => d.data }))
      return { docs }
    },
    writeBatch: () => {
      const writes: { path: string; data: Record<string, unknown> }[] = []
      return {
        set: (ref: { path: string }, data: Record<string, unknown>) => writes.push({ path: ref.path, data }),
        commit: async () => {
          server.calls.push('push')
          if (server.hang) await new Promise(() => undefined)
          const code = server.fail(writes.map((w) => w.path))
          if (code) throw Object.assign(new Error(code), { code })
          server.commits++
          for (const w of writes) {
            const ms = ++server.clock
            server.docs.set(w.path, { ...w.data, serverUpdatedAt: Timestamp.fromMillis(ms) })
          }
        },
      }
    },
  }
})

const { closeUserData, getAll, getOne, listConflicts, listOutbox, openUserData, repo, ensureLoaded } = await import('@/services/data/store')
const { syncNow, retryNow, networkConfig } = await import('./engine')

const income = (amountMinor = 10000) => ({
  amountMinor, date: '2026-01-01', patientName: '', procedure: '', categoryId: 'other', description: '', paymentMethod: '', notes: '',
})

let n = 0
beforeEach(async () => {
  vi.stubGlobal('navigator', { onLine: true })
  server.docs.clear()
  server.fail = () => null
  server.commits = 0
  server.reads = 0
  server.calls = []
  server.hang = false
  networkConfig.timeoutMs = 20_000
  closeUserData()
  await openUserData(`u${++n}`)
})

const docPath = (id: string, col = 'income') => `users/u${n}/${col}/${id}`

describe('push', () => {
  it('uploads queued records and only then marks them synced', async () => {
    const rec = await repo.create('income', income())
    expect(getOne('income', rec.id)?._sync).toBe('local')
    await syncNow()
    const stored = server.docs.get(docPath(rec.id))!
    expect(stored.amountMinor).toBe(10000)
    expect(stored).not.toHaveProperty('_sync')
    expect(getOne('income', rec.id)?._sync).toBe('synced')
    expect(await listOutbox()).toHaveLength(0)
  })

  it('pulls before it pushes, so conflicts resolve before anything is overwritten', async () => {
    await repo.create('income', income())
    await syncNow()
    expect(server.calls.indexOf('pull')).toBeLessThan(server.calls.indexOf('push'))
  })

  it('never reports synced while the network is down, and keeps everything queued', async () => {
    const rec = await repo.create('income', income())
    server.fail = () => 'unavailable'
    await syncNow()
    expect(getOne('income', rec.id)?._sync).not.toBe('synced')
    expect(await listOutbox()).toHaveLength(1)
    expect((await listOutbox())[0]!.retryCount).toBe(0)
    server.fail = () => null
    await syncNow()
    expect(getOne('income', rec.id)?._sync).toBe('synced')
  })

  it('recovers from a request that never answers, instead of staying stuck', async () => {
    networkConfig.timeoutMs = 20
    const rec = await repo.create('income', income())
    server.hang = true
    await syncNow()
    expect(getOne('income', rec.id)?._sync).not.toBe('synced')
    expect(await listOutbox()).toHaveLength(1)
    server.hang = false
    await syncNow()
    expect(getOne('income', rec.id)?._sync).toBe('synced')
  })

  it('does not contact the server at all when offline', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    await repo.create('income', income())
    await syncNow()
    expect(server.calls).toHaveLength(0)
    expect(await listOutbox()).toHaveLength(1)
  })

  it('isolates a rejected document, so the rest of the batch still syncs', async () => {
    const good = await repo.create('income', income(100))
    const bad = await repo.create('income', income(200))
    const badPath = docPath(bad.id)
    server.fail = (paths) => (paths.includes(badPath) ? 'permission-denied' : null)
    await syncNow()
    expect(getOne('income', good.id)?._sync).toBe('synced')
    expect(getOne('income', bad.id)?._sync).toBe('failed')
    const [op] = await listOutbox()
    expect(op).toMatchObject({ docId: bad.id, errorStatus: 'permission-denied', retryCount: 1 })
  })

  it('retries failed operations on request without losing them', async () => {
    const bad = await repo.create('income', income())
    server.fail = () => 'permission-denied'
    await syncNow()
    expect(getOne('income', bad.id)?._sync).toBe('failed')
    server.fail = () => null
    await retryNow()
    expect(getOne('income', bad.id)?._sync).toBe('synced')
    expect(await listOutbox()).toHaveLength(0)
  })

  it('retrying the same record creates one document, never a duplicate transaction', async () => {
    const rec = await repo.create('income', income())
    server.fail = () => 'unavailable'
    await syncNow()
    server.fail = () => null
    await syncNow()
    await syncNow()
    const copies = [...server.docs.keys()].filter((k) => k.includes('/income/'))
    expect(copies).toEqual([docPath(rec.id)])
  })

  it('syncs deletions as tombstones', async () => {
    const rec = await repo.create('income', income())
    await syncNow()
    await repo.remove('income', rec.id)
    await syncNow()
    expect(server.docs.get(docPath(rec.id))!.deletedAt).toBeTruthy()
    expect(getAll('income')).toHaveLength(0)
  })
})

describe('pull', () => {
  const remoteDoc = (id: string, updatedAt: string, amountMinor: number, ms: number) => {
    server.docs.set(docPath(id), {
      ...income(amountMinor), id, createdAt: '2026-01-01T00:00:00.000Z', updatedAt, serverUpdatedAt: { ms, toMillis: () => ms },
    })
  }

  it('brings in records from another device as synced', async () => {
    remoteDoc('r1', '2026-02-01T00:00:00.000Z', 777, 100_000)
    await ensureLoaded('income')
    await syncNow()
    expect(getOne('income', 'r1')).toMatchObject({ amountMinor: 777, _sync: 'synced' })
  })

  it('only asks for changes since the last cursor', async () => {
    remoteDoc('r1', '2026-02-01T00:00:00.000Z', 1, 1_000_000)
    await ensureLoaded('income')
    await syncNow()
    expect(getOne('income', 'r1')?.amountMinor).toBe(1)
    // A document older than the cursor window is not re-read, which is what keeps reads low.
    remoteDoc('old', '2026-02-02T00:00:00.000Z', 2, 500)
    remoteDoc('fresh', '2026-02-03T00:00:00.000Z', 3, 2_000_000)
    await syncNow()
    expect(getOne('income', 'old')).toBeUndefined()
    expect(getOne('income', 'fresh')?.amountMinor).toBe(3)
  })

  it('preserves a local edit that loses a conflict', async () => {
    const rec = await repo.create('income', income(111))
    remoteDoc(rec.id, '2999-01-01T00:00:00.000Z', 999, 100_000)
    await syncNow()
    expect(getOne('income', rec.id)?.amountMinor).toBe(999)
    const conflicts = await listConflicts()
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0]!.local.amountMinor).toBe(111)
    // The losing edit must not overwrite the winner on the server afterwards.
    expect(server.docs.get(docPath(rec.id))!.amountMinor).toBe(999)
  })

  it('pushes a local edit that wins a conflict', async () => {
    const rec = await repo.create('income', income(111))
    remoteDoc(rec.id, '2000-01-01T00:00:00.000Z', 999, 100_000)
    await syncNow()
    expect(server.docs.get(docPath(rec.id))!.amountMinor).toBe(111)
    expect(await listConflicts()).toHaveLength(0)
  })
})

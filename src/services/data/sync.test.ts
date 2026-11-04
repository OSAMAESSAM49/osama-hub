import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  applyRemote, closeUserData, completeOps, ensureLoaded, failOp, getAll, getDb, getOne, listConflicts, listOutbox, openUserData, repo,
  resolveConflict,
} from './store'

let n = 0
beforeEach(async () => {
  closeUserData()
  await openUserData(`test-${++n}`)
})

const incomeData = {
  amountMinor: 10000, date: '2026-01-01', patientName: '', procedure: '', categoryId: 'other', description: '', paymentMethod: '', notes: '',
}

describe('outbox', () => {
  it('writes the record and its pending operation together', async () => {
    const rec = await repo.create('income', incomeData)
    expect(rec._sync).toBe('local')
    const row = await getDb().get('records', `income/${rec.id}`)
    expect(row?.rec.id).toBe(rec.id)
    const [op] = await listOutbox()
    expect(op).toMatchObject({ collection: 'income', docId: rec.id, type: 'upsert', retryCount: 0, errorStatus: null })
    expect(op!.payload).not.toHaveProperty('_sync')
  })

  it('coalesces repeated edits into one queued write', async () => {
    const rec = await repo.create('income', incomeData)
    await repo.update('income', rec.id, { amountMinor: 20000 })
    await repo.update('income', rec.id, { amountMinor: 30000 })
    const ops = await listOutbox()
    expect(ops).toHaveLength(1)
    expect(ops[0]!.payload.amountMinor).toBe(30000)
  })

  it('survives a restart with the pending operation intact', async () => {
    const rec = await repo.create('income', incomeData)
    const uid = `test-${n}`
    closeUserData()
    await openUserData(uid)
    await ensureLoaded('income')
    expect(getOne('income', rec.id)?.amountMinor).toBe(10000)
    expect(await listOutbox()).toHaveLength(1)
  })

  it('never marks a record synced before confirmation, and keeps edits made during upload', async () => {
    const rec = await repo.create('income', incomeData)
    const [sent] = await listOutbox()
    await repo.update('income', rec.id, { amountMinor: 55500 }) // edited while `sent` is in flight
    await completeOps([sent!])
    expect(getOne('income', rec.id)?._sync).toBe('local')
    expect(await listOutbox()).toHaveLength(1)
    const [latest] = await listOutbox()
    await completeOps([latest!])
    expect(getOne('income', rec.id)?._sync).toBe('synced')
    expect(await listOutbox()).toHaveLength(0)
  })

  it('keeps failed operations with an error and a retry count', async () => {
    await repo.create('income', incomeData)
    const [op] = await listOutbox()
    await failOp(op!, 'permission-denied')
    const [after] = await listOutbox()
    expect(after).toMatchObject({ errorStatus: 'permission-denied', retryCount: 1 })
    expect(after!.nextAttemptAt).toBeGreaterThan(Date.now())
  })

  it('soft-deletes with a tombstone that is queued for sync', async () => {
    const rec = await repo.create('income', incomeData)
    await repo.remove('income', rec.id)
    expect(getAll('income')).toHaveLength(0)
    const [op] = await listOutbox()
    expect(op!.type).toBe('delete')
    expect(op!.payload.deletedAt).toBeTruthy()
  })
})

describe('pulling remote changes', () => {
  const remote = (id: string, updatedAt: string, amountMinor = 777) => ({
    ...incomeData, id, amountMinor, createdAt: '2026-01-01T00:00:00.000Z', updatedAt,
  })

  it('applies new documents as synced', async () => {
    await ensureLoaded('income')
    await applyRemote('income', [remote('r1', '2026-02-01T00:00:00.000Z')])
    expect(getOne('income', 'r1')).toMatchObject({ amountMinor: 777, _sync: 'synced' })
  })

  it('applies a remote tombstone', async () => {
    await applyRemote('income', [remote('r1', '2026-02-01T00:00:00.000Z')])
    await applyRemote('income', [{ ...remote('r1', '2026-03-01T00:00:00.000Z'), deletedAt: '2026-03-01T00:00:00.000Z' }])
    expect(getOne('income', 'r1')).toBeUndefined()
  })

  it('keeps a newer local edit and its queued push', async () => {
    const rec = await repo.create('income', incomeData)
    await applyRemote('income', [remote(rec.id, '2000-01-01T00:00:00.000Z')])
    expect(getOne('income', rec.id)?.amountMinor).toBe(10000)
    expect(await listOutbox()).toHaveLength(1)
    expect(await listConflicts()).toHaveLength(0)
  })

  it('when the remote edit is later, keeps the local edit as a recoverable copy', async () => {
    const rec = await repo.create('income', incomeData)
    await applyRemote('income', [remote(rec.id, '2999-01-01T00:00:00.000Z')])
    expect(getOne('income', rec.id)?.amountMinor).toBe(777)
    expect(await listOutbox()).toHaveLength(0)
    const [conflict] = await listConflicts()
    expect(conflict!.local.amountMinor).toBe(10000)
    await resolveConflict(conflict!.key, true)
    expect(getOne('income', rec.id)?.amountMinor).toBe(10000)
    expect(await listConflicts()).toHaveLength(0)
    expect(await listOutbox()).toHaveLength(1)
  })

  it('does not reapply an older remote version', async () => {
    await applyRemote('income', [remote('r1', '2026-05-01T00:00:00.000Z', 1)])
    await applyRemote('income', [remote('r1', '2026-04-01T00:00:00.000Z', 2)])
    expect(getOne('income', 'r1')?.amountMinor).toBe(1)
  })
})

describe('isolation and seeding', () => {
  it('keeps each user in a separate database', async () => {
    await repo.create('income', incomeData)
    closeUserData()
    await openUserData('other-user')
    await ensureLoaded('income')
    expect(getAll('income')).toHaveLength(0)
  })

  it('seeds default content without queueing cloud writes', async () => {
    await repo.seedLocal('bookmarkCollections', [
      { id: 'a', name: 'A', order: 0, createdAt: '2000-01-01T00:00:00.000Z', updatedAt: '2000-01-01T00:00:00.000Z' },
    ])
    expect(await listOutbox()).toHaveLength(0)
    expect(getOne('bookmarkCollections', 'a')?._sync).toBe('synced')
    // Any real remote edit beats the seed, with no conflict.
    await applyRemote('bookmarkCollections', [
      { id: 'a', name: 'Renamed', order: 0, createdAt: '2000-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
    ])
    expect(getOne('bookmarkCollections', 'a')?.name).toBe('Renamed')
  })
})

import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { describe, expect, it } from 'vitest'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

/** The schema as shipped before the UUID migration (v4), with some data in it. */
async function seedV4Database() {
  const legacy = new Dexie('spar')
  legacy.version(4).stores({
    responses: '++id, itemId, sessionId, ts',
    sessions: 'id, startedAt',
    lcLogs: '++id, slug, ts',
    recommendations: '++id, ts, sessionId, surface, candidateRef',
  })
  await legacy.table('sessions').add({ id: 's-1', minutesPlanned: 10, timed: false, startedAt: 1, endedAt: 9 })
  await legacy.table('responses').bulkAdd([
    { itemId: 'pat-001', choice: 'two-pointers', correct: true, latencyMs: 1200, sessionId: 's-1', ts: 2 },
    { itemId: 'pat-002', choice: '', correct: false, latencyMs: 60000, sessionId: 's-1', ts: 3, timedOut: true },
  ])
  await legacy.table('lcLogs').add({
    slug: 'two-sum',
    outcome: 'unaided',
    patternIds: ['arrays-hashing'],
    difficulty: 'easy',
    minutes: 12,
    ts: 4,
  })
  await legacy.table('recommendations').add({
    ts: 2,
    sessionId: 's-1',
    surface: 'drill',
    paramsVersion: 'v1',
    candidateRef: 'item:pat-001',
    outcome: { type: 'drill', correct: true, latencyMs: 1200, timedOut: false },
  })
  legacy.close()
}

describe('UUID migration (v4 -> v8)', () => {
  it('keeps every row, gives each a UUID and drops the temporary tables', async () => {
    await seedV4Database()
    const { db, recordResponse } = await import('./index')

    const responses = await db.responses.orderBy('ts').toArray()
    expect(responses).toHaveLength(2)
    expect(responses.map((r) => r.itemId)).toEqual(['pat-001', 'pat-002'])
    expect(responses[1]).toMatchObject({ timedOut: true, latencyMs: 60000, sessionId: 's-1' })
    for (const r of responses) expect(r.id).toMatch(UUID)
    expect(new Set(responses.map((r) => r.id)).size).toBe(2)

    const [log] = await db.lcLogs.toArray()
    expect(log).toMatchObject({ slug: 'two-sum', outcome: 'unaided', minutes: 12 })
    expect(log!.id).toMatch(UUID)

    const [rec] = await db.recommendations.toArray()
    expect(rec).toMatchObject({ candidateRef: 'item:pat-001', outcome: { type: 'drill', correct: true } })
    expect(rec!.id).toMatch(UUID)

    expect(await db.sessions.get('s-1')).toMatchObject({ minutesPlanned: 10, endedAt: 9 })
    expect(db.tables.map((t) => t.name).sort()).toEqual(['lcLogs', 'recommendations', 'responses', 'sessions'])

    // Indexes still work and new rows get UUIDs too.
    expect(await db.responses.where('sessionId').equals('s-1').count()).toBe(2)
    const newId = await recordResponse({ itemId: 'pat-003', choice: 'x', correct: false, latencyMs: 5, sessionId: 's-2', ts: 5 })
    expect(newId).toMatch(UUID)
    db.close()
  })
})

describe('newId', () => {
  it('makes v4 UUIDs, with or without crypto.randomUUID', async () => {
    const { newId } = await import('./index')
    expect(newId()).toMatch(UUID)
    const original = crypto.randomUUID
    try {
      // Simulate an insecure context (plain-http LAN testing on a phone).
      Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true })
      const ids = Array.from({ length: 50 }, newId)
      for (const id of ids) expect(id).toMatch(UUID)
      expect(new Set(ids).size).toBe(50)
    } finally {
      Object.defineProperty(crypto, 'randomUUID', { value: original, configurable: true })
    }
  })
})

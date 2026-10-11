import Dexie, { type EntityTable } from 'dexie'
import type { LcLogEvent } from '../engine/lc'
import type { SessionLength } from '../engine/session'

export interface ResponseRow {
  id: number
  itemId: string
  /** The choice the user picked ('' on a timeout), kept for error analysis. */
  choice: string
  correct: boolean
  latencyMs: number
  sessionId: string
  ts: number
  /** Timed mode ran out before an answer. Absent on rows saved before v2. */
  timedOut?: boolean
}

export interface SessionRow {
  id: string
  minutesPlanned: SessionLength
  timed: boolean
  startedAt: number
  endedAt: number | null
}

/** One quick-log entry for a problem solved on leetcode.com. */
export interface LcLogRow extends LcLogEvent {
  id: number
  minutes: number | null
  /** Set when the problem was done inside a practice session. */
  sessionId?: string
}

export const db = new Dexie('spar') as Dexie & {
  responses: EntityTable<ResponseRow, 'id'>
  sessions: EntityTable<SessionRow, 'id'>
  lcLogs: EntityTable<LcLogRow, 'id'>
}

db.version(1).stores({
  responses: '++id, itemId, sessionId, ts',
})

// v2: time-boxed sessions. Additive, so v1 data carries over unchanged.
db.version(2).stores({
  responses: '++id, itemId, sessionId, ts',
  sessions: 'id, startedAt',
})

// v3: quick LeetCode log. Additive.
db.version(3).stores({
  responses: '++id, itemId, sessionId, ts',
  sessions: 'id, startedAt',
  lcLogs: '++id, slug, ts',
})

export function recordResponse(row: Omit<ResponseRow, 'id'>) {
  return db.responses.add(row)
}

export async function startSession(minutes: SessionLength, timed: boolean): Promise<SessionRow> {
  const session: SessionRow = {
    id: crypto.randomUUID(),
    minutesPlanned: minutes,
    timed,
    startedAt: Date.now(),
    endedAt: null,
  }
  await db.sessions.add(session)
  return session
}

export function endSession(id: string) {
  return db.sessions.update(id, { endedAt: Date.now() })
}

export function addLcLog(row: Omit<LcLogRow, 'id' | 'ts'>) {
  return db.lcLogs.add({ ...row, ts: Date.now() })
}

export function deleteLcLog(id: number) {
  return db.lcLogs.delete(id)
}

/** Deletes every response, session and LeetCode log on this device. */
export function clearAllProgress() {
  return db.transaction('rw', db.responses, db.sessions, db.lcLogs, async () => {
    await db.responses.clear()
    await db.sessions.clear()
    await db.lcLogs.clear()
  })
}

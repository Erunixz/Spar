import Dexie, { type EntityTable } from 'dexie'
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

export const db = new Dexie('spar') as Dexie & {
  responses: EntityTable<ResponseRow, 'id'>
  sessions: EntityTable<SessionRow, 'id'>
}

db.version(1).stores({
  responses: '++id, itemId, sessionId, ts',
})

// v2: time-boxed sessions. Additive, so v1 data carries over unchanged.
db.version(2).stores({
  responses: '++id, itemId, sessionId, ts',
  sessions: 'id, startedAt',
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

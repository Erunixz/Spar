import Dexie, { type EntityTable } from 'dexie'
import type { LcLogEvent, LcOutcome } from '../engine/lc'
import { PARAMS } from '../engine/params'
import type { CandidateScore, RecFeatures } from '../engine/recommend'
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

export type RecOutcome =
  | { type: 'drill'; correct: boolean; latencyMs: number; timedOut: boolean }
  | { type: 'lc'; outcome: LcOutcome; minutes: number | null }
  | { type: 'skipped' }

/**
 * One recommendation the app acted on, with the features and runner-up scores
 * behind it. Phase 9 re-estimates PARAMS from these rows.
 */
export interface RecommendationRow {
  id: number
  ts: number
  sessionId: string | null
  /** Where it was shown: the next drill item, or the LeetCode task inside a session. */
  surface: 'drill' | 'session-lc'
  paramsVersion: string
  /** "item:pat-001" or "lc:two-sum" */
  candidateRef: string
  targetPattern: string
  kind: string
  reason: string
  features: RecFeatures
  baseScore: number
  noise: number
  noiseScale: number
  /** Top candidates by base score, including the chosen one. */
  candidates: CandidateScore[]
  poolSize: number
  /** null until the user answers, logs or skips; stays null if the session ends first. */
  outcome: RecOutcome | null
}

export const db = new Dexie('spar') as Dexie & {
  responses: EntityTable<ResponseRow, 'id'>
  sessions: EntityTable<SessionRow, 'id'>
  lcLogs: EntityTable<LcLogRow, 'id'>
  recommendations: EntityTable<RecommendationRow, 'id'>
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

// v4: recommendation log for Phase 9 re-estimation. Additive.
db.version(4).stores({
  responses: '++id, itemId, sessionId, ts',
  sessions: 'id, startedAt',
  lcLogs: '++id, slug, ts',
  recommendations: '++id, ts, sessionId, surface, candidateRef',
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

export function logRecommendation(row: Omit<RecommendationRow, 'id' | 'ts' | 'paramsVersion' | 'outcome'>) {
  return db.recommendations.add({ ...row, ts: Date.now(), paramsVersion: PARAMS.version, outcome: null })
}

export function setRecommendationOutcome(id: number, outcome: RecOutcome) {
  return db.recommendations.update(id, { outcome })
}

/** Deletes everything stored on this device. */
export function clearAllProgress() {
  return db.transaction('rw', [db.responses, db.sessions, db.lcLogs, db.recommendations], async () => {
    await db.responses.clear()
    await db.sessions.clear()
    await db.lcLogs.clear()
    await db.recommendations.clear()
  })
}

export const EXPORT_FORMAT = 'spar-export/1'

/** Everything on this device as one JSON-ready object, for backups and Phase 9 scripts. */
export async function exportAllData() {
  const [responses, sessions, lcLogs, recommendations] = await Promise.all([
    db.responses.toArray(),
    db.sessions.toArray(),
    db.lcLogs.toArray(),
    db.recommendations.toArray(),
  ])
  return {
    format: EXPORT_FORMAT,
    exportedAt: new Date().toISOString(),
    paramsVersion: PARAMS.version,
    responses,
    sessions,
    lcLogs,
    recommendations,
  }
}

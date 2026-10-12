import Dexie, { type EntityTable, type Transaction } from 'dexie'
import type { LcLogEvent, LcOutcome } from '../engine/lc'
import { PARAMS } from '../engine/params'
import type { CandidateScore, RecFeatures } from '../engine/recommend'
import type { SessionLength } from '../engine/session'
import type { ComfortRating, SelfRatingEvent } from '../engine/survey'

/**
 * Row ids are UUIDs generated on the device, so rows from several devices can
 * be synced into one account without colliding (Phase 5).
 */
export function newId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  // randomUUID needs a secure context; plain-http LAN testing on a phone doesn't have one.
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6]! & 0x0f) | 0x40
  b[8] = (b[8]! & 0x3f) | 0x80
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

export interface ResponseRow {
  id: string
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
  id: string
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
  id: string
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

/** One answer in one comfort survey. Append-only, so retakes keep the history. */
export interface SelfRatingRow extends SelfRatingEvent {
  id: string
  /** Groups the rows saved together by one survey submission. */
  surveyId: string
  paramsVersion: string
}

export type SurveyStatus = { status: 'done' | 'skipped'; ts: number }

/** Small key-value store for app state that should sync with the account later. */
export interface SettingRow {
  key: 'survey'
  value: SurveyStatus
}

export const DB_NAME = 'spar'

export const db = new Dexie(DB_NAME) as Dexie & {
  responses: EntityTable<ResponseRow, 'id'>
  sessions: EntityTable<SessionRow, 'id'>
  lcLogs: EntityTable<LcLogRow, 'id'>
  recommendations: EntityTable<RecommendationRow, 'id'>
  selfRatings: EntityTable<SelfRatingRow, 'id'>
  settings: EntityTable<SettingRow, 'key'>
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

/*
 * v5-v8: switch responses, lcLogs and recommendations from auto-increment
 * numbers to UUID primary keys. IndexedDB can't change a primary key in
 * place, so each table is copied to a temporary table (v5), dropped (v6),
 * recreated with the new key and refilled (v7), and the temporary tables
 * are dropped (v8). Dexie runs all pending steps in one upgrade.
 */
const MIGRATED = {
  responses: 'id, itemId, sessionId, ts',
  lcLogs: 'id, slug, ts',
  recommendations: 'id, ts, sessionId, surface, candidateRef',
} as const
type MigratedTable = keyof typeof MIGRATED
const MIGRATED_TABLES = Object.keys(MIGRATED) as MigratedTable[]
const tmp = (t: MigratedTable) => `${t}_uuid_tmp`

async function copyRows(tx: Transaction, from: string, to: string, withNewIds: boolean) {
  const rows = await tx.table(from).toArray()
  await tx.table(to).bulkAdd(withNewIds ? rows.map((r) => ({ ...r, id: newId() })) : rows)
}

db.version(5)
  .stores({
    sessions: 'id, startedAt',
    ...Object.fromEntries(MIGRATED_TABLES.map((t) => [tmp(t), MIGRATED[t]])),
  })
  .upgrade(async (tx) => {
    for (const t of MIGRATED_TABLES) await copyRows(tx, t, tmp(t), true)
  })

db.version(6).stores(Object.fromEntries(MIGRATED_TABLES.map((t) => [t, null])))

db.version(7)
  .stores(MIGRATED)
  .upgrade(async (tx) => {
    for (const t of MIGRATED_TABLES) await copyRows(tx, tmp(t), t, false)
  })

db.version(8).stores(Object.fromEntries(MIGRATED_TABLES.map((t) => [tmp(t), null])))

// v9: comfort survey ratings and a settings table. Additive.
db.version(9).stores({
  selfRatings: 'id, patternId, ts, surveyId',
  settings: 'key',
})

export function recordResponse(row: Omit<ResponseRow, 'id'>) {
  return db.responses.add({ ...row, id: newId() })
}

export async function startSession(minutes: SessionLength, timed: boolean): Promise<SessionRow> {
  const session: SessionRow = {
    id: newId(),
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
  return db.lcLogs.add({ ...row, id: newId(), ts: Date.now() })
}

export function deleteLcLog(id: string) {
  return db.lcLogs.delete(id)
}

/** Resolves to the new row's id once it is saved. */
export function logRecommendation(row: Omit<RecommendationRow, 'id' | 'ts' | 'paramsVersion' | 'outcome'>) {
  return db.recommendations.add({
    ...row,
    id: newId(),
    ts: Date.now(),
    paramsVersion: PARAMS.version,
    outcome: null,
  })
}

export function setRecommendationOutcome(id: string, outcome: RecOutcome) {
  return db.recommendations.update(id, { outcome })
}

/**
 * Saves one survey submission: a row for every pattern shown (null = "not
 * sure"), all with the same surveyId and timestamp, and marks the survey done.
 */
export function saveSurvey(answers: Map<string, ComfortRating | null>) {
  const surveyId = newId()
  const ts = Date.now()
  const rows: SelfRatingRow[] = [...answers].map(([patternId, rating]) => ({
    id: newId(),
    surveyId,
    patternId,
    rating,
    ts,
    paramsVersion: PARAMS.version,
  }))
  return db.transaction('rw', db.selfRatings, db.settings, async () => {
    await db.selfRatings.bulkAdd(rows)
    await db.settings.put({ key: 'survey', value: { status: 'done', ts } })
  })
}

/** Records that the user skipped the survey, so it isn't shown again automatically. */
export function skipSurvey() {
  return db.settings.put({ key: 'survey', value: { status: 'skipped', ts: Date.now() } })
}

const ALL_TABLES = () => [db.responses, db.sessions, db.lcLogs, db.recommendations, db.selfRatings, db.settings]

/** Deletes everything stored on this device. */
export function clearAllProgress() {
  return db.transaction('rw', ALL_TABLES(), async () => {
    for (const t of ALL_TABLES()) await t.clear()
  })
}

/** v3: adds selfRatings and settings. */
export const EXPORT_FORMAT = 'spar-export/3'

/** Everything on this device as one JSON-ready object, for backups and Phase 9 scripts. */
export async function exportAllData() {
  const [responses, sessions, lcLogs, recommendations, selfRatings, settings] = await Promise.all([
    db.responses.toArray(),
    db.sessions.toArray(),
    db.lcLogs.toArray(),
    db.recommendations.toArray(),
    db.selfRatings.toArray(),
    db.settings.toArray(),
  ])
  return {
    format: EXPORT_FORMAT,
    exportedAt: new Date().toISOString(),
    paramsVersion: PARAMS.version,
    responses,
    sessions,
    lcLogs,
    recommendations,
    selfRatings,
    settings,
  }
}

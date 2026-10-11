import Dexie, { type EntityTable } from 'dexie'

export interface ResponseRow {
  id: number
  itemId: string
  /** The choice the user picked, kept for error analysis. */
  choice: string
  correct: boolean
  latencyMs: number
  sessionId: string
  ts: number
}

export const db = new Dexie('spar') as Dexie & {
  responses: EntityTable<ResponseRow, 'id'>
}

db.version(1).stores({
  responses: '++id, itemId, sessionId, ts',
})

export function recordResponse(row: Omit<ResponseRow, 'id'>) {
  return db.responses.add(row)
}

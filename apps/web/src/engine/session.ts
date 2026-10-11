import type { Item } from '../content/schema'
import type { LcLogEvent } from './lc'
import { computeSkills, type ResponseEvent } from './skill'

/** Session lengths offered in the builder, in minutes. null = no limit. */
export const SESSION_LENGTHS = [10, 30, 60, null] as const
export type SessionLength = (typeof SESSION_LENGTHS)[number]

export interface SessionConfig {
  minutes: SessionLength
  /** Each item gets a countdown of its est_seconds; running out counts as wrong. */
  timed: boolean
}

export interface SessionResponse extends ResponseEvent {
  sessionId: string
  timedOut?: boolean
}

/** Seconds left in the session budget, or Infinity when there is no limit. */
export function remainingSeconds(minutes: SessionLength, startedAt: number, now: number): number {
  if (minutes === null) return Infinity
  return Math.max(0, minutes * 60 - (now - startedAt) / 1000)
}

/** The session is over once no item in the bank fits in the time left. */
export function isSessionOver(items: Item[], remaining: number): boolean {
  return !items.some((i) => i.est_seconds <= remaining)
}

export interface PatternChange {
  patternId: string
  before: number
  after: number
  attempts: number
  correct: number
}

export interface SessionSummary {
  answered: number
  correct: number
  timedOut: number
  /** Sum of response latencies, i.e. time spent answering. */
  activeMs: number
  /** Patterns practiced this session, most-practiced first. */
  patterns: PatternChange[]
}

/**
 * Compares mastery before the session with mastery after it. "Before" replays
 * every response older than the session; "after" adds the session's own.
 */
export function summarizeSession(
  patternIds: string[],
  itemsById: Map<string, Item>,
  responses: SessionResponse[],
  sessionId: string,
  lcLogs: LcLogEvent[] = [],
): SessionSummary {
  const mine = responses.filter((r) => r.sessionId === sessionId)
  const startedAt = mine.length ? Math.min(...mine.map((r) => r.ts)) : Infinity
  const earlier = responses.filter((r) => r.sessionId !== sessionId && r.ts < startedAt)
  // LeetCode logs from before the session form part of both baselines.
  const lcEarlier = lcLogs.filter((l) => l.ts < startedAt)
  const before = computeSkills(patternIds, itemsById, earlier, lcEarlier).patterns
  const after = computeSkills(patternIds, itemsById, [...earlier, ...mine], lcEarlier).patterns

  const counts = new Map<string, { attempts: number; correct: number }>()
  for (const r of mine) {
    for (const pid of itemsById.get(r.itemId)?.pattern_ids ?? []) {
      const c = counts.get(pid) ?? { attempts: 0, correct: 0 }
      c.attempts += 1
      if (r.correct) c.correct += 1
      counts.set(pid, c)
    }
  }

  const patterns = [...counts.entries()]
    .filter(([pid]) => before.has(pid))
    .map(([pid, c]) => ({
      patternId: pid,
      before: before.get(pid)!.mastery,
      after: after.get(pid)!.mastery,
      ...c,
    }))
    .sort((a, b) => b.attempts - a.attempts || a.patternId.localeCompare(b.patternId))

  return {
    answered: mine.length,
    correct: mine.filter((r) => r.correct).length,
    timedOut: mine.filter((r) => r.timedOut).length,
    activeMs: mine.reduce((ms, r) => ms + r.latencyMs, 0),
    patterns,
  }
}

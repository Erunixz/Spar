import type { Difficulty, Item } from '../content/schema'
import {
  DIFFICULTY_PRIOR,
  initialRating,
  mastery,
  masteryBand,
  standardError,
  update,
  type Rating,
} from './elo'
import { bestOutcome, isSolved, lcDifficultyB, LC_OUTCOME_SCORE, type LcLogEvent, type LcOutcome } from './lc'

export interface ResponseEvent {
  itemId: string
  correct: boolean
  latencyMs: number
  ts: number
}

export interface PatternSkill {
  patternId: string
  rating: Rating
  mastery: number
  band: [number, number]
  se: number
  attempts: number
  correct: number
  /** Distinct drill items answered correctly at least once, by difficulty. */
  solved: Record<Difficulty, number>
  /** Distinct LeetCode problems solved (unaided or with hints), by difficulty. */
  lcSolved: Record<Difficulty, number>
  /** Distinct LeetCode problems logged, whatever the outcome. */
  lcLogged: number
  /** Drill accuracy over the last RECENT_WINDOW attempts, or null before any. */
  recentAccuracy: number | null
  medianLatencyMs: number | null
  /** Latest drill answer or LeetCode log. */
  lastPracticedAt: number | null
}

export interface SkillState {
  patterns: Map<string, PatternSkill>
  /** Current difficulty estimate per item. */
  itemDifficulty: Map<string, number>
}

export const RECENT_WINDOW = 10

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

const emptyCounts = (): Record<Difficulty, number> => ({ easy: 0, medium: 0, hard: 0 })

type TimelineEvent = { kind: 'drill'; event: ResponseEvent } | { kind: 'lc'; event: LcLogEvent }

/**
 * Rebuilds skill state by replaying drill responses and LeetCode logs in time
 * order. Deterministic, so the stored rows are the single source of truth.
 * priors sets a pattern's starting theta (from the comfort survey); others start at 0.
 */
export function computeSkills(
  patternIds: string[],
  itemsById: Map<string, Item>,
  responses: ResponseEvent[],
  lcLogs: LcLogEvent[] = [],
  priors: Map<string, number> = new Map(),
): SkillState {
  const ratings = new Map<string, Rating>(patternIds.map((id) => [id, initialRating(priors.get(id) ?? 0)]))
  const itemDifficulty = new Map<string, number>()
  for (const item of itemsById.values()) itemDifficulty.set(item.id, DIFFICULTY_PRIOR[item.difficulty])

  const history = new Map<string, { correct: boolean; latencyMs: number; ts: number }[]>(
    patternIds.map((id) => [id, []]),
  )
  const solvedItems = new Map<string, Set<string>>(patternIds.map((id) => [id, new Set()]))
  const lastTs = new Map<string, number>()
  // Best outcome per problem per pattern: a problem counts once.
  const lcBest = new Map<string, Map<string, { outcome: LcOutcome; difficulty: Difficulty }>>(
    patternIds.map((id) => [id, new Map()]),
  )

  const timeline: TimelineEvent[] = [
    ...responses.map((event) => ({ kind: 'drill' as const, event })),
    ...lcLogs.map((event) => ({ kind: 'lc' as const, event })),
  ].sort((a, b) => a.event.ts - b.event.ts)

  for (const entry of timeline) {
    if (entry.kind === 'lc') {
      const log = entry.event
      for (const pid of log.patternIds) {
        const rating = ratings.get(pid)
        if (!rating) continue
        ratings.set(pid, update(rating, lcDifficultyB(log), LC_OUTCOME_SCORE[log.outcome]).rating)
        lastTs.set(pid, log.ts)
        const best = lcBest.get(pid)!
        const prev = best.get(log.slug)
        best.set(log.slug, {
          outcome: prev ? bestOutcome(prev.outcome, log.outcome) : log.outcome,
          difficulty: log.difficulty,
        })
      }
      continue
    }
    const r = entry.event
    const item = itemsById.get(r.itemId)
    if (!item) continue // item removed from the bank; ignore its old responses
    const b = itemDifficulty.get(item.id)!
    let bSum = 0
    let touched = 0
    for (const pid of item.pattern_ids) {
      const rating = ratings.get(pid)
      if (!rating) continue
      const next = update(rating, b, r.correct)
      ratings.set(pid, next.rating)
      bSum += next.b
      touched += 1
      history.get(pid)!.push({ correct: r.correct, latencyMs: r.latencyMs, ts: r.ts })
      lastTs.set(pid, r.ts)
      if (r.correct) solvedItems.get(pid)!.add(item.id)
    }
    if (touched > 0) itemDifficulty.set(item.id, bSum / touched)
  }

  const patterns = new Map<string, PatternSkill>()
  for (const pid of patternIds) {
    const rating = ratings.get(pid)!
    const events = history.get(pid)!
    const recent = events.slice(-RECENT_WINDOW)
    const solved = emptyCounts()
    for (const itemId of solvedItems.get(pid)!) solved[itemsById.get(itemId)!.difficulty] += 1
    const lcSolved = emptyCounts()
    for (const { outcome, difficulty } of lcBest.get(pid)!.values()) {
      if (isSolved(outcome)) lcSolved[difficulty] += 1
    }
    patterns.set(pid, {
      patternId: pid,
      rating,
      mastery: mastery(rating.theta),
      band: masteryBand(rating),
      se: standardError(rating),
      attempts: events.length,
      correct: events.filter((e) => e.correct).length,
      solved,
      lcSolved,
      lcLogged: lcBest.get(pid)!.size,
      recentAccuracy: recent.length ? recent.filter((e) => e.correct).length / recent.length : null,
      medianLatencyMs: median(events.map((e) => e.latencyMs)),
      lastPracticedAt: lastTs.get(pid) ?? null,
    })
  }
  return { patterns, itemDifficulty }
}

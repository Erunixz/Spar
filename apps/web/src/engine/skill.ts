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
  /** Distinct items answered correctly at least once, by difficulty. */
  solved: Record<Difficulty, number>
  /** Accuracy over the last RECENT_WINDOW attempts, or null before any. */
  recentAccuracy: number | null
  medianLatencyMs: number | null
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

/**
 * Rebuilds skill state by replaying responses in time order. Deterministic, so
 * the stored responses are the single source of truth.
 */
export function computeSkills(
  patternIds: string[],
  itemsById: Map<string, Item>,
  responses: ResponseEvent[],
): SkillState {
  const ratings = new Map<string, Rating>(patternIds.map((id) => [id, initialRating()]))
  const itemDifficulty = new Map<string, number>()
  for (const item of itemsById.values()) itemDifficulty.set(item.id, DIFFICULTY_PRIOR[item.difficulty])

  const history = new Map<string, { correct: boolean; latencyMs: number; ts: number }[]>(
    patternIds.map((id) => [id, []]),
  )
  const solvedItems = new Map<string, Set<string>>(patternIds.map((id) => [id, new Set()]))

  const ordered = [...responses].sort((a, b) => a.ts - b.ts)
  for (const r of ordered) {
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
      if (r.correct) solvedItems.get(pid)!.add(item.id)
    }
    if (touched > 0) itemDifficulty.set(item.id, bSum / touched)
  }

  const patterns = new Map<string, PatternSkill>()
  for (const pid of patternIds) {
    const rating = ratings.get(pid)!
    const events = history.get(pid)!
    const recent = events.slice(-RECENT_WINDOW)
    const solved: Record<Difficulty, number> = { easy: 0, medium: 0, hard: 0 }
    for (const itemId of solvedItems.get(pid)!) solved[itemsById.get(itemId)!.difficulty] += 1
    patterns.set(pid, {
      patternId: pid,
      rating,
      mastery: mastery(rating.theta),
      band: masteryBand(rating),
      se: standardError(rating),
      attempts: events.length,
      correct: events.filter((e) => e.correct).length,
      solved,
      recentAccuracy: recent.length ? recent.filter((e) => e.correct).length / recent.length : null,
      medianLatencyMs: median(events.map((e) => e.latencyMs)),
      lastPracticedAt: events.length ? events[events.length - 1]!.ts : null,
    })
  }
  return { patterns, itemDifficulty }
}

import type { Item } from '../content/schema'
import type { CatItem } from './cat'
import { DIFFICULTY_PRIOR } from './elo'
import type { Estimate } from './irt'
import { ratingTheta, type SelfRatingEvent } from './survey'

/** The drill bank as placement items: difficulty from the label, a = 1, until items are calibrated (as in ml/src/cat.py). */
export function placementBank(items: Item[]): CatItem[] {
  return items.map((i) => ({ id: i.id, patterns: i.pattern_ids, a: 1, b: DIFFICULTY_PRIOR[i.difficulty] }))
}

/** What a finished placement leaves behind for the skill model. */
export interface PlacementOutcome {
  endedAt: number
  patterns: Record<string, Estimate>
}

/**
 * Starting theta per pattern for computeSkills. A finished placement already
 * folded in the survey that was current when it ran, so its estimate wins,
 * unless the pattern was re-rated in a survey taken afterwards.
 */
export function skillPriors(placement: PlacementOutcome | null, ratingEvents: SelfRatingEvent[]): Map<string, number> {
  const latest = new Map<string, SelfRatingEvent>()
  for (const e of ratingEvents) {
    const prev = latest.get(e.patternId)
    if (!prev || e.ts >= prev.ts) latest.set(e.patternId, e)
  }
  const out = new Map<string, number>()
  if (placement) for (const [pid, est] of Object.entries(placement.patterns)) out.set(pid, est.theta)
  for (const [pid, e] of latest) {
    if (e.rating === null) continue // "not sure" never overrides measured evidence
    if (!placement || e.ts > placement.endedAt || !out.has(pid)) out.set(pid, ratingTheta(e.rating))
  }
  return out
}

/** The n patterns with the lowest estimates; ties go to the less certain one. */
export function weakest(patterns: Record<string, Estimate>, n = 3): string[] {
  return Object.entries(patterns)
    .sort(([, x], [, y]) => x.theta - y.theta || y.se - x.se)
    .slice(0, n)
    .map(([pid]) => pid)
}

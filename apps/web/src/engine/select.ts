import type { Item } from '../content/schema'
import { DIFFICULTY_PRIOR } from './elo'
import { PARAMS } from './params'
import {
  formatReason,
  scoreCandidate,
  topCandidates,
  type CandidateScore,
  type RecContext,
  type Scored,
} from './recommend'

export interface Pick {
  item: Item
  reason: string
  /** Everything needed to log this decision for Phase 9 re-estimation. */
  decision: {
    scored: Scored
    noise: number
    candidates: CandidateScore[]
    poolSize: number
  }
}

/** Don't repeat any of the last few items while others are available. */
export const RECENT_EXCLUDE = PARAMS.select.recentExclude

export interface PickOptions {
  random?: () => number
  /** Time fit: only items expected to take at most this many seconds. */
  maxSeconds?: number
}

/**
 * Picks the next drill item with the shared ranking rules (weakness,
 * difficulty fit, due reviews, prerequisites). Time fit and freshness are
 * hard filters; a little noise breaks ties.
 */
export function pickNextItem(
  items: Item[],
  ctx: RecContext,
  recentItemIds: string[],
  patternName: (id: string) => string,
  { random = Math.random, maxSeconds = Infinity }: PickOptions = {},
): Pick | null {
  const fitting = items.filter((i) => i.est_seconds <= maxSeconds)
  if (fitting.length === 0) return null
  const excludeCount = Math.min(RECENT_EXCLUDE, fitting.length - 1)
  // slice(-0) would return everything, so guard the zero case explicitly.
  const excluded = new Set(excludeCount > 0 ? recentItemIds.slice(-excludeCount) : [])
  const pool = fitting.filter((i) => !excluded.has(i.id))

  let best: { item: Item; total: number; scored: Scored; noise: number } | null = null
  const all: CandidateScore[] = []
  for (const item of pool) {
    const b = ctx.skills.itemDifficulty.get(item.id) ?? DIFFICULTY_PRIOR[item.difficulty]
    const scored = scoreCandidate(item.pattern_ids, b, ctx)
    if (!scored) continue
    all.push({ ref: `item:${item.id}`, baseScore: scored.score })
    const noise = random() * PARAMS.rec.noise.drill
    const total = scored.score + noise
    if (!best || total > best.total) best = { item, total, scored, noise }
  }
  if (!best) return null
  return {
    item: best.item,
    reason: formatReason(patternName(best.scored.targetPattern), best.scored.reasons),
    decision: { scored: best.scored, noise: best.noise, candidates: topCandidates(all), poolSize: all.length },
  }
}

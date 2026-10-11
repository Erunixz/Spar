import type { Item } from '../content/schema'
import { DIFFICULTY_PRIOR } from './elo'
import { formatReason, scoreCandidate, type RecContext } from './recommend'

export interface Pick {
  item: Item
  reason: string
}

/** Don't repeat any of the last few items while others are available. */
export const RECENT_EXCLUDE = 8

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

  let best: { item: Item; score: number; reason: string } | null = null
  for (const item of pool) {
    const b = ctx.skills.itemDifficulty.get(item.id) ?? DIFFICULTY_PRIOR[item.difficulty]
    const scored = scoreCandidate(item.pattern_ids, b, ctx)
    if (!scored) continue
    const score = scored.score + random() * 0.25
    if (!best || score > best.score) {
      best = { item, score, reason: formatReason(patternName(scored.targetPattern), scored.reasons) }
    }
  }
  return best && { item: best.item, reason: best.reason }
}

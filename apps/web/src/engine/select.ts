import type { Item } from '../content/schema'
import type { SkillState } from './skill'

export interface Pick {
  item: Item
  reason: string
}

/** Don't repeat any of the last few items while others are available. */
export const RECENT_EXCLUDE = 8

/**
 * Day-one selection rule: favour items on weak or uncertain patterns, skip
 * items seen in the last few answers, add a little noise to break ties.
 * The full recommender (difficulty fit, due reviews, time fit) replaces this
 * in the session builder.
 */
export function pickNextItem(
  items: Item[],
  skills: SkillState,
  recentItemIds: string[],
  patternName: (id: string) => string,
  random: () => number = Math.random,
): Pick | null {
  if (items.length === 0) return null
  const excludeCount = Math.min(RECENT_EXCLUDE, items.length - 1)
  // slice(-0) would return everything, so guard the zero case explicitly.
  const excluded = new Set(excludeCount > 0 ? recentItemIds.slice(-excludeCount) : [])
  const pool = items.filter((i) => !excluded.has(i.id))

  let best: { item: Item; score: number; weakest: string } | null = null
  for (const item of pool) {
    let weakest = item.pattern_ids[0]!
    let need = -Infinity
    for (const pid of item.pattern_ids) {
      const s = skills.patterns.get(pid)
      if (!s) continue
      // Weakness (0..1) plus uncertainty (se shrinks from 1.5 toward ~0.3).
      const score = (100 - s.mastery) / 100 + s.se / 2
      if (score > need) {
        need = score
        weakest = pid
      }
    }
    const score = need + random() * 0.25
    if (!best || score > best.score) best = { item, score, weakest }
  }
  if (!best) return null

  const s = skills.patterns.get(best.weakest)
  const name = patternName(best.weakest)
  const reason = !s || s.attempts === 0
    ? `${name}: not practiced yet`
    : `${name}: mastery ${Math.round(s.mastery)}, ${s.attempts} attempt${s.attempts === 1 ? '' : 's'} so far`
  return { item: best.item, reason }
}

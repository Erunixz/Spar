import { eap, grid, information, type Answer, type Estimate } from './irt'
import { PARAMS } from './params'

/**
 * Computerized adaptive placement test (CAT).
 *
 * - General ability: EAP over every answer, prior N(0, generalPriorSd^2).
 * - Each pattern: EAP over that pattern's answers, with the general estimate
 *   as its prior mean (a shared prior: with ~1-2 answers per pattern, borrowing
 *   strength from everything else is what makes the estimates usable).
 * - Next item: the pattern with the highest SE, tilted toward patterns that
 *   look weaker than general ability; within it, the unseen item with the most
 *   information at that pattern's current estimate.
 * - Stop: every pattern's SE <= seStop (after minItems), or maxItems.
 *
 * Mirrored in ml/src/cat.py for the simulation study; parity-tested.
 */

/** The placement settings (PARAMS.placement), widened so tests and simulations can vary them. */
export interface PlacementConfig {
  grid: { min: number; max: number; points: number }
  generalPriorSd: number
  patternSd: number
  weakTilt: number
  seStop: number
  maxItems: number
  minItems: number
}

export interface CatItem {
  id: string
  patterns: string[]
  a: number
  b: number
}

export interface CatResponse {
  itemId: string
  correct: boolean
}

export interface CatEstimates {
  general: Estimate
  patterns: Map<string, Estimate>
}

export interface CatChoice {
  item: CatItem
  pattern: string
}

/** Scores closer than this are ties, broken by a fixed order (keeps TypeScript and Python in step). */
const TIE = 1e-9

export function estimateAll(
  bank: Map<string, CatItem>,
  patternIds: string[],
  responses: CatResponse[],
  cfg: PlacementConfig = PARAMS.placement,
): CatEstimates {
  const nodes = grid(cfg.grid.min, cfg.grid.max, cfg.grid.points)
  const answered = responses.flatMap((r) => {
    const item = bank.get(r.itemId)
    return item ? [{ item, answer: { a: item.a, b: item.b, correct: r.correct } satisfies Answer }] : []
  })
  const general = eap(answered.map((x) => x.answer), { mean: 0, sd: cfg.generalPriorSd }, nodes)
  const patterns = new Map<string, Estimate>()
  for (const p of patternIds) {
    const mine = answered.filter((x) => x.item.patterns.includes(p)).map((x) => x.answer)
    patterns.set(p, eap(mine, { mean: general.theta, sd: cfg.patternSd }, nodes))
  }
  return { general, patterns }
}

export function nextItem(
  items: CatItem[],
  patternIds: string[],
  responses: CatResponse[],
  cfg: PlacementConfig = PARAMS.placement,
  estimates: CatEstimates = estimateAll(new Map(items.map((i) => [i.id, i])), patternIds, responses, cfg),
): CatChoice | null {
  const asked = new Set(responses.map((r) => r.itemId))
  const unseen = (p: string) => items.filter((i) => !asked.has(i.id) && i.patterns.includes(p))

  let bestPattern: string | null = null
  let bestScore = -Infinity
  for (const p of patternIds) {
    if (unseen(p).length === 0) continue
    const e = estimates.patterns.get(p)!
    const score = e.se + cfg.weakTilt * (estimates.general.theta - e.theta)
    // Strictly greater (beyond the tie tolerance): earlier patterns win ties.
    if (score > bestScore + TIE) {
      bestScore = score
      bestPattern = p
    }
  }
  if (bestPattern === null) return null

  const theta = estimates.patterns.get(bestPattern)!.theta
  const candidates = [...unseen(bestPattern)].sort((x, y) => (x.id < y.id ? -1 : 1))
  let best = candidates[0]!
  let bestInfo = information(theta, best)
  for (const item of candidates.slice(1)) {
    const info = information(theta, item)
    if (info > bestInfo + TIE) {
      best = item
      bestInfo = info
    }
  }
  return { item: best, pattern: bestPattern }
}

export type StopReason = 'precise' | 'max-items' | 'bank-exhausted'

export function stopReason(
  responses: CatResponse[],
  estimates: CatEstimates,
  hasNext: boolean,
  cfg: PlacementConfig = PARAMS.placement,
): StopReason | null {
  if (!hasNext) return 'bank-exhausted'
  if (responses.length >= cfg.maxItems) return 'max-items'
  const worst = Math.max(...[...estimates.patterns.values()].map((e) => e.se))
  if (responses.length >= cfg.minItems && worst <= cfg.seStop) return 'precise'
  return null
}

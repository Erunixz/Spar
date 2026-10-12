import type { Layer, Pattern } from '../../content'
import { LAYERS } from '../../content/constants'
import type { SkillState } from '../../engine/skill'
import { masteryTier, type MasteryTier } from '../skillmap/tier'

export interface CardRow {
  name: string
  layer: Layer
  /** null when the pattern hasn't been practiced, so the card shows a dash. */
  mastery: number | null
  band: [number, number] | null
  tier: MasteryTier
}

export interface CardData {
  rows: CardRow[]
  answered: number
  accuracy: number | null
  lcSolved: number
  practiced: number
  date: string
}

/** Everything the share image shows, as plain data (testable without a canvas). */
export function buildCardData(
  patterns: Pattern[],
  skills: SkillState,
  lcSolvedTotal: number,
  date: Date,
): CardData {
  const order = (l: Layer) => LAYERS.indexOf(l)
  const rows = [...patterns]
    .sort((a, b) => order(a.layer) - order(b.layer))
    .map((p): CardRow => {
      const s = skills.patterns.get(p.id)!
      const tier = masteryTier(s)
      return {
        name: p.name,
        layer: p.layer,
        mastery: tier === 'none' ? null : Math.round(s.mastery),
        band: tier === 'none' ? null : s.band,
        tier,
      }
    })
  const all = [...skills.patterns.values()]
  const answered = all.reduce((n, s) => n + s.attempts, 0)
  const correct = all.reduce((n, s) => n + s.correct, 0)
  return {
    rows,
    answered,
    accuracy: answered ? Math.round((correct / answered) * 100) : null,
    lcSolved: lcSolvedTotal,
    practiced: rows.filter((r) => r.mastery !== null).length,
    date: date.toLocaleDateString('en', { year: 'numeric', month: 'short', day: 'numeric' }),
  }
}

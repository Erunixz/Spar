import { mastery } from './elo'
import { PARAMS } from './params'
import type { PatternSkill } from './skill'

/** How comfortable the user says they are with a pattern. */
export const COMFORT_RATINGS = [1, 2, 3, 4, 5] as const
export type ComfortRating = (typeof COMFORT_RATINGS)[number]

export const COMFORT_LABEL: Record<ComfortRating, string> = {
  1: 'Never seen it',
  2: 'Know the idea',
  3: 'Can solve easy ones',
  4: 'Can solve mediums',
  5: 'Comfortable with hards',
}

export interface SelfRatingEvent {
  patternId: string
  /** null means "not sure", which clears an earlier rating. */
  rating: ComfortRating | null
  ts: number
}

/** The most recent rating per pattern; a later "not sure" removes an earlier rating. */
export function latestRatings(events: SelfRatingEvent[]): Map<string, ComfortRating> {
  const latest = new Map<string, { rating: ComfortRating | null; ts: number }>()
  for (const e of events) {
    const prev = latest.get(e.patternId)
    if (!prev || e.ts >= prev.ts) latest.set(e.patternId, { rating: e.rating, ts: e.ts })
  }
  const out = new Map<string, ComfortRating>()
  for (const [pid, { rating }] of latest) if (rating !== null) out.set(pid, rating)
  return out
}

export function ratingTheta(rating: ComfortRating): number {
  return PARAMS.survey.ratingTheta[rating]
}

/** Starting theta per rated pattern, for computeSkills. Unrated patterns keep the neutral prior. */
export function priorsFromRatings(ratings: Map<string, ComfortRating>): Map<string, number> {
  return new Map([...ratings].map(([pid, r]) => [pid, ratingTheta(r)]))
}

/** The mastery a rating implies, on the same 0..100 scale as the skill graph. */
export function expectedMastery(rating: ComfortRating): number {
  return mastery(ratingTheta(rating))
}

export interface RatingGap {
  rating: ComfortRating
  expected: number
  measured: number
  /** measured - expected: negative means the user rated themselves higher than they measure. */
  gap: number
}

/** A self-rating that disagrees with enough real evidence to be worth pointing out. */
export function ratingGap(skill: PatternSkill, rating: ComfortRating | undefined): RatingGap | null {
  if (rating === undefined) return null
  if (skill.attempts + skill.lcLogged < PARAMS.survey.gapMinEvidence) return null
  const expected = expectedMastery(rating)
  const gap = skill.mastery - expected
  if (Math.abs(gap) < PARAMS.survey.gapMastery) return null
  return { rating, expected, measured: skill.mastery, gap }
}

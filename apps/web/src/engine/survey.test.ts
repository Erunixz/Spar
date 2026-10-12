import { describe, expect, it } from 'vitest'
import type { Item } from '../content/schema'
import { PARAMS } from './params'
import { scoreCandidate } from './recommend'
import { computeSkills, type ResponseEvent } from './skill'
import { expectedMastery, latestRatings, priorsFromRatings, ratingGap, type SelfRatingEvent } from './survey'

const item: Item = {
  id: 'pat-001',
  type: 'pattern',
  difficulty: 'medium',
  est_seconds: 30,
  pattern_ids: ['a'],
  prompt: 'p',
  choices: ['a', 'b'],
  answer: 'a',
  signals: [],
  explanation: 'e',
}
const itemsById = new Map([[item.id, item]])
const answers = (correct: boolean, n: number): ResponseEvent[] =>
  Array.from({ length: n }, (_, i) => ({ itemId: 'pat-001', correct, latencyMs: 1000, ts: i + 1 }))

describe('latestRatings', () => {
  it('keeps the most recent rating per pattern', () => {
    const events: SelfRatingEvent[] = [
      { patternId: 'a', rating: 2, ts: 1 },
      { patternId: 'a', rating: 4, ts: 5 },
      { patternId: 'b', rating: 3, ts: 2 },
    ]
    expect(latestRatings(events)).toEqual(new Map([['a', 4], ['b', 3]]))
  })

  it('lets a later "not sure" clear an earlier rating', () => {
    const events: SelfRatingEvent[] = [
      { patternId: 'a', rating: 5, ts: 1 },
      { patternId: 'a', rating: null, ts: 2 },
    ]
    expect(latestRatings(events).has('a')).toBe(false)
  })

  it('does not depend on input order', () => {
    const events: SelfRatingEvent[] = [
      { patternId: 'a', rating: 4, ts: 5 },
      { patternId: 'a', rating: 2, ts: 1 },
    ]
    expect(latestRatings(events).get('a')).toBe(4)
  })
})

describe('ratings as priors', () => {
  it('maps ratings monotonically onto starting theta', () => {
    const priors = priorsFromRatings(new Map([['a', 1], ['b', 3], ['c', 5]]))
    expect(priors.get('a')).toBeLessThan(priors.get('b')!)
    expect(priors.get('b')).toBe(0)
    expect(priors.get('c')).toBe(PARAMS.survey.ratingTheta[5])
  })

  it('shifts starting mastery but leaves uncertainty wide', () => {
    const neutral = computeSkills(['a'], itemsById, []).patterns.get('a')!
    const rated = computeSkills(['a'], itemsById, [], [], priorsFromRatings(new Map([['a', 5]]))).patterns.get('a')!
    expect(rated.mastery).toBeCloseTo(expectedMastery(5))
    expect(rated.mastery).toBeGreaterThan(70)
    expect(rated.se).toBeCloseTo(neutral.se)
  })

  it('lets real answers override an over-confident rating within a few items', () => {
    const priors = priorsFromRatings(new Map([['a', 5]]))
    const after = computeSkills(['a'], itemsById, answers(false, 5), [], priors).patterns.get('a')!
    expect(after.mastery).toBeLessThan(40)
  })

  it('changes which patterns the recommender thinks need work, and says why', () => {
    const ratings = new Map<string, 1 | 2 | 3 | 4 | 5>([['a', 5], ['b', 1]])
    const skills = computeSkills(['a', 'b'], new Map(), [], [], priorsFromRatings(ratings))
    const ctx = { skills, patternsById: new Map(), now: 0, selfRatings: ratings }
    const a = scoreCandidate(['a'], 0, ctx)!
    const b = scoreCandidate(['b'], 0, ctx)!
    expect(b.features.need).toBeGreaterThan(a.features.need)
    expect(b.reasons[0]).toBe('not practiced yet, you rated it 1/5')
    expect(b.features.selfRating).toBe(1)
  })
})

describe('ratingGap', () => {
  it('flags a big gap once there is enough evidence', () => {
    const priors = priorsFromRatings(new Map([['a', 5]]))
    const skill = computeSkills(['a'], itemsById, answers(false, 6), [], priors).patterns.get('a')!
    const gap = ratingGap(skill, 5)
    expect(gap).not.toBeNull()
    expect(gap!.gap).toBeLessThan(0)
  })

  it('stays quiet without a rating, without enough evidence, or when they agree', () => {
    const few = computeSkills(['a'], itemsById, answers(false, 2)).patterns.get('a')!
    expect(ratingGap(few, 5)).toBeNull()
    const many = computeSkills(['a'], itemsById, answers(false, 6)).patterns.get('a')!
    expect(ratingGap(many, undefined)).toBeNull()
    expect(ratingGap(many, 1)).toBeNull()
  })
})

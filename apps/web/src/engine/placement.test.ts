import { describe, expect, it } from 'vitest'
import { content } from '../content'
import { estimateAll } from './cat'
import { PARAMS } from './params'
import { placementBank, skillPriors, weakest } from './placement'
import { ratingTheta } from './survey'

const est = (theta: number, se = 0.5) => ({ theta, se })

describe('placementBank', () => {
  it('maps every drill item with a = 1 and b from its label', () => {
    const bank = placementBank(content.items)
    expect(bank).toHaveLength(content.items.length)
    for (const item of bank) {
      expect(item.a).toBe(1)
      expect([-1, 0, 1]).toContain(item.b)
    }
  })
})

describe('survey priors in the CAT', () => {
  it('a rated pattern starts at its rating; unrated ones at the general estimate', () => {
    const items = placementBank(content.items)
    const ids = content.patterns.map((p) => p.id)
    const bank = new Map(items.map((i) => [i.id, i]))
    const e = estimateAll(bank, ids, [], PARAMS.placement, new Map([[ids[0]!, 1.2]]))
    expect(e.patterns.get(ids[0]!)!.theta).toBeCloseTo(1.2, 2)
    expect(e.patterns.get(ids[1]!)!.theta).toBeCloseTo(e.general.theta, 2)
  })
})

describe('skillPriors', () => {
  const placement = { endedAt: 100, patterns: { a: est(-0.7), b: est(0.4) } }

  it('uses the survey alone before any placement', () => {
    const priors = skillPriors(null, [{ patternId: 'a', rating: 4, ts: 1 }])
    expect(priors.get('a')).toBe(ratingTheta(4))
    expect(priors.has('b')).toBe(false)
  })

  it('a placement overrides the survey it was seeded with', () => {
    const priors = skillPriors(placement, [{ patternId: 'a', rating: 5, ts: 50 }])
    expect(priors.get('a')).toBe(-0.7)
    expect(priors.get('b')).toBe(0.4)
  })

  it('a later re-rating overrides that pattern only', () => {
    const priors = skillPriors(placement, [
      { patternId: 'a', rating: 2, ts: 150 },
      { patternId: 'b', rating: null, ts: 150 },
    ])
    expect(priors.get('a')).toBe(ratingTheta(2))
    expect(priors.get('b')).toBe(0.4) // "not sure" keeps the measurement
  })
})

describe('weakest', () => {
  it('orders by estimate, breaking ties toward the less certain pattern', () => {
    expect(weakest({ a: est(0.2), b: est(-1), c: est(0.2, 0.7), d: est(1) }, 3)).toEqual(['b', 'c', 'a'])
  })
})

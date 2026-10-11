import { describe, expect, it } from 'vitest'
import {
  initialRating,
  kFactor,
  K_MAX,
  K_MIN,
  mastery,
  masteryBand,
  pCorrect,
  PRIOR_SD,
  standardError,
  update,
} from './elo'

describe('pCorrect', () => {
  it('is 0.5 when ability equals difficulty', () => {
    expect(pCorrect(0.7, 0.7)).toBeCloseTo(0.5)
  })

  it('is symmetric around the difficulty', () => {
    expect(pCorrect(1, 0) + pCorrect(-1, 0)).toBeCloseTo(1)
  })
})

describe('kFactor', () => {
  it('starts at K_MAX and decays to K_MIN', () => {
    expect(kFactor(0)).toBe(K_MAX)
    expect(kFactor(1)).toBeLessThan(kFactor(0))
    expect(kFactor(10_000)).toBe(K_MIN)
  })
})

describe('update', () => {
  it('raises ability and lowers item difficulty after a correct answer', () => {
    const { rating, b } = update(initialRating(), 0, true)
    expect(rating.theta).toBeCloseTo(K_MAX * 0.5)
    expect(b).toBeLessThan(0)
    expect(rating.n).toBe(1)
    expect(rating.info).toBeCloseTo(0.25)
  })

  it('lowers ability after a wrong answer', () => {
    expect(update(initialRating(), 0, false).rating.theta).toBeCloseTo(-K_MAX * 0.5)
  })

  it('moves less when the outcome was expected', () => {
    const strong = { theta: 3, n: 0, info: 0 }
    const easyWin = update(strong, -1, true).rating.theta - 3
    const evenWin = update({ ...strong, theta: 0 }, 0, true).rating.theta - 0
    expect(easyWin).toBeLessThan(evenWin)
  })

  it('converges toward the true ability on simulated answers', () => {
    // Deterministic LCG so the test is stable.
    let seed = 42
    const rand = () => ((seed = (seed * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32)
    const trueTheta = 1.2
    let rating = initialRating()
    for (let i = 0; i < 400; i++) {
      const b = rand() * 4 - 2
      const correct = rand() < pCorrect(trueTheta, b)
      rating = update(rating, b, correct).rating
    }
    expect(rating.theta).toBeGreaterThan(trueTheta - 0.6)
    expect(rating.theta).toBeLessThan(trueTheta + 0.6)
  })
})

describe('uncertainty and mastery', () => {
  it('starts at the prior SD and shrinks with evidence', () => {
    const r0 = initialRating()
    expect(standardError(r0)).toBeCloseTo(PRIOR_SD)
    const r1 = update(r0, 0, true).rating
    expect(standardError(r1)).toBeLessThan(standardError(r0))
  })

  it('maps theta 0 to 50 mastery and keeps the band within 0..100', () => {
    expect(mastery(0)).toBeCloseTo(50)
    const [lo, hi] = masteryBand(initialRating())
    expect(lo).toBeGreaterThan(0)
    expect(hi).toBeLessThan(100)
    expect(lo).toBeLessThan(50)
    expect(hi).toBeGreaterThan(50)
  })
})

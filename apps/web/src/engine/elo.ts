/**
 * Elo-style skill tracking on the logit scale, so ratings line up with the
 * Rasch model used by the placement test later: P(correct) = sigmoid(theta - b).
 *
 * theta is a person's ability on one pattern, b is an item's difficulty.
 */

import { PARAMS } from './params'

// Tunable values live in params.ts; these aliases keep call sites short.
export const PRIOR_SD = PARAMS.elo.priorSd
export const K_MAX = PARAMS.elo.kMax
export const K_MIN = PARAMS.elo.kMin
export const K_HALF_LIFE = PARAMS.elo.kHalfLife
export const ITEM_K = PARAMS.elo.itemK
export const DIFFICULTY_PRIOR = PARAMS.elo.difficultyPrior

export interface Rating {
  theta: number
  /** Number of responses folded into this rating. */
  n: number
  /** Accumulated Fisher information, sum of p(1 - p). */
  info: number
}

export const initialRating = (): Rating => ({ theta: 0, n: 0, info: 0 })

export function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x))
}

export function pCorrect(theta: number, b: number): number {
  return sigmoid(theta - b)
}

export function kFactor(n: number): number {
  return Math.max(K_MIN, K_MAX / (1 + n / K_HALF_LIFE))
}

/**
 * Returns the updated person rating and item difficulty after one response.
 * score is 1 for correct and 0 for wrong; values in between give partial
 * credit (e.g. a LeetCode solve that needed hints).
 */
export function update(
  rating: Rating,
  b: number,
  score: boolean | number,
): { rating: Rating; b: number } {
  const p = pCorrect(rating.theta, b)
  const surprise = (typeof score === 'boolean' ? (score ? 1 : 0) : score) - p
  return {
    rating: {
      theta: rating.theta + kFactor(rating.n) * surprise,
      n: rating.n + 1,
      info: rating.info + p * (1 - p),
    },
    b: b - ITEM_K * surprise,
  }
}

/** Approximate standard error of theta: prior precision plus observed information. */
export function standardError(rating: Rating): number {
  return 1 / Math.sqrt(1 / PRIOR_SD ** 2 + rating.info)
}

/** Mastery 0..100 = chance of answering an average (b = 0) item correctly. */
export function mastery(theta: number): number {
  return 100 * sigmoid(theta)
}

/** 95% band on mastery, mapped through the sigmoid so it stays inside 0..100. */
export function masteryBand(rating: Rating): [number, number] {
  const se = standardError(rating)
  return [mastery(rating.theta - 1.96 * se), mastery(rating.theta + 1.96 * se)]
}

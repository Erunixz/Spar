/**
 * Item response theory for the placement test.
 *
 * 2PL model: P(correct | theta) = 1 / (1 + exp(-a (theta - b))). With a = 1 it is
 * the Rasch model, the same scale as the Elo engine (P = sigmoid(theta - b)).
 * Abilities are estimated by EAP (expected a posteriori) on a fixed grid, which
 * gives both an estimate and an honest standard error from very few answers.
 *
 * Mirrored in ml/src/cat.py; a parity fixture keeps the two identical, and the
 * Python side cross-checks the formulas against catsim.
 */

export interface ItemParams {
  /** Difficulty on the theta scale. */
  b: number
  /** Discrimination; 1 for Rasch. */
  a: number
}

export interface Answer extends ItemParams {
  correct: boolean
}

export interface Estimate {
  theta: number
  se: number
}

export function icc(theta: number, { a, b }: ItemParams): number {
  return 1 / (1 + Math.exp(-a * (theta - b)))
}

/** Fisher information of one item at theta: a^2 P (1 - P). */
export function information(theta: number, item: ItemParams): number {
  const p = icc(theta, item)
  return item.a * item.a * p * (1 - p)
}

export function logLikelihood(theta: number, answers: Answer[]): number {
  let ll = 0
  for (const ans of answers) {
    const p = icc(theta, ans)
    ll += ans.correct ? Math.log(p) : Math.log(1 - p)
  }
  return ll
}

export function grid(min: number, max: number, points: number): number[] {
  return Array.from({ length: points }, (_, i) => min + ((max - min) * i) / (points - 1))
}

/**
 * EAP estimate and posterior SD under a normal prior N(mean, sd^2), on `nodes`.
 * Works in log space so long answer sequences can't underflow.
 */
export function eap(answers: Answer[], prior: { mean: number; sd: number }, nodes: number[]): Estimate {
  const logPost = nodes.map((t) => -0.5 * ((t - prior.mean) / prior.sd) ** 2 + logLikelihood(t, answers))
  const max = Math.max(...logPost)
  const w = logPost.map((v) => Math.exp(v - max))
  const total = w.reduce((s, v) => s + v, 0)
  const theta = nodes.reduce((s, t, i) => s + t * w[i]!, 0) / total
  const variance = nodes.reduce((s, t, i) => s + (t - theta) ** 2 * w[i]!, 0) / total
  return { theta, se: Math.sqrt(variance) }
}

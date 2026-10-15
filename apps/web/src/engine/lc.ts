import type { Difficulty, LcProblem } from '../content/schema'
import { PARAMS } from './params'

export const LC_OUTCOMES = ['unaided', 'hints', 'viewed'] as const
export type LcOutcome = (typeof LC_OUTCOMES)[number]

export const LC_OUTCOME_LABEL: Record<LcOutcome, string> = {
  unaided: 'Solved on my own',
  hints: 'Solved with hints',
  viewed: 'Looked at the solution',
}

/**
 * Elo score per outcome. Only unaided solves count fully; a viewed solution is
 * exposure, not skill, so it scores as a miss.
 */
export const LC_OUTCOME_SCORE: Record<LcOutcome, number> = PARAMS.lc.outcomeScore

/** Full problems are harder than 60-second drill items, so their priors sit higher. */
export const LC_DIFFICULTY_PRIOR: Record<Difficulty, number> = PARAMS.lc.difficultyPrior

export interface LcLogEvent {
  slug: string
  outcome: LcOutcome
  /** Tags at log time: from the catalog, or picked by the user for unknown problems. */
  patternIds: string[]
  difficulty: Difficulty
  /** The catalog rating at log time, if the problem had one (older logs don't). */
  rating?: number
  ts: number
}

/** Difficulty on the skill scale: the problem's own rating when known, else its label's bucket. */
export function lcDifficultyB(p: { difficulty: Difficulty; rating?: number }): number {
  if (p.rating === undefined) return LC_DIFFICULTY_PRIOR[p.difficulty]
  const { center, scale } = PARAMS.lc.ratingToB
  return (p.rating - center) / scale
}

const RANK: Record<LcOutcome, number> = { viewed: 0, hints: 1, unaided: 2 }

export function bestOutcome(a: LcOutcome, b: LcOutcome): LcOutcome {
  return RANK[a] >= RANK[b] ? a : b
}

/** A problem counts as solved if its best outcome was unaided or with hints. */
export function isSolved(outcome: LcOutcome): boolean {
  return outcome !== 'viewed'
}

export function lcUrl(slug: string): string {
  return `https://leetcode.com/problems/${slug}/`
}

/** "two-sum-ii-input-array-is-sorted" -> "Two Sum Ii Input Array Is Sorted" */
export function slugTitle(slug: string): string {
  return slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

export type ParsedLcInput =
  | { kind: 'catalog'; problem: LcProblem }
  | { kind: 'unknown'; slug: string }
  | { kind: 'invalid'; reason: string }

const URL_SLUG = /leetcode\.(?:com|cn)\/problems\/([a-z0-9-]+)/i
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/
// "15", "#15", "15 · 3sum", "15. 3Sum". No hyphen separator, so slugs such
// as "1-bit-and-2-bit-characters" are not mistaken for problem #1.
const NUMBER = /^#?(\d{1,5})(?:(?:\s*[·.:]\s*|\s+)(.+))?$/

/**
 * Accepts a problem URL, a slug, a number ("15" or "#15"), or the
 * "15 · 3sum" form shown in the autocomplete list.
 */
export function parseLeetCodeInput(input: string, catalog: LcProblem[]): ParsedLcInput {
  const text = input.trim()
  if (!text) return { kind: 'invalid', reason: 'Paste a LeetCode link, a problem number or a slug.' }

  const bySlug = (slug: string): ParsedLcInput => {
    const problem = catalog.find((p) => p.slug === slug)
    return problem ? { kind: 'catalog', problem } : { kind: 'unknown', slug }
  }

  const fromUrl = URL_SLUG.exec(text)
  if (fromUrl) return bySlug(fromUrl[1]!.toLowerCase())

  const num = NUMBER.exec(text)
  if (num) {
    const problem = catalog.find((p) => p.number === Number(num[1]))
    if (problem) return { kind: 'catalog', problem }
    // "15 · 3sum" style: fall back to the slug after the separator.
    const tail = num[2]?.trim().toLowerCase().replace(/\s+/g, '-')
    if (tail && SLUG.test(tail)) return bySlug(tail)
    return { kind: 'invalid', reason: `Problem #${num[1]} isn't in the catalog yet. Paste its link instead.` }
  }

  const slug = text.toLowerCase().replace(/\s+/g, '-')
  if (SLUG.test(slug)) return bySlug(slug)
  return { kind: 'invalid', reason: "That doesn't look like a LeetCode link, number or slug." }
}

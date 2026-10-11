import type { Difficulty, LcProblem, Pattern } from '../content/schema'
import { pCorrect } from './elo'
import { bestOutcome, LC_DIFFICULTY_PRIOR, type LcLogEvent, type LcOutcome } from './lc'
import type { PatternSkill, SkillState } from './skill'

/**
 * Ranking v1: rules on top of the skill engine, shared by drill items and
 * LeetCode problems. Each candidate is scored on weakness, difficulty fit,
 * due reviews and prerequisites; time fit and freshness are hard filters
 * applied by the callers.
 */

export interface RecContext {
  skills: SkillState
  patternsById: Map<string, Pattern>
  now: number
}

/** Aim for problems the user solves 60 to 75% of the time: hard enough to learn from. */
export const TARGET_P: readonly [number, number] = [0.6, 0.75]
/**
 * A stretch pick is harder than the main picks: at least STRETCH_GAP below
 * their lowest predicted success, but not hopeless.
 */
export const STRETCH_GAP = 0.1
export const STRETCH_FLOOR = 0.2
/** Until FSRS lands, a pattern is due for review after a week without practice. */
export const FADING_MS = 7 * 24 * 60 * 60 * 1000
/** A prerequisite with evidence and mastery below this holds its dependants back. */
export const WEAK_PREREQ_MASTERY = 40
/** Rough minutes to budget for a LeetCode problem. */
export const LC_MINUTES: Record<Difficulty, number> = { easy: 15, medium: 25, hard: 40 }

const W_FIT = 1.5
const W_FADING = 0.3
const W_PREREQ = 0.5

/** How much a pattern needs practice: weakness (0..1) plus uncertainty (se shrinks from 1.5 toward ~0.3). */
export function practiceNeed(skill: PatternSkill): number {
  return (100 - skill.mastery) / 100 + skill.se / 2
}

export function hasEvidence(skill: PatternSkill): boolean {
  return skill.attempts > 0 || skill.lcLogged > 0
}

export function isFading(skill: PatternSkill, now: number): boolean {
  return skill.lastPracticedAt !== null && now - skill.lastPracticedAt > FADING_MS
}

/** Prerequisites of a pattern that have been practiced and are still weak. */
export function weakPrerequisites(patternId: string, ctx: RecContext): string[] {
  const pattern = ctx.patternsById.get(patternId)
  if (!pattern) return []
  return pattern.prerequisites.filter((pre) => {
    const s = ctx.skills.patterns.get(pre)
    return s !== undefined && hasEvidence(s) && s.mastery < WEAK_PREREQ_MASTERY
  })
}

export interface Scored {
  score: number
  /** The candidate's pattern that most needs practice; the reason is about it. */
  targetPattern: string
  /** Predicted chance of success on the target pattern. */
  p: number
  /** Short phrases explaining the pick, most important first. */
  reasons: string[]
}

/** Scores one candidate (a drill item or a LeetCode problem) by its patterns and difficulty b. */
export function scoreCandidate(patternIds: string[], b: number, ctx: RecContext): Scored | null {
  let target: PatternSkill | null = null
  for (const pid of patternIds) {
    const s = ctx.skills.patterns.get(pid)
    if (s && (!target || practiceNeed(s) > practiceNeed(target))) target = s
  }
  if (!target) return null

  const p = pCorrect(target.rating.theta, b)
  const [lo, hi] = TARGET_P
  const miss = p < lo ? lo - p : p > hi ? p - hi : 0
  let score = practiceNeed(target) - W_FIT * miss
  const reasons: string[] = []

  if (!hasEvidence(target)) reasons.push('not practiced yet')
  else if (target.mastery < 40) reasons.push('low mastery')
  else if (target.se > 0.8) reasons.push('still uncertain')
  else reasons.push(`mastery ${Math.round(target.mastery)}`)

  if (isFading(target, ctx.now)) {
    score += W_FADING
    reasons.push('not practiced in over a week')
  }
  if (weakPrerequisites(target.patternId, ctx).length > 0) score -= W_PREREQ

  return { score, targetPattern: target.patternId, p, reasons }
}

export type LcRecKind = 'weak' | 'review' | 'retry' | 'stretch'

export interface LcRecommendation {
  problem: LcProblem
  minutes: number
  kind: LcRecKind
  targetPattern: string
  p: number
  reasons: string[]
}

export interface RecommendOptions {
  count?: number
  /** Time fit: only problems expected to take at most this many minutes. */
  maxMinutes?: number
  random?: () => number
}

/**
 * Picks LeetCode problems for the user's weakest patterns: mostly in the
 * difficulty band, on different patterns, plus one stretch pick at the end.
 */
export function recommendLeetCode(
  catalog: LcProblem[],
  lcLogs: LcLogEvent[],
  ctx: RecContext,
  { count = 3, maxMinutes = Infinity, random = Math.random }: RecommendOptions = {},
): LcRecommendation[] {
  const history = new Map<string, { lastTs: number; best: LcOutcome }>()
  for (const l of lcLogs) {
    const h = history.get(l.slug)
    history.set(l.slug, {
      lastTs: Math.max(h?.lastTs ?? 0, l.ts),
      best: h ? bestOutcome(h.best, l.outcome) : l.outcome,
    })
  }

  const candidates: { rec: LcRecommendation; score: number }[] = []
  for (const problem of catalog) {
    const minutes = LC_MINUTES[problem.difficulty]
    if (minutes > maxMinutes) continue
    const scored = scoreCandidate(problem.pattern_ids, LC_DIFFICULTY_PRIOR[problem.difficulty], ctx)
    if (!scored) continue

    const h = history.get(problem.slug)
    let kind: LcRecKind = 'weak'
    const reasons = [...scored.reasons]
    if (h) {
      // Freshness: never within a week; an unaided solve only returns as a review.
      if (ctx.now - h.lastTs < FADING_MS) continue
      const fading = isFading(ctx.skills.patterns.get(scored.targetPattern)!, ctx.now)
      if (h.best === 'unaided') {
        if (!fading) continue
        kind = 'review'
        reasons.unshift('review: solved before')
      } else {
        kind = 'retry'
        reasons.unshift('retry: you needed help last time')
      }
    }
    candidates.push({
      rec: { problem, minutes, kind, targetPattern: scored.targetPattern, p: scored.p, reasons },
      score: scored.score + random() * 0.1,
    })
  }
  const ranked = candidates.sort((a, b) => b.score - a.score).map((c) => c.rec)

  const picks: LcRecommendation[] = []
  const unused = (r: LcRecommendation) => !picks.some((p) => p.problem.slug === r.problem.slug)

  const mainCount = count > 1 ? count - 1 : count
  // Prefer one problem per pattern, then fill if there aren't enough patterns.
  for (const r of ranked) {
    if (picks.length >= mainCount) break
    if (!picks.some((p) => p.targetPattern === r.targetPattern)) picks.push(r)
  }
  for (const r of ranked) {
    if (picks.length >= mainCount) break
    if (unused(r)) picks.push(r)
  }

  if (count > 1) {
    // Best-ranked candidate that is clearly harder than the main picks.
    const ceiling = Math.min(...picks.map((p) => p.p)) - STRETCH_GAP
    const stretch = ranked.find((r) => unused(r) && r.p >= STRETCH_FLOOR && r.p <= ceiling)
    if (stretch) picks.push({ ...stretch, kind: 'stretch', reasons: ['stretch pick', ...stretch.reasons] })
    else {
      const filler = ranked.find(unused)
      if (filler) picks.push(filler)
    }
  }
  return picks
}

/** "Sliding Window: low mastery, not practiced in over a week" */
export function formatReason(patternName: string, reasons: string[]): string {
  return `${patternName}: ${reasons.join(', ')}`
}

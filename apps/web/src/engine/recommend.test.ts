import { describe, expect, it } from 'vitest'
import type { Item, LcProblem, Pattern } from '../content/schema'
import type { LcLogEvent } from './lc'
import {
  FADING_MS,
  formatReason,
  isFading,
  LOGGED_CANDIDATES,
  recommendLeetCode,
  recommendLeetCodeDetailed,
  scoreCandidate,
  weakPrerequisites,
  type RecContext,
} from './recommend'
import { PARAMS } from './params'
import { pickNextItem } from './select'
import { computeSkills, type ResponseEvent } from './skill'

const DAY = 24 * 60 * 60 * 1000
const NOW = 100 * DAY

const pattern = (id: string, prerequisites: string[] = []): Pattern => ({
  id,
  name: id.toUpperCase(),
  layer: 'core',
  prerequisites,
  summary: 's',
  signals: [],
})
const patterns = [pattern('a'), pattern('b'), pattern('c', ['a'])]
const patternsById = new Map(patterns.map((p) => [p.id, p]))
const patternIds = patterns.map((p) => p.id)

const items: Item[] = patternIds.map((pid, i) => ({
  id: `pat-00${i + 1}`,
  type: 'pattern',
  difficulty: 'medium',
  est_seconds: 30,
  pattern_ids: [pid],
  prompt: 'p',
  choices: [pid, 'x'],
  answer: pid,
  signals: [],
  explanation: 'e',
}))
const itemsById = new Map(items.map((i) => [i.id, i]))

const lc = (slug: string, number: number, difficulty: LcProblem['difficulty'], pid: string): LcProblem => ({
  slug,
  number,
  difficulty,
  pattern_ids: [pid],
})
const catalog: LcProblem[] = [
  lc('a-easy', 1, 'easy', 'a'),
  lc('a-medium', 2, 'medium', 'a'),
  lc('a-hard', 3, 'hard', 'a'),
  lc('b-easy', 4, 'easy', 'b'),
  lc('b-medium', 5, 'medium', 'b'),
  lc('c-easy', 6, 'easy', 'c'),
  lc('c-medium', 7, 'medium', 'c'),
]

const answers = (pid: string, correct: boolean, n: number, ts: number): ResponseEvent[] =>
  Array.from({ length: n }, (_, i) => ({ itemId: `pat-00${patternIds.indexOf(pid) + 1}`, correct, latencyMs: 1000, ts: ts + i }))

function ctxFrom(responses: ResponseEvent[], logs: LcLogEvent[] = [], now = NOW): RecContext {
  return { skills: computeSkills(patternIds, itemsById, responses, logs), patternsById, now }
}

const noNoise = { random: () => 0 }

describe('scoreCandidate', () => {
  it('prefers candidates inside the 60-75% band', () => {
    const ctx = ctxFrom([])
    // Unpracticed: theta 0, so b = -0.8 gives p of about 0.69 (in band) and b = 1 gives about 0.27.
    const inBand = scoreCandidate(['a'], -0.8, ctx)!
    const tooHard = scoreCandidate(['a'], 1, ctx)!
    expect(inBand.p).toBeGreaterThan(0.6)
    expect(inBand.p).toBeLessThan(0.75)
    expect(inBand.score).toBeGreaterThan(tooHard.score)
  })

  it('targets the weakest of several patterns and explains it', () => {
    const ctx = ctxFrom(answers('a', true, 6, NOW - DAY))
    const s = scoreCandidate(['a', 'b'], 0, ctx)!
    expect(s.targetPattern).toBe('b')
    expect(s.reasons).toEqual(['not practiced yet'])
  })

  it('boosts patterns not practiced for over a week', () => {
    const fresh = ctxFrom(answers('a', false, 3, NOW - DAY))
    const stale = ctxFrom(answers('a', false, 3, NOW - FADING_MS - DAY))
    expect(isFading(stale.skills.patterns.get('a')!, NOW)).toBe(true)
    const staleScore = scoreCandidate(['a'], 0, stale)!
    expect(staleScore.score).toBeGreaterThan(scoreCandidate(['a'], 0, fresh)!.score)
    expect(staleScore.reasons).toEqual(['low mastery', 'not practiced in over a week'])
  })

  it('holds back patterns whose prerequisites are weak', () => {
    const weakA = ctxFrom(answers('a', false, 4, NOW - DAY))
    expect(weakPrerequisites('c', weakA)).toEqual(['a'])
    expect(weakPrerequisites('c', ctxFrom([]))).toEqual([]) // no evidence yet: not "weak"
    const c = scoreCandidate(['c'], 0, weakA)!
    const cWithoutPenalty = scoreCandidate(['c'], 0, ctxFrom([]))!
    expect(c.score).toBeLessThan(cWithoutPenalty.score)
  })
})

describe('recommendLeetCode', () => {
  const log = (slug: string, outcome: LcLogEvent['outcome'], ts: number, pid = slug[0]!): LcLogEvent => ({
    slug,
    outcome,
    ts,
    difficulty: 'easy',
    patternIds: [pid],
  })

  it('starts a new user on easy problems across different patterns, plus a stretch', () => {
    const recs = recommendLeetCode(catalog, [], ctxFrom([]), noNoise)
    expect(recs).toHaveLength(3)
    const [first, second, stretch] = recs
    expect(first!.problem.difficulty).toBe('easy')
    expect(second!.problem.difficulty).toBe('easy')
    expect(first!.targetPattern).not.toBe(second!.targetPattern)
    expect(stretch!.kind).toBe('stretch')
    expect(stretch!.p).toBeLessThan(first!.p)
  })

  it('does not lead with a pattern whose prerequisite is weak', () => {
    const recs = recommendLeetCode(catalog, [], ctxFrom(answers('a', false, 4, NOW - DAY)), { ...noNoise, count: 1 })
    expect(recs[0]!.targetPattern).not.toBe('c')
  })

  it('respects the time left', () => {
    const recs = recommendLeetCode(catalog, [], ctxFrom([]), { ...noNoise, maxMinutes: 20 })
    expect(recs.every((r) => r.minutes <= 20)).toBe(true)
    expect(recommendLeetCode(catalog, [], ctxFrom([]), { maxMinutes: 5 })).toEqual([])
  })

  it('never repeats a problem within a week', () => {
    const logs = [log('a-easy', 'viewed', NOW - DAY), log('b-easy', 'hints', NOW - 2 * DAY)]
    const recs = recommendLeetCode(catalog, logs, ctxFrom([], logs), { ...noNoise, count: 7 })
    const slugs = recs.map((r) => r.problem.slug)
    expect(slugs).not.toContain('a-easy')
    expect(slugs).not.toContain('b-easy')
  })

  it('brings back an unaided solve only as a review once the pattern fades', () => {
    const old = NOW - 10 * DAY
    const recentA = answers('a', true, 2, NOW - DAY)
    const solved = [log('a-easy', 'unaided', old)]
    const notFading = recommendLeetCode(catalog, solved, ctxFrom(recentA, solved), { ...noNoise, count: 7 })
    expect(notFading.map((r) => r.problem.slug)).not.toContain('a-easy')

    const fading = recommendLeetCode(catalog, solved, ctxFrom([], solved), { ...noNoise, count: 7 })
    const review = fading.find((r) => r.problem.slug === 'a-easy')
    expect(review?.kind).toBe('review')
    expect(review?.reasons[0]).toBe('review: solved before')
  })

  it('offers a retry for problems that needed help over a week ago', () => {
    const logs = [log('b-easy', 'viewed', NOW - 10 * DAY)]
    const recs = recommendLeetCode(catalog, logs, ctxFrom([], logs), { ...noNoise, count: 7 })
    expect(recs.find((r) => r.problem.slug === 'b-easy')?.kind).toBe('retry')
  })
})

describe('decision logging (Phase 9 data)', () => {
  it('exposes the features behind a score', () => {
    const ctx = ctxFrom(answers('a', false, 4, NOW - FADING_MS - DAY))
    const s = scoreCandidate(['c'], 0, ctx)!
    expect(s.features).toMatchObject({ evidence: false, fading: false, weakPrereq: true })
    const a = scoreCandidate(['a'], 0, ctx)!
    expect(a.features).toMatchObject({ evidence: true, fading: true, weakPrereq: false })
    expect(a.features.p).toBeCloseTo(a.p)
  })

  it('logs runner-up base scores and the noise for drill picks', () => {
    const pick = pickNextItem(items, ctxFrom([]), [], (id) => id, { random: () => 0.5 })!
    expect(pick.decision.noise).toBeCloseTo(0.5 * PARAMS.rec.noise.drill)
    expect(pick.decision.poolSize).toBe(items.length)
    const refs = pick.decision.candidates.map((c) => c.ref)
    expect(refs).toContain(`item:${pick.item.id}`)
    const scores = pick.decision.candidates.map((c) => c.baseScore)
    expect(scores).toEqual([...scores].sort((x, y) => y - x))
  })

  it('caps logged LeetCode candidates and keeps base score separate from noise', () => {
    const { picks, candidates, poolSize } = recommendLeetCodeDetailed(catalog, [], ctxFrom([]), {
      random: () => 0.5,
    })
    expect(poolSize).toBe(catalog.length)
    expect(candidates.length).toBeLessThanOrEqual(LOGGED_CANDIDATES)
    const first = picks[0]!
    expect(first.noise).toBeCloseTo(0.5 * PARAMS.rec.noise.lc)
    expect(candidates.find((c) => c.ref === `lc:${first.problem.slug}`)?.baseScore).toBeCloseTo(first.baseScore)
  })

  it('stamps a params version', () => {
    expect(PARAMS.version).toMatch(/^v\d+-/)
  })
})

describe('formatReason', () => {
  it('joins the pattern name and reasons', () => {
    expect(formatReason('Sliding Window', ['low mastery', 'not practiced in over a week'])).toBe(
      'Sliding Window: low mastery, not practiced in over a week',
    )
  })
})

import { describe, expect, it } from 'vitest'
import type { LcProblem } from '../content/schema'
import { bestOutcome, lcUrl, parseLeetCodeInput, slugTitle, type LcLogEvent } from './lc'
import { computeSkills } from './skill'

const catalog: LcProblem[] = [
  { slug: 'two-sum', number: 1, difficulty: 'easy', pattern_ids: ['a'] },
  { slug: '3sum', number: 15, difficulty: 'medium', pattern_ids: ['b'] },
]

describe('parseLeetCodeInput', () => {
  it('reads problem URLs, with or without extra path', () => {
    expect(parseLeetCodeInput('https://leetcode.com/problems/two-sum/', catalog)).toMatchObject({
      kind: 'catalog',
      problem: { slug: 'two-sum' },
    })
    expect(parseLeetCodeInput('leetcode.com/problems/3sum/description/?envType=x', catalog)).toMatchObject({
      kind: 'catalog',
      problem: { number: 15 },
    })
  })

  it('reads numbers and the autocomplete form', () => {
    expect(parseLeetCodeInput('15', catalog)).toMatchObject({ problem: { slug: '3sum' } })
    expect(parseLeetCodeInput('#1', catalog)).toMatchObject({ problem: { slug: 'two-sum' } })
    expect(parseLeetCodeInput('15 · 3sum', catalog)).toMatchObject({ problem: { slug: '3sum' } })
  })

  it('reads slugs and typed titles', () => {
    expect(parseLeetCodeInput('3sum', catalog)).toMatchObject({ problem: { slug: '3sum' } })
    expect(parseLeetCodeInput('Two Sum', catalog)).toMatchObject({ problem: { slug: 'two-sum' } })
  })

  it('does not mistake a slug starting with a digit for a number', () => {
    expect(parseLeetCodeInput('1-bit-and-2-bit-characters', catalog)).toEqual({
      kind: 'unknown',
      slug: '1-bit-and-2-bit-characters',
    })
  })

  it('flags problems outside the catalog and bad input', () => {
    expect(parseLeetCodeInput('https://leetcode.com/problems/rare-problem/', catalog)).toEqual({
      kind: 'unknown',
      slug: 'rare-problem',
    })
    expect(parseLeetCodeInput('999', catalog).kind).toBe('invalid')
    expect(parseLeetCodeInput('', catalog).kind).toBe('invalid')
    expect(parseLeetCodeInput('https://example.com/x', catalog).kind).toBe('invalid')
  })
})

describe('helpers', () => {
  it('builds links and titles from slugs', () => {
    expect(lcUrl('two-sum')).toBe('https://leetcode.com/problems/two-sum/')
    expect(slugTitle('two-sum-ii')).toBe('Two Sum Ii')
  })

  it('keeps the best outcome', () => {
    expect(bestOutcome('viewed', 'hints')).toBe('hints')
    expect(bestOutcome('unaided', 'hints')).toBe('unaided')
    expect(bestOutcome('viewed', 'viewed')).toBe('viewed')
  })
})

describe('LeetCode logs in the skill model', () => {
  const log = (slug: string, outcome: LcLogEvent['outcome'], ts: number, difficulty: LcLogEvent['difficulty'] = 'medium'): LcLogEvent => ({
    slug,
    outcome,
    ts,
    difficulty,
    patternIds: ['a'],
  })
  const skillA = (logs: LcLogEvent[]) => computeSkills(['a'], new Map(), [], logs).patterns.get('a')!

  it('moves mastery most for unaided, less for hints, down for viewed', () => {
    const unaided = skillA([log('x', 'unaided', 1)]).mastery
    const hints = skillA([log('x', 'hints', 1)]).mastery
    const viewed = skillA([log('x', 'viewed', 1)]).mastery
    expect(unaided).toBeGreaterThan(hints)
    expect(hints).toBeGreaterThan(50)
    expect(viewed).toBeLessThan(50)
  })

  it('counts each problem once by its best outcome', () => {
    const s = skillA([
      log('x', 'viewed', 1),
      log('x', 'unaided', 2),
      log('y', 'viewed', 3, 'hard'),
      log('z', 'hints', 4, 'easy'),
    ])
    expect(s.lcSolved).toEqual({ easy: 1, medium: 1, hard: 0 })
    expect(s.lcLogged).toBe(3)
    expect(s.lastPracticedAt).toBe(4)
    expect(s.attempts).toBe(0) // drill stats stay separate
  })

  it('ignores patterns that no longer exist', () => {
    const s = computeSkills(['a'], new Map(), [], [{ ...log('x', 'unaided', 1), patternIds: ['gone'] }])
    expect(s.patterns.get('a')!.lcLogged).toBe(0)
  })
})

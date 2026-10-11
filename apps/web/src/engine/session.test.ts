import { describe, expect, it } from 'vitest'
import type { Item } from '../content/schema'
import { isSessionOver, remainingSeconds, summarizeSession, type SessionResponse } from './session'

const mkItem = (id: string, patternId: string, est = 30): Item => ({
  id,
  type: 'pattern',
  difficulty: 'medium',
  est_seconds: est,
  pattern_ids: [patternId],
  prompt: 'p',
  choices: [patternId, 'other'],
  answer: patternId,
  signals: [],
  explanation: 'e',
})

const items = [mkItem('pat-001', 'a', 30), mkItem('pat-002', 'b', 60)]
const itemsById = new Map(items.map((i) => [i.id, i]))

describe('remainingSeconds', () => {
  it('counts down from the budget and stops at zero', () => {
    expect(remainingSeconds(10, 0, 0)).toBe(600)
    expect(remainingSeconds(10, 0, 90_000)).toBe(510)
    expect(remainingSeconds(10, 0, 9_999_999)).toBe(0)
  })

  it('is unlimited without a budget', () => {
    expect(remainingSeconds(null, 0, 9_999_999)).toBe(Infinity)
  })
})

describe('isSessionOver', () => {
  it('ends once even the shortest item no longer fits', () => {
    expect(isSessionOver(items, 45)).toBe(false)
    expect(isSessionOver(items, 29)).toBe(true)
    expect(isSessionOver(items, Infinity)).toBe(false)
  })
})

describe('summarizeSession', () => {
  const r = (itemId: string, correct: boolean, ts: number, sessionId: string, timedOut = false): SessionResponse => ({
    itemId,
    correct,
    ts,
    sessionId,
    latencyMs: 2000,
    timedOut,
  })

  it('reports counts and mastery change for the session only', () => {
    const responses = [
      r('pat-001', false, 1, 'old'),
      r('pat-001', true, 10, 's1'),
      r('pat-001', true, 11, 's1'),
      r('pat-002', false, 12, 's1', true),
    ]
    const s = summarizeSession(['a', 'b'], itemsById, responses, 's1')
    expect(s.answered).toBe(3)
    expect(s.correct).toBe(2)
    expect(s.timedOut).toBe(1)
    expect(s.activeMs).toBe(6000)
    expect(s.patterns.map((p) => p.patternId)).toEqual(['a', 'b'])

    const a = s.patterns[0]!
    expect(a.attempts).toBe(2)
    expect(a.before).toBeLessThan(50) // the old wrong answer
    expect(a.after).toBeGreaterThan(a.before)
    expect(s.patterns[1]!.after).toBeLessThan(s.patterns[1]!.before)
  })

  it('ignores responses from later sessions in the baseline', () => {
    const responses = [r('pat-001', true, 10, 's1'), r('pat-001', false, 20, 's2')]
    const s = summarizeSession(['a', 'b'], itemsById, responses, 's1')
    expect(s.patterns[0]!.before).toBeCloseTo(50)
  })

  it('handles an empty session', () => {
    expect(summarizeSession(['a', 'b'], itemsById, [], 's1')).toMatchObject({ answered: 0, patterns: [] })
  })
})

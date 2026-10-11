import { describe, expect, it } from 'vitest'
import type { Item } from '../content/schema'
import { computeSkills, type ResponseEvent, type SkillState } from './skill'
import { pickNextItem } from './select'

const mkItem = (id: string, patternIds: string[], difficulty: Item['difficulty'] = 'medium'): Item => ({
  id,
  type: 'pattern',
  difficulty,
  est_seconds: 30,
  pattern_ids: patternIds,
  prompt: 'p',
  choices: patternIds,
  answer: patternIds[0]!,
  signals: [],
  explanation: 'e',
})

const items = [mkItem('pat-001', ['a'], 'easy'), mkItem('pat-002', ['a'], 'hard'), mkItem('pat-003', ['b'])]
const itemsById = new Map(items.map((i) => [i.id, i]))
const patternIds = ['a', 'b']
const resp = (itemId: string, correct: boolean, ts: number, latencyMs = 1000): ResponseEvent => ({
  itemId,
  correct,
  ts,
  latencyMs,
})

describe('computeSkills', () => {
  it('returns neutral state with no responses', () => {
    const { patterns } = computeSkills(patternIds, itemsById, [])
    const a = patterns.get('a')!
    expect(a.mastery).toBeCloseTo(50)
    expect(a.attempts).toBe(0)
    expect(a.recentAccuracy).toBeNull()
    expect(a.lastPracticedAt).toBeNull()
  })

  it('counts each solved item once by difficulty', () => {
    const { patterns } = computeSkills(patternIds, itemsById, [
      resp('pat-001', true, 1),
      resp('pat-001', true, 2),
      resp('pat-002', false, 3),
      resp('pat-002', true, 4),
    ])
    const a = patterns.get('a')!
    expect(a.solved).toEqual({ easy: 1, medium: 0, hard: 1 })
    expect(a.attempts).toBe(4)
    expect(a.correct).toBe(3)
    expect(a.lastPracticedAt).toBe(4)
  })

  it('replays in timestamp order regardless of input order', () => {
    const events = [resp('pat-001', true, 1), resp('pat-001', false, 2), resp('pat-002', true, 3)]
    const forward = computeSkills(patternIds, itemsById, events).patterns.get('a')!
    const shuffled = computeSkills(patternIds, itemsById, [events[2]!, events[0]!, events[1]!]).patterns.get('a')!
    expect(shuffled.rating.theta).toBeCloseTo(forward.rating.theta)
  })

  it('separates patterns and ignores unknown items', () => {
    const { patterns } = computeSkills(patternIds, itemsById, [resp('pat-003', true, 1), resp('gone', true, 2)])
    expect(patterns.get('b')!.mastery).toBeGreaterThan(50)
    expect(patterns.get('a')!.attempts).toBe(0)
  })

  it('computes median latency', () => {
    const { patterns } = computeSkills(patternIds, itemsById, [
      resp('pat-001', true, 1, 1000),
      resp('pat-001', true, 2, 3000),
      resp('pat-002', true, 3, 2000),
      resp('pat-002', true, 4, 9000),
    ])
    expect(patterns.get('a')!.medianLatencyMs).toBe(2500)
  })
})

describe('pickNextItem', () => {
  const name = (id: string) => id.toUpperCase()
  const ctx = (skills: SkillState) => ({ skills, patternsById: new Map(), now: 0 })

  it('favours the weaker pattern', () => {
    const skills = computeSkills(patternIds, itemsById, [
      resp('pat-001', true, 1),
      resp('pat-002', true, 2),
      resp('pat-001', true, 3),
    ])
    const pick = pickNextItem(items, ctx(skills), [], name, { random: () => 0 })
    expect(pick?.item.pattern_ids).toEqual(['b'])
    expect(pick?.reason).toBe('B: not practiced yet')
  })

  it('does not repeat a recent item while others exist', () => {
    const skills = computeSkills(patternIds, itemsById, [])
    const pick = pickNextItem([items[0]!, items[2]!], ctx(skills), ['pat-003'], name, { random: () => 0 })
    expect(pick?.item.id).toBe('pat-001')
  })

  it('only picks items that fit the time left', () => {
    const skills = computeSkills(patternIds, itemsById, [])
    const short = { ...items[0]!, id: 'pat-009', est_seconds: 20 }
    const pick = pickNextItem([...items, short], ctx(skills), [], name, { maxSeconds: 25 })
    expect(pick?.item.id).toBe('pat-009')
    expect(pickNextItem(items, ctx(skills), [], name, { maxSeconds: 5 })).toBeNull()
  })

  it('still returns an item when the bank has only one', () => {
    const skills = computeSkills(patternIds, itemsById, [])
    expect(pickNextItem([items[0]!], ctx(skills), ['pat-001'], name)?.item.id).toBe('pat-001')
  })
})

import { describe, expect, it } from 'vitest'
import type { Item, Pattern } from '../../content'
import { computeSkills, type ResponseEvent } from '../../engine/skill'
import { buildCardData } from './cardData'

const pattern = (id: string, layer: Pattern['layer']): Pattern => ({
  id,
  name: id.toUpperCase(),
  layer,
  prerequisites: [],
  summary: 's',
  signals: [],
})
// Deliberately out of layer order.
const patterns = [pattern('dp', 'advanced'), pattern('hash', 'foundations'), pattern('tp', 'core')]

const item = (id: string, pid: string): Item => ({
  id,
  type: 'pattern',
  difficulty: 'medium',
  est_seconds: 30,
  pattern_ids: [pid],
  prompt: 'p',
  choices: [pid, 'x'],
  answer: pid,
  signals: [],
  explanation: 'e',
})
const itemsById = new Map([item('pat-001', 'hash'), item('pat-002', 'tp')].map((i) => [i.id, i]))
const answer = (itemId: string, correct: boolean, ts: number): ResponseEvent => ({ itemId, correct, ts, latencyMs: 1000 })

describe('buildCardData', () => {
  const skills = computeSkills(['dp', 'hash', 'tp'], itemsById, [
    answer('pat-001', true, 1),
    answer('pat-001', true, 2),
    answer('pat-002', false, 3),
    answer('pat-002', false, 4),
  ])
  const data = buildCardData(patterns, skills, 4, new Date('2026-10-11T12:00:00Z'))

  it('orders rows by layer, foundations first', () => {
    expect(data.rows.map((r) => r.name)).toEqual(['HASH', 'TP', 'DP'])
  })

  it('shows a dash for unpracticed patterns and a rounded score otherwise', () => {
    const dp = data.rows.find((r) => r.name === 'DP')!
    expect(dp).toMatchObject({ mastery: null, band: null, tier: 'none' })
    const hash = data.rows.find((r) => r.name === 'HASH')!
    expect(Number.isInteger(hash.mastery)).toBe(true)
    expect(hash.mastery).toBeGreaterThan(50)
    expect(data.rows.find((r) => r.name === 'TP')!.tier).toBe('low')
  })

  it('totals answers, accuracy, LeetCode solves and practiced patterns', () => {
    expect(data).toMatchObject({ answered: 4, accuracy: 50, lcSolved: 4, practiced: 2, date: 'Oct 11, 2026' })
  })

  it('handles a brand-new user', () => {
    const empty = buildCardData(patterns, computeSkills(['dp', 'hash', 'tp'], itemsById, []), 0, new Date())
    expect(empty).toMatchObject({ answered: 0, accuracy: null, practiced: 0 })
    expect(empty.rows.every((r) => r.mastery === null)).toBe(true)
  })
})

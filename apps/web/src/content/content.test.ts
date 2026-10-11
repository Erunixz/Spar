import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { validateContent } from './schema'

const contentDir = resolve(import.meta.dirname, '../../../../content')

function loadRepoContent() {
  const patterns = parse(readFileSync(join(contentDir, 'patterns.yaml'), 'utf8'))
  const itemsDir = join(contentDir, 'items')
  const items = readdirSync(itemsDir)
    .filter((f) => f.endsWith('.yaml'))
    .map((file) => ({ file, data: parse(readFileSync(join(itemsDir, file), 'utf8')) }))
  return { patterns, items }
}

describe('repo content', () => {
  it('passes validation', () => {
    const { patterns, items } = loadRepoContent()
    const content = validateContent(patterns, items)
    expect(content.patterns.length).toBeGreaterThanOrEqual(14)
    expect(content.items.length).toBeGreaterThanOrEqual(20)
  })

  it('covers every pattern with at least one item', () => {
    const { patterns, items } = loadRepoContent()
    const content = validateContent(patterns, items)
    const covered = new Set(content.items.flatMap((i) => i.pattern_ids))
    const missing = content.patterns.filter((p) => !covered.has(p.id)).map((p) => p.id)
    expect(missing).toEqual([])
  })
})

describe('validateContent', () => {
  const patterns = [
    { id: 'a', name: 'A', layer: 'core', prerequisites: [], summary: 's', signals: [] },
    { id: 'b', name: 'B', layer: 'core', prerequisites: ['a'], summary: 's', signals: [] },
  ]
  const item = {
    id: 'pat-001',
    type: 'pattern',
    difficulty: 'easy',
    est_seconds: 30,
    pattern_ids: ['a'],
    prompt: 'p',
    choices: ['a', 'b'],
    answer: 'a',
    explanation: 'e',
  }

  it('accepts a valid item', () => {
    expect(validateContent(patterns, [{ file: 'pat-001.yaml', data: item }]).items).toHaveLength(1)
  })

  it('rejects an answer that is not a choice', () => {
    expect(() =>
      validateContent(patterns, [{ file: 'pat-001.yaml', data: { ...item, answer: 'c', pattern_ids: ['c'] } }]),
    ).toThrow(/not one of the choices/)
  })

  it('rejects a file name that does not match the id', () => {
    expect(() => validateContent(patterns, [{ file: 'pat-002.yaml', data: item }])).toThrow(/does not match/)
  })

  it('rejects unknown prerequisites and unknown fields', () => {
    expect(() =>
      validateContent([{ ...patterns[0], prerequisites: ['zzz'] }], []),
    ).toThrow(/unknown prerequisite/)
    expect(() =>
      validateContent(patterns, [{ file: 'pat-001.yaml', data: { ...item, typo: 1 } }]),
    ).toThrow()
  })
})

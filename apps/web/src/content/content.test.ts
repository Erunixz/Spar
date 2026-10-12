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
  const catalog = parse(readFileSync(join(contentDir, 'lc_catalog.yaml'), 'utf8'))
  return { patterns, items, catalog }
}

describe('repo content', () => {
  it('passes validation', () => {
    const { patterns, items, catalog } = loadRepoContent()
    const content = validateContent(patterns, items, catalog)
    expect(content.patterns.length).toBeGreaterThanOrEqual(14)
    expect(content.items.length).toBeGreaterThanOrEqual(20)
  })

  it('has LeetCode references for every pattern', () => {
    const { patterns, items, catalog } = loadRepoContent()
    const content = validateContent(patterns, items, catalog)
    const covered = new Set(content.lcCatalog.flatMap((p) => p.pattern_ids))
    expect(content.patterns.filter((p) => !covered.has(p.id)).map((p) => p.id)).toEqual([])
  })

  it('has a balanced bank: 120+ items, 6+ pattern and 2+ complexity items per pattern', () => {
    const { patterns, items, catalog } = loadRepoContent()
    const content = validateContent(patterns, items, catalog)
    expect(content.items.length).toBeGreaterThanOrEqual(120)
    const thin = content.patterns
      .map((p) => {
        const mine = content.items.filter((i) => i.pattern_ids.includes(p.id))
        return {
          id: p.id,
          pattern: mine.filter((i) => i.type === 'pattern').length,
          complexity: mine.filter((i) => i.type === 'complexity').length,
        }
      })
      .filter((c) => c.pattern < 6 || c.complexity < 2)
    expect(thin).toEqual([])
  })

  it('has no duplicate prompts and mixes difficulties', () => {
    const { patterns, items, catalog } = loadRepoContent()
    const content = validateContent(patterns, items, catalog)
    const prompts = content.items.map((i) => i.prompt.replace(/\s+/g, ' ').trim().toLowerCase())
    expect(new Set(prompts).size).toBe(prompts.length)
    for (const d of ['easy', 'medium', 'hard'] as const) {
      expect(content.items.filter((i) => i.difficulty === d).length).toBeGreaterThanOrEqual(10)
    }
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

  it('rejects catalog entries with duplicate slugs, problem text or unknown patterns', () => {
    const lc = { slug: 'two-sum', number: 1, difficulty: 'easy', pattern_ids: ['a'] }
    expect(validateContent(patterns, [], [lc]).lcCatalog).toHaveLength(1)
    expect(() => validateContent(patterns, [], [lc, { ...lc, number: 2 }])).toThrow(/duplicate slug/)
    expect(() => validateContent(patterns, [], [{ ...lc, statement: 'copied text' }])).toThrow()
    expect(() => validateContent(patterns, [], [{ ...lc, pattern_ids: ['zzz'] }])).toThrow(/unknown pattern/)
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

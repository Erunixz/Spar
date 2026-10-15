import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TfidfScorer, tokenize, type TfidfModel } from './tfidf'

const here = import.meta.dirname
const readJson = <T>(p: string) => JSON.parse(readFileSync(p, 'utf8')) as T

describe('tokenize', () => {
  const pre: TfidfModel['preprocess'] = {
    lowercase: true,
    strip_accents: 'unicode',
    token_pattern: '(?u)\\b\\w\\w+\\b',
    ngram_range: [1, 2],
    sublinear_tf: true,
    norm: 'l2',
  }

  it('matches scikit-learn: accents stripped, lowercase, 2+ char words, bigrams', () => {
    expect(tokenize('Café A Résumé', pre)).toEqual(['cafe', 'resume', 'cafe resume'])
  })

  it('treats underscores and digits as word characters, punctuation as a break', () => {
    expect(tokenize('two_pointers O(n2) x', pre)).toEqual(['two_pointers', 'n2', 'two_pointers n2'])
  })
})

describe('TfidfScorer vs scikit-learn (toy model fixture)', () => {
  const toy = readJson<TfidfModel & { expected: { text: string; probs: number[] }[] }>(
    resolve(here, '__fixtures__/tfidf-toy.json'),
  )
  const scorer = new TfidfScorer(toy)

  for (const { text, probs } of toy.expected) {
    it(`scores ${JSON.stringify(text.slice(0, 40))} like scikit-learn`, () => {
      const got = scorer.score(text)
      const worst = Math.max(...got.map((p, i) => Math.abs(p - probs[i]!)))
      expect(worst).toBeLessThan(1e-6)
    })
  }
})

// The real 3 MB model lives in ml/artifacts (git-ignored); this runs wherever it has been exported.
const realModel = resolve(here, '../../../../../ml/artifacts/pattern-classifier-v1/tfidf.json')
describe.skipIf(!existsSync(realModel))('TfidfScorer vs scikit-learn (real exported model)', () => {
  it('matches the parity fixture on all of Spar’s own drill prompts', () => {
    const scorer = new TfidfScorer(readJson<TfidfModel>(realModel))
    const parity = readJson<{ cases: { text: string; tfidf: number[] }[] }>(resolve(here, '__fixtures__/parity.json'))
    const worst = Math.max(
      ...parity.cases.flatMap((c) => scorer.score(c.text).map((p, i) => Math.abs(p - c.tfidf[i]!))),
    )
    expect(worst).toBeLessThan(1e-5)
  })
})

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { blend, MODEL_ID, PatternClassifier, rankPatterns } from './classifier'

describe('rankPatterns', () => {
  it('sorts by probability and marks likely ones (threshold, plus always the top)', () => {
    const ranked = rankPatterns(['a', 'b', 'c'], [0.2, 0.6, 0.4], 0.5)
    expect(ranked.map((r) => [r.pattern, r.likely])).toEqual([
      ['b', true],
      ['c', false],
      ['a', false],
    ])
    expect(rankPatterns(['a', 'b'], [0.1, 0.2], 0.5).map((r) => r.likely)).toEqual([true, false])
  })

  it('blends with the configured weight', () => {
    expect(blend([1, 0], [0, 1], 0.4)).toEqual([0.4, 0.6])
  })
})

// The real model lives in ml/artifacts (git-ignored); this runs wherever it has been exported.
const artifacts = resolve(import.meta.dirname, '../../../../../ml/artifacts')
describe.skipIf(!existsSync(resolve(artifacts, MODEL_ID, 'onnx/model_quantized.onnx')))('PatternClassifier (real model, Node)', () => {
  it(
    'reproduces Python ONNX Runtime outputs on Spar’s own drill prompts',
    async () => {
      const classifier = await PatternClassifier.load({
        modelPath: artifacts + '/',
        readJson: async (file) => JSON.parse(readFileSync(resolve(artifacts, file), 'utf8')),
        device: 'cpu',
      })
      const parity = JSON.parse(readFileSync(resolve(import.meta.dirname, '__fixtures__/parity.json'), 'utf8')) as {
        cases: { text: string; student_int8: number[] }[]
      }
      let worst = 0
      for (const c of parity.cases) {
        const got = await classifier.studentProbs(c.text)
        worst = Math.max(worst, ...got.map((p, i) => Math.abs(p - c.student_int8[i]!)))
      }
      expect(worst).toBeLessThan(1e-3)

      // Sanity on self-written prompts: the right pattern is among the likely ones.
      // (Top-1 is ~52% on new problems, so rank 1 isn't guaranteed: here hashing edges out the window.)
      const likely = async (text: string) =>
        (await classifier.classify(text)).ranked.filter((r) => r.likely).map((r) => r.pattern)
      expect(await likely('Find the longest contiguous substring with at most k distinct characters.')).toContain(
        'sliding-window',
      )
      expect(await likely('Given the root of a binary tree, return its maximum depth.')).toContain('trees')
    },
    120_000,
  )
})

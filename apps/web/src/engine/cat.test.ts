import { describe, expect, it } from 'vitest'
import { estimateAll, nextItem, stopReason, type CatItem, type CatResponse } from './cat'
import { eap, grid, icc, information, logLikelihood } from './irt'
import { PARAMS } from './params'

const nodes = grid(-4, 4, 61)

describe('irt', () => {
  it('icc is the Rasch sigmoid at a = 1 and steepens with a', () => {
    expect(icc(0, { a: 1, b: 0 })).toBeCloseTo(0.5)
    expect(icc(1, { a: 1, b: 0 })).toBeCloseTo(1 / (1 + Math.exp(-1)))
    expect(icc(1, { a: 2, b: 0 })).toBeGreaterThan(icc(1, { a: 1, b: 0 }))
  })

  it('information peaks at theta = b with value a^2 / 4', () => {
    expect(information(0.3, { a: 1.5, b: 0.3 })).toBeCloseTo(1.5 ** 2 / 4)
    expect(information(2, { a: 1, b: 0 })).toBeLessThan(information(0, { a: 1, b: 0 }))
  })

  it('log-likelihood rewards abilities that explain the answers', () => {
    const answers = [
      { a: 1, b: -1, correct: true },
      { a: 1, b: 1, correct: false },
    ]
    expect(logLikelihood(0, answers)).toBeGreaterThan(logLikelihood(3, answers))
  })

  it('EAP with no answers returns the prior', () => {
    const e = eap([], { mean: 0.5, sd: 0.8 }, nodes)
    expect(e.theta).toBeCloseTo(0.5, 3)
    expect(e.se).toBeCloseTo(0.8, 2)
  })

  it('EAP moves toward the evidence and shrinks the SE', () => {
    const right = eap([{ a: 1, b: 1, correct: true }], { mean: 0, sd: 1 }, nodes)
    const wrong = eap([{ a: 1, b: 1, correct: false }], { mean: 0, sd: 1 }, nodes)
    expect(right.theta).toBeGreaterThan(0)
    expect(wrong.theta).toBeLessThan(0)
    expect(right.se).toBeLessThan(1)
  })

  it('stays finite on long answer runs (log-space)', () => {
    const many = Array.from({ length: 400 }, () => ({ a: 1, b: 0, correct: true }))
    const e = eap(many, { mean: 0, sd: 1 }, nodes)
    expect(Number.isFinite(e.theta)).toBe(true)
    expect(e.theta).toBeGreaterThan(3)
  })
})

describe('cat', () => {
  const patterns = ['p1', 'p2', 'p3']
  const items: CatItem[] = patterns.flatMap((p) =>
    [-1, 0, 1].map((b, i) => ({ id: `${p}-${i}`, patterns: [p], a: 1, b })),
  )
  const bank = new Map(items.map((i) => [i.id, i]))

  it('shares strength: answers on one pattern move the others through general ability', () => {
    const responses: CatResponse[] = [
      { itemId: 'p1-0', correct: true },
      { itemId: 'p1-1', correct: true },
      { itemId: 'p1-2', correct: true },
    ]
    const e = estimateAll(bank, patterns, responses)
    expect(e.general.theta).toBeGreaterThan(0)
    expect(e.patterns.get('p2')!.theta).toBeCloseTo(e.general.theta, 3) // no own data: sits at the general level (to grid precision)
    expect(e.patterns.get('p1')!.theta).toBeGreaterThan(e.patterns.get('p2')!.theta)
    expect(e.patterns.get('p1')!.se).toBeLessThan(e.patterns.get('p2')!.se)
  })

  it('starts with the first pattern and the most informative item at the prior (b closest to 0)', () => {
    expect(nextItem(items, patterns, [])).toMatchObject({ pattern: 'p1', item: { id: 'p1-1' } })
  })

  it('moves on to the most uncertain pattern; the weak tilt can pull it back to a weak one', () => {
    const after = nextItem(items, patterns, [{ itemId: 'p1-1', correct: true }])
    expect(after?.pattern).not.toBe('p1')
    const history: CatResponse[] = [
      { itemId: 'p1-1', correct: true },
      { itemId: 'p2-1', correct: false },
    ]
    // No tilt: untouched p3 has the largest SE.
    expect(nextItem(items, patterns, history, { ...PARAMS.placement, weakTilt: 0 })?.pattern).toBe('p3')
    // Strong tilt: p2 looks weak, so probe it again.
    expect(nextItem(items, patterns, history, { ...PARAMS.placement, weakTilt: 1 })?.pattern).toBe('p2')
  })

  it('picks harder items after correct answers within a pattern', () => {
    const one = [{ id: 'x-easy', patterns: ['x'], a: 1, b: -1.5 }, { id: 'x-mid', patterns: ['x'], a: 1, b: 0 }, { id: 'x-hard', patterns: ['x'], a: 1, b: 1.5 }]
    const choice = nextItem(one, ['x'], [{ itemId: 'x-mid', correct: true }])
    expect(choice?.item.id).toBe('x-hard')
    const choice2 = nextItem(one, ['x'], [{ itemId: 'x-mid', correct: false }])
    expect(choice2?.item.id).toBe('x-easy')
  })

  it('stops at max items, when precise enough after min items, or when the bank runs out', () => {
    const cfg = { ...PARAMS.placement, maxItems: 4, minItems: 2, seStop: 0.99 }
    const e = estimateAll(bank, patterns, [])
    expect(stopReason([], e, true, cfg)).toBeNull()
    const two: CatResponse[] = [
      { itemId: 'p1-1', correct: true },
      { itemId: 'p2-1', correct: true },
    ]
    expect(stopReason(two, estimateAll(bank, patterns, two, cfg), true, cfg)).toBe('precise')
    const four = [...two, { itemId: 'p3-1', correct: true }, { itemId: 'p1-0', correct: true }]
    expect(stopReason(four, estimateAll(bank, patterns, four), true, { ...cfg, seStop: 0.1 })).toBe('max-items')
    expect(stopReason(two, e, false, cfg)).toBe('bank-exhausted')
  })
})

describe('cat parity with the Python mirror (ml/src/cat.py)', async () => {
  const { readFileSync } = await import('node:fs')
  const { resolve } = await import('node:path')
  const fx = JSON.parse(readFileSync(resolve(import.meta.dirname, '__fixtures__/cat-parity.json'), 'utf8')) as {
    patterns: string[]
    items: CatItem[]
    examinees: {
      steps: { general: [number, number]; patterns: Record<string, [number, number]>; stop: string | null; itemId?: string; pattern?: string; correct?: boolean }[]
    }[]
  }
  const bank2 = new Map(fx.items.map((i) => [i.id, i]))

  fx.examinees.forEach((ex, k) => {
    it(`replays examinee ${k + 1}: same estimates, same item choices, same stop`, () => {
      const responses: CatResponse[] = []
      for (const step of ex.steps) {
        const est = estimateAll(bank2, fx.patterns, responses)
        expect(est.general.theta).toBeCloseTo(step.general[0], 9)
        expect(est.general.se).toBeCloseTo(step.general[1], 9)
        for (const p of fx.patterns) {
          expect(est.patterns.get(p)!.theta).toBeCloseTo(step.patterns[p]![0], 9)
          expect(est.patterns.get(p)!.se).toBeCloseTo(step.patterns[p]![1], 9)
        }
        const choice = nextItem(fx.items, fx.patterns, responses, PARAMS.placement, est)
        expect(stopReason(responses, est, choice !== null)).toBe(step.stop)
        if (step.stop) break
        expect(choice).toMatchObject({ item: { id: step.itemId }, pattern: step.pattern })
        responses.push({ itemId: step.itemId!, correct: step.correct! })
      }
    })
  })
})

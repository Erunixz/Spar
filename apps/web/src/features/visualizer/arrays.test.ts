import { describe, expect, it } from 'vitest'
import type { Frame, HeapObject, Step } from '../../workers/trace'
import { arrayViews, isPointerName, MAX_CELLS } from './arrays'

const step = (locals: Frame['locals'], heap: Record<string, HeapObject> = {}): Step => ({
  event: 'line',
  line: 1,
  stdout: 0,
  stack: [{ fn: 'f', line: 1, locals }],
  heap,
})
const list = (items: (number | string | { ref: number })[]): HeapObject => ({ kind: 'list', type: 'list', items, more: false })
const views = (s: Step, prev: Step | null = null) => arrayViews(s, s.stack[0]!, prev, prev?.stack[0])

describe('isPointerName', () => {
  it('accepts index-style names and rejects value-style ones', () => {
    for (const n of ['i', 'j', 'lo', 'hi', 'mid', 'left', 'right', 'slow', 'fast', 'i2', 'start_idx', 'write']) {
      expect(isPointerName(n), n).toBe(true)
    }
    for (const n of ['target', 'total', 'best', 'count', 'n', 'x', 'value', 'lines']) {
      expect(isPointerName(n), n).toBe(false)
    }
  })
})

describe('arrayViews', () => {
  it('draws a list with the pointers that index into it', () => {
    const s = step({ nums: { ref: 1 }, lo: 0, hi: 4, mid: 2, target: 3 }, { 1: list([1, 3, 5, 7, 9]) })
    const [v] = views(s)
    expect(v!.cells.map((c) => c.text)).toEqual(['1', '3', '5', '7', '9'])
    expect(v!.pointers.map((p) => p.name)).toEqual(['lo', 'hi', 'mid'])
    expect(v!.range).toEqual({ from: 0, to: 4, label: 'lo..hi' })
  })

  it('treats strings as arrays of characters', () => {
    const [v] = views(step({ s: 'abca', left: 1, right: 3 }))
    expect(v).toMatchObject({ kind: 'str', length: 4, range: { from: 1, to: 3 } })
    expect(v!.cells.map((c) => c.text)).toEqual(['a', 'b', 'c', 'a'])
  })

  it('skips single characters and reports refs for lists', () => {
    expect(views(step({ ch: 'b', left: 0 }))).toEqual([])
    const [v] = views(step({ nums: { ref: 7 } }, { 7: list([1, 2]) }))
    expect(v!.ref).toBe(7)
    expect(views(step({ s: 'ab' }))[0]!.ref).toBeNull()
  })

  it('allows -1 and len as pointer positions but drops anything further out', () => {
    const [v] = views(step({ nums: { ref: 1 }, i: -1, j: 3, k: 4 }, { 1: list([1, 2, 3]) }))
    expect(v!.pointers).toEqual([
      { name: 'i', index: -1 },
      { name: 'j', index: 3 },
    ])
  })

  it('shades nothing once the range is empty', () => {
    const [v] = views(step({ nums: { ref: 1 }, lo: 3, hi: 2 }, { 1: list([1, 2, 3]) }))
    expect(v!.range).toBeNull()
  })

  it('flags cells changed in place since the previous step', () => {
    const before = step({ nums: { ref: 1 }, i: 0 }, { 1: list([3, 1, 2]) })
    const after = step({ nums: { ref: 1 }, i: 1 }, { 1: list([1, 3, 2]) })
    expect(views(after, before)[0]!.cells.map((c) => c.changed)).toEqual([true, true, false])
    // A brand-new list bound to the same name is not "changed cells".
    const rebound = step({ nums: { ref: 2 }, i: 1 }, { 2: list([9, 9, 9]) })
    expect(views(rebound, before)[0]!.cells.some((c) => c.changed)).toBe(false)
  })

  it('leaves grids, empty lists and non-sequences to other views', () => {
    const s = step(
      { grid: { ref: 1 }, empty: { ref: 3 }, seen: { ref: 4 }, n: 5 },
      {
        1: list([{ ref: 2 }]),
        2: list([0, 0]),
        3: list([]),
        4: { kind: 'dict', type: 'dict', entries: [], more: false },
      },
    )
    expect(views(s)).toEqual([])
  })

  it('caps very long arrays', () => {
    const long = Array.from({ length: MAX_CELLS + 10 }, (_, i) => i)
    const [v] = views(step({ xs: { ref: 1 } }, { 1: list(long) }))
    expect(v!.cells).toHaveLength(MAX_CELLS)
    expect(v!.more).toBe(true)
    expect(v!.length).toBe(MAX_CELLS + 10)
  })
})

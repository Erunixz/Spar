import { describe, expect, it } from 'vitest'
import type { Frame, HeapObject, Step } from '../../workers/trace'
import { arrayViews } from './arrays'
import { gridViews } from './grids'
import { lineAccesses } from './indexing'

const list = (items: (number | { ref: number })[]): HeapObject => ({ kind: 'list', type: 'list', items, more: false })
const step = (locals: Frame['locals'], heap: Record<string, HeapObject>): Step => ({
  event: 'line',
  line: 7,
  stdout: 0,
  stack: [{ fn: 'lcs', line: 7, locals }],
  heap,
})

// dp = [[0, 0, 0], [0, 1, 1]] as heap 1 with rows 2 and 3
const dpHeap = (row1: number[]) => ({ 1: list([{ ref: 2 }, { ref: 3 }]), 2: list([0, 0, 0]), 3: list(row1) })

describe('gridViews', () => {
  it('draws a list of lists with the target and read cells of the current line', () => {
    const s = step({ dp: { ref: 1 }, i: 1, j: 2 }, dpHeap([0, 1, 0]))
    const acc = lineAccesses('dp[i][j] = max(dp[i - 1][j], dp[i][j - 1])', { i: 1, j: 2 })
    const [g] = gridViews(s, s.stack[0]!, null, undefined, acc)
    expect(g!.rows.map((r) => r.map((c) => c.text))).toEqual([
      ['0', '0', '0'],
      ['0', '1', '0'],
    ])
    expect(g!.rows[1]![2]).toMatchObject({ target: true, read: false })
    expect(g!.rows[0]![2]).toMatchObject({ read: true })
    expect(g!.rows[1]![1]).toMatchObject({ read: true })
    expect(g!.rowPointers).toEqual([{ name: 'i', index: 1 }])
    expect(g!.colPointers).toEqual([{ name: 'j', index: 2 }])
  })

  it('flags the cell written since the previous step', () => {
    const before = step({ dp: { ref: 1 }, i: 1, j: 2 }, dpHeap([0, 1, 0]))
    const after = step({ dp: { ref: 1 }, i: 1, j: 2 }, dpHeap([0, 1, 1]))
    const [g] = gridViews(after, after.stack[0]!, before, before.stack[0], [])
    const changed = g!.rows.flatMap((r, ri) => r.map((c, ci) => (c.changed ? `${ri},${ci}` : null))).filter(Boolean)
    expect(changed).toEqual(['1,2'])
  })

  it('ignores flat lists and lists of objects', () => {
    const s = step({ xs: { ref: 1 }, nodes: { ref: 2 } }, { 1: list([1, 2]), 2: list([{ ref: 3 }]), 3: list([{ ref: 1 }]) })
    expect(gridViews(s, s.stack[0]!, null, undefined, [])).toEqual([])
  })
})

describe('1D read/write markers', () => {
  it('marks the cell a line will write and the cells it reads', () => {
    const s = step({ ways: { ref: 1 }, i: 3 }, { 1: list([1, 1, 2, 0, 0]) })
    const acc = lineAccesses('ways[i] = ways[i - 1] + ways[i - 2]', { i: 3 })
    const [v] = arrayViews(s, s.stack[0]!, null, undefined, acc)
    expect(v!.cells.map((c) => (c.target ? 'W' : c.read ? 'R' : '.')).join('')).toBe('.RRW.')
  })

  it('understands negative indices', () => {
    const s = step({ stack: { ref: 1 } }, { 1: list([4, 5, 6]) })
    const [v] = arrayViews(s, s.stack[0]!, null, undefined, lineAccesses('top = stack[-1]', {}))
    expect(v!.cells.map((c) => c.read)).toEqual([false, false, true])
  })
})

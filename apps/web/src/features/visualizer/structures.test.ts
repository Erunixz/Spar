import { describe, expect, it } from 'vitest'
import type { Frame, HeapObject, Step, Value } from '../../workers/trace'
import { nodeSummary, structureViews } from './structures'

const node = (val: number, next: Value = null): HeapObject => ({ kind: 'object', type: 'ListNode', fields: { val, next } })
const tnode = (val: number, left: Value = null, right: Value = null): HeapObject => ({
  kind: 'object',
  type: 'TreeNode',
  fields: { val, left, right },
})
const r = (ref: number) => ({ ref })
const step = (stack: Frame[], heap: Record<string, HeapObject>): Step => ({ event: 'line', line: 1, stdout: 0, stack, heap })
const frame = (fn: string, locals: Frame['locals']): Frame => ({ fn, line: 1, locals })

describe('linked lists', () => {
  it('draws one chain per head, with middle pointers as labels', () => {
    // head -> 1 -> 2 -> 3, cur points at 2
    const s = step([frame('f', { head: r(1), cur: r(2) })], { 1: node(1, r(2)), 2: node(2, r(3)), 3: node(3) })
    const { lists, trees } = structureViews(s, null)
    expect(trees).toEqual([])
    expect(lists).toHaveLength(1)
    expect(lists[0]!.nodes.map((n) => n.label)).toEqual(['1', '2', '3'])
    expect(lists[0]!.nodes.map((n) => n.pointers.map((p) => p.name))).toEqual([['head'], ['cur'], []])
    expect(lists[0]!.cycleTo).toBeNull()
  })

  it('shows a list being reversed as two chains and flags the rewired link', () => {
    // Before: 1 -> 2 -> 3. After setting 1.next = None: prev=1 alone, head=2 -> 3.
    const before = step([frame('reverse', { head: r(1), prev: null })], { 1: node(1, r(2)), 2: node(2, r(3)), 3: node(3) })
    const after = step([frame('reverse', { head: r(2), prev: r(1) })], { 1: node(1), 2: node(2, r(3)), 3: node(3) })
    const { lists } = structureViews(after, before)
    const chains = lists.map((l) => l.nodes.map((n) => n.label))
    expect(chains).toContainEqual(['1'])
    expect(chains).toContainEqual(['2', '3'])
    const one = lists.flatMap((l) => l.nodes).find((n) => n.label === '1')!
    expect(one.relinked).toBe(true)
    expect(lists.flatMap((l) => l.nodes).find((n) => n.label === '2')!.relinked).toBe(false)
  })

  it('detects cycles', () => {
    // 1 -> 2 -> 3 -> back to 2
    const s = step([frame('f', { head: r(1) })], { 1: node(1, r(2)), 2: node(2, r(3)), 3: node(3, r(2)) })
    const [list] = structureViews(s, null).lists
    expect(list!.nodes.map((n) => n.label)).toEqual(['1', '2', '3'])
    expect(list!.cycleTo).toBe(1)
  })

  it('handles a pure cycle with no head', () => {
    const s = step([frame('f', { a: r(1) })], { 1: node(1, r(2)), 2: node(2, r(1)) })
    const [list] = structureViews(s, null).lists
    expect(list!.nodes).toHaveLength(2)
    expect(list!.cycleTo).toBe(0)
  })

  it('marks nodes that are new since the previous step', () => {
    const before = step([frame('f', { head: r(1) })], { 1: node(1) })
    const after = step([frame('f', { head: r(2) })], { 1: node(1), 2: node(0, r(1)) })
    const nodes = structureViews(after, before).lists[0]!.nodes
    expect(nodes.map((n) => [n.label, n.isNew])).toEqual([
      ['0', true],
      ['1', false],
    ])
  })
})

describe('trees', () => {
  // 3 -> (9, 20 -> (15, 7))
  const heap = { 1: tnode(3, r(2), r(3)), 2: tnode(9), 3: tnode(20, r(4), r(5)), 4: tnode(15), 5: tnode(7) }

  it('lays nodes out by in-order position and depth', () => {
    const { trees, lists } = structureViews(step([frame('<module>', { root: r(1) })], heap), null)
    expect(lists).toEqual([])
    const [t] = trees
    expect(t).toMatchObject({ width: 5, depth: 3 })
    const pos = Object.fromEntries(t!.nodes.map((n) => [n.label, [n.x, n.y]]))
    expect(pos).toEqual({ '9': [0, 1], '3': [1, 0], '15': [2, 2], '20': [3, 1], '7': [4, 2] })
  })

  it('draws a tree once and marks every frame of a recursion on it', () => {
    const s = step(
      [frame('<module>', { root: r(1) }), frame('max_depth', { node: r(1) }), frame('max_depth', { node: r(3) })],
      heap,
    )
    const { trees } = structureViews(s, null)
    expect(trees).toHaveLength(1)
    const by = Object.fromEntries(trees[0]!.nodes.map((n) => [n.label, n.pointers]))
    expect(by['3']!.map((p) => [p.name, p.innermost])).toEqual([
      ['root', false],
      ['node', false],
    ])
    expect(by['20']).toEqual([{ name: 'node', fn: 'max_depth', innermost: true }])
  })

  it('flags an edge that changed since the previous step', () => {
    const before = step([frame('f', { root: r(1) })], { 1: tnode(1, r(2)), 2: tnode(2) })
    const after = step([frame('f', { root: r(1) })], { 1: tnode(1, null, r(2)), 2: tnode(2) })
    const two = structureViews(after, before).trees[0]!.nodes.find((n) => n.label === '2')!
    expect(two.relinked).toBe(true)
  })

  it('ignores ordinary objects', () => {
    const s = step([frame('f', { p: r(1) })], { 1: { kind: 'object', type: 'Point', fields: { x: 1, y: 2 } } })
    expect(structureViews(s, null)).toEqual({ lists: [], trees: [] })
  })
})

describe('nodeSummary', () => {
  it('shortens nodes and leaves other values alone', () => {
    const s = step([], { 1: node(5, r(2)), 2: node(6), 3: { kind: 'list', type: 'list', items: [], more: false } })
    expect(nodeSummary(s, r(1))).toBe('ListNode 5')
    expect(nodeSummary(s, r(3))).toBeNull()
    expect(nodeSummary(s, 7)).toBeNull()
  })
})

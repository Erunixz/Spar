import { deref, formatValue, type Frame, type Step, type Value } from '../../workers/trace'
import { nodeSummary } from './structures'

export const MAX_CALLS = 150

export interface CallNode {
  id: number
  fn: string
  /** e.g. fib(4) */
  label: string
  parent: number | null
  children: number[]
  depth: number
  /** Step index where the call started, and where it returned (null if it never did). */
  start: number
  end: number | null
  retval: string | null
  /**
   * Same function and arguments as an earlier, finished call:
   * 'cached' if it returned without recursing (a memo hit), 'recomputed' if it did the work again.
   */
  repeat: 'cached' | 'recomputed' | null
  /** Layout: leaves get consecutive x; parents sit over their children. */
  x: number
}

export interface CallTree {
  nodes: CallNode[]
  /** Some function called itself (directly or through another call); the tree is worth showing. */
  recursive: boolean
  truncated: boolean
  width: number
  depth: number
}

/** A short argument for a call label: plain values as-is, nodes by their value, other objects elided. */
function argText(step: Step, v: Value): string {
  if (v === null || typeof v !== 'object' || !('ref' in v)) return formatValue(step, v)
  const node = nodeSummary(step, v)
  if (node) return node.split(' ').slice(1).join(' ')
  const obj = deref(step, v)
  return obj?.kind === 'list' || obj?.kind === 'tuple' ? '[…]' : obj?.kind === 'dict' ? '{…}' : '…'
}

/** Containers passed along a recursion (a memo dict, a path list) rather than the problem's inputs. */
function isContainer(step: Step, v: Value): boolean {
  const kind = deref(step, v)?.kind
  return kind === 'dict' || kind === 'list' || kind === 'set'
}

function callLabel(step: Step, frame: Frame): string {
  const params = Object.entries(frame.locals)
  // With several arguments, leave out None (an unset memo=None) and containers
  // (the memo itself), so fib(4, memo) and fib(4) read the same.
  const core = params.filter(([, v]) => v !== null && !isContainer(step, v))
  const shown = params.length > 1 && core.length > 0 ? core : params
  return `${frame.fn}(${shown.map(([, v]) => argText(step, v)).join(', ')})`
}

export function buildCallTree(steps: Step[]): CallTree {
  const nodes: CallNode[] = []
  const active: number[] = []
  let truncated = false

  const push = (step: Step, t: number) => {
    const frame = step.stack[active.length + 1]!
    const parent = active.at(-1) ?? null
    const node: CallNode = {
      id: nodes.length,
      fn: frame.fn,
      label: callLabel(step, frame),
      parent,
      children: [],
      depth: active.length,
      start: t,
      end: null,
      retval: null,
      repeat: null,
      x: 0,
    }
    nodes.push(node)
    if (parent !== null) nodes[parent]!.children.push(node.id)
    active.push(node.id)
  }

  for (let t = 0; t < steps.length; t++) {
    const s = steps[t]!
    const prev = t > 0 ? steps[t - 1]! : null
    // A function that just returned leaves the stack, even if the next call lands at the same depth.
    if (prev?.event === 'return' && prev.stack.length - 1 === active.length && active.length > 0) active.pop()
    const depth = Math.max(0, s.stack.length - 1) // frame 0 is the module
    while (active.length > depth) {
      const id = active.pop()!
      nodes[id]!.end ??= t - 1
    }
    while (active.length < depth) {
      if (nodes.length >= MAX_CALLS) {
        truncated = true
        break
      }
      push(s, t)
    }
    if (truncated) break
    if (s.event === 'return' && depth > 0 && active.length === depth) {
      const node = nodes[active.at(-1)!]!
      node.end = t
      node.retval = formatValue(s, s.retval ?? null)
    }
  }

  // Repeats: same label as a call that had already finished when this one started.
  // Recursing again is 'recomputed'; returning at once is 'cached', but only when
  // the first call did real work. A repeated base case like fib(1) is neither.
  const firstDone = new Map<string, CallNode>()
  for (const n of [...nodes].sort((a, b) => a.start - b.start)) {
    const earlier = firstDone.get(n.label)
    if (earlier && earlier.end !== null && earlier.end < n.start) {
      if (n.children.length > 0) n.repeat = 'recomputed'
      else if (earlier.children.length > 0) n.repeat = 'cached'
    }
    if (n.end !== null && !firstDone.has(n.label)) firstDone.set(n.label, n)
  }

  // Tidy layout: leaves left to right in call order, parents centred over their children.
  let nextX = 0
  const place = (id: number): number => {
    const n = nodes[id]!
    if (n.children.length === 0) return (n.x = nextX++)
    const xs = n.children.map(place)
    return (n.x = (xs[0]! + xs.at(-1)!) / 2)
  }
  for (const n of nodes) if (n.parent === null) place(n.id)

  const byFn = (id: number | null, fn: string): boolean => {
    for (let p = id; p !== null; p = nodes[p]!.parent) if (nodes[p]!.fn === fn) return true
    return false
  }
  const recursive = nodes.some((n) => byFn(n.parent, n.fn))
  const maxDepth = nodes.reduce((m, n) => Math.max(m, n.depth), 0)
  return { nodes, recursive, truncated, width: nextX, depth: maxDepth + 1 }
}

/** Calls that have started by step t, and which of them are on the stack at t. */
export function callsAt(tree: CallTree, t: number): { visible: CallNode[]; onStack: Set<number>; current: number | null } {
  const visible = tree.nodes.filter((n) => n.start <= t)
  const onStack = new Set(visible.filter((n) => n.end === null || n.end >= t).map((n) => n.id))
  const current = [...onStack].reduce<number | null>(
    (best, id) => (best === null || tree.nodes[id]!.depth > tree.nodes[best]!.depth ? id : best),
    null,
  )
  return { visible, onStack, current }
}

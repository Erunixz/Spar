import { formatValue, isRef, type HeapObject, type Step, type Value } from '../../workers/trace'

/**
 * Finds linked lists and binary trees among the objects every frame can see,
 * by shape: an object with a `next` field is a list node, one with `left` /
 * `right` fields is a tree node. Drawn once per step, with each frame's
 * pointers marked on the nodes.
 */

const VALUE_FIELDS = ['val', 'value', 'data', 'key', 'item', 'name']
export const MAX_NODES = 63

type ObjectNode = Extract<HeapObject, { kind: 'object' }>

export interface NodePointer {
  name: string
  /** Name of the function whose frame holds this variable. */
  fn: string
  /** Pointers from the innermost frame are drawn bold; outer frames' faded. */
  innermost: boolean
}

export interface ListNodeView {
  ref: number
  label: string
  pointers: NodePointer[]
  /** The node wasn't there on the previous step. */
  isNew: boolean
  /** Its `next` points somewhere different than on the previous step. */
  relinked: boolean
}

export interface LinkedListView {
  nodes: ListNodeView[]
  /** Index in `nodes` the last node's next loops back to, or null if the list ends in None. */
  cycleTo: number | null
  truncated: boolean
}

export interface TreeNodeView {
  ref: number
  label: string
  pointers: NodePointer[]
  isNew: boolean
  /** In-order position (x) and depth (y), for layout. */
  x: number
  y: number
  parent: number | null
  /** The edge from the parent is new since the previous step. */
  relinked: boolean
}

export interface TreeView {
  nodes: TreeNodeView[]
  width: number
  depth: number
  truncated: boolean
}

export interface StructureViews {
  lists: LinkedListView[]
  trees: TreeView[]
}

function objectAt(step: Step, ref: number): ObjectNode | null {
  const obj = step.heap[String(ref)]
  return obj && obj.kind === 'object' ? obj : null
}

const refOf = (v: Value | undefined): number | null => (v !== undefined && isRef(v) ? v.ref : null)

export function isListNode(obj: ObjectNode): boolean {
  return 'next' in obj.fields && !('left' in obj.fields || 'right' in obj.fields)
}

export function isTreeNode(obj: ObjectNode): boolean {
  return 'left' in obj.fields || 'right' in obj.fields
}

function nodeLabel(step: Step, obj: ObjectNode): string {
  for (const f of VALUE_FIELDS) {
    if (f in obj.fields) return formatValue(step, obj.fields[f]!, 2)
  }
  const prim = Object.values(obj.fields).find((v) => !isRef(v))
  return prim === undefined ? '·' : formatValue(step, prim)
}

/** The ref a node's link field pointed to on the previous step, or undefined if the node is new. */
function previousLink(prev: Step | null, ref: number, field: string): number | null | undefined {
  if (!prev) return undefined
  const old = objectAt(prev, ref)
  if (!old) return undefined
  return refOf(old.fields[field])
}

/** "TreeNode 20" for list/tree nodes (drawn in the Structures panel); null for anything else. */
export function nodeSummary(step: Step, v: Value): string | null {
  const ref = refOf(v)
  if (ref === null) return null
  const obj = objectAt(step, ref)
  if (!obj || !(isListNode(obj) || isTreeNode(obj))) return null
  return `${obj.type} ${nodeLabel(step, obj)}`
}

export function structureViews(step: Step, prev: Step | null): StructureViews {
  // Every frame's variables that point at nodes, innermost frame last.
  const pointersByRef = new Map<number, NodePointer[]>()
  const innermost = step.stack.length - 1
  step.stack.forEach((frame, depth) => {
    for (const [name, v] of Object.entries(frame.locals)) {
      const ref = refOf(v)
      if (ref === null) continue
      const obj = objectAt(step, ref)
      if (!obj || !(isListNode(obj) || isTreeNode(obj))) continue
      const list = pointersByRef.get(ref) ?? []
      list.push({ name, fn: frame.fn, innermost: depth === innermost })
      pointersByRef.set(ref, list)
    }
  })
  const pointersOf = (ref: number) => pointersByRef.get(ref) ?? []
  const isNew = (ref: number) => prev !== null && !objectAt(prev, ref)

  // ---- Linked lists: collect reachable list nodes, then start a chain at each node nothing points to.
  const listNodes = new Set<number>()
  const nextOf = new Map<number, number | null>()
  for (const start of pointersByRef.keys()) {
    let ref: number | null = start
    while (ref !== null && !listNodes.has(ref) && listNodes.size < MAX_NODES * 4) {
      const obj = objectAt(step, ref)
      if (!obj || !isListNode(obj)) break
      listNodes.add(ref)
      const next = refOf(obj.fields.next)
      nextOf.set(ref, next !== null && objectAt(step, next) ? next : null)
      ref = nextOf.get(ref)!
    }
  }
  const pointedAt = new Set([...nextOf.values()].filter((r): r is number => r !== null))
  const heads = [...listNodes].filter((r) => !pointedAt.has(r))
  // A pure cycle has no head: start it at a node some variable points to.
  const covered = new Set<number>()
  const lists: LinkedListView[] = []
  const walk = (head: number) => {
    const order: number[] = []
    const index = new Map<number, number>()
    let ref: number | null = head
    let cycleTo: number | null = null
    let truncated = false
    while (ref !== null) {
      if (index.has(ref)) {
        cycleTo = index.get(ref)!
        break
      }
      if (order.length >= MAX_NODES) {
        truncated = true
        break
      }
      index.set(ref, order.length)
      order.push(ref)
      covered.add(ref)
      ref = nextOf.get(ref) ?? null
    }
    lists.push({
      cycleTo,
      truncated,
      nodes: order.map((r) => {
        const before = previousLink(prev, r, 'next')
        return {
          ref: r,
          label: nodeLabel(step, objectAt(step, r)!),
          pointers: pointersOf(r),
          isNew: isNew(r),
          relinked: before !== undefined && before !== (nextOf.get(r) ?? null),
        }
      }),
    })
  }
  for (const h of heads) walk(h)
  for (const r of pointersByRef.keys()) if (listNodes.has(r) && !covered.has(r)) walk(r)

  // ---- Trees: reachable tree nodes, roots are the ones no node points to.
  const treeNodes = new Set<number>()
  const children = new Map<number, [number | null, number | null]>()
  const stack = [...pointersByRef.keys()]
  while (stack.length && treeNodes.size < MAX_NODES * 4) {
    const ref = stack.pop()!
    if (treeNodes.has(ref)) continue
    const obj = objectAt(step, ref)
    if (!obj || !isTreeNode(obj)) continue
    treeNodes.add(ref)
    const kid = (f: string) => {
      const r = refOf(obj.fields[f])
      return r !== null && objectAt(step, r) ? r : null
    }
    const pair: [number | null, number | null] = [kid('left'), kid('right')]
    children.set(ref, pair)
    for (const c of pair) if (c !== null) stack.push(c)
  }
  const hasParent = new Set([...children.values()].flat().filter((r): r is number => r !== null))
  const roots = [...treeNodes].filter((r) => !hasParent.has(r))

  const trees: TreeView[] = roots.map((root) => {
    const nodes: TreeNodeView[] = []
    const seen = new Set<number>()
    let x = 0
    let maxDepth = 0
    let truncated = false
    // Iterative in-order walk: x = in-order rank, y = depth.
    const work: { ref: number; depth: number; parent: number | null; field: string; visited: boolean }[] = [
      { ref: root, depth: 0, parent: null, field: '', visited: false },
    ]
    while (work.length) {
      const top = work.pop()!
      if (!top.visited) {
        if (seen.has(top.ref)) continue // shared subtree or cycle: draw once
        if (seen.size >= MAX_NODES) {
          truncated = true
          continue
        }
        seen.add(top.ref)
        const [left, right] = children.get(top.ref) ?? [null, null]
        if (right !== null) work.push({ ref: right, depth: top.depth + 1, parent: top.ref, field: 'right', visited: false })
        work.push({ ...top, visited: true })
        if (left !== null) work.push({ ref: left, depth: top.depth + 1, parent: top.ref, field: 'left', visited: false })
        continue
      }
      const before = top.parent === null ? undefined : previousLink(prev, top.parent, top.field)
      nodes.push({
        ref: top.ref,
        label: nodeLabel(step, objectAt(step, top.ref)!),
        pointers: pointersOf(top.ref),
        isNew: isNew(top.ref),
        x: x++,
        y: top.depth,
        parent: top.parent,
        relinked: before !== undefined && before !== top.ref,
      })
      maxDepth = Math.max(maxDepth, top.depth)
    }
    return { nodes, width: x, depth: maxDepth + 1, truncated }
  })

  return { lists, trees }
}

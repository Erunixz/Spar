import { deref, formatValue, isRef, type Frame, type Step, type Value } from '../../workers/trace'

/** Int variables with these names are drawn as arrows over array cells. */
const POINTER_NAME =
  /^(?:i|j|k|l|r|p|q|lo|hi|low|high|mid|left|right|start|end|begin|slow|fast|cur|curr|idx|index|pos|read|write|front|back|ptr)\d*$|_(?:i|j|idx|index|ptr|pos)$/

/** When both names of a pair are pointers into the same array, the range between them is shaded. */
const RANGE_PAIRS: [string, string][] = [
  ['lo', 'hi'],
  ['low', 'high'],
  ['left', 'right'],
  ['l', 'r'],
  ['start', 'end'],
  ['begin', 'end'],
]

export const MAX_CELLS = 60

export interface Cell {
  /** Display text for the cell, e.g. 5, 'a' or [1, 2]. */
  text: string
  changed: boolean
}

export interface Pointer {
  name: string
  /** -1 or len are allowed: "before the start" and "past the end" are common loop states. */
  index: number
}

export interface ArrayView {
  name: string
  /** Heap id for lists and tuples (so a shared list can be drawn once); null for strings. */
  ref: number | null
  kind: 'list' | 'tuple' | 'str'
  cells: Cell[]
  /** True when the array is longer than MAX_CELLS (or the tracer truncated it). */
  more: boolean
  length: number
  pointers: Pointer[]
  /** Inclusive range to shade, from a pair like lo/hi. */
  range: { from: number; to: number; label: string } | null
}

export function isPointerName(name: string): boolean {
  return POINTER_NAME.test(name)
}

/** Items of a value if it's a 1D sequence worth drawing as cells; null otherwise. */
function sequence(step: Step, v: Value): { kind: ArrayView['kind']; items: Value[]; more: boolean } | null {
  if (typeof v === 'string') {
    // Single characters (like a loop's `ch`) aren't worth drawing as arrays.
    if (v.length < 2) return null
    return { kind: 'str', items: [...v], more: false }
  }
  const obj = deref(step, v)
  if (!obj || (obj.kind !== 'list' && obj.kind !== 'tuple')) return null
  if (obj.items.length === 0) return null
  // Lists of lists are grids (a separate view); keep this view 1D.
  if (obj.items.some((x) => deref(step, x)?.kind === 'list')) return null
  return { kind: obj.kind, items: obj.items, more: obj.more }
}

/** Finds the frame's arrays and the int pointers that index into them. */
export function arrayViews(step: Step, frame: Frame, prev: Step | null, prevFrame: Frame | undefined): ArrayView[] {
  const ints = Object.entries(frame.locals).filter(
    (e): e is [string, number] => typeof e[1] === 'number' && Number.isInteger(e[1]) && isPointerName(e[0]),
  )
  const views: ArrayView[] = []
  for (const [name, value] of Object.entries(frame.locals)) {
    const seq = sequence(step, value)
    if (!seq) continue
    const length = seq.items.length
    const shown = seq.items.slice(0, MAX_CELLS)

    // Compare against the same variable one step earlier to flag changed cells.
    const before = prevFrame && prev ? prevFrame.locals[name] : undefined
    const prevSeq = before !== undefined && prev ? sequence(prev, before) : null
    const sameObject = isRef(value) && before !== undefined && isRef(before) && value.ref === before.ref
    const cells = shown.map((item, i): Cell => {
      const text = seq.kind === 'str' ? String(item) : formatValue(step, item)
      const old = prevSeq?.items[i]
      const oldText = old === undefined || !prev ? null : seq.kind === 'str' ? String(old) : formatValue(prev, old)
      // Only call it a change when the same list was mutated in place, or a string/list grew.
      const changed = prev !== null && (sameObject || seq.kind === 'str') && oldText !== null && oldText !== text
      return { text, changed: changed || (prev !== null && sameObject && old === undefined) }
    })

    const pointers = ints.filter(([, i]) => i >= -1 && i <= length).map(([n, index]) => ({ name: n, index }))
    const byName = new Map(pointers.map((p) => [p.name, p.index]))
    let range: ArrayView['range'] = null
    for (const [a, b] of RANGE_PAIRS) {
      const from = byName.get(a)
      const to = byName.get(b)
      if (from === undefined || to === undefined) continue
      // lo > hi means the range is empty (e.g. binary search has finished): shade nothing.
      if (from <= to) range = { from: Math.max(0, from), to: Math.min(length - 1, to), label: `${a}..${b}` }
      break
    }
    views.push({ name, ref: isRef(value) ? value.ref : null, kind: seq.kind, cells, more: seq.more || length > MAX_CELLS, length, pointers, range })
  }
  return views
}

/** Types for the JSON produced by tracer.py. */

/** Inline values: null, booleans, numbers, strings, or special numbers. */
export type Primitive = null | boolean | number | string | { bigint: string } | { float: string }
export type Ref = { ref: number; truncated?: boolean }
export type Value = Primitive | Ref

export type HeapObject =
  | { kind: 'list' | 'tuple' | 'set'; type: string; items: Value[]; more: boolean }
  | { kind: 'dict'; type: string; entries: [Value, Value][]; more: boolean }
  | { kind: 'object'; type: string; fields: Record<string, Value> }
  | { kind: 'function' | 'class' | 'module'; name: string }
  | { kind: 'other'; type: string; repr: string }

export interface Frame {
  fn: string
  line: number
  locals: Record<string, Value>
}

export interface Step {
  event: 'line' | 'return' | 'exception'
  line: number
  /** Outermost frame first. */
  stack: Frame[]
  /** Length of stdout printed before this step. */
  stdout: number
  heap: Record<string, HeapObject | null>
  retval?: Value
  exception?: { type: string; message: string }
}

export interface TraceResult {
  status: 'ok' | 'error' | 'step_limit'
  /** Why a step_limit run stopped: too many steps, or too much data recorded. */
  limit?: 'steps' | 'size' | null
  error: { type: string; message: string; line: number | null } | null
  steps: Step[]
  stdout: string
  maxSteps?: number
}

export function isRef(v: Value): v is Ref {
  return typeof v === 'object' && v !== null && 'ref' in v
}

export function deref(step: Step, v: Value): HeapObject | null {
  return isRef(v) ? (step.heap[String(v.ref)] ?? null) : null
}

/** Messages between the page and the Pyodide worker. */
export type WorkerRequest = { id: number; type: 'warmup' } | { id: number; type: 'run'; source: string; maxSteps: number }
export type WorkerResponse =
  | { id: number; ok: true; result?: TraceResult; pythonVersion?: string }
  | { id: number; ok: false; error: string }

const MAX_DEPTH = 3

/** A compact, Python-style rendering of a value, e.g. [2, 5, 8] or ListNode(val=1, next=#3). */
export function formatValue(step: Step, v: Value, depth = 0, seen: ReadonlySet<number> = new Set()): string {
  if (v === null) return 'None'
  if (v === true) return 'True'
  if (v === false) return 'False'
  if (typeof v === 'number') return String(v)
  if (typeof v === 'string') return `'${v.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
  if ('bigint' in v) return v.bigint
  if ('float' in v) return v.float
  if (v.truncated) return '…'
  const obj = step.heap[String(v.ref)]
  if (!obj) return `#${v.ref}`
  if (obj.kind === 'function') return `<function ${obj.name}>`
  if (obj.kind === 'class') return `<class ${obj.name}>`
  if (obj.kind === 'module') return `<module ${obj.name}>`
  if (obj.kind === 'other') return obj.repr
  // Shared or cyclic structures, and deep nesting, print as #id.
  if (seen.has(v.ref) || depth >= MAX_DEPTH) return `#${v.ref}`
  const inner = new Set(seen).add(v.ref)
  const f = (x: Value) => formatValue(step, x, depth + 1, inner)
  const more = 'more' in obj && obj.more ? ', …' : ''
  switch (obj.kind) {
    case 'list':
      return `[${obj.items.map(f).join(', ')}${more}]`
    case 'tuple':
      return obj.items.length === 1 ? `(${f(obj.items[0]!)},)` : `(${obj.items.map(f).join(', ')}${more})`
    case 'set':
      return obj.items.length ? `{${obj.items.map(f).join(', ')}${more}}` : 'set()'
    case 'dict':
      return `{${obj.entries.map(([k, x]) => `${f(k)}: ${f(x)}`).join(', ')}${more}}`
    case 'object':
      return `${obj.type}(${Object.entries(obj.fields)
        .map(([k, x]) => `${k}=${f(x)}`)
        .join(', ')})`
  }
}

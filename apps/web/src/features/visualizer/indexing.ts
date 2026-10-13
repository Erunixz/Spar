/**
 * Finds the subscripts a line of Python is about to read and write, like
 * dp[i - 1][j] or nums[mid], and evaluates their indices with the frame's int
 * variables. The tracer can't see reads, so this is what lets the grid and
 * array views show "this cell is computed from those cells".
 *
 * Deliberately small: indices may use ints, int variables, + - * // % and
 * parentheses. Anything else (calls, attributes, slices) is skipped.
 */

export interface Access {
  name: string
  /** Evaluated indices, outermost first. May be negative (Python counts from the end). */
  indices: number[]
  write: boolean
}

type Token = { t: 'num'; v: number } | { t: 'id'; v: string } | { t: 'op'; v: string }

function tokenize(src: string): Token[] | null {
  const out: Token[] = []
  const re = /\s*(?:(\d+)|([A-Za-z_]\w*)|(\/\/|[-+*%()]))/y
  let pos = 0
  while (pos < src.length) {
    if (/^\s*$/.test(src.slice(pos))) break
    re.lastIndex = pos
    const m = re.exec(src)
    if (!m) return null
    if (m[1] !== undefined) out.push({ t: 'num', v: Number(m[1]) })
    else if (m[2] !== undefined) out.push({ t: 'id', v: m[2] })
    else out.push({ t: 'op', v: m[3]! })
    pos = re.lastIndex
  }
  return out
}

/** Evaluates an index expression; null if it uses anything unsupported or unknown. */
export function evalIndex(src: string, ints: Readonly<Record<string, number>>): number | null {
  const tokenized = tokenize(src)
  if (!tokenized || tokenized.length === 0) return null
  const tokens: Token[] = tokenized
  let i = 0
  const peek = () => tokens[i]
  const isOp = (v: string) => peek()?.t === 'op' && peek()!.v === v

  const atom = (): number | null => {
    const tok = tokens[i++]
    if (!tok) return null
    if (tok.t === 'num') return tok.v
    if (tok.t === 'id') return Object.hasOwn(ints, tok.v) ? ints[tok.v]! : null
    if (tok.v === '-') {
      const v = atom()
      return v === null ? null : -v
    }
    if (tok.v === '(') {
      const v = sum()
      if (!isOp(')')) return null
      i++
      return v
    }
    return null
  }
  const product = (): number | null => {
    let left = atom()
    while (left !== null && (isOp('*') || isOp('//') || isOp('%'))) {
      const op = tokens[i++]!.v
      const right = atom()
      if (right === null) return null
      if (op === '*') left = left * right
      else if (right === 0) return null
      else if (op === '//') left = Math.floor(left / right)
      else left = ((left % right) + right) % right
    }
    return left
  }
  function sum(): number | null {
    let left = product()
    while (left !== null && (isOp('+') || isOp('-'))) {
      const op = tokens[i++]!.v
      const right = product()
      if (right === null) return null
      left = op === '+' ? left + right : left - right
    }
    return left
  }
  const value = sum()
  return value !== null && i === tokens.length ? value : null
}

/** Position of the first top-level assignment (=, +=, ...), or -1. Ignores ==, <=, >=, !=. */
function assignmentAt(line: string): number {
  let depth = 0
  let quote: string | null = null
  for (let k = 0; k < line.length; k++) {
    const c = line[k]!
    if (quote) {
      if (c === quote) quote = null
      continue
    }
    if (c === '"' || c === "'") quote = c
    else if (c === '#') return -1
    else if ('([{'.includes(c)) depth++
    else if (')]}'.includes(c)) depth--
    else if (c === '=' && depth === 0) {
      const before = line[k - 1] ?? ''
      const after = line[k + 1] ?? ''
      if (after === '=' || '=<>!'.includes(before)) {
        if (after === '=') k++
        continue
      }
      // Augmented assignments (+=, //=, ...) start at their operator.
      let start = k
      while (start > 0 && '+-*/%&|^@<>'.includes(line[start - 1]!)) start--
      return start
    }
  }
  return -1
}

/** Replaces the inside of string literals with spaces, keeping positions, so they're never parsed. */
function blankStrings(line: string): string {
  return line.replace(/(['"])(?:\.|(?!\1).)*\1/g, (m) => m[0] + ' '.repeat(m.length - 2) + m[0])
}

export function lineAccesses(line: string, ints: Readonly<Record<string, number>>): Access[] {
  const code = blankStrings(line).replace(/#.*$/, '')
  const assignAt = assignmentAt(code)
  const accesses: Access[] = []
  // name followed by one or more [ ... ] groups without nested brackets.
  const re = /\b([A-Za-z_]\w*)((?:\s*\[[^[\]]+\])+)/g
  for (const m of code.matchAll(re)) {
    const parts = [...m[2]!.matchAll(/\[([^[\]]+)\]/g)].map((p) => p[1]!)
    if (parts.some((p) => p.includes(':'))) continue // slices aren't single cells
    const indices = parts.map((p) => evalIndex(p, ints))
    if (indices.some((v) => v === null)) continue
    accesses.push({ name: m[1]!, indices: indices as number[], write: assignAt >= 0 && m.index! < assignAt })
  }
  return accesses
}

/** Python-style negative index to a position, or null when out of range. */
export function resolveIndex(index: number, length: number): number | null {
  const i = index < 0 ? length + index : index
  return i >= 0 && i < length ? i : null
}

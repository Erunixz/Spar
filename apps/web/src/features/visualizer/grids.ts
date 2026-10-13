import { deref, formatValue, isRef, type Frame, type Step, type Value } from '../../workers/trace'
import { isPointerName } from './arrays'
import { resolveIndex, type Access } from './indexing'

export const MAX_ROWS = 30
export const MAX_COLS = 30

/** Names that usually index rows vs columns, for the header labels. */
const ROW_NAME = /^(?:i|r|row|y)\d*$/
const COL_NAME = /^(?:j|c|col|x)\d*$/

export interface GridCell {
  text: string
  /** Value differs from the previous step: the cell that was just written. */
  changed: boolean
  /** The current line is about to write this cell. */
  target: boolean
  /** The current line is about to read this cell. */
  read: boolean
}

export interface GridView {
  name: string
  ref: number
  rows: GridCell[][]
  rowCount: number
  colCount: number
  truncated: boolean
  rowPointers: { name: string; index: number }[]
  colPointers: { name: string; index: number }[]
}

/** Rows of a list-of-lists with plain values (a DP table), or null. */
function gridRows(step: Step, v: Value): Value[][] | null {
  const outer = deref(step, v)
  if (!outer || outer.kind !== 'list' || outer.items.length === 0) return null
  const rows: Value[][] = []
  for (const item of outer.items) {
    const row = deref(step, item)
    if (!row || row.kind !== 'list') return null
    if (row.items.some((x) => isRef(x))) return null // nested deeper than 2D
    rows.push(row.items)
  }
  return rows
}

export function gridViews(
  step: Step,
  frame: Frame,
  prev: Step | null,
  prevFrame: Frame | undefined,
  accesses: Access[],
): GridView[] {
  const ints = Object.entries(frame.locals).filter(
    (e): e is [string, number] => typeof e[1] === 'number' && Number.isInteger(e[1]) && isPointerName(e[0]),
  )
  const views: GridView[] = []
  for (const [name, value] of Object.entries(frame.locals)) {
    if (!isRef(value)) continue
    const rows = gridRows(step, value)
    if (!rows) continue
    const before = prevFrame?.locals[name]
    const prevRows = prev && before !== undefined && isRef(before) && before.ref === value.ref ? gridRows(prev, before) : null

    const rowCount = rows.length
    const colCount = Math.max(...rows.map((r) => r.length))
    const mine = accesses.filter((a) => a.name === name && a.indices.length === 2)
    const mark = (r: number, c: number, write: boolean) =>
      mine.some(
        (a) => a.write === write && resolveIndex(a.indices[0]!, rowCount) === r && resolveIndex(a.indices[1]!, rows[r]!.length) === c,
      )

    const shownRows = rows.slice(0, MAX_ROWS).map((row, r) =>
      row.slice(0, MAX_COLS).map((cell, c): GridCell => {
        const text = formatValue(step, cell)
        const old = prevRows?.[r]?.[c]
        const changed = prevRows !== null && prev !== null && old !== undefined && formatValue(prev, old) !== text
        return { text, changed, target: mark(r, c, true), read: mark(r, c, false) }
      }),
    )
    const pointers = (re: RegExp, size: number) =>
      ints.filter(([n, i]) => re.test(n) && i >= 0 && i < size).map(([n, index]) => ({ name: n, index }))
    views.push({
      name,
      ref: value.ref,
      rows: shownRows,
      rowCount,
      colCount,
      truncated: rowCount > MAX_ROWS || colCount > MAX_COLS,
      rowPointers: pointers(ROW_NAME, rowCount),
      colPointers: pointers(COL_NAME, colCount),
    })
  }
  return views
}

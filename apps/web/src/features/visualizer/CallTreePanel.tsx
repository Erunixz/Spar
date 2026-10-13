import { callsAt, type CallNode, type CallTree } from './callTree'

const COL_W = 78
const ROW_H = 58
const BOX_W = 70
const BOX_H = 26
const PAD = 16

function boxClass(n: CallNode, onStack: boolean, current: boolean): string {
  if (current) return 'fill-indigo-600 stroke-indigo-600'
  if (n.repeat === 'cached') return 'fill-emerald-50 stroke-emerald-500 dark:fill-emerald-950'
  if (n.repeat === 'recomputed') return 'fill-rose-50 stroke-rose-500 dark:fill-rose-950'
  if (onStack) return 'fill-indigo-50 stroke-indigo-400 dark:fill-indigo-950'
  return 'fill-white stroke-slate-300 dark:fill-slate-900 dark:stroke-slate-600'
}

/** Every call as a node; grows as you step. Repeats show as cached (memo hit) or recomputed. */
export function CallTreePanel({ tree, stepIndex }: { tree: CallTree; stepIndex: number }) {
  const { visible, onStack, current } = callsAt(tree, stepIndex)
  const pos = (n: CallNode) => ({ cx: PAD + n.x * COL_W + COL_W / 2, top: PAD + n.depth * ROW_H })
  const width = PAD * 2 + Math.max(1, tree.width) * COL_W
  const height = PAD * 2 + (tree.depth - 1) * ROW_H + BOX_H + 16
  const shown = new Set(visible.map((n) => n.id))
  const hasCached = tree.nodes.some((n) => n.repeat === 'cached')
  const hasRecomputed = tree.nodes.some((n) => n.repeat === 'recomputed')

  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        Recursion tree
      </h3>
      <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
        <div className="max-h-80 overflow-auto">
          <svg width={width} height={height} role="img" aria-label="Recursion tree">
            {visible.map((n) => {
              if (n.parent === null || !shown.has(n.parent)) return null
              const a = pos(tree.nodes[n.parent]!)
              const b = pos(n)
              return (
                <line
                  key={`e${n.id}`}
                  x1={a.cx}
                  y1={a.top + BOX_H}
                  x2={b.cx}
                  y2={b.top}
                  strokeWidth={onStack.has(n.id) ? 2 : 1}
                  className={onStack.has(n.id) ? 'stroke-indigo-400' : 'stroke-slate-300 dark:stroke-slate-600'}
                />
              )
            })}
            {visible.map((n) => {
              const { cx, top } = pos(n)
              const isCurrent = n.id === current
              const returned = n.end !== null && n.end <= stepIndex
              return (
                <g key={n.id}>
                  <title>
                    {n.label}
                    {returned ? ` returned ${n.retval}` : ''}
                    {n.repeat === 'cached' ? ' (repeat answered from cache)' : ''}
                    {n.repeat === 'recomputed' ? ' (repeat that recomputed everything)' : ''}
                  </title>
                  <rect
                    x={cx - BOX_W / 2}
                    y={top}
                    width={BOX_W}
                    height={BOX_H}
                    rx={6}
                    strokeWidth={1.5}
                    className={boxClass(n, onStack.has(n.id), isCurrent)}
                  />
                  <text
                    x={cx}
                    y={top + BOX_H / 2}
                    textAnchor="middle"
                    dominantBaseline="central"
                    className={`font-mono text-[11px] ${isCurrent ? 'fill-white' : 'fill-slate-800 dark:fill-slate-100'}`}
                  >
                    {n.label.length > 11 ? `${n.label.slice(0, 10)}…` : n.label}
                  </text>
                  {returned && (
                    <text x={cx} y={top + BOX_H + 11} textAnchor="middle" className="fill-slate-500 font-mono text-[10px]">
                      → {n.retval && n.retval.length > 8 ? `${n.retval.slice(0, 7)}…` : n.retval}
                    </text>
                  )}
                </g>
              )
            })}
          </svg>
        </div>
        <p className="text-[11px] text-slate-400">
          Filled: the running call. Blue outline: calls waiting on it.
          {hasCached && ' Green: a repeat answered from the cache.'}
          {hasRecomputed && ' Red: a repeat that redid all the work (a memo would skip it).'}
          {tree.truncated && ` Showing the first ${tree.nodes.length} calls.`}
        </p>
      </div>
    </section>
  )
}

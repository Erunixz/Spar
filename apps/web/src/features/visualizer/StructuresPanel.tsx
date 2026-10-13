import { pointerColor } from './pointerColor'
import type { LinkedListView, NodePointer, StructureViews, TreeView } from './structures'

function PointerLabels({ pointers }: { pointers: NodePointer[] }) {
  return (
    <>
      {pointers.map((p, i) => (
        <span
          key={`${p.fn}-${p.name}-${i}`}
          title={p.innermost ? `${p.name} in ${p.fn}` : `${p.name} in an outer ${p.fn} frame`}
          className={`font-mono text-[11px] leading-tight ${pointerColor(p.name)} ${p.innermost ? 'font-semibold' : 'opacity-50'}`}
        >
          {p.name}
        </span>
      ))}
    </>
  )
}

function LinkedListViewer({ list }: { list: LinkedListView }) {
  return (
    <div className="overflow-x-auto pb-1">
      <div className="inline-flex items-end gap-0">
        {list.nodes.map((n, i) => {
          const last = i === list.nodes.length - 1
          return (
            <div key={n.ref} className="flex items-end">
              <div className="flex flex-col items-center">
                <div className="flex min-h-4 flex-col items-center justify-end">
                  <PointerLabels pointers={n.pointers} />
                  {n.pointers.length > 0 && <span className="text-[11px] text-slate-400" aria-hidden>↓</span>}
                </div>
                <div
                  title={n.isNew ? 'New node' : undefined}
                  className={`flex h-10 overflow-hidden rounded-md border font-mono text-sm ${
                    n.isNew
                      ? 'border-emerald-500 ring-2 ring-emerald-200 dark:ring-emerald-900'
                      : n.pointers.some((p) => p.innermost)
                        ? 'border-indigo-400 dark:border-indigo-500'
                        : 'border-slate-300 dark:border-slate-700'
                  }`}
                >
                  <span className="flex min-w-10 items-center justify-center bg-white px-2 dark:bg-slate-900">{n.label}</span>
                  <span className="flex w-5 items-center justify-center border-l border-slate-300 bg-slate-50 text-slate-400 dark:border-slate-700 dark:bg-slate-800">
                    •
                  </span>
                </div>
              </div>
              {/* The arrow out of this node; highlighted when it was just rewired. */}
              <div
                className={`flex h-10 items-center px-1 font-mono text-sm ${
                  n.relinked ? 'font-bold text-amber-600 dark:text-amber-400' : 'text-slate-400'
                }`}
                title={n.relinked ? 'This link changed in the last step' : undefined}
              >
                {last && list.cycleTo !== null ? (
                  <span>↩ {list.nodes[list.cycleTo]!.label}</span>
                ) : last ? (
                  <span>
                    → <span className="text-slate-400">{list.truncated ? '…' : 'None'}</span>
                  </span>
                ) : (
                  '→'
                )}
              </div>
            </div>
          )
        })}
      </div>
      {list.cycleTo !== null && (
        <p className="text-xs text-amber-700 dark:text-amber-300">
          Cycle: the last node links back to node {list.cycleTo + 1}.
        </p>
      )}
    </div>
  )
}

const COL_W = 48
const ROW_H = 64
const PAD = 20
const LABEL_SPACE = 26
const R = 17

function TreeViewer({ tree }: { tree: TreeView }) {
  const pos = new Map(
    tree.nodes.map((n) => [n.ref, { cx: PAD + n.x * COL_W + COL_W / 2, cy: PAD + LABEL_SPACE + n.y * ROW_H }]),
  )
  const width = PAD * 2 + tree.width * COL_W
  const height = PAD * 2 + LABEL_SPACE + (tree.depth - 1) * ROW_H + R
  return (
    <div className="overflow-x-auto pb-1">
      <svg width={width} height={height} role="img" aria-label="Binary tree">
        {tree.nodes.map((n) => {
          if (n.parent === null) return null
          const a = pos.get(n.parent)!
          const b = pos.get(n.ref)!
          return (
            <line
              key={`e-${n.ref}`}
              x1={a.cx}
              y1={a.cy}
              x2={b.cx}
              y2={b.cy}
              className={n.relinked ? 'stroke-amber-500' : 'stroke-slate-300 dark:stroke-slate-600'}
              strokeWidth={n.relinked ? 3 : 1.5}
            />
          )
        })}
        {tree.nodes.map((n) => {
          const { cx, cy } = pos.get(n.ref)!
          const active = n.pointers.some((p) => p.innermost)
          const onStack = n.pointers.length > 0
          return (
            <g key={n.ref}>
              <circle
                cx={cx}
                cy={cy}
                r={R}
                strokeWidth={active ? 3 : 1.5}
                className={[
                  'fill-white dark:fill-slate-900',
                  n.isNew
                    ? 'stroke-emerald-500'
                    : active
                      ? 'stroke-indigo-500'
                      : onStack
                        ? 'stroke-indigo-300 dark:stroke-indigo-700'
                        : 'stroke-slate-300 dark:stroke-slate-600',
                ].join(' ')}
              />
              <text
                x={cx}
                y={cy}
                textAnchor="middle"
                dominantBaseline="central"
                className="fill-slate-800 font-mono text-[12px] dark:fill-slate-100"
              >
                {n.label.length > 5 ? `${n.label.slice(0, 4)}…` : n.label}
              </text>
              {n.pointers.length > 0 && (
                <text x={cx} y={cy - R - 6} textAnchor="middle" className="font-mono text-[11px]">
                  {n.pointers.map((p, i) => (
                    <tspan
                      key={i}
                      fill="currentColor"
                      className={`${pointerColor(p.name)} ${p.innermost ? 'font-semibold' : 'opacity-50'}`}
                    >
                      {i > 0 ? ' ' : ''}
                      {p.name}
                    </tspan>
                  ))}
                </text>
              )}
            </g>
          )
        })}
      </svg>
      {tree.truncated && <p className="text-xs text-slate-400">Showing the first {tree.nodes.length} nodes</p>}
    </div>
  )
}

/** Linked lists and trees reachable from any frame, drawn once per step. */
export function StructuresPanel({ views }: { views: StructureViews }) {
  if (views.lists.length === 0 && views.trees.length === 0) return null
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Structures</h3>
      <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
        {views.lists.map((l) => (
          <LinkedListViewer key={`l-${l.nodes[0]?.ref}`} list={l} />
        ))}
        {views.trees.map((t) => (
          <TreeViewer key={`t-${t.nodes[0]?.ref}`} tree={t} />
        ))}
        <p className="text-[11px] text-slate-400">
          Bold labels: the current function&apos;s variables. Faded: the same names in outer calls. Amber: a link that
          just changed.
        </p>
      </div>
    </section>
  )
}

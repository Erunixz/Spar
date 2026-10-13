import { pointerColor } from './pointerColor'
import type { ArrayView } from './arrays'

const CELL_W = 'w-11 min-w-11'

export function ArrayViewer({ view }: { view: ArrayView }) {
  const { cells, pointers, range } = view
  const hasBefore = pointers.some((p) => p.index === -1)
  const hasAfter = pointers.some((p) => p.index === view.length && view.length <= cells.length)
  // Column positions: optional "-1" slot, the cells, optional "len" slot.
  const slots: number[] = [...(hasBefore ? [-1] : []), ...cells.map((_, i) => i), ...(hasAfter ? [view.length] : [])]
  const at = (i: number) => pointers.filter((p) => p.index === i)
  const inRange = (i: number) => range !== null && i >= range.from && i <= range.to

  return (
    <figure className="space-y-1">
      <figcaption className="flex items-baseline gap-2 font-mono text-xs text-slate-500 dark:text-slate-400">
        <span className="font-semibold text-slate-700 dark:text-slate-200">{view.name}</span>
        <span>
          {view.kind === 'str' ? 'str' : view.kind} · len {view.length}
        </span>
        {range && <span className="rounded bg-indigo-100 px-1 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-200">{range.label}</span>}
      </figcaption>
      <div className="overflow-x-auto pb-1">
        <div className="inline-flex flex-col">
          {/* Pointer labels */}
          <div className="flex">
            {slots.map((i) => (
              <div key={i} className={`${CELL_W} flex flex-col items-center justify-end font-mono text-[11px] leading-tight`}>
                {at(i).map((p) => (
                  <span key={p.name} className={`font-semibold ${pointerColor(p.name)}`}>
                    {p.name}
                  </span>
                ))}
                {at(i).length > 0 && <span className="text-slate-400" aria-hidden>↓</span>}
              </div>
            ))}
          </div>
          {/* Cells */}
          <div className="flex">
            {slots.map((i) => {
              const cell = cells[i]
              const pointed = at(i).length > 0
              if (!cell) {
                return (
                  <div
                    key={i}
                    className={`${CELL_W} h-10 rounded border border-dashed border-slate-300 dark:border-slate-700`}
                    title={i < 0 ? 'before the start' : 'past the end'}
                  />
                )
              }
              return (
                <div
                  key={i}
                  title={cell.text}
                  className={[
                    CELL_W,
                    'flex h-10 items-center justify-center overflow-hidden border-y border-r font-mono text-sm',
                    i === 0 ? 'rounded-l border-l' : '',
                    i === cells.length - 1 ? 'rounded-r' : '',
                    pointed ? 'border-indigo-400 dark:border-indigo-500' : 'border-slate-300 dark:border-slate-700',
                    cell.target ? 'outline outline-2 -outline-offset-2 outline-indigo-500' : '',
                    cell.changed
                      ? 'bg-amber-200 dark:bg-amber-800/70'
                      : cell.read
                        ? 'bg-sky-100 dark:bg-sky-900/60'
                        : inRange(i)
                        ? 'bg-indigo-50 dark:bg-indigo-950/60'
                        : 'bg-white dark:bg-slate-900',
                  ].join(' ')}
                >
                  <span className="truncate px-0.5">{cell.text}</span>
                </div>
              )
            })}
          </div>
          {/* Indices */}
          <div className="flex">
            {slots.map((i) => (
              <div key={i} className={`${CELL_W} text-center font-mono text-[10px] text-slate-400`}>
                {i}
              </div>
            ))}
          </div>
        </div>
        {view.more && <p className="text-xs text-slate-400">Showing the first {cells.length} of {view.length}</p>}
      </div>
    </figure>
  )
}

import type { GridView } from './grids'
import { pointerColor } from './pointerColor'

function cellClass(c: { changed: boolean; target: boolean; read: boolean }): string {
  const fill = c.changed
    ? 'bg-amber-200 dark:bg-amber-800/70'
    : c.read
      ? 'bg-sky-100 dark:bg-sky-900/60'
      : 'bg-white dark:bg-slate-900'
  const ring = c.target ? 'outline outline-2 -outline-offset-2 outline-indigo-500' : ''
  return `${fill} ${ring}`
}

/** A DP table: written cell in amber, the cell about to be written outlined, cells it reads in blue. */
export function GridViewer({ view }: { view: GridView }) {
  const cols = view.rows[0]?.length ?? 0
  const colLabel = (c: number) => view.colPointers.filter((p) => p.index === c)
  const rowLabel = (r: number) => view.rowPointers.filter((p) => p.index === r)
  return (
    <figure className="space-y-1">
      <figcaption className="font-mono text-xs text-slate-500 dark:text-slate-400">
        <span className="font-semibold text-slate-700 dark:text-slate-200">{view.name}</span> · {view.rowCount} ×{' '}
        {view.colCount}
      </figcaption>
      <div className="overflow-x-auto pb-1">
        <table className="border-collapse font-mono text-xs">
          <thead>
            <tr>
              <th className="w-10" />
              {Array.from({ length: cols }, (_, c) => (
                <th key={c} className="h-8 w-9 min-w-9 align-bottom font-normal text-slate-400">
                  {colLabel(c).map((p) => (
                    <span key={p.name} className={`block font-semibold ${pointerColor(p.name)}`}>
                      {p.name}
                    </span>
                  ))}
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.rows.map((row, r) => (
              <tr key={r}>
                <th className="whitespace-nowrap pr-1.5 text-right font-normal text-slate-400">
                  {rowLabel(r).map((p) => (
                    <span key={p.name} className={`mr-1 font-semibold ${pointerColor(p.name)}`}>
                      {p.name}
                    </span>
                  ))}
                  {r}
                </th>
                {row.map((cell, c) => (
                  <td
                    key={c}
                    title={cell.text}
                    className={`h-9 w-9 min-w-9 max-w-16 truncate border border-slate-300 px-1 text-center dark:border-slate-700 ${cellClass(cell)}`}
                  >
                    {cell.text}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {view.truncated && <p className="text-xs text-slate-400">Showing up to 30 × 30 cells</p>}
    </figure>
  )
}

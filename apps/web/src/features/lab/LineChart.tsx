import { useState } from 'react'

export interface LineSeries {
  name: string
  /** One value per x position (x = 1, 2, ...). */
  values: number[]
  /** A CSS color, ideally a var(--viz-series-n) token. */
  color: string
}

interface Props {
  series: LineSeries[]
  xLabel: string
  yLabel: string
  /** Format a y value for ticks, labels, the tooltip and the table. */
  format: (v: number) => string
  yMax?: number
  /** A dashed-free reference level (e.g. chance), drawn as a muted hairline with its own label. */
  reference?: { value: number; label: string }
}

const W = 560
const H = 260
const M = { top: 12, right: 92, bottom: 34, left: 48 }

/**
 * Multi-series line chart: 2px lines, end-of-line direct labels plus a legend,
 * a crosshair that snaps to the nearest x with every series in one tooltip,
 * keyboard stepping, and a table view.
 */
export function LineChart({ series, xLabel, yLabel, format, yMax = 1, reference }: Props) {
  const [hoverX, setHoverX] = useState<number | null>(null)
  const [asTable, setAsTable] = useState(false)
  const n = Math.max(...series.map((s) => s.values.length))
  const x = (i: number) => M.left + (i / (n - 1)) * (W - M.left - M.right)
  const y = (v: number) => M.top + (1 - v / yMax) * (H - M.top - M.bottom)
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * yMax)
  const xTicks = Array.from({ length: n }, (_, i) => i).filter((i) => (i + 1) % 5 === 0 || i === 0)

  function onMove(e: React.PointerEvent<SVGRectElement>) {
    const box = e.currentTarget.getBoundingClientRect()
    const frac = (e.clientX - box.left) / box.width
    setHoverX(Math.max(0, Math.min(n - 1, Math.round(frac * (n - 1)))))
  }

  return (
    <figure className="viz-root space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600 dark:text-slate-300">
        <div className="flex flex-wrap items-center gap-4" aria-label="Legend">
          {series.map((s) => (
            <span key={s.name} className="flex items-center gap-1.5">
              <svg width="16" height="8" aria-hidden>
                <line x1="1" x2="15" y1="4" y2="4" stroke={s.color} strokeWidth="2" strokeLinecap="round" />
              </svg>
              {s.name}
            </span>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setAsTable((t) => !t)}
          className="rounded-md border border-slate-300 px-2 py-1 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          {asTable ? 'Show chart' : 'Show as table'}
        </button>
      </div>

      {asTable ? (
        <div className="max-h-80 overflow-auto">
          <table className="w-full text-sm tabular-nums">
            <thead className="sticky top-0 bg-white text-left text-xs text-slate-500 dark:bg-slate-900 dark:text-slate-400">
              <tr>
                <th className="py-1 font-medium">{xLabel}</th>
                {series.map((s) => (
                  <th key={s.name} className="py-1 text-right font-medium">
                    {s.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: n }, (_, i) => (
                <tr key={i} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="py-1">{i + 1}</td>
                  {series.map((s) => (
                    <td key={s.name} className="py-1 text-right">
                      {s.values[i] === undefined ? '' : format(s.values[i]!)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative overflow-x-auto">
          <svg
            width={W}
            height={H}
            role="group"
            aria-label={`${yLabel} by ${xLabel}`}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight') setHoverX((v) => Math.min(n - 1, (v ?? -1) + 1))
              else if (e.key === 'ArrowLeft') setHoverX((v) => Math.max(0, (v ?? n) - 1))
              else return
              e.preventDefault()
            }}
            onBlur={() => setHoverX(null)}
            className="outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
          >
            {/* Recessive hairline grid, y ticks, x ticks */}
            {yTicks.map((t) => (
              <g key={t}>
                <line x1={M.left} x2={W - M.right} y1={y(t)} y2={y(t)} stroke="var(--viz-grid)" strokeWidth={1} />
                <text x={M.left - 8} y={y(t)} textAnchor="end" dominantBaseline="central" fontSize={11} fill="var(--viz-muted)">
                  {format(t)}
                </text>
              </g>
            ))}
            {xTicks.map((i) => (
              <text key={i} x={x(i)} y={H - M.bottom + 16} textAnchor="middle" fontSize={11} fill="var(--viz-muted)">
                {i + 1}
              </text>
            ))}
            <text x={(M.left + W - M.right) / 2} y={H - 4} textAnchor="middle" fontSize={11} fill="var(--viz-muted)">
              {xLabel}
            </text>
            {reference && (
              <g>
                <line x1={M.left} x2={W - M.right} y1={y(reference.value)} y2={y(reference.value)} stroke="var(--viz-connector)" strokeWidth={1} />
                <text x={W - M.right + 6} y={y(reference.value)} dominantBaseline="central" fontSize={11} fill="var(--viz-muted)">
                  {reference.label}
                </text>
              </g>
            )}
            {/* Series lines + end labels (text in ink, identity from the line beside it) */}
            {series.map((s) => (
              <g key={s.name}>
                <polyline
                  points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                <circle cx={x(s.values.length - 1)} cy={y(s.values.at(-1)!)} r={4} fill={s.color} stroke="var(--viz-surface)" strokeWidth={2} />
              </g>
            ))}
            {series.map((s, k) => {
              // Nudge end labels apart if they would collide.
              const ys = series.map((t) => y(t.values.at(-1)!))
              let ly = ys[k]!
              for (let j = 0; j < k; j++) if (Math.abs(ly - ys[j]!) < 13) ly = ys[j]! + (ly >= ys[j]! ? 13 : -13)
              return (
                <text key={s.name} x={W - M.right + 10} y={ly} dominantBaseline="central" fontSize={11} className="fill-slate-700 dark:fill-slate-200">
                  {s.name} {format(s.values.at(-1)!)}
                </text>
              )
            })}
            {/* Crosshair */}
            {hoverX !== null && (
              <g pointerEvents="none">
                <line x1={x(hoverX)} x2={x(hoverX)} y1={M.top} y2={H - M.bottom} stroke="var(--viz-connector)" strokeWidth={1} />
                {series.map((s) =>
                  s.values[hoverX] === undefined ? null : (
                    <circle key={s.name} cx={x(hoverX)} cy={y(s.values[hoverX]!)} r={4} fill={s.color} stroke="var(--viz-surface)" strokeWidth={2} />
                  ),
                )}
              </g>
            )}
            {/* The whole plot area is the hit target; the crosshair finds the x. */}
            <rect
              x={M.left}
              y={M.top}
              width={W - M.left - M.right}
              height={H - M.top - M.bottom}
              fill="transparent"
              onPointerMove={onMove}
              onPointerLeave={() => setHoverX(null)}
            />
          </svg>
          {hoverX !== null && (
            <div
              role="status"
              className="pointer-events-none absolute top-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md dark:border-slate-700 dark:bg-slate-900"
              style={hoverX < n / 2 ? { left: x(hoverX) + 12 } : { left: x(hoverX) - 12, transform: 'translateX(-100%)' }}
            >
              <p className="mb-1 font-medium text-slate-500 dark:text-slate-400">
                {xLabel}: {hoverX + 1}
              </p>
              {series.map((s) => (
                <p key={s.name} className="flex items-center gap-2">
                  <span className="inline-block h-0.5 w-3" style={{ background: s.color }} />
                  <span className="font-semibold tabular-nums">{s.values[hoverX] === undefined ? '–' : format(s.values[hoverX]!)}</span>
                  <span className="text-slate-500">{s.name}</span>
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </figure>
  )
}

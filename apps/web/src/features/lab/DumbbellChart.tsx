import { useState } from 'react'

export interface DumbbellRow {
  label: string
  before: number
  after: number
  /** Test examples behind the scores; rows under minSupport are drawn faded. */
  support: number
}

interface Props {
  rows: DumbbellRow[]
  beforeName: string
  afterName: string
  minSupport: number
}

const ROW_H = 30
const LABEL_W = 170
const PLOT_W = 420
const PAD = { top: 26, right: 56, bottom: 8 }
const TICKS = [0, 0.25, 0.5, 0.75, 1]

/**
 * Before -> after per item on a 0..1 scale: one hue, two shades (validated),
 * legend always shown, each row a hover/focus target with a tooltip, and a
 * table view one click away.
 */
export function DumbbellChart({ rows, beforeName, afterName, minSupport }: Props) {
  const [hover, setHover] = useState<number | null>(null)
  const [asTable, setAsTable] = useState(false)
  const x = (v: number) => LABEL_W + v * PLOT_W
  const width = LABEL_W + PLOT_W + PAD.right
  const height = PAD.top + rows.length * ROW_H + PAD.bottom
  const pct = (v: number) => v.toFixed(2)

  return (
    <figure className="viz-root space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600 dark:text-slate-300">
        <div className="flex items-center gap-4" aria-label="Legend">
          <span className="flex items-center gap-1.5">
            <svg width="10" height="10" aria-hidden>
              <circle cx="5" cy="5" r="4.5" fill="var(--viz-baseline)" />
            </svg>
            {beforeName}
          </span>
          <span className="flex items-center gap-1.5">
            <svg width="10" height="10" aria-hidden>
              <circle cx="5" cy="5" r="4.5" fill="var(--viz-accent)" />
            </svg>
            {afterName}
          </span>
          <span className="text-slate-400">Faded: fewer than {minSupport} test examples</span>
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
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-slate-500 dark:text-slate-400">
            <tr>
              <th className="py-1 font-medium">Pattern</th>
              <th className="py-1 text-right font-medium">{beforeName}</th>
              <th className="py-1 text-right font-medium">{afterName}</th>
              <th className="py-1 text-right font-medium">Change</th>
              <th className="py-1 text-right font-medium">Test examples</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {rows.map((r) => (
              <tr key={r.label} className="border-t border-slate-100 dark:border-slate-800">
                <td className="py-1">{r.label}</td>
                <td className="py-1 text-right">{pct(r.before)}</td>
                <td className="py-1 text-right">{pct(r.after)}</td>
                <td className="py-1 text-right">{(r.after - r.before >= 0 ? '+' : '') + pct(r.after - r.before)}</td>
                <td className="py-1 text-right">{r.support}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="relative overflow-x-auto">
          <svg width={width} height={height} role="group" aria-label={`F1 per pattern: ${beforeName} vs ${afterName}`}>
            {/* Recessive hairline grid + tick labels */}
            {TICKS.map((t) => (
              <g key={t}>
                <line x1={x(t)} x2={x(t)} y1={PAD.top - 6} y2={height - PAD.bottom} stroke="var(--viz-grid)" strokeWidth={1} />
                <text x={x(t)} y={PAD.top - 12} textAnchor="middle" fontSize={11} fill="var(--viz-muted)" className="tabular-nums">
                  {t}
                </text>
              </g>
            ))}
            <g role="list">
            {rows.map((r, i) => {
              const cy = PAD.top + i * ROW_H + ROW_H / 2
              const faded = r.support < minSupport
              const active = hover === i
              return (
                <g
                  key={r.label}
                  opacity={faded ? 0.45 : 1}
                  tabIndex={0}
                  role="listitem"
                  aria-label={`${r.label}: ${afterName} ${pct(r.after)}, ${beforeName} ${pct(r.before)}, ${r.support} test examples`}
                  onPointerEnter={() => setHover(i)}
                  onPointerLeave={() => setHover(null)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                  className="outline-none"
                >
                  {/* The whole row is the hit target, not just the dots. */}
                  <rect x={0} y={cy - ROW_H / 2} width={width} height={ROW_H} fill={active ? 'var(--viz-grid)' : 'transparent'} opacity={0.5} />
                  <text x={LABEL_W - 12} y={cy} textAnchor="end" dominantBaseline="central" fontSize={12} className="fill-slate-700 dark:fill-slate-200">
                    {r.label}
                  </text>
                  <line x1={x(r.before)} x2={x(r.after)} y1={cy} y2={cy} stroke="var(--viz-connector)" strokeWidth={2} strokeLinecap="round" />
                  <circle cx={x(r.before)} cy={cy} r={5} fill="var(--viz-baseline)" stroke="var(--viz-surface)" strokeWidth={2} />
                  <circle cx={x(r.after)} cy={cy} r={5} fill="var(--viz-accent)" stroke="var(--viz-surface)" strokeWidth={2} />
                  <text x={LABEL_W + PLOT_W + 10} y={cy} dominantBaseline="central" fontSize={11} fill="var(--viz-muted)" className="tabular-nums">
                    n={r.support}
                  </text>
                </g>
              )
            })}
            </g>
          </svg>
          {hover !== null && rows[hover] && (
            <div
              role="status"
              className="pointer-events-none absolute rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md dark:border-slate-700 dark:bg-slate-900"
              style={{
                left: x(Math.max(rows[hover]!.before, rows[hover]!.after)) + 16,
                // The scroll container clips vertically: open upward in the lower half.
                ...(hover < rows.length / 2
                  ? { top: PAD.top + hover * ROW_H - 6 }
                  : { bottom: height - (PAD.top + (hover + 1) * ROW_H) - 6 }),
              }}
            >
              <p className="mb-1 font-medium text-slate-500 dark:text-slate-400">{rows[hover]!.label}</p>
              <p className="flex items-center gap-2">
                <span className="inline-block h-0.5 w-3" style={{ background: 'var(--viz-accent)' }} />
                <span className="font-semibold tabular-nums">{pct(rows[hover]!.after)}</span>
                <span className="text-slate-500">{afterName}</span>
              </p>
              <p className="flex items-center gap-2">
                <span className="inline-block h-0.5 w-3" style={{ background: 'var(--viz-baseline)' }} />
                <span className="font-semibold tabular-nums">{pct(rows[hover]!.before)}</span>
                <span className="text-slate-500">{beforeName}</span>
              </p>
              <p className="mt-1 text-slate-500">{rows[hover]!.support} test examples</p>
            </div>
          )}
        </div>
      )}
    </figure>
  )
}

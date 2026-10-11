import { content } from '../../content'
import type { LcLogRow, ResponseRow } from '../../db'
import { summarizeSession } from '../../engine/session'
import { formatClock } from './useNow'

interface Props {
  sessionId: string
  responses: ResponseRow[]
  lcLogs: LcLogRow[]
  onAgain: () => void
  onViewSkills: () => void
}

const patternIds = content.patterns.map((p) => p.id)

export function SessionSummary({ sessionId, responses, lcLogs, onAgain, onViewSkills }: Props) {
  const s = summarizeSession(patternIds, content.itemsById, responses, sessionId, lcLogs)

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h2 className="text-2xl font-bold">Session done</h2>

      {s.answered === 0 ? (
        <p className="text-slate-500 dark:text-slate-400">No answers this time, so nothing changed.</p>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Tile label="Answered" value={s.answered} />
            <Tile label="Accuracy" value={`${Math.round((s.correct / s.answered) * 100)}%`} />
            <Tile label="Time answering" value={formatClock(s.activeMs / 1000)} />
            <Tile label="Timed out" value={s.timedOut} />
          </dl>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-2 font-medium">Pattern</th>
                  <th className="px-4 py-2 font-medium">Right</th>
                  <th className="px-4 py-2 text-right font-medium">Mastery</th>
                </tr>
              </thead>
              <tbody>
                {s.patterns.map((p) => {
                  const delta = Math.round(p.after) - Math.round(p.before)
                  return (
                    <tr key={p.patternId} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="px-4 py-2">{content.patternsById.get(p.patternId)?.name ?? p.patternId}</td>
                      <td className="px-4 py-2 tabular-nums">
                        {p.correct}/{p.attempts}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {Math.round(p.before)} → {Math.round(p.after)}{' '}
                        <span
                          className={
                            delta > 0
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : delta < 0
                                ? 'text-rose-600 dark:text-rose-400'
                                : 'text-slate-400'
                          }
                        >
                          ({delta > 0 ? '+' : ''}
                          {delta})
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onAgain}
          className="rounded-lg bg-indigo-600 px-5 py-2.5 font-semibold text-white hover:bg-indigo-700"
        >
          Start another session
        </button>
        <button
          type="button"
          onClick={onViewSkills}
          className="rounded-lg border border-slate-300 px-5 py-2.5 font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          View skill graph
        </button>
      </div>
    </div>
  )
}

function Tile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 text-center dark:border-slate-800 dark:bg-slate-900">
      <dd className="text-xl font-bold tabular-nums">{value}</dd>
      <dt className="text-xs text-slate-500 dark:text-slate-400">{label}</dt>
    </div>
  )
}

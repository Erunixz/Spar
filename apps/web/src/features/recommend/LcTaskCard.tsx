import { useCallback } from 'react'
import { addLcLog } from '../../db'
import { LC_OUTCOME_LABEL, LC_OUTCOMES, lcUrl, type LcOutcome } from '../../engine/lc'
import type { LcRecommendation } from '../../engine/recommend'
import { LcRecCard } from './LcRecCard'

export interface LcTaskResult {
  outcome: LcOutcome
  minutes: number | null
}

interface Props {
  rec: LcRecommendation
  shownAt: number
  sessionId: string
  /** Called with the logged result, or null when skipped. */
  onDone: (result: LcTaskResult | null) => void
}

/** A LeetCode problem placed inside a session: solve it on leetcode.com, then log how it went. */
export function LcTaskCard({ rec, shownAt, sessionId, onDone }: Props) {
  const log = useCallback(
    async (outcome: LcOutcome) => {
      const elapsed = Math.round((Date.now() - shownAt) / 60_000)
      const minutes = elapsed > 0 ? elapsed : null
      await addLcLog({
        slug: rec.problem.slug,
        outcome,
        patternIds: rec.problem.pattern_ids,
        difficulty: rec.problem.difficulty,
        minutes,
        sessionId,
      })
      onDone({ outcome, minutes })
    },
    [rec, shownAt, sessionId, onDone],
  )

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Time for a real problem. Solve it on LeetCode, then come back and say how it went.
      </p>
      <LcRecCard
        rec={rec}
        action={
          <a
            href={lcUrl(rec.problem.slug)}
            target="_blank"
            rel="noreferrer"
            className="inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            Open on LeetCode ↗
          </a>
        }
      />
      <div className="grid gap-2 sm:grid-cols-3">
        {LC_OUTCOMES.map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => void log(o)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium hover:border-indigo-400 hover:bg-indigo-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
          >
            {LC_OUTCOME_LABEL[o]}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onDone(null)}
        className="text-sm text-slate-500 underline hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
      >
        Skip, back to drills
      </button>
    </div>
  )
}

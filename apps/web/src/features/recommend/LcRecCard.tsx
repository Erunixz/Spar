import { content } from '../../content'
import { lcUrl, slugTitle } from '../../engine/lc'
import { formatReason, type LcRecKind, type LcRecommendation } from '../../engine/recommend'

const KIND_LABEL: Record<LcRecKind, string> = {
  weak: 'Weak spot',
  review: 'Review',
  retry: 'Retry',
  stretch: 'Stretch',
}

const KIND_STYLE: Record<LcRecKind, string> = {
  weak: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200',
  review: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200',
  retry: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
  stretch: 'bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-950 dark:text-fuchsia-200',
}

const patternName = (id: string) => content.patternsById.get(id)?.name ?? id

function recReason(rec: LcRecommendation) {
  return formatReason(patternName(rec.targetPattern), rec.reasons)
}

/** One LeetCode recommendation: link out, why it was picked, optional action. */
export function LcRecCard({ rec, action }: { rec: LcRecommendation; action?: React.ReactNode }) {
  const { problem } = rec
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-2">
        <a
          href={lcUrl(problem.slug)}
          target="_blank"
          rel="noreferrer"
          className="font-semibold leading-tight text-indigo-700 hover:underline dark:text-indigo-300"
        >
          #{problem.number} {slugTitle(problem.slug)} ↗
        </a>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${KIND_STYLE[rec.kind]}`}>
          {KIND_LABEL[rec.kind]}
        </span>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        <span className="capitalize">{problem.difficulty}</span> · ~{rec.minutes} min ·{' '}
        {problem.pattern_ids.map(patternName).join(', ')}
      </p>
      <p className="text-sm">{recReason(rec)}</p>
      {action && <div className="pt-1">{action}</div>}
    </div>
  )
}

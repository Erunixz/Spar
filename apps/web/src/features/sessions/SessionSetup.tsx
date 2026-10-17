import { useMemo, useState } from 'react'
import { content } from '../../content'
import type { LcLogRow } from '../../db'
import { PARAMS } from '../../engine/params'
import { practiceNeed, recommendLeetCode } from '../../engine/recommend'
import { SESSION_LENGTHS, type SessionLength } from '../../engine/session'
import type { SkillState } from '../../engine/skill'
import type { ComfortRating } from '../../engine/survey'
import { LcRecCard } from '../recommend/LcRecCard'

interface Props {
  skills: SkillState
  lcLogs: LcLogRow[]
  selfRatings: Map<string, ComfortRating>
  /** Fixed per page load so recommendations don't reshuffle on every render. */
  now: number
  /** Existing users who have neither taken nor skipped the comfort survey. */
  showSurveyBanner: boolean
  onTakeSurvey: () => void
  onDismissSurvey: () => void
  /** No finished placement and the prompt wasn't dismissed. */
  showPlacementBanner: boolean
  onTakePlacement: () => void
  onDismissPlacement: () => void
  onStart: (minutes: SessionLength, timed: boolean) => void
  onLogProblem: (slug: string) => void
}

export function SessionSetup({
  skills,
  lcLogs,
  selfRatings,
  now,
  showSurveyBanner,
  onTakeSurvey,
  onDismissSurvey,
  showPlacementBanner,
  onTakePlacement,
  onDismissPlacement,
  onStart,
  onLogProblem,
}: Props) {
  const [minutes, setMinutes] = useState<SessionLength>(10)
  const [timed, setTimed] = useState(false)

  // Same ranking the picker uses: weak and uncertain first.
  const focus = [...skills.patterns.values()]
    .sort((a, b) => practiceNeed(b) - practiceNeed(a))
    .slice(0, 3)
    .map((s) => content.patternsById.get(s.patternId)?.name ?? s.patternId)

  const recs = useMemo(
    () =>
      recommendLeetCode(content.lcCatalog, lcLogs, { skills, patternsById: content.patternsById, now, selfRatings }, {
        random: () => 0,
      }),
    [skills, lcLogs, now, selfRatings],
  )

  return (
    <div className="mx-auto max-w-xl space-y-8">
      {showSurveyBanner && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-indigo-200 bg-indigo-50 p-4 dark:border-indigo-900 dark:bg-indigo-950/50">
          <p className="text-sm">
            <span className="font-semibold">New:</span> tell Spar how comfortable you feel with each topic (about a
            minute) so recommendations start in the right place.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onTakeSurvey}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              Take the survey
            </button>
            <button
              type="button"
              onClick={onDismissSurvey}
              className="rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-indigo-100 dark:text-slate-400 dark:hover:bg-indigo-900"
            >
              Not now
            </button>
          </div>
        </div>
      )}

      {!showSurveyBanner && showPlacementBanner && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-indigo-200 bg-indigo-50 p-4 dark:border-indigo-900 dark:bg-indigo-950/50">
          <p className="text-sm">
            <span className="font-semibold">Find your weak spots:</span> a placement test of up to{' '}
            {PARAMS.placement.maxItems} questions ({PARAMS.placement.timeLimitMinutes} minutes at most) sets your
            starting skill levels.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onTakePlacement}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              Take the test
            </button>
            <button
              type="button"
              onClick={onDismissPlacement}
              className="rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-indigo-100 dark:text-slate-400 dark:hover:bg-indigo-900"
            >
              Not now
            </button>
          </div>
        </div>
      )}

      <div>
        <h2 className="text-2xl font-bold">How much time do you have?</h2>
        <p className="mt-1 text-slate-500 dark:text-slate-400">
          Each item is picked for your weakest patterns and to fit the time left.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" role="radiogroup" aria-label="Session length">
        {SESSION_LENGTHS.map((m) => (
          <button
            key={m ?? 'free'}
            type="button"
            role="radio"
            aria-checked={minutes === m}
            onClick={() => setMinutes(m)}
            className={`rounded-xl border px-4 py-5 text-center transition ${
              minutes === m
                ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-500 dark:bg-indigo-950'
                : 'border-slate-200 bg-white hover:border-indigo-300 dark:border-slate-700 dark:bg-slate-900'
            }`}
          >
            <div className="text-2xl font-bold">{m ?? '∞'}</div>
            <div className="text-sm text-slate-500 dark:text-slate-400">{m ? 'minutes' : 'no limit'}</div>
          </button>
        ))}
      </div>

      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <input
          type="checkbox"
          checked={timed}
          onChange={(e) => setTimed(e.target.checked)}
          className="mt-1 size-4 accent-indigo-600"
        />
        <span>
          <span className="font-medium">Timed mode</span>
          <span className="block text-sm text-slate-500 dark:text-slate-400">
            Each item gets a countdown, like an online assessment. Running out counts as a miss.
          </span>
          <span className="mt-1 block text-xs text-slate-400">
            Sessions of {PARAMS.session.lcTaskMinSession}+ minutes include one recommended LeetCode problem.
          </span>
        </span>
      </label>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm text-slate-500 dark:text-slate-400">Focus right now: {focus.join(', ')}</p>
        <button
          type="button"
          onClick={() => onStart(minutes, timed)}
          className="rounded-lg bg-indigo-600 px-6 py-3 font-semibold text-white hover:bg-indigo-700"
        >
          Start session
        </button>
      </div>

      {recs.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Recommended on LeetCode
          </h3>
          <div className="grid gap-3">
            {recs.map((rec) => (
              <LcRecCard
                key={rec.problem.slug}
                rec={rec}
                action={
                  <button
                    type="button"
                    onClick={() => onLogProblem(rec.problem.slug)}
                    className="text-sm font-medium text-slate-600 underline hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                  >
                    Done it? Log the result
                  </button>
                }
              />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

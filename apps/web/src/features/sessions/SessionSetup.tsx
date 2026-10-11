import { useState } from 'react'
import { content } from '../../content'
import { practiceNeed } from '../../engine/select'
import { SESSION_LENGTHS, type SessionLength } from '../../engine/session'
import type { SkillState } from '../../engine/skill'

interface Props {
  skills: SkillState
  onStart: (minutes: SessionLength, timed: boolean) => void
}

export function SessionSetup({ skills, onStart }: Props) {
  const [minutes, setMinutes] = useState<SessionLength>(10)
  const [timed, setTimed] = useState(false)

  // Same ranking the picker uses: weak and uncertain first.
  const focus = [...skills.patterns.values()]
    .sort((a, b) => practiceNeed(b) - practiceNeed(a))
    .slice(0, 3)
    .map((s) => content.patternsById.get(s.patternId)?.name ?? s.patternId)

  return (
    <div className="mx-auto max-w-xl space-y-8">
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
    </div>
  )
}

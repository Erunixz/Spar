import { useCallback, useEffect, useState } from 'react'
import { content, type Item } from '../../content'
import { recordResponse } from '../../db'
import { pickNextItem, type Pick } from '../../engine/select'
import type { SkillState } from '../../engine/skill'
import { Prompt } from './Prompt'

interface Props {
  skills: SkillState
  recentItemIds: string[]
  sessionId: string
}

const patternName = (id: string) => content.patternsById.get(id)?.name ?? id

function choiceLabel(item: Item, choice: string) {
  return item.type === 'pattern' ? patternName(choice) : choice
}

export function DrillScreen({ skills, recentItemIds, sessionId }: Props) {
  const [pick, setPick] = useState<Pick | null>(() =>
    pickNextItem(content.items, skills, recentItemIds, patternName),
  )
  const [shownAt, setShownAt] = useState(() => Date.now())
  const [chosen, setChosen] = useState<string | null>(null)
  const [stats, setStats] = useState({ answered: 0, correct: 0 })

  const answer = useCallback(
    (choice: string) => {
      if (!pick || chosen !== null) return
      const correct = choice === pick.item.answer
      setChosen(choice)
      setStats((s) => ({ answered: s.answered + 1, correct: s.correct + (correct ? 1 : 0) }))
      void recordResponse({
        itemId: pick.item.id,
        choice,
        correct,
        latencyMs: Date.now() - shownAt,
        sessionId,
        ts: Date.now(),
      })
    },
    [pick, chosen, shownAt, sessionId],
  )

  const next = useCallback(() => {
    // recentItemIds may not include the item just answered yet (live query lag).
    const recent = pick ? [...recentItemIds.filter((id) => id !== pick.item.id), pick.item.id] : recentItemIds
    setPick(pickNextItem(content.items, skills, recent, patternName))
    setChosen(null)
    setShownAt(Date.now())
  }, [pick, recentItemIds, skills])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!pick || e.metaKey || e.ctrlKey || e.altKey) return
      if (chosen === null) {
        const idx = Number(e.key) - 1
        const choice = pick.item.choices[idx]
        if (choice !== undefined) answer(choice)
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        next()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pick, chosen, answer, next])

  if (!pick) return <p className="text-slate-500">No items in the bank yet.</p>

  const { item, reason } = pick
  const isCorrect = chosen === item.answer
  const chosenPattern = chosen && item.type === 'pattern' && !isCorrect ? content.patternsById.get(chosen) : null

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-500 dark:text-slate-400">
        <span>
          {item.type === 'pattern' ? 'Which pattern fits?' : 'What is the time complexity?'} ·{' '}
          <span className="capitalize">{item.difficulty}</span> · ~{item.est_seconds}s
        </span>
        <span>
          This session: {stats.correct}/{stats.answered}
        </span>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <Prompt text={item.prompt} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {item.choices.map((choice, i) => {
          const state =
            chosen === null ? 'idle' : choice === item.answer ? 'right' : choice === chosen ? 'wrong' : 'dim'
          return (
            <button
              key={choice}
              type="button"
              onClick={() => answer(choice)}
              disabled={chosen !== null}
              className={[
                'flex items-center gap-3 rounded-lg border px-4 py-3 text-left font-medium transition',
                item.type === 'complexity' ? 'font-mono' : '',
                state === 'idle' &&
                  'border-slate-200 bg-white hover:border-indigo-400 hover:bg-indigo-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800',
                state === 'right' && 'border-emerald-500 bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100',
                state === 'wrong' && 'border-rose-500 bg-rose-50 text-rose-900 dark:bg-rose-950 dark:text-rose-100',
                state === 'dim' && 'border-slate-200 opacity-50 dark:border-slate-800',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <kbd className="rounded border border-current px-1.5 text-xs opacity-60">{i + 1}</kbd>
              {choiceLabel(item, choice)}
            </button>
          )
        })}
      </div>

      {chosen !== null && (
        <div
          className={`space-y-3 rounded-xl border p-5 ${
            isCorrect
              ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40'
              : 'border-rose-300 bg-rose-50 dark:border-rose-800 dark:bg-rose-950/40'
          }`}
        >
          <p className="font-semibold">
            {isCorrect ? 'Correct.' : `Not quite: it's ${choiceLabel(item, item.answer)}.`}
          </p>
          <p className="leading-relaxed">{item.explanation.trim()}</p>
          {chosenPattern && (
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {chosenPattern.name} is for: {chosenPattern.summary}
            </p>
          )}
          {item.signals.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-slate-500 dark:text-slate-400">Signal phrases:</span>
              {item.signals.map((s) => (
                <span key={s} className="rounded-full bg-white px-2.5 py-0.5 shadow-sm dark:bg-slate-800">
                  {s}
                </span>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between pt-1">
            <span className="text-xs text-slate-500 dark:text-slate-400">Picked because {reason}</span>
            <button
              type="button"
              onClick={next}
              autoFocus
              className="rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

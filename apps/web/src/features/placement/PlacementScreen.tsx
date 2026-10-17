import { useCallback, useEffect, useMemo, useState } from 'react'
import { content, type Item } from '../../content'
import { savePlacement, type PlacementAnswer, type PlacementRow } from '../../db'
import { estimateAll, nextItem, stopReason, type CatEstimates, type StopReason } from '../../engine/cat'
import { mastery } from '../../engine/elo'
import { PARAMS } from '../../engine/params'
import { placementBank, weakest } from '../../engine/placement'
import { displayChoices } from '../../engine/select'
import { Prompt } from '../drills/Prompt'
import { formatClock, useNow } from '../sessions/useNow'

interface Props {
  /** Survey thetas, used as the starting point for rated patterns. */
  surveyPriors: Map<string, number>
  onClose: () => void
}

type Result = Omit<PlacementRow, 'id' | 'paramsVersion'>

const cfg = PARAMS.placement
const bank = placementBank(content.items)
const bankById = new Map(bank.map((i) => [i.id, i]))
const patternIds = content.patterns.map((p) => p.id)
const patternName = (id: string) => content.patternsById.get(id)?.name ?? id
const choiceLabel = (item: Item, choice: string) => (item.type === 'pattern' ? patternName(choice) : choice)

interface Question {
  item: Item
  pattern: string
  choices: string[]
  shownAt: number
}

/** Estimates after these answers, and either the next question or why the test is over. */
function step(answers: PlacementAnswer[], priors: Map<string, number>, timeUp: boolean) {
  const responses = answers.map((a) => ({ itemId: a.itemId, correct: a.correct }))
  const estimates = estimateAll(bankById, patternIds, responses, cfg, priors)
  const choice = nextItem(bank, patternIds, responses, cfg, estimates)
  const stop: StopReason | 'time' | null =
    stopReason(responses, estimates, choice !== null, cfg) ?? (timeUp && answers.length > 0 ? 'time' : null)
  return { estimates, choice, stop }
}

function toQuestion(choice: { item: { id: string }; pattern: string }): Question {
  const item = content.itemsById.get(choice.item.id)!
  return { item, pattern: choice.pattern, choices: displayChoices(item), shownAt: Date.now() }
}

export function PlacementScreen({ surveyPriors, onClose }: Props) {
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [answers, setAnswers] = useState<PlacementAnswer[]>([])
  const [question, setQuestion] = useState<Question | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [saveError, setSaveError] = useState(false)
  const now = useNow(1000, startedAt !== null && result === null)
  const limitMs = cfg.timeLimitMinutes * 60_000

  function start() {
    const { choice } = step([], surveyPriors, false)
    if (!choice) return
    setStartedAt(Date.now())
    setQuestion(toQuestion(choice))
  }

  const finish = useCallback(
    (all: PlacementAnswer[], estimates: CatEstimates, stop: Result['stop']) => {
      const row: Result = {
        startedAt: startedAt!,
        endedAt: Date.now(),
        stop,
        answers: all,
        general: estimates.general,
        patterns: Object.fromEntries(estimates.patterns),
        priors: Object.fromEntries(surveyPriors),
      }
      setResult(row)
      setQuestion(null)
      savePlacement(row).catch(() => setSaveError(true))
    },
    [startedAt, surveyPriors],
  )

  const answer = useCallback(
    (choice: string) => {
      if (!question || startedAt === null) return
      const ts = Date.now()
      const all = [
        ...answers,
        {
          itemId: question.item.id,
          choice,
          correct: choice === question.item.answer,
          latencyMs: ts - question.shownAt,
          ts,
          pattern: question.pattern,
        },
      ]
      setAnswers(all)
      const next = step(all, surveyPriors, ts - startedAt >= limitMs)
      if (next.stop || !next.choice) finish(all, next.estimates, next.stop ?? 'bank-exhausted')
      else setQuestion(toQuestion(next.choice))
    },
    [question, startedAt, answers, surveyPriors, limitMs, finish],
  )

  useEffect(() => {
    if (!question) return
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const choice = question!.choices[Number(e.key) - 1]
      if (choice !== undefined) answer(choice)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [question, answer])

  function quit() {
    if (answers.length === 0 || window.confirm('Leave the placement test? Your answers so far won’t be saved.')) onClose()
  }

  if (result) return <Results result={result} saveError={saveError} onClose={onClose} />

  if (startedAt === null || !question) {
    const rated = surveyPriors.size
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="space-y-3">
          <h2 className="text-2xl font-bold">Placement test</h2>
          <p className="text-slate-600 dark:text-slate-300">
            Up to {cfg.maxItems} quick questions across all {patternIds.length} patterns, about{' '}
            {cfg.timeLimitMinutes} minutes at most. Each question is picked from your answers so far, aiming at the
            pattern Spar is least sure about. You&apos;ll see what you missed at the end, not during the test.
          </p>
          <p className="text-slate-600 dark:text-slate-300">
            {rated > 0
              ? `Your comfort survey sets the starting point for ${rated} pattern${rated === 1 ? '' : 's'}; the test checks those claims.`
              : 'No comfort survey yet, so every pattern starts from your overall level.'}{' '}
            The result becomes your skill graph&apos;s starting point; practice keeps refining it.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={start}
            className="rounded-lg bg-indigo-600 px-5 py-2.5 font-semibold text-white hover:bg-indigo-700"
          >
            Start
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2.5 font-medium text-slate-600 hover:bg-slate-200 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            Not now
          </button>
        </div>
      </div>
    )
  }

  const { item } = question
  const left = (limitMs - (now - startedAt)) / 1000
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-100 px-4 py-2 text-sm dark:bg-slate-900">
          <span className="tabular-nums">
            Question {answers.length + 1} of up to {cfg.maxItems} ·{' '}
            {left > 0 ? `${formatClock(left)} left` : 'time’s up: last question'}
          </span>
          <button
            type="button"
            onClick={quit}
            className="rounded-md px-2 py-1 font-medium text-slate-600 hover:bg-white hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
          >
            Quit
          </button>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800" aria-hidden>
          <div className="h-full bg-indigo-500 transition-[width]" style={{ width: `${(answers.length / cfg.maxItems) * 100}%` }} />
        </div>
      </div>

      <p className="text-sm text-slate-500 dark:text-slate-400">
        {item.type === 'pattern' ? 'Which pattern fits?' : 'What is the time complexity?'}
      </p>
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <Prompt text={item.prompt} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {question.choices.map((choice, i) => (
          <button
            key={choice}
            type="button"
            onClick={() => answer(choice)}
            className={`flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-left font-medium transition hover:border-indigo-400 hover:bg-indigo-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800 ${
              item.type === 'complexity' ? 'font-mono' : ''
            }`}
          >
            <kbd className="rounded border border-current px-1.5 text-xs opacity-60">{i + 1}</kbd>
            {choiceLabel(item, choice)}
          </button>
        ))}
      </div>
    </div>
  )
}

const STOP_TEXT: Record<Result['stop'], string> = {
  precise: 'Spar was confident enough about every pattern',
  'max-items': `that’s the ${cfg.maxItems}-question limit`,
  'bank-exhausted': 'there were no questions left to ask',
  time: `that’s the ${cfg.timeLimitMinutes}-minute limit`,
}

function Results({ result, saveError, onClose }: { result: Result; saveError: boolean; onClose: () => void }) {
  const weak = weakest(result.patterns, 3)
  const asked = useMemo(() => {
    const counts = new Map<string, number>()
    for (const a of result.answers)
      for (const pid of content.itemsById.get(a.itemId)?.pattern_ids ?? []) counts.set(pid, (counts.get(pid) ?? 0) + 1)
    return counts
  }, [result])
  const ranked = Object.entries(result.patterns).sort(([, x], [, y]) => x.theta - y.theta)
  const missed = result.answers.filter((a) => !a.correct)
  const correct = result.answers.length - missed.length
  const minutes = Math.max(1, Math.round((result.endedAt - result.startedAt) / 60_000))

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div className="space-y-2">
        <h2 className="text-2xl font-bold">Your placement</h2>
        <p className="text-slate-600 dark:text-slate-300">
          {correct} of {result.answers.length} right in about {minutes} min. The test stopped because{' '}
          {STOP_TEXT[result.stop]}.
        </p>
        {saveError && (
          <p className="text-sm text-rose-600 dark:text-rose-400">
            This result couldn&apos;t be saved on this device, so it won&apos;t affect your skill graph.
          </p>
        )}
      </div>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Start with these
        </h3>
        <ol className="grid gap-3 sm:grid-cols-3">
          {weak.map((pid, i) => (
            <li key={pid} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <p className="text-xs text-slate-500 dark:text-slate-400">#{i + 1} weakest</p>
              <p className="font-semibold">{patternName(pid)}</p>
              <p className="text-sm tabular-nums text-slate-600 dark:text-slate-300">
                {Math.round(mastery(result.patterns[pid]!.theta))} mastery
              </p>
            </li>
          ))}
        </ol>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Every pattern, weakest first
        </h3>
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white text-sm dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
          {ranked.map(([pid, e]) => {
            const n = asked.get(pid) ?? 0
            const lo = Math.round(mastery(e.theta - 1.96 * e.se))
            const hi = Math.round(mastery(e.theta + 1.96 * e.se))
            return (
              <li key={pid} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                <span className="font-medium">{patternName(pid)}</span>
                <span className="tabular-nums text-slate-600 dark:text-slate-300">
                  {Math.round(mastery(e.theta))}{' '}
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    ({lo}–{hi}) · {n === 0 ? 'not asked, from your overall level' : `${n} question${n === 1 ? '' : 's'}`}
                  </span>
                </span>
              </li>
            )
          })}
        </ul>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Mastery is the chance of answering an average question on that pattern; the range is a 95% band. With a
          question or two per pattern the bands are wide: practice narrows them quickly.
        </p>
      </section>

      {missed.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            What you missed ({missed.length})
          </h3>
          {missed.map((a) => {
            const item = content.itemsById.get(a.itemId)
            if (!item) return null
            return (
              <details key={a.itemId} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <summary className="cursor-pointer font-medium">
                  {patternName(a.pattern)}: you picked {choiceLabel(item, a.choice)}, it&apos;s {choiceLabel(item, item.answer)}
                </summary>
                <div className="mt-3 space-y-3">
                  <Prompt text={item.prompt} />
                  <p className="leading-relaxed text-slate-700 dark:text-slate-300">{item.explanation.trim()}</p>
                </div>
              </details>
            )
          })}
        </section>
      )}

      <button
        type="button"
        onClick={onClose}
        className="rounded-lg bg-indigo-600 px-5 py-2.5 font-semibold text-white hover:bg-indigo-700"
      >
        Start practicing
      </button>
    </div>
  )
}

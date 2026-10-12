import { useCallback, useEffect, useRef, useState } from 'react'
import { content, type Item } from '../../content'
import {
  logRecommendation,
  recordResponse,
  setRecommendationOutcome,
  type LcLogRow,
  type SessionRow,
} from '../../db'
import { PARAMS } from '../../engine/params'
import { formatReason, recommendLeetCodeDetailed, type LcRecommendation, type RecContext } from '../../engine/recommend'
import { pickNextItem, type Pick } from '../../engine/select'
import { isSessionOver, remainingSeconds } from '../../engine/session'
import type { SkillState } from '../../engine/skill'
import type { ComfortRating } from '../../engine/survey'
import { LcTaskCard, type LcTaskResult } from '../recommend/LcTaskCard'
import { formatClock, useNow } from '../sessions/useNow'
import { Prompt } from './Prompt'

interface Props {
  skills: SkillState
  recentItemIds: string[]
  lcLogs: LcLogRow[]
  selfRatings: Map<string, ComfortRating>
  session: SessionRow
  /** Answers so far in this session, from the response log. */
  sessionStats: { answered: number; correct: number }
  onEnd: () => void
}

const LC_TASK_MIN_SESSION = PARAMS.session.lcTaskMinSession
const LC_TASK_AFTER_DRILLS = PARAMS.session.lcTaskAfterDrills
const LC_TASK_SLACK_MIN = PARAMS.session.lcTaskSlackMin

const patternName = (id: string) => content.patternsById.get(id)?.name ?? id

function choiceLabel(item: Item, choice: string) {
  return item.type === 'pattern' ? patternName(choice) : choice
}

export function DrillScreen({ skills, recentItemIds, lcLogs, selfRatings, session, sessionStats, onEnd }: Props) {
  const ctxAt = useCallback(
    (time: number): RecContext => ({ skills, patternsById: content.patternsById, now: time, selfRatings }),
    [skills, selfRatings],
  )
  const [pick, setPick] = useState<Pick | null>(() => {
    const time = Date.now()
    return pickNextItem(content.items, ctxAt(time), recentItemIds, patternName, {
      maxSeconds: remainingSeconds(session.minutesPlanned, session.startedAt, time),
    })
  })
  const [shownAt, setShownAt] = useState(() => Date.now())
  const [chosen, setChosen] = useState<string | null>(null)
  const [timedOut, setTimedOut] = useState(false)
  // Counted here too because sessionStats can lag the answer just saved.
  const [answeredHere, setAnsweredHere] = useState(0)
  const [lcTask, setLcTask] = useState<{ rec: LcRecommendation; shownAt: number; recId: Promise<string> } | null>(
    null,
  )
  // Id of the logged recommendation for the drill on screen (Phase 9 data).
  const drillRecId = useRef<Promise<string> | null>(null)
  const loggedPick = useRef<Pick | null>(null)
  // One LeetCode problem per session, even if this screen remounts.
  const [lcOffered, setLcOffered] = useState(() => lcLogs.some((l) => l.sessionId === session.id))
  const now = useNow(250)

  const answer = useCallback(
    (choice: string, outOfTime = false) => {
      if (!pick || chosen !== null) return
      const correct = !outOfTime && choice === pick.item.answer
      const latencyMs = Date.now() - shownAt
      setChosen(choice)
      setTimedOut(outOfTime)
      setAnsweredHere((n) => n + 1)
      void recordResponse({
        itemId: pick.item.id,
        choice,
        correct,
        latencyMs,
        sessionId: session.id,
        ts: Date.now(),
        timedOut: outOfTime,
      })
      void drillRecId.current?.then((id) =>
        setRecommendationOutcome(id, { type: 'drill', correct, latencyMs, timedOut: outOfTime }),
      )
    },
    [pick, chosen, shownAt, session.id],
  )

  const next = useCallback(() => {
    const time = Date.now()
    const remaining = remainingSeconds(session.minutesPlanned, session.startedAt, time)
    const ctx = ctxAt(time)

    const longSession = session.minutesPlanned === null || session.minutesPlanned >= LC_TASK_MIN_SESSION
    const answered = Math.max(sessionStats.answered, answeredHere)
    if (longSession && !lcOffered && answered >= LC_TASK_AFTER_DRILLS) {
      setLcOffered(true)
      const { picks, candidates, poolSize } = recommendLeetCodeDetailed(content.lcCatalog, lcLogs, ctx, {
        count: 1,
        maxMinutes: remaining / 60 - LC_TASK_SLACK_MIN,
      })
      const rec = picks[0]
      if (rec) {
        const recId = logRecommendation({
          sessionId: session.id,
          surface: 'session-lc',
          candidateRef: `lc:${rec.problem.slug}`,
          targetPattern: rec.targetPattern,
          kind: rec.kind,
          reason: formatReason(patternName(rec.targetPattern), rec.reasons),
          features: rec.features,
          baseScore: rec.baseScore,
          noise: rec.noise,
          noiseScale: PARAMS.rec.noise.lc,
          candidates,
          poolSize,
        })
        setLcTask({ rec, shownAt: time, recId })
        return
      }
    }

    if (isSessionOver(content.items, remaining)) return onEnd()
    // recentItemIds may not include the item just answered yet (live query lag).
    const recent = pick ? [...recentItemIds.filter((id) => id !== pick.item.id), pick.item.id] : recentItemIds
    const nextPick = pickNextItem(content.items, ctx, recent, patternName, { maxSeconds: remaining })
    if (!nextPick) return onEnd()
    setLcTask(null)
    setPick(nextPick)
    setChosen(null)
    setTimedOut(false)
    setShownAt(Date.now())
  }, [pick, recentItemIds, lcLogs, lcOffered, sessionStats.answered, answeredHere, session, ctxAt, onEnd])

  // Log each drill pick once, when it is first shown.
  useEffect(() => {
    if (!pick || lcTask || loggedPick.current === pick) return
    loggedPick.current = pick
    const { scored, noise, candidates, poolSize } = pick.decision
    drillRecId.current = logRecommendation({
      sessionId: session.id,
      surface: 'drill',
      candidateRef: `item:${pick.item.id}`,
      targetPattern: scored.targetPattern,
      kind: 'drill',
      reason: pick.reason,
      features: scored.features,
      baseScore: scored.score,
      noise,
      noiseScale: PARAMS.rec.noise.drill,
      candidates,
      poolSize,
    })
  }, [pick, lcTask, session.id])

  const finishLcTask = useCallback(
    (result: LcTaskResult | null) => {
      void lcTask?.recId.then((id) =>
        setRecommendationOutcome(id, result ? { type: 'lc', ...result } : { type: 'skipped' }),
      )
      next()
    },
    [lcTask, next],
  )

  // Timed mode: an unanswered item times out after its est_seconds.
  useEffect(() => {
    if (!session.timed || !pick || chosen !== null || lcTask) return
    const msLeft = pick.item.est_seconds * 1000 - (Date.now() - shownAt)
    const id = setTimeout(() => answer('', true), Math.max(0, msLeft))
    return () => clearTimeout(id)
  }, [session.timed, pick, chosen, shownAt, answer, lcTask])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!pick || lcTask || e.metaKey || e.ctrlKey || e.altKey) return
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
  }, [pick, chosen, answer, next, lcTask])

  const sessionLeft = remainingSeconds(session.minutesPlanned, session.startedAt, now)
  const sessionBar = (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-100 px-4 py-2 text-sm dark:bg-slate-900">
      <span className="tabular-nums">
        {session.minutesPlanned === null
          ? `${formatClock((now - session.startedAt) / 1000)} elapsed`
          : `${formatClock(sessionLeft)} left`}{' '}
        · {sessionStats.correct}/{sessionStats.answered} right
      </span>
      <button
        type="button"
        onClick={onEnd}
        className="rounded-md px-2 py-1 font-medium text-slate-600 hover:bg-white hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
      >
        End session
      </button>
    </div>
  )

  if (lcTask) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        {sessionBar}
        <LcTaskCard rec={lcTask.rec} shownAt={lcTask.shownAt} sessionId={session.id} onDone={finishLcTask} />
      </div>
    )
  }

  if (!pick) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <p className="text-slate-500">No item fits the time left in this session.</p>
        <button type="button" onClick={onEnd} className="rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white">
          See summary
        </button>
      </div>
    )
  }

  const { item, reason } = pick
  const isCorrect = !timedOut && chosen === item.answer
  const chosenPattern = chosen && item.type === 'pattern' && !isCorrect ? content.patternsById.get(chosen) : null
  const itemLeft = item.est_seconds - (now - shownAt) / 1000

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {sessionBar}

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-500 dark:text-slate-400">
        <span>
          {item.type === 'pattern' ? 'Which pattern fits?' : 'What is the time complexity?'} ·{' '}
          <span className="capitalize">{item.difficulty}</span> · ~{item.est_seconds}s
        </span>
        {session.timed && chosen === null && (
          <span className={`font-semibold tabular-nums ${itemLeft <= 10 ? 'text-rose-600 dark:text-rose-400' : ''}`}>
            {formatClock(itemLeft)}
          </span>
        )}
      </div>

      {session.timed && (
        <div className="h-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800" aria-hidden>
          <div
            className={`h-full transition-[width] duration-200 ease-linear ${itemLeft <= 10 ? 'bg-rose-500' : 'bg-indigo-500'}`}
            style={{ width: `${chosen === null ? Math.max(0, (itemLeft / item.est_seconds) * 100) : 0}%` }}
          />
        </div>
      )}

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
            {isCorrect
              ? 'Correct.'
              : timedOut
                ? `Out of time: it's ${choiceLabel(item, item.answer)}.`
                : `Not quite: it's ${choiceLabel(item, item.answer)}.`}
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

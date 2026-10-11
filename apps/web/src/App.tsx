import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { content } from './content'
import { clearAllProgress, db, endSession, startSession, type SessionRow } from './db'
import { bestOutcome, isSolved, type LcOutcome } from './engine/lc'
import type { SessionLength } from './engine/session'
import { computeSkills } from './engine/skill'
import { DrillScreen } from './features/drills/DrillScreen'
import { LcLogScreen } from './features/lclog/LcLogScreen'
import { SessionSetup } from './features/sessions/SessionSetup'
import { SessionSummary } from './features/sessions/SessionSummary'
import { SkillGraph } from './features/skillmap/SkillGraph'

type Tab = 'practice' | 'log' | 'skills'

const patternIds = content.patterns.map((p) => p.id)

export default function App() {
  const [tab, setTab] = useState<Tab>('practice')
  const [active, setActive] = useState<SessionRow | null>(null)
  const [finished, setFinished] = useState<SessionRow | null>(null)
  const responses = useLiveQuery(() => db.responses.orderBy('ts').toArray(), [])
  const lcLogs = useLiveQuery(() => db.lcLogs.orderBy('ts').toArray(), [])
  const loaded = responses !== undefined && lcLogs !== undefined

  // A session left open by a closed tab or reload can't be resumed; close it.
  useEffect(() => {
    void db.sessions.filter((s) => s.endedAt === null).modify({ endedAt: Date.now() })
  }, [])

  const skills = useMemo(
    () => computeSkills(patternIds, content.itemsById, responses ?? [], lcLogs ?? []),
    [responses, lcLogs],
  )
  const lcSolvedTotal = useMemo(() => {
    const best = new Map<string, LcOutcome>()
    for (const l of lcLogs ?? []) best.set(l.slug, best.has(l.slug) ? bestOutcome(best.get(l.slug)!, l.outcome) : l.outcome)
    return [...best.values()].filter(isSolved).length
  }, [lcLogs])
  const recentItemIds = useMemo(() => (responses ?? []).map((r) => r.itemId), [responses])
  const sessionStats = useMemo(() => {
    const mine = (responses ?? []).filter((r) => r.sessionId === active?.id)
    return { answered: mine.length, correct: mine.filter((r) => r.correct).length }
  }, [responses, active])

  async function begin(minutes: SessionLength, timed: boolean) {
    setFinished(null)
    setActive(await startSession(minutes, timed))
  }

  const finish = useCallback(() => {
    if (!active) return
    void endSession(active.id)
    setFinished(active)
    setActive(null)
  }, [active])

  async function resetProgress() {
    if (window.confirm('Delete every saved answer and LeetCode log on this device? This cannot be undone.')) {
      await clearAllProgress()
      setFinished(null)
    }
  }

  let practice
  if (!loaded) practice = <p className="text-slate-500">Loading…</p>
  else if (active)
    practice = (
      <DrillScreen
        key={active.id}
        skills={skills}
        recentItemIds={recentItemIds}
        session={active}
        sessionStats={sessionStats}
        onEnd={finish}
      />
    )
  else if (finished)
    practice = (
      <SessionSummary
        sessionId={finished.id}
        responses={responses}
        lcLogs={lcLogs}
        onAgain={() => setFinished(null)}
        onViewSkills={() => setTab('skills')}
      />
    )
  else practice = <SessionSetup skills={skills} onStart={begin} />

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-900/80">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <h1 className="text-xl font-bold tracking-tight">
            Spar <span className="font-normal text-slate-400">· pattern drills</span>
          </h1>
          <nav className="flex gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
            {(
              [
                ['practice', active ? 'Session ●' : 'Practice'],
                ['log', 'LeetCode log'],
                ['skills', 'Skill graph'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                aria-current={tab === id ? 'page' : undefined}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  tab === id
                    ? 'bg-white shadow-sm dark:bg-slate-950'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                }`}
              >
                {label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        {tab === 'practice' ? (
          practice
        ) : !loaded ? (
          <p className="text-slate-500">Loading…</p>
        ) : tab === 'log' ? (
          <LcLogScreen logs={lcLogs} />
        ) : (
          <SkillGraph skills={skills} lcSolvedTotal={lcSolvedTotal} onReset={resetProgress} />
        )}
      </main>
    </div>
  )
}

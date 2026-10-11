import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { content } from './content'
import { db } from './db'
import { computeSkills } from './engine/skill'
import { DrillScreen } from './features/drills/DrillScreen'
import { SkillGraph } from './features/skillmap/SkillGraph'

type Tab = 'drill' | 'skills'

const patternIds = content.patterns.map((p) => p.id)

export default function App() {
  const [tab, setTab] = useState<Tab>('drill')
  const [sessionId] = useState(() => crypto.randomUUID())
  const responses = useLiveQuery(() => db.responses.orderBy('ts').toArray(), [])

  const skills = useMemo(
    () => computeSkills(patternIds, content.itemsById, responses ?? []),
    [responses],
  )
  const recentItemIds = useMemo(() => (responses ?? []).map((r) => r.itemId), [responses])

  async function resetProgress() {
    if (window.confirm('Delete every saved answer on this device? This cannot be undone.')) {
      await db.responses.clear()
    }
  }

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
                ['drill', 'Drill'],
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
        {responses === undefined ? (
          <p className="text-slate-500">Loading…</p>
        ) : tab === 'drill' ? (
          <DrillScreen skills={skills} recentItemIds={recentItemIds} sessionId={sessionId} />
        ) : (
          <SkillGraph skills={skills} onReset={resetProgress} />
        )}
      </main>
    </div>
  )
}

import { content, LAYERS, type Layer, type Pattern } from '../../content'
import { exportAllData } from '../../db'
import type { PatternSkill, SkillState } from '../../engine/skill'

const LAYER_LABEL: Record<Layer, string> = {
  foundations: 'Foundations',
  core: 'Core patterns',
  structures: 'Data structures',
  advanced: 'Advanced',
}

function tone(skill: PatternSkill) {
  if (skill.attempts === 0 && skill.lcLogged === 0) return { bar: 'bg-slate-400', text: 'text-slate-400' }
  if (skill.mastery < 40) return { bar: 'bg-rose-500', text: 'text-rose-600 dark:text-rose-400' }
  if (skill.mastery < 70) return { bar: 'bg-amber-500', text: 'text-amber-600 dark:text-amber-400' }
  return { bar: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400' }
}

function PatternCard({ pattern, skill }: { pattern: Pattern; skill: PatternSkill }) {
  const t = tone(skill)
  const [lo, hi] = skill.band
  const started = skill.attempts > 0 || skill.lcLogged > 0
  const prereqs = pattern.prerequisites.map((id) => content.patternsById.get(id)?.name ?? id)

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold leading-tight">{pattern.name}</h3>
        <span className={`text-2xl font-bold tabular-nums ${t.text}`}>
          {started ? Math.round(skill.mastery) : '—'}
        </span>
      </div>

      <div
        className="relative h-2 rounded-full bg-slate-100 dark:bg-slate-800"
        role="meter"
        aria-label={`${pattern.name} mastery`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(skill.mastery)}
      >
        {/* 95% band, then the point estimate */}
        <div className={`absolute inset-y-0 rounded-full opacity-25 ${t.bar}`} style={{ left: `${lo}%`, width: `${hi - lo}%` }} />
        <div className={`absolute inset-y-0 left-0 rounded-full ${t.bar}`} style={{ width: `${skill.mastery}%` }} />
      </div>

      <div>
        <p className="mb-1 text-[11px] uppercase tracking-wide text-slate-400">LeetCode solved</p>
        <dl className="grid grid-cols-3 gap-1 text-center text-xs">
          {(['easy', 'medium', 'hard'] as const).map((d) => (
            <div key={d} className="rounded-md bg-slate-50 py-1 dark:bg-slate-800/60">
              <dt className="capitalize text-slate-500 dark:text-slate-400">{d}</dt>
              <dd className="font-semibold tabular-nums">{skill.lcSolved[d]}</dd>
            </div>
          ))}
        </dl>
      </div>

      <p className="text-xs text-slate-500 dark:text-slate-400">
        {skill.attempts > 0
          ? `Drills: ${skill.attempts} answered · ${Math.round((skill.recentAccuracy ?? 0) * 100)}% recent · ${((skill.medianLatencyMs ?? 0) / 1000).toFixed(1)}s median`
          : started
            ? 'No drills yet'
            : 'Not practiced yet'}
      </p>
      {prereqs.length > 0 && <p className="text-xs text-slate-400 dark:text-slate-500">Builds on {prereqs.join(', ')}</p>}
    </div>
  )
}

interface Props {
  skills: SkillState
  /** Distinct LeetCode problems solved; summed per pattern would double-count multi-tag problems. */
  lcSolvedTotal: number
  onReset: () => void
}

export function SkillGraph({ skills, lcSolvedTotal, onReset }: Props) {
  const all = [...skills.patterns.values()]
  const attempts = all.reduce((n, s) => n + s.attempts, 0)
  const correct = all.reduce((n, s) => n + s.correct, 0)
  const solved = all.reduce((n, s) => n + s.solved.easy + s.solved.medium + s.solved.hard, 0)

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Skill graph</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Mastery is your estimated chance of getting an average item right; the shaded band is the 95% range.
          </p>
        </div>
        <div className="flex gap-6 text-sm">
          <Stat label="Answered" value={attempts} />
          <Stat label="Accuracy" value={attempts ? `${Math.round((correct / attempts) * 100)}%` : '—'} />
          <Stat label="Drill items solved" value={`${solved}/${content.items.length}`} />
          <Stat label="LeetCode solved" value={lcSolvedTotal} />
        </div>
      </div>

      {LAYERS.map((layer) => {
        const patterns = content.patterns.filter((p) => p.layer === layer)
        if (patterns.length === 0) return null
        return (
          <section key={layer} className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {LAYER_LABEL[layer]}
            </h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {patterns.map((p) => (
                <PatternCard key={p.id} pattern={p} skill={skills.patterns.get(p.id)!} />
              ))}
            </div>
          </section>
        )
      })}

      {(attempts > 0 || all.some((s) => s.lcLogged > 0)) && (
        <div className="flex flex-wrap gap-6 text-sm">
          <button
            type="button"
            onClick={() => void downloadExport()}
            className="text-slate-500 underline hover:text-slate-900 dark:hover:text-slate-100"
          >
            Export my data (JSON)
          </button>
          <button type="button" onClick={onReset} className="text-slate-400 underline hover:text-rose-600">
            Reset all progress
          </button>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="text-right">
      <div className="text-xl font-bold tabular-nums">{value}</div>
      <div className="text-slate-500 dark:text-slate-400">{label}</div>
    </div>
  )
}

/** Saves everything on this device as a JSON file (backup, and input for Phase 9 re-estimation). */
async function downloadExport() {
  const data = await exportAllData()
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `spar-export-${data.exportedAt.slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

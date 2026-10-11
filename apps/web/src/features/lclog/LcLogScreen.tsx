import { useMemo, useState } from 'react'
import { content, type Difficulty } from '../../content'
import { DIFFICULTIES } from '../../content/constants'
import { addLcLog, deleteLcLog, type LcLogRow } from '../../db'
import {
  bestOutcome,
  isSolved,
  LC_OUTCOME_LABEL,
  LC_OUTCOMES,
  lcUrl,
  parseLeetCodeInput,
  slugTitle,
  type LcOutcome,
} from '../../engine/lc'

const patternName = (id: string) => content.patternsById.get(id)?.name ?? id

const OUTCOME_STYLE: Record<LcOutcome, string> = {
  unaided: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
  hints: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
  viewed: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
}

const dateFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

export function LcLogScreen({ logs }: { logs: LcLogRow[] }) {
  const [input, setInput] = useState('')
  const [outcome, setOutcome] = useState<LcOutcome | null>(null)
  const [minutes, setMinutes] = useState('')
  // Only used for problems outside the catalog.
  const [customPatterns, setCustomPatterns] = useState<string[]>([])
  const [customDifficulty, setCustomDifficulty] = useState<Difficulty>('medium')
  const [justLogged, setJustLogged] = useState<string | null>(null)

  const parsed = parseLeetCodeInput(input, content.lcCatalog)
  const slug = parsed.kind === 'catalog' ? parsed.problem.slug : parsed.kind === 'unknown' ? parsed.slug : null
  const patternIds = parsed.kind === 'catalog' ? parsed.problem.pattern_ids : customPatterns
  const difficulty = parsed.kind === 'catalog' ? parsed.problem.difficulty : customDifficulty
  const minutesValue = minutes.trim() === '' ? null : Number(minutes)
  const minutesOk = minutesValue === null || (Number.isInteger(minutesValue) && minutesValue > 0 && minutesValue <= 600)
  const canLog = slug !== null && outcome !== null && patternIds.length > 0 && minutesOk

  const summary = useMemo(() => {
    const best = new Map<string, LcOutcome>()
    for (const l of logs) best.set(l.slug, best.has(l.slug) ? bestOutcome(best.get(l.slug)!, l.outcome) : l.outcome)
    return { problems: best.size, solved: [...best.values()].filter(isSolved).length }
  }, [logs])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!canLog) return
    await addLcLog({ slug, outcome, patternIds, difficulty, minutes: minutesValue })
    setJustLogged(slugTitle(slug))
    setInput('')
    setOutcome(null)
    setMinutes('')
    setCustomPatterns([])
  }

  const toggleCustom = (id: string) =>
    setCustomPatterns((ps) => (ps.includes(id) ? ps.filter((p) => p !== id) : [...ps, id]))

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">LeetCode log</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Solved something on leetcode.com? Log it here and it feeds your skill graph.
          </p>
        </div>
        <p className="text-sm tabular-nums text-slate-500 dark:text-slate-400">
          {summary.solved} solved · {summary.problems} logged
        </p>
      </div>

      <form
        onSubmit={submit}
        className="space-y-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="space-y-2">
          <label htmlFor="lc-input" className="block text-sm font-medium">
            Problem
          </label>
          <input
            id="lc-input"
            list="lc-catalog"
            value={input}
            onChange={(e) => {
              setInput(e.target.value)
              setJustLogged(null)
            }}
            placeholder="Paste a link, or type a number or name"
            autoComplete="off"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-950"
          />
          <datalist id="lc-catalog">
            {content.lcCatalog.map((p) => (
              <option key={p.slug} value={`${p.number} · ${p.slug}`} />
            ))}
          </datalist>

          {parsed.kind === 'catalog' && (
            <p className="text-sm">
              <a href={lcUrl(parsed.problem.slug)} target="_blank" rel="noreferrer" className="font-medium text-indigo-600 hover:underline dark:text-indigo-400">
                #{parsed.problem.number} {slugTitle(parsed.problem.slug)}
              </a>{' '}
              <span className="text-slate-500 dark:text-slate-400">
                · <span className="capitalize">{parsed.problem.difficulty}</span> ·{' '}
                {parsed.problem.pattern_ids.map(patternName).join(', ')}
              </span>
            </p>
          )}
          {parsed.kind === 'invalid' && input.trim() !== '' && (
            <p className="text-sm text-rose-600 dark:text-rose-400">{parsed.reason}</p>
          )}
          {justLogged && <p className="text-sm text-emerald-600 dark:text-emerald-400">Logged {justLogged}.</p>}
        </div>

        {parsed.kind === 'unknown' && (
          <fieldset className="space-y-3 rounded-lg bg-slate-50 p-4 dark:bg-slate-800/50">
            <legend className="sr-only">Tag this problem</legend>
            <p className="text-sm">
              <span className="font-medium">{slugTitle(parsed.slug)}</span> isn't in the catalog yet. Which patterns does
              it use?
            </p>
            <div className="flex flex-wrap gap-2">
              {content.patterns.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={customPatterns.includes(p.id)}
                  onClick={() => toggleCustom(p.id)}
                  className={`rounded-full border px-3 py-1 text-sm ${
                    customPatterns.includes(p.id)
                      ? 'border-indigo-500 bg-indigo-600 text-white'
                      : 'border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900'
                  }`}
                >
                  {p.name}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-sm">
              Difficulty
              <select
                value={customDifficulty}
                onChange={(e) => setCustomDifficulty(e.target.value as Difficulty)}
                className="rounded-md border border-slate-300 bg-white px-2 py-1 capitalize dark:border-slate-700 dark:bg-slate-900"
              >
                {DIFFICULTIES.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
          </fieldset>
        )}

        <div className="space-y-2">
          <span className="block text-sm font-medium" id="outcome-label">
            How did it go?
          </span>
          <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-labelledby="outcome-label">
            {LC_OUTCOMES.map((o) => (
              <button
                key={o}
                type="button"
                role="radio"
                aria-checked={outcome === o}
                onClick={() => setOutcome(o)}
                className={`rounded-lg border px-3 py-2.5 text-sm font-medium ${
                  outcome === o
                    ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-500 dark:bg-indigo-950'
                    : 'border-slate-200 hover:border-indigo-300 dark:border-slate-700'
                }`}
              >
                {LC_OUTCOME_LABEL[o]}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-4">
          <label className="text-sm">
            <span className="block font-medium">
              Minutes <span className="font-normal text-slate-400">(optional)</span>
            </span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={600}
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              className="mt-1 w-24 rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-950"
            />
          </label>
          <button
            type="submit"
            disabled={!canLog}
            className="rounded-lg bg-indigo-600 px-5 py-2.5 font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Log it
          </button>
        </div>
      </form>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Recent</h3>
        {logs.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">Nothing logged yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
            {[...logs]
              .reverse()
              .slice(0, 25)
              .map((l) => (
                <li key={l.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm">
                  <a href={lcUrl(l.slug)} target="_blank" rel="noreferrer" className="font-medium hover:underline">
                    {slugTitle(l.slug)}
                  </a>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${OUTCOME_STYLE[l.outcome]}`}>
                    {LC_OUTCOME_LABEL[l.outcome]}
                  </span>
                  <span className="text-slate-500 dark:text-slate-400">
                    <span className="capitalize">{l.difficulty}</span> · {l.patternIds.map(patternName).join(', ')}
                    {l.minutes ? ` · ${l.minutes} min` : ''}
                  </span>
                  <span className="ml-auto text-xs text-slate-400">{dateFmt.format(l.ts)}</span>
                  <button
                    type="button"
                    onClick={() => void deleteLcLog(l.id)}
                    aria-label={`Delete log for ${slugTitle(l.slug)}`}
                    className="rounded px-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950"
                  >
                    ×
                  </button>
                </li>
              ))}
          </ul>
        )}
      </section>
    </div>
  )
}

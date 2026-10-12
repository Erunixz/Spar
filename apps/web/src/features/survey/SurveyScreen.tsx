import { useState } from 'react'
import { content, LAYERS, type Layer } from '../../content'
import { saveSurvey, skipSurvey } from '../../db'
import { COMFORT_LABEL, COMFORT_RATINGS, type ComfortRating } from '../../engine/survey'

const LAYER_LABEL: Record<Layer, string> = {
  foundations: 'Foundations',
  core: 'Core patterns',
  structures: 'Data structures',
  advanced: 'Advanced',
}

interface Props {
  /** Latest ratings, to prefill a retake. */
  initial: Map<string, ComfortRating>
  /** 'first' offers "Skip for now"; 'retake' offers "Cancel". */
  mode: 'first' | 'retake'
  onClose: () => void
}

export function SurveyScreen({ initial, mode, onClose }: Props) {
  const [answers, setAnswers] = useState<Map<string, ComfortRating | null>>(
    () => new Map(content.patterns.map((p) => [p.id, initial.get(p.id) ?? null])),
  )
  const [saving, setSaving] = useState(false)
  const rated = [...answers.values()].filter((r) => r !== null).length

  const set = (pid: string, rating: ComfortRating | null) =>
    setAnswers((prev) => new Map(prev).set(pid, prev.get(pid) === rating ? null : rating))

  async function save() {
    setSaving(true)
    await saveSurvey(answers)
    onClose()
  }

  async function skip() {
    await skipSurvey()
    onClose()
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="space-y-2">
        <h2 className="text-2xl font-bold">How comfortable are you with each topic?</h2>
        <p className="text-slate-500 dark:text-slate-400">
          One tap per topic. Your answers give Spar a starting point, so your first sessions target the right things;
          real practice takes over within a few questions. Leave a topic blank if you're not sure.
        </p>
        <ol className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600 dark:text-slate-300">
          {COMFORT_RATINGS.map((r) => (
            <li key={r}>
              <span className="font-semibold">{r}</span> {COMFORT_LABEL[r]}
            </li>
          ))}
        </ol>
      </div>

      {LAYERS.map((layer) => {
        const patterns = content.patterns.filter((p) => p.layer === layer)
        if (patterns.length === 0) return null
        return (
          <section key={layer} className="space-y-2">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {LAYER_LABEL[layer]}
            </h3>
            <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
              {patterns.map((p) => {
                const current = answers.get(p.id) ?? null
                return (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1 basis-56">
                      <p className="font-medium">{p.name}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {current === null ? p.summary : COMFORT_LABEL[current]}
                      </p>
                    </div>
                    <div className="flex gap-1" role="radiogroup" aria-label={`Comfort with ${p.name}`}>
                      {COMFORT_RATINGS.map((r) => (
                        <button
                          key={r}
                          type="button"
                          role="radio"
                          aria-checked={current === r}
                          aria-label={`${r}: ${COMFORT_LABEL[r]}`}
                          title={COMFORT_LABEL[r]}
                          onClick={() => set(p.id, r)}
                          className={`size-10 rounded-lg border text-sm font-semibold transition ${
                            current === r
                              ? 'border-indigo-500 bg-indigo-600 text-white'
                              : 'border-slate-200 hover:border-indigo-400 hover:bg-indigo-50 dark:border-slate-700 dark:hover:bg-slate-800'
                          }`}
                        >
                          {r}
                        </button>
                      ))}
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}

      <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/95 py-4 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
        <span className="text-sm text-slate-500 dark:text-slate-400">
          {rated} of {content.patterns.length} rated
        </span>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => (mode === 'first' ? void skip() : onClose())}
            className="rounded-lg px-4 py-2.5 font-medium text-slate-600 hover:bg-slate-200 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            {mode === 'first' ? 'Skip for now' : 'Cancel'}
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="rounded-lg bg-indigo-600 px-5 py-2.5 font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

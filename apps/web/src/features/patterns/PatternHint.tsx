import { useState } from 'react'
import { content } from '../../content'
import type { Classification } from './classifier'
import { patternClient } from './patternClient'

type ModelState = 'idle' | 'loading' | 'ready' | 'failed'

const MAX_SHOWN = 4

/**
 * "Which pattern is this?": paste a problem you're stuck on, get the likely
 * patterns as a hint. Runs Model #1 in a worker; the text never leaves the browser.
 */
export function PatternHint() {
  const [text, setText] = useState('')
  const [model, setModel] = useState<ModelState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<Classification | null>(null)
  const [busy, setBusy] = useState(false)

  // Start downloading the model as soon as someone shows intent, not on page load.
  function warm() {
    if (model !== 'idle') return
    setModel('loading')
    patternClient()
      .warmup()
      .then(
        () => setModel('ready'),
        (e: Error) => {
          setModel('failed')
          setError(e.message)
        },
      )
  }

  async function suggest(e: React.FormEvent) {
    e.preventDefault()
    if (!text.trim() || busy) return
    warm()
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      setResult(await patternClient().classify(text))
      setModel('ready')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const likely = result?.ranked.filter((r) => r.likely).slice(0, MAX_SHOWN) ?? []
  const others = result?.ranked.filter((r) => !r.likely).slice(0, Math.max(0, 3 - likely.length)) ?? []

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div>
        <h3 className="font-semibold">Stuck? Which pattern is this?</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Paste a problem description and get the likely patterns as a hint, not a solution. It runs entirely in your
          browser; the text isn&apos;t saved or sent anywhere.
        </p>
      </div>
      <form onSubmit={suggest} className="space-y-3">
        <label htmlFor="hint-text" className="sr-only">
          Problem description
        </label>
        <textarea
          id="hint-text"
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setResult(null) // suggestions for different text would be misleading
          }}
          onFocus={warm}
          rows={5}
          placeholder="Paste the problem statement here…"
          className="w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-slate-400" aria-live="polite">
            {model === 'loading' && 'Loading the model (about 25 MB, first time only)…'}
            {model === 'ready' && result && `Answered in ${Math.round(result.ms)} ms, on this device`}
            {model === 'failed' && 'The model could not load.'}
          </span>
          <button
            type="submit"
            disabled={!text.trim() || busy}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {busy ? 'Thinking…' : 'Suggest patterns'}
          </button>
        </div>
      </form>

      {error && <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}

      {result && (
        <div className="space-y-3">
          <ul className="space-y-2">
            {likely.map((r) => {
              const p = content.patternsById.get(r.pattern)
              return (
                <li key={r.pattern} className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/60">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium">{p?.name ?? r.pattern}</span>
                    <span className="text-sm tabular-nums text-slate-500">{Math.round(r.prob * 100)}%</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-slate-200 dark:bg-slate-700">
                    <div className="h-full rounded-full bg-indigo-500" style={{ width: `${Math.round(r.prob * 100)}%` }} />
                  </div>
                  {p && <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-300">{p.summary}</p>}
                  {p && p.signals.length > 0 && (
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      Look for: {p.signals.slice(0, 4).join(', ')}
                    </p>
                  )}
                </li>
              )
            })}
          </ul>
          {others.length > 0 && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Less likely:{' '}
              {others.map((r) => `${content.patternsById.get(r.pattern)?.name ?? r.pattern} ${Math.round(r.prob * 100)}%`).join(', ')}
            </p>
          )}
          <p className="text-xs text-slate-400">
            A hint from a small model: on problems it never saw, its top guess is right about half the time, and the
            right pattern is usually among the ones listed.
          </p>
        </div>
      )}
    </section>
  )
}

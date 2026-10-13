import { useCallback, useEffect, useMemo, useState } from 'react'
import { DEFAULT_MAX_STEPS, pythonRunner } from '../../workers/runner'
import { formatValue, type Frame, type Step, type TraceResult } from '../../workers/trace'
import { arrayViews, type ArrayView } from './arrays'
import { ArrayViewer } from './ArrayViewer'
import { nodeSummary, structureViews } from './structures'
import { StructuresPanel } from './StructuresPanel'
import { CodeEditor } from './CodeEditor'
import { SAMPLES } from './samples'

type RunnerState = { kind: 'loading' } | { kind: 'ready'; version: string } | { kind: 'failed'; message: string }

const DRAFT_KEY = 'spar.visualizer.draft'

function loadDraft(): string {
  try {
    return localStorage.getItem(DRAFT_KEY) ?? SAMPLES[0].source
  } catch {
    return SAMPLES[0].source
  }
}

function saveDraft(source: string) {
  try {
    localStorage.setItem(DRAFT_KEY, source)
  } catch {
    // Private mode or blocked storage: the draft just isn't remembered.
  }
}

export default function VisualizerScreen() {
  const [source, setSource] = useState(loadDraft)
  const [runner, setRunner] = useState<RunnerState>({ kind: 'loading' })
  const [running, setRunning] = useState(false)
  const [trace, setTrace] = useState<TraceResult | null>(null)
  const [runError, setRunError] = useState<string | null>(null)
  const [stepIndex, setStepIndex] = useState(0)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    let live = true
    pythonRunner()
      .warmup()
      .then(
        (version) => live && setRunner({ kind: 'ready', version }),
        (e: Error) => live && setRunner({ kind: 'failed', message: e.message }),
      )
    return () => {
      live = false
    }
  }, [])

  const run = useCallback(async () => {
    if (running) return
    setRunning(true)
    setRunError(null)
    try {
      const result = await pythonRunner().run(source, DEFAULT_MAX_STEPS)
      setTrace(result)
      setStepIndex(0)
      setDirty(false)
    } catch (e) {
      setTrace(null)
      setRunError(e instanceof Error ? e.message : String(e))
    } finally {
      setRunning(false)
    }
  }, [running, source])

  const onEdit = useCallback((next: string) => {
    setSource(next)
    setDirty(true)
    saveDraft(next)
  }, [])

  const steps = trace?.steps ?? []
  const last = Math.max(0, steps.length - 1)
  const step: Step | null = steps[Math.min(stepIndex, last)] ?? null
  const prev: Step | null = stepIndex > 0 ? (steps[stepIndex - 1] ?? null) : null
  const go = useCallback((i: number) => setStepIndex(Math.max(0, Math.min(last, i))), [last])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = document.activeElement
      if (el?.closest('.cm-editor') || el instanceof HTMLInputElement || el instanceof HTMLSelectElement) return
      if (e.key === 'ArrowRight') go(stepIndex + 1)
      else if (e.key === 'ArrowLeft') go(stepIndex - 1)
      else if (e.key === 'Home') go(0)
      else if (e.key === 'End') go(last)
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, stepIndex, last])

  const errorLine = trace?.status === 'error' && stepIndex === last ? (trace.error?.line ?? null) : null
  const stdout = trace && step ? trace.stdout.slice(0, stepIndex === last ? undefined : step.stdout) : ''

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">Visualize</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Step through Python line by line. Your code runs only in this browser tab.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Load a sample"
            value=""
            onChange={(e) => {
              const sample = SAMPLES.find((s) => s.id === e.target.value)
              if (sample) onEdit(sample.source)
            }}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          >
            <option value="" disabled>
              Load a sample…
            </option>
            {SAMPLES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void run()}
            disabled={runner.kind !== 'ready' || running}
            className="rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            title="Ctrl+Enter"
          >
            {running ? 'Running…' : 'Run ▶'}
          </button>
        </div>
      </div>

      <p className="text-xs text-slate-500 dark:text-slate-400" aria-live="polite">
        {runner.kind === 'loading' && 'Loading Python (first time only, about 13 MB)…'}
        {runner.kind === 'ready' && `Python ${runner.version} ready · Ctrl+Enter runs · ←/→ step`}
        {runner.kind === 'failed' && `Python failed to load: ${runner.message}`}
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="h-[28rem] lg:h-[34rem]">
          <CodeEditor
            value={source}
            onChange={onEdit}
            activeLine={dirty ? null : (step?.line ?? null)}
            errorLine={dirty ? null : errorLine}
            onRun={() => void run()}
          />
        </div>

        <div className="space-y-3">
          {runError && <Notice tone="error">{runError}</Notice>}
          {!trace && !runError && (
            <div className="rounded-xl border border-dashed border-slate-300 p-6 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
              Pick a sample or write your own code, then press Run.
            </div>
          )}
          {trace && (
            <>
              {dirty && <Notice tone="info">The code changed since this run. Run again to trace the new version.</Notice>}
              <TraceStatus trace={trace} />
              {steps.length > 0 && step && (
                <>
                  <Stepper index={stepIndex} count={steps.length} step={step} onGo={go} />
                  <StructuresPanel views={structureViews(step, prev)} />
                  <FramesPanel step={step} prev={prev} />
                </>
              )}
              <OutputPanel text={stdout} />
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function Notice({ tone, children }: { tone: 'error' | 'info' | 'warn'; children: React.ReactNode }) {
  const style = {
    error: 'border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-100',
    info: 'border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-100',
    warn: 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-100',
  }[tone]
  return <div className={`rounded-lg border px-3 py-2 text-sm ${style}`}>{children}</div>
}

function TraceStatus({ trace }: { trace: TraceResult }) {
  if (trace.status === 'error' && trace.error) {
    const where = trace.error.line ? ` on line ${trace.error.line}` : ''
    return (
      <Notice tone="error">
        <span className="font-semibold">{trace.error.type}</span>
        {where}: {trace.error.message}
      </Notice>
    )
  }
  if (trace.status === 'step_limit') {
    return (
      <Notice tone="warn">
        {trace.limit === 'size'
          ? 'Stopped early: this run recorded too much data to show. Try smaller inputs.'
          : `Stopped after ${trace.maxSteps ?? DEFAULT_MAX_STEPS} steps (an infinite loop, or try smaller inputs).`}
      </Notice>
    )
  }
  return null
}

function Stepper({ index, count, step, onGo }: { index: number; count: number; step: Step; onGo: (i: number) => void }) {
  const btn =
    'rounded-md border border-slate-300 px-2.5 py-1 text-sm hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-800'
  const fn = step.stack.at(-1)?.fn
  const what =
    step.event === 'return'
      ? `${fn === '<module>' ? 'program finished' : `${fn} returns ${formatValue(step, step.retval ?? null)}`}`
      : step.event === 'exception'
        ? `raises ${step.exception?.type ?? 'an exception'}`
        : `about to run line ${step.line}`
  return (
    <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center gap-2">
        <button type="button" className={btn} onClick={() => onGo(0)} disabled={index === 0} aria-label="First step">
          ⏮
        </button>
        <button type="button" className={btn} onClick={() => onGo(index - 1)} disabled={index === 0} aria-label="Previous step">
          ◀
        </button>
        <input
          type="range"
          min={0}
          max={count - 1}
          value={index}
          onChange={(e) => onGo(Number(e.target.value))}
          aria-label="Step"
          className="flex-1 accent-indigo-600"
        />
        <button type="button" className={btn} onClick={() => onGo(index + 1)} disabled={index >= count - 1} aria-label="Next step">
          ▶
        </button>
        <button type="button" className={btn} onClick={() => onGo(count - 1)} disabled={index >= count - 1} aria-label="Last step">
          ⏭
        </button>
      </div>
      <p className="text-sm tabular-nums text-slate-600 dark:text-slate-300">
        Step {index + 1} of {count} · {what}
      </p>
    </div>
  )
}

function FramesPanel({ step, prev }: { step: Step; prev: Step | null }) {
  // Innermost frame first, like a debugger's call stack. A list shared by several
  // frames is drawn once, in the innermost frame that holds it.
  const frames = useMemo(() => {
    const drawn = new Set<number>()
    return step.stack
      .map((f, depth) => ({ f, depth }))
      .reverse()
      .map(({ f, depth }) => {
        const arrays = arrayViews(step, f, prev, prev?.stack[depth]).filter((v) => v.ref === null || !drawn.has(v.ref))
        for (const v of arrays) if (v.ref !== null) drawn.add(v.ref)
        return { f, depth, arrays }
      })
  }, [step, prev])
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        Call stack
      </h3>
      {frames.map(({ f, depth, arrays }, i) => (
        <FrameView
          key={depth}
          frame={f}
          arrays={arrays}
          step={step}
          prevFrame={prev?.stack[depth]}
          prev={prev}
          active={i === 0}
        />
      ))}
    </section>
  )
}

function FrameView({
  frame,
  arrays,
  step,
  prev,
  prevFrame,
  active,
}: {
  frame: Frame
  arrays: ArrayView[]
  step: Step
  prev: Step | null
  prevFrame: Frame | undefined
  active: boolean
}) {
  const entries = Object.entries(frame.locals)
  return (
    <div
      className={`rounded-xl border p-3 ${
        active
          ? 'border-indigo-300 bg-white dark:border-indigo-700 dark:bg-slate-900'
          : 'border-slate-200 bg-slate-50 opacity-80 dark:border-slate-800 dark:bg-slate-900/50'
      }`}
    >
      <p className="mb-2 font-mono text-sm">
        <span className="font-semibold">{frame.fn === '<module>' ? 'global' : `${frame.fn}()`}</span>
        <span className="text-slate-400"> · line {frame.line}</span>
      </p>
      {arrays.length > 0 && (
        <div className="mb-3 space-y-3">
          {arrays.map((view) => (
            <ArrayViewer key={view.name} view={view} />
          ))}
        </div>
      )}
      {entries.length === 0 ? (
        <p className="text-xs text-slate-400">No variables yet</p>
      ) : (
        <table className="w-full font-mono text-sm">
          <tbody>
            {entries.map(([name, value]) => {
              const full = formatValue(step, value)
              // Nodes are drawn in the Structures panel, so keep their row short.
              const shown = nodeSummary(step, value) ?? full
              const before = prevFrame && prev && name in prevFrame.locals ? formatValue(prev, prevFrame.locals[name]!) : null
              const changed = prev !== null && full !== before
              return (
                <tr key={name} className="align-top">
                  <td className="w-1 whitespace-nowrap py-0.5 pr-3 text-slate-500 dark:text-slate-400">{name}</td>
                  <td
                    className={`break-all rounded px-1 py-0.5 ${changed ? 'bg-amber-100 dark:bg-amber-900/50' : ''}`}
                    title={shown !== full ? full : changed ? 'Changed in the last step' : undefined}
                  >
                    {shown}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}

function OutputPanel({ text }: { text: string }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Output</h3>
      <pre className="min-h-10 overflow-x-auto rounded-xl bg-slate-900 p-3 font-mono text-sm text-slate-100">
        {text || <span className="text-slate-500">(nothing printed yet)</span>}
      </pre>
    </section>
  )
}

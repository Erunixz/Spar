import { readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { loadPyodide, type PyodideInterface } from 'pyodide'
import { beforeAll, describe, expect, it } from 'vitest'
import { formatValue, type Step, type TraceResult } from './trace'

/**
 * Golden tests: every visualizer sample is traced under the same Pyodide
 * (Python 3.14) the browser uses, and the step-by-step summary must match the
 * checked-in snapshot. Update intentionally with `vitest -u`.
 */

const here = import.meta.dirname
const samplesDir = resolve(here, '../features/visualizer/samples')

let py: PyodideInterface
let run: (source: string, maxSteps?: number) => TraceResult

beforeAll(async () => {
  // Pass the folder explicitly: Pyodide's own detection mangles paths containing parentheses.
  const indexURL = dirname(createRequire(import.meta.url).resolve('pyodide/package.json')) + '/'
  py = await loadPyodide({ indexURL })
  py.FS.mkdirTree('/home/pyodide/spar')
  py.FS.writeFile('/home/pyodide/spar/spar_tracer.py', readFileSync(join(here, 'tracer.py'), 'utf8'))
  py.runPython("import sys; sys.path.insert(0, '/home/pyodide/spar')")
  const tracer = py.pyimport('spar_tracer')
  run = (source, maxSteps = 1000) => JSON.parse(tracer.run(source, maxSteps) as string) as TraceResult
}, 60_000)

/** One line per step: line, event, then each frame's locals, innermost last. */
function summarize(result: TraceResult): string {
  const lines = result.steps.map((s: Step, i) => {
    const frames = s.stack
      .map((f) => `${f.fn}(${Object.entries(f.locals).map(([k, v]) => `${k}=${formatValue(s, v)}`).join(', ')})`)
      .join(' > ')
    const extra = s.event === 'return' ? ` -> ${formatValue(s, s.retval ?? null)}` : s.exception ? ` !! ${s.exception.type}` : ''
    return `${String(i).padStart(3)} L${s.line} ${s.event}${extra} | ${frames}`
  })
  return [`status: ${result.status}`, ...lines, `stdout: ${JSON.stringify(result.stdout)}`, ''].join('\n')
}

describe('tracer golden snapshots', () => {
  const samples = readdirSync(samplesDir).filter((f) => f.endsWith('.py'))

  it('has samples to check', () => {
    expect(samples.length).toBeGreaterThanOrEqual(5)
  })

  for (const file of samples) {
    it(file, async () => {
      const result = run(readFileSync(join(samplesDir, file), 'utf8'))
      expect(result.status).toBe('ok')
      await expect(summarize(result)).toMatchFileSnapshot(`./__golden__/${file.replace(/\.py$/, '.txt')}`)
    })
  }
})

describe('tracer behaviour', () => {
  it('snapshots are copies: later mutation does not change earlier steps', () => {
    const r = run('xs = [1]\nxs.append(2)\nxs.append(3)\n')
    // Snapshots are taken before each line runs; the final 'return' step sees the end state.
    const xs = r.steps.map((s) => formatValue(s, s.stack[0]!.locals.xs ?? null))
    expect(xs).toEqual(['None', '[1]', '[1, 2]', '[1, 2, 3]'])
  })

  it('keeps object ids stable across steps', () => {
    const r = run('a = [1]\nb = a\nb.append(2)\nc = 0\n')
    const last = r.steps.at(-1)!
    const { a, b } = last.stack[0]!.locals
    expect(a).toEqual(b)
    const firstSeen = r.steps.find((s) => s.stack[0]!.locals.a)!
    expect(firstSeen.stack[0]!.locals.a).toEqual(a)
  })

  it('stops runaway loops at the step cap', () => {
    const r = run('while True:\n    pass\n', 40)
    expect(r.status).toBe('step_limit')
    expect(r.limit).toBe('steps')
    expect(r.steps).toHaveLength(40)
  })

  it('stops when the recorded data gets too big for the tab', () => {
    const source = ['xs = list(range(100))', 'objs = [[i] for i in range(100)]', 'while True:', '    xs.append(0)'].join('\n')
    const r = run(source, 1_000_000)
    expect(r.status).toBe('step_limit')
    expect(r.limit).toBe('size')
  })

  it("can't be swallowed by a user's except Exception", () => {
    const r = run('while True:\n    try:\n        x = 1\n    except Exception:\n        pass\n', 30)
    expect(r.status).toBe('step_limit')
  })

  it('reports syntax and runtime errors with their line', () => {
    expect(run('def f(:\n    pass\n').error).toMatchObject({ type: 'SyntaxError', line: 1 })
    const r = run('x = 1\ny = x / 0\n')
    expect(r.status).toBe('error')
    expect(r.error).toMatchObject({ type: 'ZeroDivisionError', line: 2 })
    expect(r.steps.some((s) => s.event === 'exception')).toBe(true)
  })

  it('explains that input() is unavailable', () => {
    const r = run('name = input()\n')
    expect(r.error?.message).toMatch(/input\(\) isn't available/)
  })

  it('handles cycles, deep lists and special numbers without breaking JSON', () => {
    const r = run(
      [
        'class N:',
        '    def __init__(self): self.next = self',
        'loop = N()',
        'deep = None',
        'for _ in range(150): deep = [deep]',
        "big, inf = 2 ** 80, float('inf')",
        'done = True',
      ].join('\n'),
      100_000,
    )
    expect(r.status).toBe('ok')
    const last = r.steps.at(-1)!
    const { loop, big, inf } = last.stack[0]!.locals
    expect(formatValue(last, loop!)).toMatch(/^N\(next=#\d+\)$/)
    expect(big).toEqual({ bigint: String(2n ** 80n) })
    expect(inf).toEqual({ float: 'inf' })
  })

  it('hides functions, classes and modules at module level but keeps data', () => {
    const r = run('import math\nclass A: pass\ndef f(): pass\nx = 1\ny = 2\n')
    expect(Object.keys(r.steps.at(-1)!.stack[0]!.locals)).toEqual(['x', 'y'])
  })
})

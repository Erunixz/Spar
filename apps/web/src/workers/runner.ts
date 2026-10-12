import type { TraceResult, WorkerRequest, WorkerResponse } from './trace'

export const DEFAULT_MAX_STEPS = 1000
/** Covers loops inside C code (e.g. a huge sum()) that the step cap can't see. */
export const RUN_TIMEOUT_MS = 10_000

/** Omit that keeps each member of a union separate. */
type WithoutId<T> = T extends unknown ? Omit<T, 'id'> : never

type Pending = { resolve: (r: WorkerResponse) => void; timer: ReturnType<typeof setTimeout> | null }

/**
 * Runs user code in a Pyodide Web Worker. User code never touches the page;
 * if a run doesn't finish in time the worker is killed and replaced.
 */
export class PythonRunner {
  private worker: Worker | null = null
  private nextId = 1
  private pending = new Map<number, Pending>()

  private ensureWorker(): Worker {
    if (this.worker) return this.worker
    const worker = new Worker(new URL('./pyodide.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const p = this.pending.get(e.data.id)
      if (!p) return
      if (p.timer) clearTimeout(p.timer)
      this.pending.delete(e.data.id)
      p.resolve(e.data)
    }
    worker.onerror = (e) => this.failAll(e.message || 'The Python worker crashed')
    this.worker = worker
    return worker
  }

  private failAll(error: string) {
    for (const [id, p] of this.pending) {
      if (p.timer) clearTimeout(p.timer)
      p.resolve({ id, ok: false, error })
    }
    this.pending.clear()
  }

  private request(msg: WithoutId<WorkerRequest>, timeoutMs: number | null): Promise<WorkerResponse> {
    const worker = this.ensureWorker()
    const id = this.nextId++
    return new Promise((resolve) => {
      const timer =
        timeoutMs === null
          ? null
          : setTimeout(() => {
              this.pending.delete(id)
              this.kill()
              resolve({ id, ok: false, error: `Stopped after ${timeoutMs / 1000} seconds (an infinite loop?)` })
            }, timeoutMs)
      this.pending.set(id, { resolve, timer })
      worker.postMessage({ ...msg, id } as WorkerRequest)
    })
  }

  /** Loads Python in the background; resolves to its version string. */
  async warmup(): Promise<string> {
    const r = await this.request({ type: 'warmup' }, null)
    if (!r.ok) throw new Error(r.error)
    return r.pythonVersion ?? ''
  }

  async run(source: string, maxSteps = DEFAULT_MAX_STEPS): Promise<TraceResult> {
    // Make sure Python is loaded first, so slow loading doesn't count against the run timeout.
    await this.warmup()
    const r = await this.request({ type: 'run', source, maxSteps }, RUN_TIMEOUT_MS)
    if (!r.ok) throw new Error(r.error)
    return r.result!
  }

  kill() {
    this.worker?.terminate()
    this.worker = null
    this.failAll('The Python worker was restarted')
  }
}

let shared: PythonRunner | null = null
export function pythonRunner(): PythonRunner {
  shared ??= new PythonRunner()
  return shared
}

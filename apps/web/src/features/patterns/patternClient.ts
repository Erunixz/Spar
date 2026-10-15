import type { PatternRequest, PatternResponse } from '../../workers/patterns.worker'
import type { Classification } from './classifier'

type WithoutId<T> = T extends unknown ? Omit<T, 'id'> : never

/** Talks to the Model #1 worker; the model loads on first use and stays warm. */
class PatternClient {
  private worker: Worker | null = null
  private nextId = 1
  private pending = new Map<number, (r: PatternResponse) => void>()

  private ensure(): Worker {
    if (this.worker) return this.worker
    const w = new Worker(new URL('../../workers/patterns.worker.ts', import.meta.url), { type: 'module' })
    w.onmessage = (e: MessageEvent<PatternResponse>) => {
      this.pending.get(e.data.id)?.(e.data)
      this.pending.delete(e.data.id)
    }
    w.onerror = (e) => {
      for (const [id, resolve] of this.pending) resolve({ id, ok: false, error: e.message || 'The model worker crashed' })
      this.pending.clear()
      this.worker = null
    }
    this.worker = w
    return w
  }

  private request(msg: WithoutId<PatternRequest>): Promise<PatternResponse> {
    const w = this.ensure()
    const id = this.nextId++
    return new Promise((resolve) => {
      this.pending.set(id, resolve)
      w.postMessage({ ...msg, id } as PatternRequest)
    })
  }

  async warmup(): Promise<{ loadMs: number }> {
    const r = await this.request({ type: 'warmup' })
    if (!r.ok) throw new Error(r.error)
    return { loadMs: r.loadMs ?? 0 }
  }

  async classify(text: string): Promise<Classification> {
    const r = await this.request({ type: 'classify', text })
    if (!r.ok) throw new Error(r.error)
    return r.result!
  }
}

let shared: PatternClient | null = null
export const patternClient = () => (shared ??= new PatternClient())

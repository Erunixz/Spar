/// <reference lib="webworker" />
import { env } from '@huggingface/transformers'
import { PatternClassifier, type Classification } from '../features/patterns/classifier'

declare const self: DedicatedWorkerGlobalScope

export type PatternRequest = { id: number; type: 'warmup' } | { id: number; type: 'classify'; text: string }
export type PatternResponse =
  | { id: number; ok: true; loadMs?: number; device?: string; result?: Classification }
  | { id: number; ok: false; error: string }

const origin = self.location.origin
// Self-hosted ONNX Runtime (see model-assets-plugin.ts): no CDN at inference time.
env.backends.onnx.wasm!.wasmPaths = new URL(`${import.meta.env.BASE_URL}ort/`, origin).href
// Transformers.js needs a site-relative path for locally served models; our own
// JSON fetches use the absolute URL. (Remote hosting via VITE_PATTERN_MODEL_URL is
// wired up when the model is published.)
const modelPath = `${import.meta.env.BASE_URL}models/`
const modelBase = new URL(modelPath, origin).href

let ready: Promise<{ classifier: PatternClassifier; loadMs: number }> | null = null

function load() {
  ready ??= (async () => {
    const start = performance.now()
    const classifier = await PatternClassifier.load({
      modelPath,
      readJson: async (file) => {
        const res = await fetch(new URL(file, modelBase))
        if (!res.ok) throw new Error(`Couldn't load ${file} (${res.status})`)
        return res.json()
      },
      device: 'wasm',
    })
    return { classifier, loadMs: performance.now() - start }
  })()
  return ready
}

self.onmessage = async (e: MessageEvent<PatternRequest>) => {
  const msg = e.data
  try {
    const { classifier, loadMs } = await load()
    if (msg.type === 'warmup') self.postMessage({ id: msg.id, ok: true, loadMs, device: 'wasm' } satisfies PatternResponse)
    else self.postMessage({ id: msg.id, ok: true, result: await classifier.classify(msg.text) } satisfies PatternResponse)
  } catch (err) {
    ready = null // let a later request retry the load
    self.postMessage({ id: msg.id, ok: false, error: err instanceof Error ? err.message : String(err) } satisfies PatternResponse)
  }
}

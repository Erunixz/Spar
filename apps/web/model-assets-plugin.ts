import { createReadStream, existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import type { Connect, Plugin } from 'vite'

/**
 * Serves Model #1 and ONNX Runtime's WebAssembly from this machine:
 *  - /models/pattern-classifier-v1/*  from ml/artifacts (until it's hosted on Hugging Face;
 *    set VITE_PATTERN_MODEL_URL to load from there instead)
 *  - /ort/*  from onnxruntime-web, so inference never depends on a CDN
 * In dev these stream from disk; a build copies them into dist/ (the model only if it exists).
 */

const MODEL_DIR = 'pattern-classifier-v1'
const MODEL_FILES = [
  'config.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'spar.json',
  'tfidf.json',
  'onnx/model_quantized.onnx',
]
/** The ONNX Runtime build Transformers.js 4.3 actually requests (checked in the browser). */
export const ORT_FILES = ['ort-wasm-simd-threaded.asyncify.mjs', 'ort-wasm-simd-threaded.asyncify.wasm']

const TYPES: Record<string, string> = {
  '.json': 'application/json',
  '.onnx': 'application/octet-stream',
  '.wasm': 'application/wasm',
  '.mjs': 'text/javascript',
}
const typeOf = (name: string) => TYPES[name.slice(name.lastIndexOf('.'))] ?? 'application/octet-stream'

export function modelAssets(artifactsDir: string): Plugin {
  // onnxruntime-web doesn't export its package.json; its main entry lives in dist/.
  const ortDir = dirname(createRequire(import.meta.url).resolve('onnxruntime-web'))
  const modelDir = resolve(artifactsDir, MODEL_DIR)
  const serve =
    (root: string, allowed: string[]): Connect.NextHandleFunction =>
    (req, res, next) => {
      const name = decodeURIComponent((req.url ?? '').replace(/^\//, '').split('?')[0]!)
      if (!allowed.includes(name) || !existsSync(join(root, name))) return next()
      res.setHeader('Content-Type', typeOf(name))
      createReadStream(join(root, name)).pipe(res)
    }

  return {
    name: 'spar-model-assets',
    configureServer(server) {
      server.middlewares.use(`/models/${MODEL_DIR}`, serve(modelDir, MODEL_FILES))
      server.middlewares.use('/ort', serve(ortDir, ORT_FILES))
    },
    generateBundle() {
      for (const name of ORT_FILES) {
        this.emitFile({ type: 'asset', fileName: `ort/${name}`, source: readFileSync(join(ortDir, name)) })
      }
      if (process.env.VITE_PATTERN_MODEL_URL || !existsSync(join(modelDir, 'onnx/model_quantized.onnx'))) return
      for (const name of MODEL_FILES) {
        this.emitFile({ type: 'asset', fileName: `models/${MODEL_DIR}/${name}`, source: readFileSync(join(modelDir, name)) })
      }
    },
  }
}

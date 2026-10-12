/// <reference lib="webworker" />
import { loadPyodide, type PyodideInterface } from 'pyodide'
import type { WorkerRequest, WorkerResponse } from './trace'
import tracerSource from './tracer.py?raw'

declare const self: DedicatedWorkerGlobalScope

const TRACER_DIR = '/home/pyodide/spar'
let ready: Promise<PyodideInterface> | null = null

function pyodide(): Promise<PyodideInterface> {
  ready ??= (async () => {
    const indexURL = new URL(`${import.meta.env.BASE_URL}pyodide/`, self.location.origin).href
    const py = await loadPyodide({ indexURL })
    py.FS.mkdirTree(TRACER_DIR)
    py.FS.writeFile(`${TRACER_DIR}/spar_tracer.py`, tracerSource)
    py.runPython(`import sys; sys.path.insert(0, ${JSON.stringify(TRACER_DIR)})`)
    return py
  })()
  return ready
}

function reply(msg: WorkerResponse) {
  self.postMessage(msg)
}

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data
  try {
    const py = await pyodide()
    if (msg.type === 'warmup') {
      reply({ id: msg.id, ok: true, pythonVersion: py.runPython('import sys; sys.version.split()[0]') as string })
      return
    }
    const tracer = py.pyimport('spar_tracer')
    try {
      const json = tracer.run(msg.source, msg.maxSteps) as string
      reply({ id: msg.id, ok: true, result: JSON.parse(json) })
    } finally {
      tracer.destroy()
    }
  } catch (err) {
    reply({ id: msg.id, ok: false, error: err instanceof Error ? err.message : String(err) })
  }
}

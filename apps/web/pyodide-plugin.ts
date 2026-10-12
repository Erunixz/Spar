import { createReadStream, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import type { Plugin } from 'vite'

/** The runtime files Pyodide fetches from its indexURL. The loader itself is bundled. */
const FILES: Record<string, string> = {
  'pyodide.asm.mjs': 'text/javascript',
  'pyodide.asm.wasm': 'application/wasm',
  'python_stdlib.zip': 'application/zip',
  'pyodide-lock.json': 'application/json',
}

export const PYODIDE_PATH = 'pyodide'

/**
 * Self-hosts Pyodide's runtime under /pyodide/: served from node_modules in
 * dev, copied into the build output for production. No CDN, works offline.
 */
export function pyodideAssets(): Plugin {
  const dir = dirname(createRequire(import.meta.url).resolve('pyodide/package.json'))
  return {
    name: 'spar-pyodide-assets',
    configureServer(server) {
      server.middlewares.use(`/${PYODIDE_PATH}`, (req, res, next) => {
        const name = (req.url ?? '').replace(/^\//, '').split('?')[0]!
        const type = FILES[name]
        if (!type) return next()
        res.setHeader('Content-Type', type)
        createReadStream(join(dir, name)).pipe(res)
      })
    },
    generateBundle() {
      for (const name of Object.keys(FILES)) {
        this.emitFile({ type: 'asset', fileName: `${PYODIDE_PATH}/${name}`, source: readFileSync(join(dir, name)) })
      }
    },
  }
}

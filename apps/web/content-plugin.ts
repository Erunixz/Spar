import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Plugin } from 'vite'
import { parse } from 'yaml'
import { validateContent } from './src/content/schema'

const VIRTUAL_ID = 'virtual:spar-content'
const RESOLVED_ID = '\0' + VIRTUAL_ID

/**
 * Reads content/patterns.yaml and content/items/*.yaml, validates them, and
 * exposes the result as a JSON module. YAML parsing and schema checks stay
 * out of the browser bundle, and bad content fails the build.
 */
export function sparContent(contentDir: string): Plugin {
  const itemsDir = join(contentDir, 'items')
  const patternsFile = join(contentDir, 'patterns.yaml')

  return {
    name: 'spar-content',
    resolveId(id) {
      return id === VIRTUAL_ID ? RESOLVED_ID : undefined
    },
    load(id) {
      if (id !== RESOLVED_ID) return
      this.addWatchFile(patternsFile)
      this.addWatchFile(itemsDir)
      const itemFiles = readdirSync(itemsDir).filter((f) => f.endsWith('.yaml'))
      for (const f of itemFiles) this.addWatchFile(join(itemsDir, f))
      const { patterns, items } = validateContent(
        parse(readFileSync(patternsFile, 'utf8')),
        itemFiles.map((file) => ({ file, data: parse(readFileSync(join(itemsDir, file), 'utf8')) })),
      )
      return `export default ${JSON.stringify({ patterns, items })}`
    },
    configureServer(server) {
      // Reload when an item file is added, edited or removed.
      server.watcher.add(contentDir)
      const reload = (file: string) => {
        if (!file.startsWith(contentDir)) return
        const mod = server.moduleGraph.getModuleById(RESOLVED_ID)
        if (mod) server.moduleGraph.invalidateModule(mod)
        server.ws.send({ type: 'full-reload' })
      }
      server.watcher.on('add', reload)
      server.watcher.on('change', reload)
      server.watcher.on('unlink', reload)
    },
  }
}

import data from 'virtual:spar-content'
import type { Content } from './schema'

// Parsed and validated at build time by content-plugin.ts.
export const content: Content = {
  patterns: data.patterns,
  patternsById: new Map(data.patterns.map((p) => [p.id, p])),
  items: data.items,
  itemsById: new Map(data.items.map((i) => [i.id, i])),
}

export type { Content, Item, Pattern, Difficulty, Layer } from './schema'
export { LAYERS } from './constants'

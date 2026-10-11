/// <reference types="vite/client" />

declare module 'virtual:spar-content' {
  import type { Item, Pattern } from './content/schema'
  const data: { patterns: Pattern[]; items: Item[] }
  export default data
}

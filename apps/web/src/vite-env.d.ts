/// <reference types="vite/client" />

declare module 'virtual:spar-content' {
  import type { Item, LcProblem, Pattern } from './content/schema'
  const data: { patterns: Pattern[]; items: Item[]; lcCatalog: LcProblem[] }
  export default data
}

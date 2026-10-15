/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Where Model #1's files live (e.g. a Hugging Face resolve URL). Defaults to the app's own /models/. */
  readonly VITE_PATTERN_MODEL_URL?: string
}

declare module 'virtual:spar-content' {
  import type { Item, LcProblem, Pattern } from './content/schema'
  const data: { patterns: Pattern[]; items: Item[]; lcCatalog: LcProblem[] }
  export default data
}

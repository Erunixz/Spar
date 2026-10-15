/**
 * TypeScript port of the TF-IDF half of Model #1 (scikit-learn TfidfVectorizer
 * + one-vs-rest logistic regression), reading the JSON exported by
 * ml/src/tfidf_export.py. The Python reference scorer there is the spec; the
 * parity tests check this port against scikit-learn's own numbers.
 */

export interface TfidfModel {
  format: 'spar-tfidf-ovr-logreg/1'
  patterns: string[]
  preprocess: {
    lowercase: boolean
    strip_accents: 'unicode' | null
    token_pattern: string
    ngram_range: [number, number]
    sublinear_tf: boolean
    norm: 'l2' | null
  }
  terms: string[]
  idf: number[]
  coef: number[][]
  intercept: number[]
}

/**
 * Python's `\b\w\w+\b` with re.UNICODE: runs of two or more word characters.
 * JavaScript's \w is ASCII-only, so spell out Unicode letters, numbers and _.
 */
const WORD_RUN = /[\p{L}\p{N}_]{2,}/gu

/** NFKD, then drop combining marks: scikit-learn's strip_accents="unicode". */
function stripAccents(s: string): string {
  return s.normalize('NFKD').replace(/\p{M}/gu, '')
}

export function tokenize(text: string, pre: TfidfModel['preprocess']): string[] {
  if (pre.token_pattern !== '(?u)\\b\\w\\w+\\b') throw new Error(`Unsupported token_pattern ${pre.token_pattern}`)
  let s = pre.strip_accents === 'unicode' ? stripAccents(text) : text
  if (pre.lowercase) s = s.toLowerCase()
  const words = s.match(WORD_RUN) ?? []
  const [lo, hi] = pre.ngram_range
  const grams: string[] = []
  for (let n = lo; n <= hi; n++) {
    for (let i = 0; i + n <= words.length; i++) grams.push(words.slice(i, i + n).join(' '))
  }
  return grams
}

export class TfidfScorer {
  private readonly index: Map<string, number>

  constructor(private readonly model: TfidfModel) {
    if (model.format !== 'spar-tfidf-ovr-logreg/1') throw new Error(`Unknown TF-IDF format ${model.format}`)
    this.index = new Map(model.terms.map((t, i) => [t, i]))
  }

  get patterns(): string[] {
    return this.model.patterns
  }

  /** Per-pattern probabilities, in `patterns` order. */
  score(text: string): number[] {
    const { preprocess: pre, idf, coef, intercept } = this.model
    const counts = new Map<number, number>()
    for (const g of tokenize(text, pre)) {
      const i = this.index.get(g)
      if (i !== undefined) counts.set(i, (counts.get(i) ?? 0) + 1)
    }
    const weights = new Map<number, number>()
    for (const [i, tf] of counts) weights.set(i, (pre.sublinear_tf ? 1 + Math.log(tf) : tf) * idf[i]!)
    if (pre.norm === 'l2') {
      const norm = Math.sqrt([...weights.values()].reduce((s, v) => s + v * v, 0))
      if (norm > 0) for (const [i, v] of weights) weights.set(i, v / norm)
    }
    return coef.map((row, k) => {
      let z = intercept[k]!
      for (const [i, v] of weights) z += row[i]! * v
      return 1 / (1 + Math.exp(-z))
    })
  }
}

import { AutoModelForSequenceClassification, AutoTokenizer, env, type PreTrainedModel, type PreTrainedTokenizer } from '@huggingface/transformers'
import { TfidfScorer, type TfidfModel } from './tfidf'

/**
 * Model #1 at inference time: distilled MiniLM (ONNX int8, via Transformers.js)
 * blended with the TF-IDF scorer, exactly as configured in spar.json.
 * Works in a browser worker and in Node (tests).
 */

export const MODEL_ID = 'pattern-classifier-v1'

export interface SparConfig {
  patterns: string[]
  weight_on_student: number
  threshold: number
  max_length: number
  data_version: string
}

export interface PatternScore {
  pattern: string
  prob: number
  /** Above the validation-tuned threshold (the top pattern always counts). */
  likely: boolean
}

export interface Classification {
  ranked: PatternScore[]
  student: number[]
  tfidf: number[]
  ms: number
}

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x))

/** Blend, then rank: same rule as ml/src/metrics.predict (threshold, plus always the top pattern). */
export function rankPatterns(patterns: string[], probs: number[], threshold: number): PatternScore[] {
  const top = probs.indexOf(Math.max(...probs))
  return patterns
    .map((pattern, i) => ({ pattern, prob: probs[i]!, likely: i === top || probs[i]! >= threshold }))
    .sort((a, b) => b.prob - a.prob)
}

export function blend(student: number[], tfidf: number[], weightOnStudent: number): number[] {
  return student.map((s, i) => weightOnStudent * s + (1 - weightOnStudent) * tfidf[i]!)
}

export class PatternClassifier {
  private constructor(
    private readonly config: SparConfig,
    private readonly tokenizer: PreTrainedTokenizer,
    private readonly model: PreTrainedModel,
    private readonly tfidf: TfidfScorer,
  ) {}

  /**
   * modelPath: folder containing `pattern-classifier-v1/`, as Transformers.js wants it:
   *   a site-relative path in the browser (an absolute http URL counts as "remote"
   *   and is refused while remote models are off), a filesystem path in Node.
   * readJson: how to fetch spar.json and tfidf.json (fetch in the browser, fs in Node).
   */
  static async load(opts: {
    modelPath: string
    readJson: <T>(file: string) => Promise<T>
    device?: 'wasm' | 'webgpu' | 'cpu'
  }): Promise<PatternClassifier> {
    env.allowRemoteModels = false
    env.allowLocalModels = true
    env.localModelPath = opts.modelPath
    const [config, tfidfModel] = await Promise.all([
      opts.readJson<SparConfig>(`${MODEL_ID}/spar.json`),
      opts.readJson<TfidfModel>(`${MODEL_ID}/tfidf.json`),
    ])
    const tfidf = new TfidfScorer(tfidfModel)
    if (tfidf.patterns.join() !== config.patterns.join()) throw new Error('TF-IDF and model pattern order differ')
    const tokenizer = await AutoTokenizer.from_pretrained(MODEL_ID)
    const model = await AutoModelForSequenceClassification.from_pretrained(MODEL_ID, {
      dtype: 'q8',
      ...(opts.device ? { device: opts.device } : {}),
    })
    return new PatternClassifier(config, tokenizer, model, tfidf)
  }

  get patterns(): string[] {
    return this.config.patterns
  }

  /** The student's per-pattern probabilities alone. */
  async studentProbs(text: string): Promise<number[]> {
    const inputs = this.tokenizer(text, { truncation: true, max_length: this.config.max_length })
    const { logits } = await this.model(inputs)
    return Array.from(logits.data as Float32Array, sigmoid)
  }

  async classify(text: string): Promise<Classification> {
    const start = performance.now()
    const student = await this.studentProbs(text)
    const tfidf = this.tfidf.score(text)
    const probs = blend(student, tfidf, this.config.weight_on_student)
    return {
      ranked: rankPatterns(this.config.patterns, probs, this.config.threshold),
      student,
      tfidf,
      ms: performance.now() - start,
    }
  }
}

import { useState } from 'react'
import dataReport from '../../../../../ml/reports/data_v1.json'
import difficultyReport from '../../../../../ml/reports/difficulty_v1.json'
import exportReport from '../../../../../ml/reports/export_v1.json'
import final from '../../../../../ml/reports/final_v1.json'
import ablationOff from '../../../../../ml/reports/finetune_minilm-30ep_v1.json'
import ablationOn from '../../../../../ml/reports/finetune_minilm-distilled_v1.json'
import { content } from '../../content'
import { patternClient } from '../patterns/patternClient'
import { PatternHint } from '../patterns/PatternHint'
import { DumbbellChart } from './DumbbellChart'

/**
 * /lab: the models behind Spar, with numbers read straight from ml/reports
 * (committed, metrics only), plus a live demo and an on-device benchmark.
 */

type Metrics = (typeof final.test)['tfidf_baseline']
const T = final.test
const name = (id: string) => content.patternsById.get(id)?.name ?? id
const fmt = (v: number) => v.toFixed(3)

const MODELS: { key: keyof typeof T; label: string; size: string; note?: string }[] = [
  { key: 'tfidf_baseline', label: 'TF-IDF + logistic regression', size: '~3 MB' },
  { key: 'minilm_distilled', label: 'Distilled MiniLM-L6 alone', size: '~22 MB' },
  { key: 'shipped_minilm_distilled_plus_tfidf', label: 'Distilled MiniLM + TF-IDF', size: '~25 MB', note: 'shipped' },
  { key: 'teacher_roberta_plus_tfidf', label: 'RoBERTa-base + TF-IDF (teacher)', size: '~127 MB', note: 'reference' },
]

const BENCH_TEXT =
  'Given an array of positive integers and a target, find the length of the shortest contiguous stretch whose sum is at least the target.'

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{sub}</p>}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{title}</h3>
      {children}
    </section>
  )
}

function Benchmark() {
  const [state, setState] = useState<{ status: 'idle' | 'running' | 'done' | 'failed'; text?: string }>({ status: 'idle' })
  async function run() {
    setState({ status: 'running' })
    try {
      const client = patternClient()
      const { loadMs } = await client.warmup()
      const times: number[] = []
      for (let i = 0; i < 15; i++) times.push((await client.classify(BENCH_TEXT)).ms)
      times.sort((a, b) => a - b)
      setState({
        status: 'done',
        text: `Median ${times[7]!.toFixed(0)} ms per problem (fastest ${times[0]!.toFixed(0)} ms, slowest ${times[14]!.toFixed(0)} ms over 15 runs)${loadMs > 0 ? `; model loaded in ${(loadMs / 1000).toFixed(1)} s` : ''}.`,
      })
    } catch (e) {
      setState({ status: 'failed', text: e instanceof Error ? e.message : String(e) })
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={() => void run()}
        disabled={state.status === 'running'}
        className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800"
      >
        {state.status === 'running' ? 'Measuring…' : 'Measure on this device'}
      </button>
      <span className="text-sm text-slate-600 dark:text-slate-300" aria-live="polite">
        {state.text}
      </span>
    </div>
  )
}

const DIFF_MODELS: { key: keyof typeof difficultyReport.test; label: string; note?: string }[] = [
  { key: 'label_mean', label: 'Average for the difficulty label' },
  { key: 'tag_mean', label: 'Label + LeetCode tag averages' },
  { key: 'tag_ridge', label: 'Ridge: label + tags' },
  { key: 'tag_text_ridge', label: 'Ridge: label + tags + statement text', note: 'shipped' },
]

function ModelTwo() {
  const t = difficultyReport.test
  const split = difficultyReport.split
  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">Model #2: difficulty rating</h2>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Estimates a problem&apos;s contest-style difficulty rating, so the recommender can tell an easy Medium from a
          brutal one. Most classic problems predate rated contests: of the {78} catalog problems, 6 have a real
          contest rating and the rest are estimated offline. Only the numbers ship; no problem text.
        </p>
      </div>
      <Section title={`Test results: ${split.test.rows} newest rated problems (${split.test.date_from} to ${split.test.date_to})`}>
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
              <tr>
                <th className="px-3 py-2 font-medium">Model</th>
                <th className="px-3 py-2 text-right font-medium">Spearman</th>
                <th className="px-3 py-2 text-right font-medium">MAE (rating points)</th>
                <th className="px-3 py-2 text-right font-medium">Within-label Spearman</th>
                <th className="px-3 py-2 text-right font-medium">Easy / Medium / Hard</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {DIFF_MODELS.map(({ key, label, note }) => {
                const m = t[key]
                const w = m.spearman_within_label as Record<string, number>
                return (
                  <tr key={key} className={`border-t border-slate-100 dark:border-slate-800 ${note ? 'bg-indigo-50/60 font-medium dark:bg-indigo-950/40' : ''}`}>
                    <td className="px-3 py-2">
                      {label}
                      {note && <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-normal text-slate-600 dark:bg-slate-800 dark:text-slate-300">{note}</span>}
                    </td>
                    <td className="px-3 py-2 text-right">{m.spearman.toFixed(3)}</td>
                    <td className="px-3 py-2 text-right">{m.mae.toFixed(0)}</td>
                    <td className="px-3 py-2 text-right">{m.spearman_within_label_mean.toFixed(3)}</td>
                    <td className="px-3 py-2 text-right">
                      {['easy', 'medium', 'hard'].map((l) => (w[l] ?? 0).toFixed(2)).join(' / ')}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          The Easy / Medium / Hard label already sorts problems, so overall Spearman barely moves. What the model adds
          is ranking <em>within</em> a label, where the label alone scores zero: useful for Mediums (0.45), weak for
          Easies, and absent for Hards, which differ in ways the statement and tags don&apos;t reveal. Labels are
          zerotrac&apos;s contest ratings (MIT), trained on {split.train.rows} problems and chosen on {split.val.rows}{' '}
          validation problems before this test was scored once.
        </p>
      </Section>
    </section>
  )
}

export default function LabScreen() {
  const shipped = T.shipped_minilm_distilled_plus_tfidf as Metrics
  const baseline = T.tfidf_baseline as Metrics
  const rows = Object.entries(shipped.per_pattern)
    .map(([id, m]) => ({
      label: name(id),
      after: m.f1,
      before: baseline.per_pattern[id as keyof typeof baseline.per_pattern].f1,
      support: m.support,
    }))
    .sort((a, b) => b.after - a.after)
  const splits = dataReport.splits
  const exp = exportReport.val_shipped_blend

  return (
    <div className="mx-auto max-w-4xl space-y-10">
      <header className="space-y-2">
        <h2 className="text-2xl font-bold">Lab</h2>
        <p className="text-slate-600 dark:text-slate-300">
          The models behind Spar, how they were trained and evaluated, and what they can&apos;t do. Every number here
          is read from the committed reports in <code className="text-sm">ml/reports/</code>.
        </p>
      </header>

      <section className="space-y-8">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold">Model #1: pattern classifier</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Reads a problem description and estimates which of Spar&apos;s 14 interview patterns it needs. It powers
            the &ldquo;Which pattern is this?&rdquo; hint and runs entirely in the browser.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Macro-F1, newest problems" value={fmt(shipped.macro_f1)} sub={`baseline ${fmt(baseline.macro_f1)}`} />
          <Stat label="Top-1 accuracy" value={fmt(shipped.top1_accuracy)} sub={`baseline ${fmt(baseline.top1_accuracy)}`} />
          <Stat label="Download" value={`~${Math.round(exportReport.sizes_mb.onnx_int8 + exportReport.sizes_mb.tfidf_json)} MB`} sub="8-bit model + TF-IDF" />
          <Stat label="Per problem" value="~20 ms" sub="Edge, development laptop" />
        </div>

        <Section title="Try it">
          <PatternHint />
          <Benchmark />
        </Section>

        <Section title={`Test results: ${final.test_rows} newest problems (Dec 2023 to Mar 2025)`}>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
                <tr>
                  <th className="px-3 py-2 font-medium">Model</th>
                  <th className="px-3 py-2 text-right font-medium">In browser</th>
                  <th className="px-3 py-2 text-right font-medium">Macro-F1</th>
                  <th className="px-3 py-2 text-right font-medium">Macro-F1 (n ≥ 5)</th>
                  <th className="px-3 py-2 text-right font-medium">Micro-F1</th>
                  <th className="px-3 py-2 text-right font-medium">Top-1</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {MODELS.map(({ key, label, size, note }) => {
                  const m = T[key] as Metrics
                  return (
                    <tr key={key} className={`border-t border-slate-100 dark:border-slate-800 ${note === 'shipped' ? 'bg-indigo-50/60 font-medium dark:bg-indigo-950/40' : ''}`}>
                      <td className="px-3 py-2">
                        {label}
                        {note && <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-normal text-slate-600 dark:bg-slate-800 dark:text-slate-300">{note}</span>}
                      </td>
                      <td className="px-3 py-2 text-right">{size}</td>
                      <td className="px-3 py-2 text-right">{fmt(m.macro_f1)}</td>
                      <td className="px-3 py-2 text-right">{fmt(m.macro_f1_support_ge_5)}</td>
                      <td className="px-3 py-2 text-right">{fmt(m.micro_f1)}</td>
                      <td className="px-3 py-2 text-right">{fmt(m.top1_accuracy)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            The shipped configuration was chosen on the validation split and frozen before the test split was scored
            once. Differences of 1 to 2 points are within the noise of {final.test_rows} problems.
          </p>
        </Section>

        <Section title="F1 per pattern on the test set">
          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <DumbbellChart rows={rows} beforeName="TF-IDF baseline" afterName="Shipped model" minSupport={5} />
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Keyword patterns (trees, linked lists, graphs) are easy for every model. Shape patterns, where you have to
            recognise the problem&apos;s structure (two pointers, monotonic stack, prefix sum), are still hard: exactly
            the gap Spar&apos;s drills exist to train.
          </p>
        </Section>

        <div className="grid gap-8 md:grid-cols-2">
          <Section title="Distillation ablation (validation)">
            <table className="w-full text-sm tabular-nums">
              <thead className="text-left text-xs text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="py-1 font-medium">MiniLM, 30 epochs</th>
                  <th className="py-1 text-right font-medium">Macro-F1</th>
                  <th className="py-1 text-right font-medium">Top-1</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-slate-100 dark:border-slate-800">
                  <td className="py-1">True labels only</td>
                  <td className="py-1 text-right">{fmt(ablationOff.val.macro_f1)}</td>
                  <td className="py-1 text-right">{fmt(ablationOff.val.top1_accuracy)}</td>
                </tr>
                <tr className="border-t border-slate-100 font-medium dark:border-slate-800">
                  <td className="py-1">+ out-of-fold teacher (distilled)</td>
                  <td className="py-1 text-right">{fmt(ablationOn.val.macro_f1)}</td>
                  <td className="py-1 text-right">{fmt(ablationOn.val.top1_accuracy)}</td>
                </tr>
              </tbody>
            </table>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              The teacher (RoBERTa + TF-IDF) scores each training problem from folds that never saw it, so the student
              learns from honest soft labels, not echoes.
            </p>
          </Section>

          <Section title="Browser export (validation, shipped blend)">
            <table className="w-full text-sm tabular-nums">
              <thead className="text-left text-xs text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="py-1 font-medium">Student weights</th>
                  <th className="py-1 text-right font-medium">Size</th>
                  <th className="py-1 text-right font-medium">Macro-F1</th>
                  <th className="py-1 text-right font-medium">Top-1</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-slate-100 dark:border-slate-800">
                  <td className="py-1">PyTorch fp32</td>
                  <td className="py-1 text-right">{exportReport.sizes_mb.onnx_fp32.toFixed(0)} MB</td>
                  <td className="py-1 text-right">{fmt(exp.torch.macro_f1)}</td>
                  <td className="py-1 text-right">{fmt(exp.torch.top1_accuracy)}</td>
                </tr>
                <tr className="border-t border-slate-100 font-medium dark:border-slate-800">
                  <td className="py-1">ONNX int8, per-channel</td>
                  <td className="py-1 text-right">{exportReport.sizes_mb.onnx_int8.toFixed(0)} MB</td>
                  <td className="py-1 text-right">{fmt(exp.onnx_int8.macro_f1)}</td>
                  <td className="py-1 text-right">{fmt(exp.onnx_int8.top1_accuracy)}</td>
                </tr>
              </tbody>
            </table>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Same top pattern as PyTorch on {Math.round(exportReport.top1_agreement_int8_vs_torch * 100)}% of problems.
              The browser&apos;s TypeScript TF-IDF and ONNX outputs are tested against Python&apos;s on{' '}
              {exportReport.parity_cases} of Spar&apos;s own drill prompts.
            </p>
          </Section>
        </div>

        <Section title="Model card">
          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[10rem_1fr]">
            <dt className="font-medium">Data</dt>
            <dd className="text-slate-600 dark:text-slate-300">
              {dataReport.problems_total.toLocaleString()} LeetCode problems from LeetCodeDataset (Apache-2.0 per its
              card); {dataReport.dropped_no_pattern} with no matching pattern dropped. Split by release date: train{' '}
              {splits.train.rows} ({splits.train.date_from} to {splits.train.date_to}), validation {splits.val.rows},
              test {splits.test.rows} (newest).
            </dd>
            <dt className="font-medium">Labels</dt>
            <dd className="text-slate-600 dark:text-slate-300">
              LeetCode topic tags mapped onto Spar&apos;s 14 patterns. Tags are often incomplete, which caps every
              model&apos;s score. Intervals has no tag and is labelled from problem names, so it is weak and rare.
            </dd>
            <dt className="font-medium">Model</dt>
            <dd className="text-slate-600 dark:text-slate-300">
              all-MiniLM-L6-v2 (22M parameters) distilled from a RoBERTa-base + TF-IDF teacher, blended 0.4 / 0.6 with
              TF-IDF + logistic regression; ONNX, 8-bit per-channel weights, run with Transformers.js.
            </dd>
            <dt className="font-medium">Intended use</dt>
            <dd className="text-slate-600 dark:text-slate-300">
              A hint for practice: which patterns a problem probably needs. Not a grader, and never used to score you.
            </dd>
            <dt className="font-medium">Limits</dt>
            <dd className="text-slate-600 dark:text-slate-300">
              Top-1 is about 52% on unseen problems; trained on English LeetCode-style statements only; trained by one
              person on one laptop GPU (RTX 4060) with fixed seeds, without repeated runs.
            </dd>
            <dt className="font-medium">Licensing</dt>
            <dd className="text-slate-600 dark:text-slate-300">
              LeetCode problem text was used for training only: it is not in this app or its repository. A dataset
              license can&apos;t grant rights LeetCode claims over its problems, so the weights are shared for
              education and demonstration.
            </dd>
          </dl>
        </Section>
      </section>

      <ModelTwo />

      <section className="space-y-2 rounded-xl border border-dashed border-slate-300 p-5 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-300">
        <h2 className="font-semibold text-slate-800 dark:text-slate-100">Coming next</h2>
        <p>
          The adaptive placement test&apos;s simulation study (how many questions it needs versus a fixed test), and
          Model #3 (time complexity from code).
        </p>
      </section>
    </div>
  )
}

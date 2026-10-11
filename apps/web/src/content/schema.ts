import { z } from 'zod'

import { DIFFICULTIES, ITEM_TYPES, LAYERS } from './constants'

export type { Difficulty, Layer } from './constants'

const slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'must be a kebab-case slug')

export const patternSchema = z.strictObject({
  id: slug,
  name: z.string().min(1),
  layer: z.enum(LAYERS),
  prerequisites: z.array(slug),
  summary: z.string().min(1),
  signals: z.array(z.string().min(1)),
})

export const itemSchema = z.strictObject({
  id: z.string().regex(/^(pat|cx)-\d{3}$/, 'must look like pat-001 or cx-001'),
  type: z.enum(ITEM_TYPES),
  difficulty: z.enum(DIFFICULTIES),
  est_seconds: z.number().int().min(10).max(600),
  pattern_ids: z.array(slug).min(1),
  prompt: z.string().min(1),
  choices: z.array(z.string().min(1)).min(2).max(6),
  answer: z.string().min(1),
  signals: z.array(z.string().min(1)).default([]),
  explanation: z.string().min(1),
})

/** A LeetCode problem reference: public metadata plus our own tags, never problem text. */
export const lcProblemSchema = z.strictObject({
  slug,
  number: z.number().int().positive(),
  difficulty: z.enum(DIFFICULTIES),
  pattern_ids: z.array(slug).min(1),
})

export type Pattern = z.infer<typeof patternSchema>
export type Item = z.infer<typeof itemSchema>
export type LcProblem = z.infer<typeof lcProblemSchema>

export interface Content {
  patterns: Pattern[]
  patternsById: Map<string, Pattern>
  items: Item[]
  itemsById: Map<string, Item>
  lcCatalog: LcProblem[]
  lcBySlug: Map<string, LcProblem>
}

export interface RawItemFile {
  /** Path or file name, used for error messages and the id/file-name check. */
  file: string
  data: unknown
}

/** Parses and cross-checks all content. Throws one error listing every problem found. */
export function validateContent(rawPatterns: unknown, rawItems: RawItemFile[], rawCatalog: unknown = []): Content {
  const problems: string[] = []

  const patternsResult = z.array(patternSchema).safeParse(rawPatterns)
  if (!patternsResult.success) {
    throw new Error(`patterns.yaml is invalid:\n${z.prettifyError(patternsResult.error)}`)
  }
  const patterns = patternsResult.data
  const patternsById = new Map<string, Pattern>()
  for (const p of patterns) {
    if (patternsById.has(p.id)) problems.push(`patterns.yaml: duplicate pattern id "${p.id}"`)
    patternsById.set(p.id, p)
  }
  for (const p of patterns) {
    for (const pre of p.prerequisites) {
      if (!patternsById.has(pre)) problems.push(`patterns.yaml: ${p.id} has unknown prerequisite "${pre}"`)
      if (pre === p.id) problems.push(`patterns.yaml: ${p.id} lists itself as a prerequisite`)
    }
  }

  const items: Item[] = []
  const itemsById = new Map<string, Item>()
  for (const { file, data } of rawItems) {
    const result = itemSchema.safeParse(data)
    if (!result.success) {
      problems.push(`${file}:\n${z.prettifyError(result.error)}`)
      continue
    }
    const item = result.data
    const baseName = file.split(/[\\/]/).pop()?.replace(/\.ya?ml$/, '')
    if (baseName !== item.id) problems.push(`${file}: id "${item.id}" does not match the file name`)
    if (itemsById.has(item.id)) problems.push(`${file}: duplicate item id "${item.id}"`)
    if (!item.choices.includes(item.answer)) problems.push(`${file}: answer "${item.answer}" is not one of the choices`)
    if (new Set(item.choices).size !== item.choices.length) problems.push(`${file}: choices contain duplicates`)
    for (const pid of item.pattern_ids) {
      if (!patternsById.has(pid)) problems.push(`${file}: unknown pattern id "${pid}"`)
    }
    if (item.type === 'pattern') {
      for (const c of item.choices) {
        if (!patternsById.has(c)) problems.push(`${file}: pattern choice "${c}" is not a pattern id`)
      }
      if (!item.pattern_ids.includes(item.answer)) {
        problems.push(`${file}: a pattern item's answer must be one of its pattern_ids`)
      }
    }
    itemsById.set(item.id, item)
    items.push(item)
  }

  const catalogResult = z.array(lcProblemSchema).safeParse(rawCatalog)
  if (!catalogResult.success) {
    throw new Error(`lc_catalog.yaml is invalid:\n${z.prettifyError(catalogResult.error)}`)
  }
  const lcCatalog = catalogResult.data
  const lcBySlug = new Map<string, LcProblem>()
  const lcNumbers = new Set<number>()
  for (const lc of lcCatalog) {
    if (lcBySlug.has(lc.slug)) problems.push(`lc_catalog.yaml: duplicate slug "${lc.slug}"`)
    if (lcNumbers.has(lc.number)) problems.push(`lc_catalog.yaml: duplicate number ${lc.number}`)
    for (const pid of lc.pattern_ids) {
      if (!patternsById.has(pid)) problems.push(`lc_catalog.yaml: ${lc.slug} has unknown pattern id "${pid}"`)
    }
    lcBySlug.set(lc.slug, lc)
    lcNumbers.add(lc.number)
  }

  if (problems.length > 0) throw new Error(`Content is invalid:\n${problems.join('\n')}`)
  items.sort((a, b) => a.id.localeCompare(b.id))
  return { patterns, patternsById, items, itemsById, lcCatalog, lcBySlug }
}

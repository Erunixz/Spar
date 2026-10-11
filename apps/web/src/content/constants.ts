// Kept free of zod so the browser bundle can import them cheaply.
export const LAYERS = ['foundations', 'core', 'structures', 'advanced'] as const
export const DIFFICULTIES = ['easy', 'medium', 'hard'] as const
export const ITEM_TYPES = ['pattern', 'complexity'] as const

export type Layer = (typeof LAYERS)[number]
export type Difficulty = (typeof DIFFICULTIES)[number]

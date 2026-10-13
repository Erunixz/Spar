/** Distinct, readable pointer colours; a pointer keeps its colour as long as its name does. */
const POINTER_COLORS = [
  'text-indigo-600 dark:text-indigo-300',
  'text-rose-600 dark:text-rose-300',
  'text-emerald-600 dark:text-emerald-300',
  'text-amber-600 dark:text-amber-300',
  'text-sky-600 dark:text-sky-300',
  'text-fuchsia-600 dark:text-fuchsia-300',
]

export function pointerColor(name: string): string {
  let h = 0
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return POINTER_COLORS[h % POINTER_COLORS.length]!
}

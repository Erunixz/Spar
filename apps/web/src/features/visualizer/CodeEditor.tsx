import { python } from '@codemirror/lang-python'
import { Compartment, EditorState, StateEffect, StateField, type Extension } from '@codemirror/state'
import { oneDark } from '@codemirror/theme-one-dark'
import { Decoration, EditorView, keymap, type DecorationSet } from '@codemirror/view'
import { basicSetup } from 'codemirror'
import { useEffect, useRef } from 'react'

interface Props {
  value: string
  onChange: (value: string) => void
  /** 1-based line the trace is on, highlighted. */
  activeLine: number | null
  /** 1-based line of an error, highlighted in red. */
  errorLine: number | null
  onRun: () => void
}

const setLines = StateEffect.define<{ active: number | null; error: number | null }>()

const lineHighlights = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes)
    for (const e of tr.effects) {
      if (!e.is(setLines)) continue
      const { active, error } = e.value
      const doc = tr.state.doc
      const valid = (n: number | null): n is number => n !== null && n >= 1 && n <= doc.lines
      const marks = []
      // The error line wins when both point at the same line.
      if (valid(error)) marks.push(Decoration.line({ class: 'cm-trace-error' }).range(doc.line(error).from))
      if (valid(active) && active !== error) {
        marks.push(Decoration.line({ class: 'cm-trace-active' }).range(doc.line(active).from))
      }
      deco = Decoration.set(marks, true)
    }
    return deco
  },
  provide: (f) => EditorView.decorations.from(f),
})

const baseTheme = EditorView.theme({
  '&': { fontSize: '14px', height: '100%' },
  '.cm-scroller': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' },
  // Only the traced line should look current; hide the cursor-line highlight.
  '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'transparent' },
  '.cm-trace-active': { backgroundColor: 'rgba(99, 102, 241, 0.18)', boxShadow: 'inset 3px 0 0 #6366f1' },
  '.cm-trace-error': { backgroundColor: 'rgba(244, 63, 94, 0.18)', boxShadow: 'inset 3px 0 0 #f43f5e' },
})

const darkQuery = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null
const themeFor = (dark: boolean): Extension => (dark ? oneDark : [])

export function CodeEditor({ value, onChange, activeLine, errorLine, onRun }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  // Callbacks change every render; read the latest through refs.
  const onChangeRef = useRef(onChange)
  const onRunRef = useRef(onRun)
  useEffect(() => {
    onChangeRef.current = onChange
    onRunRef.current = onRun
  })

  useEffect(() => {
    const theme = new Compartment()
    const v = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          keymap.of([{ key: 'Mod-Enter', run: () => (onRunRef.current(), true) }]),
          basicSetup,
          python(),
          lineHighlights,
          baseTheme,
          theme.of(themeFor(darkQuery?.matches ?? false)),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) onChangeRef.current(u.state.doc.toString())
          }),
        ],
      }),
    })
    view.current = v
    const onScheme = (e: MediaQueryListEvent) => v.dispatch({ effects: theme.reconfigure(themeFor(e.matches)) })
    darkQuery?.addEventListener('change', onScheme)
    return () => {
      darkQuery?.removeEventListener('change', onScheme)
      v.destroy()
      view.current = null
    }
    // The editor is created once; `value` changes from outside are synced below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Replace the document when the value changes from outside (e.g. picking a sample).
  useEffect(() => {
    const v = view.current
    if (v && v.state.doc.toString() !== value) {
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } })
    }
  }, [value])

  useEffect(() => {
    const v = view.current
    if (!v) return
    v.dispatch({ effects: setLines.of({ active: activeLine, error: errorLine }) })
    if (activeLine && activeLine <= v.state.doc.lines) {
      v.dispatch({ effects: EditorView.scrollIntoView(v.state.doc.line(activeLine).from, { y: 'nearest' }) })
    }
  }, [activeLine, errorLine])

  return <div ref={host} className="h-full min-h-72 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700" />
}

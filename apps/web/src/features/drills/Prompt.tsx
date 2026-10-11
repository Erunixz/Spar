const FENCE = /```[a-z]*\n([\s\S]*?)```/g

/** Renders item prompts: plain paragraphs plus fenced code blocks. */
export function Prompt({ text }: { text: string }) {
  const parts: { kind: 'text' | 'code'; value: string }[] = []
  let last = 0
  for (const match of text.matchAll(FENCE)) {
    parts.push({ kind: 'text', value: text.slice(last, match.index) })
    parts.push({ kind: 'code', value: match[1]!.replace(/\n$/, '') })
    last = match.index + match[0].length
  }
  parts.push({ kind: 'text', value: text.slice(last) })

  return (
    <div className="space-y-3">
      {parts.map((part, i) =>
        part.kind === 'code' ? (
          <pre
            key={i}
            className="overflow-x-auto rounded-lg bg-slate-900 p-4 font-mono text-sm leading-relaxed text-slate-100"
          >
            <code>{part.value}</code>
          </pre>
        ) : (
          part.value
            .split(/\n\s*\n/)
            .map((p) => p.replace(/\s*\n\s*/g, ' ').trim())
            .filter(Boolean)
            .map((p, j) => (
              <p key={`${i}-${j}`} className="text-lg leading-relaxed">
                {p}
              </p>
            ))
        ),
      )}
    </div>
  )
}

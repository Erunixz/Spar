import { useEffect, useRef, useState } from 'react'
import { canvasToPng, CARD_HEIGHT, CARD_WIDTH, drawCard } from './drawCard'
import type { CardData } from './cardData'

interface Props {
  data: CardData
  onClose: () => void
}

const FILE_NAME = 'spar-skill-graph.png'

/** Preview of the share image with download, copy and (where supported) native share. */
export function ShareDialog({ data, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [image, setImage] = useState<{ png: Blob; url: string } | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const png = image?.png ?? null
  const previewUrl = image?.url ?? null

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let url: string | null = null
    let cancelled = false
    drawCard(canvas, data)
    canvasToPng(canvas).then(
      (blob) => {
        if (cancelled) return
        url = URL.createObjectURL(blob)
        setImage({ png: blob, url })
      },
      (e: Error) => setStatus(e.message),
    )
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [data])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const file = png ? new File([png], FILE_NAME, { type: 'image/png' }) : null
  const canCopy = typeof ClipboardItem !== 'undefined' && !!navigator.clipboard?.write
  const canShare = !!file && !!navigator.canShare?.({ files: [file] })

  function download() {
    if (!previewUrl) return
    const a = document.createElement('a')
    a.href = previewUrl
    a.download = FILE_NAME
    a.click()
  }

  async function copy() {
    if (!png) return
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })])
      setStatus('Copied. Paste it into a post or message.')
    } catch {
      setStatus("Couldn't copy here; use Download instead.")
    }
  }

  async function share() {
    if (!file) return
    try {
      await navigator.share({ files: [file], title: 'My interview skill graph' })
    } catch {
      // The user closed the share sheet; nothing to report.
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Share your skill graph"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-3xl space-y-4 rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-900">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Share your skill graph</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md px-2 text-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
          >
            ×
          </button>
        </div>

        <canvas ref={canvasRef} className="hidden" width={CARD_WIDTH} height={CARD_HEIGHT} />
        {previewUrl ? (
          <img
            src={previewUrl}
            alt="Your skill graph as an image"
            className="w-full rounded-lg border border-slate-200 dark:border-slate-700"
            style={{ aspectRatio: `${CARD_WIDTH} / ${CARD_HEIGHT}` }}
          />
        ) : (
          <div
            className="w-full animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800"
            style={{ aspectRatio: `${CARD_WIDTH} / ${CARD_HEIGHT}` }}
          />
        )}

        <p className="text-xs text-slate-500 dark:text-slate-400">
          The image shows only your pattern scores and totals; no name or account details.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={download}
            disabled={!png}
            className="rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            Download PNG
          </button>
          {canCopy && (
            <button
              type="button"
              onClick={() => void copy()}
              disabled={!png}
              className="rounded-lg border border-slate-300 px-4 py-2 font-medium hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              Copy image
            </button>
          )}
          {canShare && (
            <button
              type="button"
              onClick={() => void share()}
              className="rounded-lg border border-slate-300 px-4 py-2 font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              Share…
            </button>
          )}
          {status && <span className="text-sm text-slate-600 dark:text-slate-300">{status}</span>}
        </div>
      </div>
    </div>
  )
}

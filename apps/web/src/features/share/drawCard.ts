import type { MasteryTier } from '../skillmap/tier'
import type { CardData } from './cardData'

/** Open Graph size, so the image previews well when posted. */
export const CARD_WIDTH = 1200
export const CARD_HEIGHT = 630

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
const C = {
  bg: '#f8fafc',
  panel: '#ffffff',
  border: '#e2e8f0',
  text: '#0f172a',
  muted: '#64748b',
  faint: '#94a3b8',
  track: '#f1f5f9',
  brand: '#4f46e5',
}
const TIER: Record<MasteryTier, string> = {
  none: '#cbd5e1',
  low: '#f43f5e',
  mid: '#f59e0b',
  high: '#10b981',
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

/** Draws the share card at 1200x630 CSS pixels; scale > 1 renders a sharper image. */
export function drawCard(canvas: HTMLCanvasElement, data: CardData, scale = 2) {
  canvas.width = CARD_WIDTH * scale
  canvas.height = CARD_HEIGHT * scale
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D is not available')
  ctx.scale(scale, scale)
  ctx.textBaseline = 'alphabetic'

  ctx.fillStyle = C.bg
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT)
  ctx.fillStyle = C.brand
  ctx.fillRect(0, 0, CARD_WIDTH, 8)

  // Header
  const pad = 56
  ctx.fillStyle = C.text
  ctx.font = `700 40px ${FONT}`
  ctx.fillText('My interview skill graph', pad, 84)
  ctx.fillStyle = C.muted
  ctx.font = `400 20px ${FONT}`
  ctx.fillText(`${data.practiced} of ${data.rows.length} patterns practiced · ${data.date}`, pad, 118)

  // Stats, right-aligned in the header
  const stats: [string, string][] = [
    [String(data.answered), 'drills answered'],
    [data.accuracy === null ? '—' : `${data.accuracy}%`, 'accuracy'],
    [String(data.lcSolved), 'LeetCode solved'],
  ]
  let sx = CARD_WIDTH - pad
  ctx.textAlign = 'right'
  for (const [value, label] of [...stats].reverse()) {
    ctx.fillStyle = C.text
    ctx.font = `700 34px ${FONT}`
    ctx.fillText(value, sx, 84)
    ctx.fillStyle = C.muted
    ctx.font = `400 16px ${FONT}`
    ctx.fillText(label, sx, 112)
    const w = Math.max(ctx.measureText(label).width, 80)
    sx -= w + 36
  }
  ctx.textAlign = 'left'

  // Pattern rows: two columns inside a panel
  const panelY = 150
  const panelH = CARD_HEIGHT - panelY - 64
  ctx.fillStyle = C.panel
  roundRect(ctx, pad - 16, panelY, CARD_WIDTH - 2 * (pad - 16), panelH, 18)
  ctx.fill()
  ctx.strokeStyle = C.border
  ctx.lineWidth = 1
  ctx.stroke()

  const perCol = Math.ceil(data.rows.length / 2)
  const colGap = 48
  const colW = (CARD_WIDTH - 2 * pad - colGap) / 2
  const rowH = (panelH - 32) / perCol
  const nameW = 230
  const numW = 48
  const barW = colW - nameW - numW - 16

  data.rows.forEach((row, i) => {
    const col = Math.floor(i / perCol)
    const x = pad + col * (colW + colGap)
    const y = panelY + 16 + (i % perCol) * rowH
    const mid = y + rowH / 2

    ctx.fillStyle = row.mastery === null ? C.faint : C.text
    ctx.font = `500 19px ${FONT}`
    ctx.textBaseline = 'middle'
    ctx.fillText(row.name, x, mid, nameW - 12)

    const bx = x + nameW
    const bh = 12
    ctx.fillStyle = C.track
    roundRect(ctx, bx, mid - bh / 2, barW, bh, bh / 2)
    ctx.fill()
    if (row.mastery !== null && row.band) {
      const [lo, hi] = row.band
      ctx.globalAlpha = 0.25
      ctx.fillStyle = TIER[row.tier]
      roundRect(ctx, bx + (barW * lo) / 100, mid - bh / 2, (barW * (hi - lo)) / 100, bh, bh / 2)
      ctx.fill()
      ctx.globalAlpha = 1
      roundRect(ctx, bx, mid - bh / 2, Math.max(bh, (barW * row.mastery) / 100), bh, bh / 2)
      ctx.fill()
    }

    ctx.textAlign = 'right'
    ctx.fillStyle = row.mastery === null ? C.faint : TIER[row.tier]
    ctx.font = `700 20px ${FONT}`
    ctx.fillText(row.mastery === null ? '—' : String(row.mastery), x + colW, mid)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
  })

  // Footer
  ctx.fillStyle = C.brand
  ctx.font = `700 22px ${FONT}`
  ctx.fillText('Spar', pad, CARD_HEIGHT - 24)
  const brandW = ctx.measureText('Spar').width
  ctx.fillStyle = C.muted
  ctx.font = `400 17px ${FONT}`
  ctx.fillText('· find your weakest interview patterns and drill them', pad + brandW + 8, CARD_HEIGHT - 24)
  ctx.textAlign = 'right'
  ctx.fillStyle = C.faint
  ctx.fillText('mastery = estimated chance on an average item · shaded = 95% range', CARD_WIDTH - pad, CARD_HEIGHT - 24)
  ctx.textAlign = 'left'
}

export function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not create the image'))), 'image/png'),
  )
}

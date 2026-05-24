/**
 * strokeExporter — vector → SVG → high-resolution PNG.
 *
 * We deliberately do NOT screenshot the live DOM. Strokes are stored as
 * structured vector data and re-rasterised here at the requested resolution
 * so exports stay crisp at any size. Hooked into the share / save pipeline
 * by the caller — the export functions here are pure.
 */

import { getStroke } from 'perfect-freehand'
import { TOOL_CONFIG, strokeOutlineToSvgPath } from './drawingPresets'

/**
 * Build a self-contained <svg> string for a set of strokes at the given
 * pixel dimensions. Useful as a standalone deliverable or as the source for
 * the rasteriser below.
 *
 * @param {Array} strokes   normalised stroke records
 * @param {object} opts
 *   width, height — output dimensions in CSS px
 *   background    — optional paper colour, e.g. '#FAFAF8'
 */
export function strokesToSvg(strokes, { width, height, background = null } = {}) {
  const bg = background
    ? `<rect width="${width}" height="${height}" fill="${background}"/>`
    : ''
  const paths = strokes.map(s => {
    const cfg = TOOL_CONFIG[s.tool]
    if (!cfg || !s.points?.length) return ''
    const size   = width * cfg.sizeRatio
    const inputs = s.points.map(p => [p.x * width, p.y * height, p.pressure])
    const outline = getStroke(inputs, { ...cfg.freehand, size })
    const d = strokeOutlineToSvgPath(outline)
    return `<path d="${d}" fill="${s.color}" opacity="${cfg.opacity}" fill-rule="nonzero"/>`
  }).join('')
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" ` +
    `width="${width}" height="${height}">${bg}${paths}</svg>`
  )
}

/**
 * Rasterise strokes to a canvas at `pixelRatio` × CSS dims. Default 3× hits
 * print-quality without ballooning memory. Returns the canvas — callers can
 * toDataURL / toBlob from there.
 */
export async function rasteriseStrokes(strokes, { width, height, pixelRatio = 3, background = null } = {}) {
  const svg = strokesToSvg(strokes, { width, height, background })
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
  const url  = URL.createObjectURL(blob)
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image()
      i.onload  = () => resolve(i)
      i.onerror = (e) => reject(e)
      i.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width  = Math.round(width  * pixelRatio)
    canvas.height = Math.round(height * pixelRatio)
    const ctx = canvas.getContext('2d')
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    if (background) {
      ctx.fillStyle = background
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return canvas
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * One-shot: vector strokes → PNG dataURL at the requested resolution.
 * Returns null for empty stroke sets.
 */
export async function strokesToPngDataUrl(strokes, opts) {
  if (!strokes?.length) return null
  const canvas = await rasteriseStrokes(strokes, opts)
  return canvas.toDataURL('image/png')
}

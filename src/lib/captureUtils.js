import { toPng } from 'html-to-image'

/* ─────────────────────────────────────────────────────────────────────────
   Single source of truth for capturing the live paper as a PNG.

   Used by:
     • WritingScreen → Export-PNG button (dev)
     • ShareSheet    → "Download as image" action (user-facing)
     • RecipientScreen → save-as-image action

   Why one helper instead of three: each surface used to do its own thing
   with subtle bugs (Safari font-loading, mid-stroke animation captures,
   stains-layer-renders-black-via-feTurbulence, drop-shadow getting baked
   into the wrong bounds). Concentrating the workarounds here means a fix
   in one place lands everywhere a user might download the letter.

   Notes on the trickier bits:
     • Font embedding (Safari): Safari refuses to render webfonts inside
       a captured DOM clone unless @font-face is inlined into the cloned
       document's <head>. We fetch the Caveat file, base64 it, and inject.
     • Animation freezing: glyph SVG paths animate via stroke-dashoffset
       on mount; if we capture mid-animation, characters look half-drawn.
       The onclone callback forces transition-duration: 0 and snaps
       stroke-dashoffset to 0 so every glyph renders fully on capture.
     • Drop-shadow: lives on .paperWrap (parent of .paper). We zero its
       filter for the duration of the capture so the shadow doesn't end
       up inside the captured paper bitmap.
     • Stains layer: USED to be a black-rendering issue when the stains
       grain was an SVG <feTurbulence>. The grain is now a pre-rasterized
       PNG (see PaperCanvas.module.css → .stains url), so html-to-image
       handles it natively. The old swap-to-gradients-only workaround
       has been removed.
   ───────────────────────────────────────────────────────────────────── */

async function bufferToBase64(buf) {
  const bytes = new Uint8Array(buf)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

async function buildFontEmbedCSS() {
  try {
    const res = await fetch('/fonts/caveat-full.ttf')
    if (!res.ok) return undefined
    const b64 = await bufferToBase64(await res.arrayBuffer())
    return `@font-face { font-family: 'Caveat'; src: url('data:font/ttf;base64,${b64}') format('truetype'); font-weight: 400 700; font-style: normal; }`
  } catch {
    return undefined
  }
}

/**
 * captureCanvas — captures the live paper DOM as an HTMLCanvasElement.
 *
 * Accepts either a React ref ({ current: HTMLElement }) or a plain DOM
 * element. The element passed in is the SCOPE — we look inside it for
 * [data-paper-canvas]; if not found we capture the element itself.
 *
 * Returns a Promise<HTMLCanvasElement>. Callers convert to data URL /
 * blob and trigger their own downloads (web share, anchor download,
 * iOS overlay long-press, etc).
 */
export async function captureCanvas(refOrElement) {
  // Unbox ref-or-element so callers can pass whatever they have.
  const containerEl = (refOrElement && 'current' in refOrElement)
    ? refOrElement.current
    : refOrElement
  if (!containerEl) throw new Error('captureCanvas: no element')

  const paperEl = containerEl.querySelector?.('[data-paper-canvas]') ?? containerEl

  // Drop the .paperWrap drop-shadow during capture so it doesn't get
  // baked INSIDE the bitmap. Restored in `finally` below — leaving it
  // off would corrupt the live editor view.
  const wrapEl = paperEl.parentElement
  const savedFilter = wrapEl?.style.filter ?? ''
  if (wrapEl) wrapEl.style.filter = 'none'

  let dataUrl
  try {
    const fontEmbedCSS = await buildFontEmbedCSS()
    const bgColor = window.getComputedStyle(paperEl).backgroundColor || '#ffffff'

    const opts = {
      pixelRatio: 3,
      backgroundColor: bgColor,
      onclone: (_doc) => {
        // Inject Caveat directly — Safari needs @font-face in a real
        // <style> tag inside the cloned document to render the text.
        if (fontEmbedCSS) {
          const fontStyle = _doc.createElement('style')
          fontStyle.textContent = fontEmbedCSS
          _doc.head.appendChild(fontStyle)
        }
        // Freeze SVG stroke animations so glyph chars are fully drawn
        // in the capture (otherwise they render mid-stroke and look
        // like missing letters).
        const animStyle = _doc.createElement('style')
        animStyle.textContent = [
          '*, *::before, *::after {',
          '  animation-duration: 0.001ms !important;',
          '  animation-delay: 0ms !important;',
          '  transition-duration: 0ms !important;',
          '}',
          'svg path, svg polyline, svg line {',
          '  stroke-dashoffset: 0 !important;',
          '  stroke-dasharray: none !important;',
          '}',
        ].join('\n')
        _doc.head.appendChild(animStyle)
      },
      ...(fontEmbedCSS ? { fontEmbedCSS } : {}),
    }

    // Safari needs two toPng calls: the first warms up resource loading
    // (images, fonts) for the cloned document; the second actually captures.
    // Without the warmup, Safari produces a blank or partial image on the
    // first paint of any letter that includes uploaded media frames.
    await toPng(paperEl, opts).catch(() => {})
    dataUrl = await toPng(paperEl, opts)
  } finally {
    // Always restore the drop-shadow, even if capture threw — leaving
    // it off would make the live editor view look flat.
    if (wrapEl) wrapEl.style.filter = savedFilter
  }

  // Re-rasterize through a fresh canvas with the explicit background
  // color filled first — guarantees no transparent pixels even on
  // edge cases where the captured paper had alpha somewhere.
  const bgColor = window.getComputedStyle(paperEl).backgroundColor || '#ffffff'
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const out = document.createElement('canvas')
      out.width  = img.naturalWidth
      out.height = img.naturalHeight
      const ctx  = out.getContext('2d')
      ctx.fillStyle = bgColor
      ctx.fillRect(0, 0, out.width, out.height)
      ctx.drawImage(img, 0, 0)
      resolve(out)
    }
    img.onerror = reject
    img.src = dataUrl
  })
}

/**
 * captureCanvasAsPng — convenience wrapper that captures + triggers a
 * file download. Used by the dev Export-PNG button. Other surfaces
 * (ShareSheet, RecipientScreen) call captureCanvas() directly because
 * they need the canvas for richer flows (mobile long-press overlay,
 * Web Share API blob handoff, etc.) rather than a plain download.
 */
export async function captureCanvasAsPng({ filename = 'dearly-note.png' } = {}) {
  const canvas = await captureCanvas(document.querySelector('[data-paper-canvas]'))
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob) { reject(new Error('toBlob failed')); return }
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href     = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      resolve({ filename, width: canvas.width, height: canvas.height })
    }, 'image/png')
  })
}

import { toPng } from 'html-to-image'

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

export async function captureCanvas(paperRef) {
  const containerEl = paperRef.current
  if (!containerEl) throw new Error('No element')

  const paperEl = containerEl.querySelector('[data-paper-canvas]') ?? containerEl

  const wrapEl = paperEl.parentElement
  const savedFilter = wrapEl?.style.filter ?? ''
  if (wrapEl) wrapEl.style.filter = 'none'

  const fontEmbedCSS = await buildFontEmbedCSS()
  const bgColor = window.getComputedStyle(paperEl).backgroundColor || '#ffffff'

  const opts = {
    pixelRatio: 3,
    backgroundColor: bgColor,
    onclone: (_doc) => {
      // Inject font directly into cloned document — Safari ignores fontEmbedCSS
      // option alone and needs the @font-face in a real <style> tag to render text.
      if (fontEmbedCSS) {
        const fontStyle = _doc.createElement('style')
        fontStyle.textContent = fontEmbedCSS
        _doc.head.appendChild(fontStyle)
      }
      // Freeze all SVG stroke animations so TegakiRenderer chars are fully drawn.
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
        // The SVG feTurbulence grain in [data-stains] renders as solid black
        // in html-to-image canvas captures. Override to gradients-only so the
        // vignette and edge aging still show without the black fill.
        '[data-stains] {',
        '  background:',
        '    radial-gradient(ellipse 92% 88% at 50% 50%, transparent 60%, rgba(88,50,14,0.16) 100%),',
        '    linear-gradient(to bottom, rgba(80,45,12,0.09) 0%, transparent 18%),',
        '    linear-gradient(to top,    rgba(80,45,12,0.11) 0%, transparent 18%),',
        '    linear-gradient(to right,  rgba(80,45,12,0.07) 0%, transparent 14%),',
        '    linear-gradient(to left,   rgba(80,45,12,0.07) 0%, transparent 14%),',
        '    radial-gradient(ellipse 34% 30% at   0%   0%, rgba(68,38,8,0.09) 0%, transparent 100%),',
        '    radial-gradient(ellipse 30% 26% at 100%   0%, rgba(68,38,8,0.07) 0%, transparent 100%),',
        '    radial-gradient(ellipse 34% 30% at   0% 100%, rgba(68,38,8,0.09) 0%, transparent 100%),',
        '    radial-gradient(ellipse 38% 33% at 100% 100%, rgba(68,38,8,0.11) 0%, transparent 100%) !important;',
        '}',
      ].join('\n')
      _doc.head.appendChild(animStyle)
    },
    ...(fontEmbedCSS ? { fontEmbedCSS } : {}),
  }

  // Safari requires two toPng calls: first warms up resource loading (fonts,
  // images), second captures with everything available.
  await toPng(paperEl, opts).catch(() => {})
  const dataUrl = await toPng(paperEl, opts)

  if (wrapEl) wrapEl.style.filter = savedFilter

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

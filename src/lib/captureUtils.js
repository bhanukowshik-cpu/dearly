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

  const dataUrl = await toPng(paperEl, {
    pixelRatio: 3,
    backgroundColor: bgColor,
    onclone: (_doc, el) => {
      // Force all SVG stroke animations to their completed state so
      // TegakiRenderer characters are fully drawn (not mid-animation invisible).
      const style = _doc.createElement('style')
      style.textContent = [
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
      _doc.head.appendChild(style)
    },
    ...(fontEmbedCSS ? { fontEmbedCSS } : {}),
  })

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

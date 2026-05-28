/* ─────────────────────────────────────────────────────────────────────────
   exportAnimatedGif — dev export path for notes that contain a GIF.

   Triggered from the same "PNG" button on WritingScreen. When the paper
   contains one or more animated GIFs the static PNG would freeze whatever
   frame happened to be on screen, so we branch here:

     1. Find every <img> on the paper whose blob src is GIF89a / GIF87a.
     2. Parse each one into a list of fully-composed frames (full canvas,
        disposal applied) using gifuct-js, and rasterize each to a data URL.
     3. Pick the longest-running GIF as the master timeline. For every
        master tick, set every other GIF's src to the right cycled frame,
        wait a paint, then run the existing captureCanvas pipeline.
     4. Hand each captured frame to gif.js (Web Worker encoder) with the
        master's per-frame delay.
     5. Worker emits a Blob, we trigger a .gif download.

   Dev-only — html-to-image runs once per frame, so a 30-frame GIF takes
   ~6-12s. Acceptable for the showcase-asset workflow this button serves.
   ───────────────────────────────────────────────────────────────────── */

import { parseGIF, decompressFrames } from 'gifuct-js'
import GIF from 'gif.js/dist/gif.js'
import gifWorkerUrl from 'gif.js/dist/gif.worker.js?url'
import { captureCanvas } from './captureUtils'

/**
 * Sniff for an animated GIF by checking magic bytes on the blob behind an
 * <img>. Returns null for non-GIFs (so callers can fall through to PNG).
 *
 * Only blob: srcs are considered — uploaded GIFs land as blob URLs in
 * MediaFrameRenderer. Static demo assets via http(s) aren't expected here.
 */
async function sniffGifBuffer(img) {
  const src = img.getAttribute('src') || ''
  if (!/^blob:/.test(src)) return null
  let buf
  try {
    const res = await fetch(src)
    buf = await res.arrayBuffer()
  } catch {
    return null
  }
  const head = new Uint8Array(buf, 0, Math.min(6, buf.byteLength))
  const sig  = String.fromCharCode(...head)
  if (sig !== 'GIF87a' && sig !== 'GIF89a') return null
  return buf
}

/**
 * Walk the paper and return every <img> whose blob is an animated GIF,
 * paired with its parsed frame list. An image with a single frame is
 * skipped — there's nothing to animate, the PNG path is fine.
 */
export async function findGifFrames(paperEl) {
  const imgs   = paperEl.querySelectorAll('img')
  const result = []
  for (const img of imgs) {
    const buf = await sniffGifBuffer(img)
    if (!buf) continue
    let parsed
    try {
      parsed = parseGIF(buf)
    } catch {
      continue
    }
    const frames = decompressFrames(parsed, true)
    if (!frames || frames.length < 2) continue
    result.push({ img, parsed, frames })
  }
  return result
}

/**
 * Re-compose a GIF's frame list into an array of full-canvas data URLs.
 *
 * gifuct-js gives us a "patch" per frame (the changed rectangle) plus a
 * disposal method describing how to clean up between frames. We replay
 * the spec's disposal logic so each output URL is a complete still — the
 * <img> can swap to any index without artifacts from prior frames.
 *
 * Returns { dataUrls: string[], delays: number[] }. Delays are in ms,
 * floored to 20ms (the GIF spec's minimum, also gif.js's effective floor).
 */
function composeGifFrames({ parsed, frames }) {
  const W = parsed.lsd.width
  const H = parsed.lsd.height
  const canvas = document.createElement('canvas')
  canvas.width  = W
  canvas.height = H
  const ctx = canvas.getContext('2d')

  // Backing patch canvas reused per frame — sized to the largest patch.
  const patchCanvas = document.createElement('canvas')
  const patchCtx    = patchCanvas.getContext('2d')

  const dataUrls = []
  const delays   = []
  let prevImageData = null

  for (let i = 0; i < frames.length; i++) {
    const f = frames[i]
    const { width, height, top, left } = f.dims

    // Disposal of the PREVIOUS frame (per GIF spec) happens before drawing.
    if (i > 0) {
      const prev = frames[i - 1]
      if (prev.disposalType === 2) {
        // Restore-to-background → clear the prev rect.
        ctx.clearRect(prev.dims.left, prev.dims.top, prev.dims.width, prev.dims.height)
      } else if (prev.disposalType === 3 && prevImageData) {
        // Restore-to-previous → put back the snapshot taken before prev.
        ctx.putImageData(prevImageData, 0, 0)
      }
    }

    if (frames[i].disposalType === 3) {
      // Snapshot BEFORE we draw — used by the next frame if it asks for
      // restore-to-previous.
      prevImageData = ctx.getImageData(0, 0, W, H)
    }

    patchCanvas.width  = width
    patchCanvas.height = height
    const patchImage = new ImageData(new Uint8ClampedArray(f.patch), width, height)
    patchCtx.putImageData(patchImage, 0, 0)
    ctx.drawImage(patchCanvas, left, top)

    dataUrls.push(canvas.toDataURL('image/png'))
    delays.push(Math.max(20, (f.delay || 100)))
  }

  return { dataUrls, delays }
}

/**
 * Wait for an <img>'s newly-assigned src to be fully decoded so the next
 * DOM capture sees the right pixels (not the previous frame).
 */
function waitForImgLoad(img, src) {
  return new Promise(resolve => {
    if (img.src === src && img.complete && img.naturalWidth > 0) {
      resolve()
      return
    }
    const done = () => {
      img.removeEventListener('load', done)
      img.removeEventListener('error', done)
      resolve()
    }
    img.addEventListener('load', done)
    img.addEventListener('error', done)
    img.src = src
  })
}

/**
 * captureCanvasAsAnimatedGif — orchestrate frame-by-frame capture + GIF
 * encode. Caller passes the result of findGifFrames (so we don't pay the
 * sniff cost twice).
 *
 * Options:
 *   - filename       Output download name. ".gif" appended if absent.
 *   - pixelRatio     html-to-image pixelRatio per frame. Default 2 —
 *                    matches "retina-ish" sharpness without ballooning the
 *                    file the way 3× does (each step is 2.25× more pixels
 *                    *and* dramatically slower to quantize).
 *   - maxFrames      Cap on master frames captured. Default 40. Above this
 *                    the file gets unwieldy and encoding takes too long.
 *   - quality        gif.js NeuQuant sample rate. 1 = best (every pixel
 *                    sampled), 30 = worst. Default 1 — the dev export is
 *                    used for showcase assets where sharpness matters more
 *                    than a fast encode.
 *   - dither         gif.js dithering algorithm. Default 'FloydSteinberg-
 *                    serpentine' — breaks up the banding that the 256-
 *                    color palette would otherwise impose on photo
 *                    content (the meeting photos in the marcus letter
 *                    were the visible offender).
 *   - onProgress     Receives (capturedFrames, totalFrames) during the
 *                    capture phase, then (1) once encoding kicks in.
 */
export async function captureCanvasAsAnimatedGif({
  filename = `dearly-letter-${Date.now()}.gif`,
  pixelRatio = 2,
  maxFrames = 40,
  quality = 1,
  dither = 'FloydSteinberg-serpentine',
  onProgress = () => {},
  gifTargets = null,
} = {}) {
  const paperEl = document.querySelector('[data-paper-canvas]')
  if (!paperEl) throw new Error('captureCanvasAsAnimatedGif: no paper element')

  const targets = gifTargets || await findGifFrames(paperEl)
  if (targets.length === 0) {
    throw new Error('No animated GIFs found — fall back to PNG export.')
  }

  // Pre-compose every GIF's frames into full data URLs + per-frame delays.
  const composed = targets.map(t => ({
    img: t.img,
    ...composeGifFrames(t),
    originalSrc: t.img.getAttribute('src'),
  }))

  // Master = the GIF with the most frames. Drives the timeline; the
  // others cycle modulo their own length per master tick.
  let masterIdx = 0
  for (let i = 1; i < composed.length; i++) {
    if (composed[i].dataUrls.length > composed[masterIdx].dataUrls.length) {
      masterIdx = i
    }
  }
  const master = composed[masterIdx]
  const totalFrames = Math.min(master.dataUrls.length, maxFrames)

  // Probe one capture at the chosen pixelRatio to lock GIF dimensions.
  // gif.js needs width/height up-front; passing them keeps frame size
  // consistent (every frame goes through the same crop / scale path).
  const probeCanvas = await captureCanvas(paperEl, { pixelRatio })
  const gifW = probeCanvas.width
  const gifH = probeCanvas.height

  const encoder = new GIF({
    workers: 4,            // more workers → frames quantize in parallel
    workerScript: gifWorkerUrl,
    quality,               // 1 = full-resolution NeuQuant sampling
    dither,                // breaks photo banding from the 256-color palette
    width: gifW,
    height: gifH,
    repeat: 0,
  })

  // Use the probe as frame 0 — but we need to ensure it represents the
  // FIRST master frame. Reset every GIF to its 0th frame first.
  for (const g of composed) {
    await waitForImgLoad(g.img, g.dataUrls[0])
  }
  // Now actually capture frame 0 (probe was taken before the reset).
  const frame0 = await captureCanvas(paperEl, { pixelRatio })
  encoder.addFrame(frame0.getContext('2d'), { copy: true, delay: master.delays[0] })
  onProgress(1, totalFrames)

  for (let i = 1; i < totalFrames; i++) {
    for (const g of composed) {
      const idx = i % g.dataUrls.length
      await waitForImgLoad(g.img, g.dataUrls[idx])
    }
    // One rAF so the browser actually paints the new src before we capture.
    await new Promise(r => requestAnimationFrame(r))
    const c = await captureCanvas(paperEl, { pixelRatio })
    encoder.addFrame(c.getContext('2d'), { copy: true, delay: master.delays[i] })
    onProgress(i + 1, totalFrames)
  }

  // Restore the original blob URLs so the live editor keeps animating
  // normally after the export. Done before encoding so even a worker
  // failure doesn't strand the editor on a static frame.
  for (const g of composed) {
    if (g.originalSrc) g.img.setAttribute('src', g.originalSrc)
  }

  const blob = await new Promise((resolve, reject) => {
    encoder.on('finished', b => resolve(b))
    encoder.on('abort', () => reject(new Error('GIF encoding aborted')))
    encoder.render()
  })

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.gif') ? filename : `${filename}.gif`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)

  return { filename: a.download, width: gifW, height: gifH, frames: totalFrames }
}

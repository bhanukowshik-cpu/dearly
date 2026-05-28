import { toPng } from 'html-to-image'
import { uploadVoiceNote, uploadMediaFrame, saveNote } from './supabase'
import { renderVoiceBarcodeSVG } from './voiceBarcode'

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

/* ─────────────────────────────────────────────────────────────────────────
   Voice-note → barcode swap for export
   ─────────────────────────────────────────────────────────────────────────
   Goal: a downloaded letter is a static image — recipients can't tap a
   voice-note pill to play it. So at export time we:

     1. Walk the live paper for [data-voice-note] elements.
     2. For each, fetch its audio blob (from the in-memory blob: URL),
        upload it to Supabase Storage, and get back a stable id.
     3. Generate a horizontal PDF417 barcode that encodes
        `<origin>/v/<id>` — the playback landing page.
     4. In onclone (where the DOM clone is mutable but rendering hasn't
        happened yet), replace the matching voice-note's inner content
        with the barcode SVG, preserving the wrapper's position/size/
        rotation so the barcode lands EXACTLY where the voice pill was.

   Uploads happen before toPng() so the onclone callback can stay
   synchronous (html-to-image doesn't await onclone). If an upload fails
   we just leave the voice pill in place — better to ship a degraded
   image than no image.
   ───────────────────────────────────────────────────────────────────── */

/**
 * Canonical Dearly host that voice-note barcodes point to.
 *
 * Always uses the production domain (or VITE_PUBLIC_URL override) — never
 * window.location.origin — because a letter exported from localhost would
 * otherwise encode a URL like `http://localhost:5173/v/...` that fails on
 * the recipient's phone. The barcode must resolve to a real Dearly URL
 * no matter where the letter was downloaded from.
 */
const DEARLY_PUBLIC_URL =
  (import.meta.env.VITE_PUBLIC_URL || 'https://bhanu-dearly.vercel.app').replace(/\/$/, '')

/**
 * Pre-export pipeline:
 *
 *   1. Find every voice-note in the paper.
 *   2. Upload each audio blob to Supabase Storage → permanent URL.
 *   3. If we have full noteData (passed from ShareSheet / etc.), clone it,
 *      swap blob: URLs for permanent URLs, and call saveNote() — this gives
 *      us a noteId pointing to the WHOLE letter, not just the audio.
 *   4. Generate one QR per voice-note. The QR encodes the SHARE URL for the
 *      full letter (`<origin>/?id=<noteId>`) so a recipient who scans it
 *      opens the entire letter on their phone — text, stickers, photos,
 *      and the voice note ready to play in context.
 *
 *   Fallback: if noteData isn't provided, or saveNote fails (e.g. schema
 *   migration not run), the QR falls back to the voice-only landing page
 *   `<origin>/v/<storageId>` — recipients can still hear the audio, just
 *   without the surrounding letter.
 */
async function prepareVoiceBarcodes(paperEl, noteData) {
  const nodes = paperEl.querySelectorAll('[data-voice-note]')
  if (nodes.length === 0) return new Map()

  const origin = DEARLY_PUBLIC_URL

  // Step 1+2 — upload every voice note, keep a (id → permanentUrl) map.
  const uploadedById = new Map()
  await Promise.all([...nodes].map(async (el) => {
    const id        = el.getAttribute('data-voice-note-id')
    const audioUrl  = el.getAttribute('data-voice-note-audio')
    if (!id || !audioUrl) return
    try {
      const blob   = await fetch(audioUrl).then(r => r.blob())
      const upload = await uploadVoiceNote(blob)
      if (!upload) return
      uploadedById.set(id, upload)  // { id: storagePath, url: publicUrl }
    } catch (err) {
      console.warn('[dearly] voice upload failed for', id, err)
    }
  }))

  // Step 3 — if the caller passed noteData, persist the WHOLE letter so the
  // QR can deep-link into it. We also need to upload any media-frame
  // images so their blob: URLs (sender-only) get replaced with permanent
  // Storage URLs before saving — otherwise the recipient sees broken
  // image placeholders where photos should be.
  let shareUrlBase = null
  if (noteData) {
    try {
      // Upload every media frame's image in parallel (alongside the voice
      // uploads we already did up top). Each frame's mediaUrl is a blob:
      // URL that we resolve back to a blob via fetch, then push to Storage.
      const uploadedFramesById = new Map()
      const frames = noteData.mediaFrames || []
      await Promise.all(frames.map(async (frame) => {
        if (!frame?.mediaUrl) return
        // Skip frames that already point to a real URL (shared letter
        // being re-exported, etc.).
        if (!/^blob:/.test(frame.mediaUrl)) return
        try {
          const blob   = await fetch(frame.mediaUrl).then(r => r.blob())
          const upload = await uploadMediaFrame(blob)
          if (upload) uploadedFramesById.set(frame.id, upload)
        } catch (err) {
          console.warn('[dearly] media upload failed for', frame.id, err)
        }
      }))

      const persistable = {
        ...noteData,
        voiceNotes: (noteData.voiceNotes || []).map(v => {
          const up = uploadedById.get(v.id)
          if (!up) return v
          return { ...v, audioUrl: up.url, storagePath: up.id }
        }),
        mediaFrames: frames.map(f => {
          const up = uploadedFramesById.get(f.id)
          if (!up) return f
          return { ...f, mediaUrl: up.url, storagePath: up.id }
        }),
      }
      const noteId = await saveNote(persistable)
      if (noteId) {
        // Use the bare `?id=<uuid>` URL — same final destination as
        // `/api/share?id=...&r=...&s=...` (the share endpoint just
        // redirects there after injecting OG metadata for link
        // previews). For a QR, OG metadata is irrelevant — phones
        // don't render previews from camera scans. The shorter URL
        // means fewer modules in the QR (33×33 instead of 37×37 or
        // 41×41), which is the single biggest factor in scannability
        // at the small physical sizes voice notes ship at.
        shareUrlBase = `${origin}/?id=${noteId}`
        console.log('[dearly:export] QR will encode share URL →', shareUrlBase)
      } else {
        console.warn('[dearly:export] saveNote returned null — QR falls back to voice-only URL. Check the [dearly] saveNote ... logs above for the underlying error.')
      }
    } catch (err) {
      console.warn('[dearly:export] saveNote threw — QR falls back to voice-only URL', err)
    }
  } else {
    console.log('[dearly:export] no noteData passed — QR falls back to voice-only URL')
  }

  // Step 4 — one QR per voice note. Same share URL for all of them when we
  // saved the letter (they all open the SAME letter). Without noteData, each
  // QR points to its own /v/<storageId> playback page.
  const result = new Map()
  await Promise.all([...nodes].map(async (el) => {
    const id  = el.getAttribute('data-voice-note-id')
    const up  = uploadedById.get(id)
    if (!up) return
    const target = shareUrlBase || `${origin}/v/${up.id}`
    try {
      const svg = await renderVoiceBarcodeSVG(target)
      result.set(id, svg)
    } catch (err) {
      console.warn('[dearly] QR render failed for', id, err)
    }
  }))

  return result
}

/**
 * Swap voice-note pills for the export-mode card IN PLACE on the live DOM,
 * and return a restore function. We mutate the live document (not a clone)
 * because html-to-image has no onclone hook — it captures whatever the
 * live DOM looks like at the moment of toPng(). The restore function runs
 * in a try/finally so the editor view is always returned to its original
 * state even if capture throws.
 *
 * EXPORT-MODE CARD LAYOUT (per design spec)
 *
 *   ┌──────────────────────────────────────────────┬─────────────┐
 *   │  ▁▃▅▇▆▄▂▁▃▅▇▆▄▂▁▃▅▇▆▄▂▁▃▅▇                 │             │
 *   │                                              │   ▓▓░▓░▓▓   │
 *   │  Scan to listen to {Sender}'s note           │   ░▓▒▒▒▓░   │
 *   │                                              │   ▓░▓▓░▓▓   │
 *   └──────────────────────────────────────────────┴─────────────┘
 *           left column — 75% width                  right — 25%
 *
 * The interactive (live) voice note is NEVER touched by this code path —
 * VoiceNoteRenderer renders it unmodified. This swap fires only during
 * captureCanvas() and is reversed immediately after.
 */
function swapVoiceNotesForBarcodes(paperEl, barcodeByVoiceId) {
  if (barcodeByVoiceId.size === 0) return () => {}
  const nodes = paperEl.querySelectorAll('[data-voice-note]')

  // Sender name flows through paper element's data-sender-name (set by
  // PaperCanvas). Caption phrasing:
  //   With sender:    "Hear it in Bhanu's voice"
  //   Without sender: "Hear it in their voice"
  // The possessive smart-quote handles both regular names and names
  // ending in 's' (Bhanu's vs Marcus').
  const rawSender = (paperEl.getAttribute('data-sender-name') || '').trim()
  const ownerPhrase = rawSender
    ? `${escapeHtml(rawSender)}${/s$/i.test(rawSender) ? '&rsquo;' : '&rsquo;s'}`
    : 'their'

  // Overlay strategy (not innerHTML swap): the original wavesurfer canvas
  // and React-managed children stay untouched, we just position an opaque
  // export card on top during capture. Removing the overlay after capture
  // returns the editor to its exact prior state — waveform pixels, canvas
  // refs, React reconciliation all intact.
  //
  // Also: hide any selection chrome (×, corner handles, rotate button) that
  // VoiceNoteRenderer renders when the pill is selected. Those elements
  // are positioned OUTSIDE the body (e.g. top:-14px on the × button), so
  // the inset:0 overlay can't cover them. We hide their `display` via
  // inline style and restore on cleanup.
  const overlays = []
  const hiddenChildren = []
  nodes.forEach(node => {
    const id  = node.getAttribute('data-voice-note-id')
    const qrSvg = barcodeByVoiceId.get(id)
    if (!qrSvg) return  // upload failed — leave voice pill as-is

    // Hide everything EXCEPT the first child (the .card with the
    // wavesurfer canvas inside). The card stays in the DOM so wavesurfer
    // / React don't lose any references, but it's visually covered by
    // the opaque overlay we're about to append. Every subsequent child
    // is selection chrome — that's what was leaking into the export.
    Array.from(node.children).forEach((child, idx) => {
      if (idx === 0) return  // .card — leave intact
      hiddenChildren.push({ el: child, prevDisplay: child.style.display })
      child.style.display = 'none'
    })

    const rect = node.getBoundingClientRect()
    const captionPx = Math.max(8, Math.round(rect.height * 0.14))

    // Decode the persisted waveform array (set by VoiceNoteRenderer via
    // data-voice-note-waveform). Fallback to a soft idle pattern if it's
    // empty so the card never looks broken.
    let waveform
    try {
      const parsed = JSON.parse(node.getAttribute('data-voice-note-waveform') || '[]')
      waveform = Array.isArray(parsed) && parsed.length ? parsed : null
    } catch { waveform = null }
    if (!waveform) waveform = new Array(36).fill(0.35)

    const waveformHTML = renderWaveformBars(waveform)
    // QR is now a PNG data URL (qrSvg variable name kept for diff clarity).
    // Embedded as <img> so html-to-image rasterises a clean bitmap rather
    // than re-vectorising an inner SVG inside its foreignObject wrap.
    const qrPrepared = `<img src="${qrSvg}" alt="" style="width:100%;height:100%;display:block;object-fit:contain;" />`

    const overlay = document.createElement('div')
    overlay.setAttribute('data-voice-note-export-overlay', '')
    overlay.style.cssText = [
      'position:absolute',
      'inset:0',
      'z-index:100',
      'pointer-events:none',
    ].join(';')
    // Card layout: a hand-drawn wobbly SVG paints the cream paper +
    // crooked outline behind the columns (same shape family as the live
    // voice pill — that's the "master frame" we're matching). No CSS
    // border, no border-radius, no drop shadow. The two flex columns
    // sit on top in a higher z-index layer.
    overlay.innerHTML = `
      <div style="
        position:absolute;inset:0;
        font-family: 'Caveat', ui-serif, Georgia, 'Times New Roman', serif;
      ">
        <!-- Hand-drawn wobbly card body (same path as VoiceNoteRenderer) -->
        <svg
          viewBox="0 0 200 60"
          preserveAspectRatio="none"
          style="position:absolute;inset:0;width:100%;height:100%;display:block;"
          aria-hidden="true"
        >
          <path
            d="M 5,7 C 60,3 140,5 195,6 C 198,20 199,40 195,54 C 140,58 60,56 5,55 C 2,40 1,20 5,7 Z"
            fill="#FFFBF2"
            stroke="rgba(120,80,30,0.30)"
            stroke-width="0.6"
          />
        </svg>

        <!-- Columns sit ON TOP of the wobbly background -->
        <div style="
          position:absolute;inset:0;
          display:flex;flex-direction:row;align-items:stretch;
          z-index:1;
        ">
          <!-- ── Left column (~64%) — waveform + caption ──────────────── -->
          <div style="
            flex:0 0 64%;
            min-width:0;
            display:flex;flex-direction:column;
            padding:8% 4% 6% 8%;
            gap:6%;
          ">
            <div style="
              flex:1 1 auto;min-height:0;
              display:flex;align-items:center;justify-content:flex-start;
            ">
              ${waveformHTML}
            </div>
            <div style="
              flex:0 0 auto;
              font-family: 'Caveat', ui-serif, Georgia, serif;
              font-size:${captionPx}px;
              line-height:1.05;
              color:#5a4632;
              letter-spacing:0.005em;
              white-space:nowrap;
              overflow:hidden;
              text-overflow:ellipsis;
            ">Hear it in ${ownerPhrase} voice</div>
          </div>

          <!-- ── Right column (~36%) — QR sits flush, the wobbly bg
               peeks around its corners. The QR PNG has its own solid
               white quiet zone baked in so it always scans cleanly.
               No divider line — a straight rule would escape the
               wobble's curved top/bottom edges anyway, and the
               waveform/QR pairing reads cleanly without one. -->
          <div style="
            flex:0 0 36%;
            display:flex;align-items:center;justify-content:center;
            padding:6% 8% 6% 2%;
            box-sizing:border-box;
          ">
            <div style="
              width:100%;height:100%;
              display:flex;align-items:center;justify-content:center;
            ">${qrPrepared}</div>
          </div>
        </div>
      </div>
    `
    node.appendChild(overlay)
    overlays.push(overlay)
  })

  return function restore() {
    overlays.forEach(o => o.remove())
    hiddenChildren.forEach(({ el, prevDisplay }) => {
      el.style.display = prevDisplay
    })
  }
}

/**
 * Render the waveform as airy, varied-height orange capsules. Goals:
 *
 *   - Bar count low (~22) and gap wide (~50% of bar width) so the bars
 *     read as individual marks rather than a solid bristle. Reads like
 *     a hand-sketched audio waveform on stationery.
 *   - Heights genuinely vary across the strip — even when the recorded
 *     waveformData is flat (very quiet recordings), we mix in a
 *     deterministic sine/cosine ripple so the visual always feels alive.
 *   - Soft fully-rounded capsule ends.
 */
function renderWaveformBars(rawValues) {
  const W = 200
  const H = 60
  const barCount = 22

  // Downsample to barCount: take averages over each segment of the input.
  const src = Array.isArray(rawValues) && rawValues.length ? rawValues : [0.3]
  const downsampled = []
  for (let i = 0; i < barCount; i++) {
    const start = Math.floor((i / barCount) * src.length)
    const end   = Math.max(start + 1, Math.floor(((i + 1) / barCount) * src.length))
    let sum = 0, n = 0
    for (let j = start; j < end && j < src.length; j++) {
      sum += Number(src[j]) || 0
      n++
    }
    downsampled.push(n ? sum / n : 0)
  }

  // Aesthetic curve — mix the recorded amplitudes with a deterministic
  // sine/cosine ripple. 40% data / 60% decoration so the strip always
  // has visible rhythm, even for near-silent recordings whose raw values
  // would otherwise produce a flat line.
  const heights = downsampled.map((v, i) => {
    const fromData = Math.min(0.95, Math.max(0, v))
    const ripple   = 0.5 + 0.45 * Math.sin(i * 0.65) * Math.cos(i * 0.35 + 0.7)
    const mixed    = fromData * 0.4 + Math.abs(ripple) * 0.6
    return Math.max(0.22, Math.min(0.92, mixed))
  })

  // Wide gap → airy strip. Bar width = ~50% of slot width.
  const slot   = W / barCount
  const barW   = slot * 0.52
  const rx     = barW / 2  // full capsule ends
  const cy     = H / 2

  const bars = heights.map((v, i) => {
    const h = v * H
    const x = i * slot + (slot - barW) / 2
    const y = cy - h / 2
    return `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${barW.toFixed(2)}" height="${h.toFixed(2)}" rx="${rx.toFixed(2)}" ry="${rx.toFixed(2)}" fill="#E37033" />`
  }).join('')

  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:100%;height:100%;display:block;">${bars}</svg>`
}

/** Tiny HTML escaper for user-controlled sender name. */
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
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
 * Options:
 *   - noteData: full letter state (sender, recipient, message, voiceNotes,
 *     etc.). Used only when swapVoiceForBarcode is true — the saved noteId
 *     becomes the QR's deep-link target.
 *
 *   - swapVoiceForBarcode (default false): if true, each voice pill on the
 *     paper is replaced with the export-mode card (waveform + caption +
 *     QR) before capture, then restored after. The QR encodes the share
 *     URL so recipients can open the full letter on their phone.
 *     If false, voice pills are captured AS THEY ARE on screen — play
 *     button, waveform, duration — matching the live editor experience.
 *
 *     Only the three user-facing download paths set this to true:
 *       1. ShareSheet → "Download as image"
 *       2. RecipientScreen → download (preview + real recipient)
 *     The dev PNG / debug export buttons leave it off so they capture a
 *     true screenshot of the editor.
 *
 * Returns a Promise<HTMLCanvasElement>. Callers convert to data URL /
 * blob and trigger their own downloads (web share, anchor download,
 * iOS overlay long-press, etc).
 */
export async function captureCanvas(refOrElement, { noteData, swapVoiceForBarcode = false } = {}) {
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
  let restoreVoiceNotes = () => {}
  try {
    const fontEmbedCSS = await buildFontEmbedCSS()
    const bgColor = window.getComputedStyle(paperEl).backgroundColor || '#ffffff'

    // Voice-note swap: opt-in via swapVoiceForBarcode. Gated because the
    // dev PNG / debug exports want a true screenshot of the live editor
    // (interactive voice pill preserved), while user-facing downloads
    // (ShareSheet + RecipientScreen) want the QR-based export card.
    if (swapVoiceForBarcode) {
      const barcodeByVoiceId = await prepareVoiceBarcodes(paperEl, noteData)
      restoreVoiceNotes = swapVoiceNotesForBarcodes(paperEl, barcodeByVoiceId)
    }

    const opts = {
      pixelRatio: 3,
      backgroundColor: bgColor,
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
    // Restore voice-note pills (swap was in-place on the live DOM).
    restoreVoiceNotes()
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
 * file download. Used by the dev Export-PNG button. Intentionally does
 * NOT pass swapVoiceForBarcode so this dev export is a true screenshot
 * of the live editor — voice pills appear with their play button +
 * waveform + duration, exactly as on screen.
 *
 * User-facing download surfaces (ShareSheet, RecipientScreen) call
 * captureCanvas() directly with `swapVoiceForBarcode: true` because they
 * produce a static image a recipient can't tap to play — the QR-based
 * export card carries the audio link instead.
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

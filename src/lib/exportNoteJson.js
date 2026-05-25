/**
 * exportNoteJson — turns the live editor state into a portable JSON blob.
 *
 * The editor stores uploaded images and recorded voice notes as `blob:`
 * URLs (from URL.createObjectURL). Those URLs are session-scoped — they
 * dereference to ArrayBuffers held inside the page, and they die the moment
 * the tab closes. A `blob:` URL pasted into a different page / browser /
 * session resolves to nothing.
 *
 * To make a note portable (e.g. inline as a static reference letter on the
 * loading screen, send via chat, store in version control), every blob URL
 * has to be inlined as a `data:` URL — base64 of the underlying bytes plus
 * the MIME type. The cost is a ~33% size penalty per binary asset, which
 * is fine for the reference-letter use case (a handful of small JPEGs).
 *
 * The returned object is JSON.stringify-safe and shaped to match the props
 * PaperCanvas already accepts, so reloading a note is essentially:
 *
 *   const data = JSON.parse(...)
 *   <PaperCanvas
 *     paperConfig={data.paperConfig}
 *     message={data.message}
 *     recipient={data.recipient}
 *     stickers={data.stickers}
 *     mediaFrames={data.mediaFrames}      // mediaUrl is now a data: URL
 *     voiceNotes={data.voiceNotes}        // audioUrl is now a data: URL
 *     strokes={data.strokes}
 *     ...
 *   />
 *
 * The full export is async because we have to fetch each blob and read it
 * as base64; do not call this on a hot render path.
 */

/* Read a fetched Blob as a base64 data: URL. FileReader is the cleanest API
   for this — `result` already arrives prefixed with `data:<mime>;base64,...` */
function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'))
    reader.onload  = () => resolve(reader.result)
    reader.readAsDataURL(blob)
  })
}

/* Resolve any URL (blob:, http:, data:) to a data: URL. data: URLs pass
   through unchanged so a re-export of an already-exported note stays cheap. */
async function urlToDataUrl(url) {
  if (!url || typeof url !== 'string') return url ?? null
  if (url.startsWith('data:')) return url
  try {
    const res  = await fetch(url)
    if (!res.ok) throw new Error(`fetch ${url} → ${res.status}`)
    const blob = await res.blob()
    return await blobToDataUrl(blob)
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[exportNoteJson] failed to inline', url, e)
    // Explicit null so consumers can filter / show a placeholder rather
    // than silently rendering a broken <img>.
    return null
  }
}

/* Walks mediaFrames + voiceNotes in parallel and inlines every binary URL.
   Preserves every other field (positions, rotation, frame style, …). */
async function inlineMediaFrames(frames) {
  if (!Array.isArray(frames)) return []
  return Promise.all(frames.map(async (f) => ({
    ...f,
    mediaUrl: await urlToDataUrl(f.mediaUrl),
  })))
}
async function inlineVoiceNotes(notes) {
  if (!Array.isArray(notes)) return []
  return Promise.all(notes.map(async (n) => ({
    ...n,
    audioUrl: await urlToDataUrl(n.audioUrl),
  })))
}

/**
 * exportNoteToJson — main entry point.
 *
 * Input  : the object returned by WritingScreen.getNoteData()
 * Output : a JSON-safe object with all media inlined as data: URLs, plus
 *          a small metadata header for forward-compat.
 */
export async function exportNoteToJson(noteData) {
  const [mediaFrames, voiceNotes] = await Promise.all([
    inlineMediaFrames(noteData.mediaFrames),
    inlineVoiceNotes(noteData.voiceNotes),
  ])

  return {
    // Schema-version header so a future loader can migrate older exports
    // forward, or refuse / warn on a newer one it doesn't know how to read.
    __format:     'dearly-note',
    __version:    1,
    __exportedAt: new Date().toISOString(),

    // Letter content (PaperCanvas props, 1:1)
    paperConfig:   noteData.paperConfig,
    recipient:     noteData.recipient,
    recipientName: noteData.recipientName,
    senderName:    noteData.senderName,
    showRecipient: noteData.showRecipient,
    message:       noteData.message,
    textSize:      noteData.textSize,

    // Editor objects — positions, rotations, scales preserved exactly.
    // Media + voice URLs are now portable data: URLs (or null if inlining
    // failed). Strokes/stickers are pure data and need no inlining.
    stickers:    noteData.stickers     ?? [],
    mediaFrames,
    voiceNotes,
    strokes:     noteData.strokes      ?? [],
  }
}

/**
 * downloadAsFile — triggers a browser download of the given string under
 * the given filename. Uses an anchor + ObjectURL (no third-party deps).
 * Cleans up the ObjectURL on next tick so we don't leak.
 */
export function downloadAsFile(text, filename = 'dearly-note.json', mimeType = 'application/json') {
  const blob = new Blob([text], { type: mimeType })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // Defer revoke so Safari has time to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * copyToClipboard — promise-based, falls back to a hidden textarea on
 * browsers/contexts where navigator.clipboard isn't available (older
 * Safari, non-secure contexts, etc).
 */
export async function copyToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      /* fall through to textarea fallback */
    }
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity  = '0'
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
    return true
  } catch {
    return false
  }
}

/**
 * importNoteFromFile — inverse of exportNoteToJson.
 *
 * Reads a File (from an <input type="file">), parses the JSON, validates
 * the format header, and returns the parsed note object. Throws on any
 * failure (bad JSON, wrong format marker, newer schema version) so the
 * caller can decide how to surface the error to the user.
 *
 * The returned object is shaped exactly like what exportNoteToJson emits,
 * which is also exactly what WritingScreen state expects field-for-field.
 * Media URLs are already data: URLs and need no conversion — they drop
 * straight into <img src> / <audio src>.
 */
export async function importNoteFromFile(file) {
  if (!file)                       throw new Error('No file selected.')
  if (file.size > 50 * 1024 * 1024) throw new Error('File is too large (>50 MB).')

  const text = await file.text()
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch (e) {
    throw new Error('File is not valid JSON.')
  }

  // Format guard. We accept anything that *looks* like a Dearly export
  // (has the magic marker) — a missing __format is a hard reject because
  // it likely means the user grabbed an unrelated JSON file by mistake.
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('JSON does not contain a note object.')
  }
  // Diagnostic: log what we actually parsed so we can debug
  // missing-format failures. The first three keys + the __format value
  // are enough to tell apart "wrong file" vs "stale module" vs "format
  // serialization bug" without dumping the whole letter to the console.
  // eslint-disable-next-line no-console
  console.info('[import] parsed keys:', Object.keys(parsed).slice(0, 4),
               '__format value:', JSON.stringify(parsed.__format),
               'type:', typeof parsed.__format)
  if (parsed.__format !== 'dearly-note') {
    throw new Error(`This file isn't a Dearly note (missing "__format": "dearly-note"). Got: ${JSON.stringify(parsed.__format)}`)
  }
  if (typeof parsed.__version === 'number' && parsed.__version > 1) {
    // Newer-than-known version: warn but still try. Today's loader knows v1;
    // if a future export adds new fields they'll just be ignored.
    // eslint-disable-next-line no-console
    console.warn(`[importNoteFromFile] Loading a v${parsed.__version} export — some newer fields may be ignored.`)
  }

  // Normalize array fields so destructuring downstream is defensive against
  // older / hand-edited exports missing some keys.
  return {
    paperConfig:   parsed.paperConfig   ?? null,
    recipient:     parsed.recipient     ?? '',
    recipientName: parsed.recipientName ?? '',
    senderName:    parsed.senderName    ?? '',
    showRecipient: !!parsed.showRecipient,
    message:       parsed.message       ?? '',
    textSize:      parsed.textSize      ?? 'md',
    stickers:      Array.isArray(parsed.stickers)    ? parsed.stickers    : [],
    mediaFrames:   Array.isArray(parsed.mediaFrames) ? parsed.mediaFrames : [],
    voiceNotes:    Array.isArray(parsed.voiceNotes)  ? parsed.voiceNotes  : [],
    strokes:       Array.isArray(parsed.strokes)     ? parsed.strokes     : [],
  }
}

/**
 * pickJsonFile — opens the OS file picker (single .json file) and resolves
 * with the chosen File, or null if the user cancelled. Returns a promise so
 * the caller can `await` it like any other async input.
 *
 * Uses a transient <input type=file> element appended to the DOM, clicked
 * programmatically, then removed. The hidden-input pattern is more
 * compatible than the modern showOpenFilePicker() (which Safari doesn't
 * implement yet) and survives sandboxed iframes.
 */
export function pickJsonFile() {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type   = 'file'
    input.accept = '.json,application/json'
    input.style.position = 'fixed'
    input.style.opacity  = '0'
    input.style.pointerEvents = 'none'
    let settled = false
    const settle = (value) => {
      if (settled) return
      settled = true
      try { document.body.removeChild(input) } catch { /* already gone */ }
      resolve(value)
    }
    input.onchange = () => settle(input.files?.[0] ?? null)
    // `cancel` fires when the picker is dismissed without selecting. Not
    // supported everywhere — we also fall back to a focus listener so we
    // resolve null on browsers that don't dispatch it.
    input.oncancel = () => settle(null)
    const onFocus = () => {
      // The picker is modal; focus returns to the page once dismissed.
      // Give the change event a tick to fire first.
      setTimeout(() => {
        if (!settled && (!input.files || input.files.length === 0)) settle(null)
      }, 300)
      window.removeEventListener('focus', onFocus)
    }
    window.addEventListener('focus', onFocus)

    document.body.appendChild(input)
    input.click()
  })
}

/**
 * exportPaperAsPng — captures the live PaperCanvas element as a high-DPI PNG.
 *
 * Used to bake a designed letter into a static image for the LoadingScreen
 * carousel (and any other "showcase" surface) — avoids the layout-drift +
 * scaling problems of rendering a live PaperCanvas inside a smaller slot.
 *
 *   • Captures the [data-paper-canvas] element + every absolutely-positioned
 *     child (stickers, mediaFrames, voice notes, drawings) by setting a
 *     `pixelRatio: 2` so the resulting PNG is 2× DPI (~1440×960 for a
 *     postcard at desktop). That's sharp on retina screens without going
 *     overboard on file size.
 *   • cacheBust: true on html-to-image so iframed images / blob URLs are
 *     re-fetched fresh (avoids stale canvas-tainting issues across sessions).
 *   • skipFonts: false so Caveat renders correctly in the captured image
 *     (default skips webfonts to dodge CORS; we WANT them).
 *
 * The capture happens inside a brief setTimeout(0) so React has time to
 * flush any pending re-renders triggered by clicking the button (e.g.
 * deselecting a sticker before the screenshot).
 */
export async function exportPaperAsPng({ pixelRatio = 2, filename } = {}) {
  const { toPng } = await import('html-to-image')
  const paperEl = document.querySelector('[data-paper-canvas]')
  if (!paperEl) throw new Error('No paper canvas found on page.')

  // Give React + ResizeObservers a tick to settle before capture.
  await new Promise(r => setTimeout(r, 0))

  // Read the paper's computed background color and pass it EXPLICITLY to
  // toPng — html-to-image doesn't always carry forward inline-style
  // backgroundColor through its SVG <foreignObject> rasterization, which
  // is why vintage paper (which gets its cream bg via React style prop)
  // was exporting as a black PNG showing only floating stickers / voice
  // notes (the cream layer was effectively transparent in the capture).
  // Falls back to white if the computed value comes back rgba(0,0,0,0).
  const computedBg = getComputedStyle(paperEl).backgroundColor
  const safeBg = (computedBg && computedBg !== 'rgba(0, 0, 0, 0)' && computedBg !== 'transparent')
    ? computedBg
    : '#FFFFFF'

  const dataUrl = await toPng(paperEl, {
    pixelRatio,
    // cacheBust: false — appending ?t=... to URLs corrupts data: URIs that
    // .stains uses for the aged-paper grain texture. Without cacheBust the
    // SVG noise / stains layer captures correctly.
    cacheBust: false,
    backgroundColor: safeBg,
    // Bigger pixelRatio bumps memory; cap canvas size sensibly via
    // explicit width/height in source pixels.
    width:  paperEl.offsetWidth,
    height: paperEl.offsetHeight,
    style: {
      // Counter any transform applied by parents (e.g. ScaledPaper) so the
      // capture grabs the natural-size paper, not a scaled one.
      transform: 'none',
    },
  })

  // Trigger download (re-use the existing helpers).
  const name = filename || `dearly-letter-${Date.now()}.png`
  // Convert data URL to Blob → trigger anchor download (downloadAsFile
  // expects a text body, so we inline a tiny anchor-click here instead).
  const a = document.createElement('a')
  a.href     = dataUrl
  a.download = name
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)

  return { filename: name, pixelRatio, width: paperEl.offsetWidth, height: paperEl.offsetHeight }
}

/**
 * Convenience: builds a kebab-case filename from the recipient + a short
 * timestamp so multiple exports don't overwrite each other in Downloads.
 */
export function buildExportFilename(noteData) {
  const name = (noteData?.recipientName || noteData?.recipient || 'note')
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    || 'note'
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\..+/, '')
    .replace('T', '-')
  return `dearly-${name}-${stamp}.json`
}

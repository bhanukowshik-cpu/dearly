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

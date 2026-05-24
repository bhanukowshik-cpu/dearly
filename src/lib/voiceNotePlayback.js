/* ─────────────────────────────────────────────────────────────────────────
   voiceNotePlayback — module-level "one voice plays at a time" registry.
   Each renderer/panel calls claim(audio) right before audio.play(); any
   previously-claimed audio gets paused first. release(audio) clears the
   slot when playback ends or the element unmounts.
   ───────────────────────────────────────────────────────────────────────── */

let current = null

export function claim(audio) {
  if (current && current !== audio) {
    try { current.pause() } catch { /* element may already be detached */ }
  }
  current = audio
}

export function release(audio) {
  if (current === audio) current = null
}

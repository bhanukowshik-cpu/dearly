/**
 * useTypingSound — Tone.js-backed typing pen-texture for any text input.
 *
 * Thin wrapper around `penSoundManager`. The manager owns the audio graph;
 * this hook only:
 *   • initializes the manager on first user interaction with the element
 *   • filters `input` events down to the ones that should make a sound
 *   • throttles + chains them so output feels like "active typing"
 *
 * "Chained" behavior:
 *   - First keystroke unlocks/loads audio and plays a slice.
 *   - Subsequent keystrokes within `chainPauseMs` add more slices.
 *   - After `chainPauseMs` of silence, the chain "closes" — the next stroke
 *     starts a fresh chain. This gives natural ebb/flow vs. a constant drone.
 *
 * Skipped automatically:
 *   - Synthetic events (e.isTrusted === false) → no sound from programmatic
 *     content updates.
 *   - IME composition events → CJK candidate cycling won't machine-gun.
 *   - Deletions (inputType starting with 'delete') → backspace is silent.
 *   - Sound only fires while the element is the document.activeElement
 *     (so a stale ref can't make noise when the user has clicked away).
 */

import { useEffect } from 'react'
import penAudio from '../audio/penSoundManager'

// Inter-stroke throttle. The manager itself also enforces ~18ms; this exists
// to be slightly more permissive at the hook level for ultra-fast typists.
const STROKE_THROTTLE_MS = 22

export function useTypingSound(elementRef) {
  useEffect(() => {
    const el = elementRef?.current
    if (!el) return

    let lastFire = 0
    let initialized = false

    async function ensureInit() {
      if (initialized) return
      initialized = true
      // Fire-and-forget: if the WAV is missing or autoplay is still blocked,
      // the manager fails silently and we just don't make sound.
      await penAudio.init()
    }

    function onInput(e) {
      if (!e.isTrusted)      return
      if (e.isComposing)     return
      const t = e.inputType || ''
      if (t.startsWith('delete')) return

      // Skip structural keystrokes that don't represent ink on paper:
      //   • Space — the pen lifts to skip ahead, no stroke is drawn
      //   • Enter — line break, no stroke
      // Filtering at this layer keeps the sound model honest to the metaphor
      // and prevents two flat "scratch" sounds when the user is just spacing.
      if (e.data === ' ') return
      if (t === 'insertLineBreak' || t === 'insertParagraph') return

      // Only sound when this element is genuinely focused. If the user has
      // moved on (e.g. clicked into the canvas), don't play.
      if (document.activeElement !== el) return

      const now = performance.now()
      if (now - lastFire < STROKE_THROTTLE_MS) return
      lastFire = now

      // Kick off init the first time we'd actually play. Once init resolves,
      // future calls find the manager ready and skip the await entirely.
      if (!penAudio.isReady()) ensureInit().then(() => penAudio.playTypingTick())
      else                     penAudio.playTypingTick()
    }

    el.addEventListener('input', onInput)
    return () => el.removeEventListener('input', onInput)
  }, [elementRef])
}

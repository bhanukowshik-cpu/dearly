/**
 * useDrawingSound — wires PointerEvents on a canvas/drawing surface to
 * the Tone.js pen sound manager. Plug-and-play for the future Draw tool.
 *
 * Usage:
 *   const canvasRef = useRef(null)
 *   useDrawingSound(canvasRef)
 *   return <canvas ref={canvasRef} />
 *
 * What this hook handles for you:
 *   • Lazy init on first pointerdown (autoplay-safe — pointerdown is a
 *     real user gesture).
 *   • Maps PointerEvent.pressure into the manager's 0..1 pressure input.
 *     Falls back to a sensible default for devices without pressure
 *     (mouse/trackpad → 0.5).
 *   • Computes stroke velocity in CSS pixels per millisecond and normalizes
 *     it to a 0..1 input. The cap is "fast handwriting", not "swipe".
 *   • pointercancel and pointerleave-while-down both clean up — no hanging
 *     loops when the user drags off the canvas or the OS interrupts.
 *   • Only one active stroke at a time. Multi-touch picks the first pointer.
 *
 * You can still call penAudio directly if you need bespoke logic — this is
 * just the "I have a pointer surface, do the right thing" path.
 */

import { useEffect } from 'react'
import penAudio from '../audio/penSoundManager'

// Velocity normalization. Anything faster than this (in CSS px/ms) is
// treated as the upper bound. Empirically ~2.0 px/ms = "writing fast".
const VELOCITY_CAP_PX_PER_MS = 2.0

// Mouse / trackpad have no pressure → PointerEvent.pressure is 0.5 by spec
// when the button is down, but some browsers report 0. Force a sane default.
function readPressure(e) {
  if (e.pointerType === 'pen' || e.pointerType === 'touch') {
    // Real pressure-capable devices.
    return Math.max(0, Math.min(1, e.pressure || 0))
  }
  // Mouse / trackpad — there's no pressure, so we synthesize a moderate one
  // that still sounds like "active drawing".
  return 0.55
}

export function useDrawingSound(elementRef) {
  useEffect(() => {
    const el = elementRef?.current
    if (!el) return

    let activePointerId = null
    let lastX = 0, lastY = 0
    let lastTs = 0
    let initStarted = false

    async function ensureInit() {
      if (initStarted) return
      initStarted = true
      await penAudio.init()
    }

    function onPointerDown(e) {
      if (activePointerId !== null) return  // already in a stroke
      activePointerId = e.pointerId
      lastX  = e.clientX
      lastY  = e.clientY
      lastTs = e.timeStamp

      // Init asynchronously; startDrawing() is safe to call before ready —
      // the manager guards. Once init lands, the next pointermove will be
      // the first audible frame.
      ensureInit().then(() => penAudio.startDrawing())
      // Also fire immediately — if the manager is already ready (subsequent
      // strokes), this avoids a perceptible delay.
      penAudio.startDrawing()

      // Pointer capture means we keep receiving move/up even if the user
      // drags off the element — no more orphan loops on fast strokes.
      try { el.setPointerCapture(e.pointerId) } catch { /* fine */ }
    }

    function onPointerMove(e) {
      if (e.pointerId !== activePointerId) return

      const dx = e.clientX - lastX
      const dy = e.clientY - lastY
      const dt = Math.max(1, e.timeStamp - lastTs)  // guard divide-by-zero
      const speedPxPerMs = Math.hypot(dx, dy) / dt
      const velocity = Math.min(1, speedPxPerMs / VELOCITY_CAP_PX_PER_MS)

      lastX  = e.clientX
      lastY  = e.clientY
      lastTs = e.timeStamp

      penAudio.updateDrawing({
        pressure: readPressure(e),
        velocity,
      })
    }

    function endStroke(e) {
      if (e.pointerId !== activePointerId) return
      activePointerId = null
      try { el.releasePointerCapture(e.pointerId) } catch { /* fine */ }
      penAudio.stopDrawing()
    }

    el.addEventListener('pointerdown',   onPointerDown)
    el.addEventListener('pointermove',   onPointerMove)
    el.addEventListener('pointerup',     endStroke)
    el.addEventListener('pointercancel', endStroke)

    return () => {
      el.removeEventListener('pointerdown',   onPointerDown)
      el.removeEventListener('pointermove',   onPointerMove)
      el.removeEventListener('pointerup',     endStroke)
      el.removeEventListener('pointercancel', endStroke)
      if (activePointerId !== null) penAudio.stopDrawing()
    }
  }, [elementRef])
}

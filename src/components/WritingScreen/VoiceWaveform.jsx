import { useEffect, useRef } from 'react'

/* ─────────────────────────────────────────────────────────────────────────
   VoiceWaveform — small canvas waveform.

   Two modes:
     - Live:   pass `analyserRef` (current = AnalyserNode). The component
               reads time-domain data each frame and animates a moving
               window of bars. Used during recording.
     - Static: pass `data` (number[] 0..1, length ≈ bar count). Renders
               those bars once and re-renders when the data changes. Used
               on the canvas card and for the post-record preview.
               Optionally pass `progress` (0..1) to dim PLAYED bars (so
               the unplayed portion stays the visible/dominant signal).

   Cozy aesthetic — variant="dots" renders rounded vertical strokes with
   per-stroke tilt + length jitter so the row reads as hand-drawn ink
   marks rather than a uniform graph.
   ───────────────────────────────────────────────────────────────────────── */

/* Deterministic per-index hand-drawn jitter — same i always produces the
   same wobble, so the strokes don't shimmer between frames. */
function jitterFor(i) {
  const s1 = Math.sin(i * 12.9898) * 43758.5453
  const s2 = Math.sin(i * 78.233)  * 23421.6311
  const s3 = Math.sin(i * 39.346)  * 11337.2113
  const s4 = Math.sin(i * 91.7777) * 19874.4521
  return {
    x:    (s1 - Math.floor(s1)) - 0.5,       // -0.5..0.5   (horizontal nudge)
    y:    (s2 - Math.floor(s2)) - 0.5,       // -0.5..0.5   (vertical nudge)
    size: 0.92 + (s3 - Math.floor(s3)) * 0.16, // 0.92..1.08 (gentle length variance)
    rot:  (s4 - Math.floor(s4)) - 0.5,       // -0.5..0.5   (tilt variance, scaled by caller)
  }
}

export default function VoiceWaveform({
  analyserRef = null,
  data = null,
  progress = null,         // 0..1, optional — only used in static mode
  bars = 48,
  height = 56,
  color = 'rgba(245, 240, 230, 0.92)',
  dimColor = 'rgba(245, 240, 230, 0.32)',
  minBarHeight = 2,
  variant = 'bars',        // 'bars' | 'dots'  (dots = hand-drawn strokes)
  className = '',
  style: styleOverride = null,
}) {
  const canvasRef = useRef(null)
  const rollingRef = useRef(new Array(bars).fill(0))
  const rafRef = useRef(0)
  const lastPushRef = useRef(0)

  /* Throttle the rate at which a new bar enters the rolling window.
     At 60fps without throttling, the full window scrolls in <1s which
     reads as a frantic VU meter. ~80ms (12.5Hz) feels cozy. */
  const PUSH_INTERVAL_MS = 80

  /* Single effect for size + draw. Previously these were separate, which
     meant the ResizeObserver's initial fire cleared the canvas AFTER the
     static draw had already happened — the waveform looked invisible until
     something forced a re-render. Now sizeToParent triggers the draw, so
     resize is always followed by repaint. */
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const live = !!analyserRef
    const timeBuf = live ? new Uint8Array(analyserRef.current?.fftSize || 1024) : null

    function sizeToParent() {
      const dpr = window.devicePixelRatio || 1
      const w = Math.max(1, Math.floor(canvas.clientWidth))
      const h = Math.max(1, Math.floor(canvas.clientHeight))
      canvas.width  = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      // Setting canvas.width clears it. In live mode the rAF loop will
      // redraw on the next frame; in static mode we must repaint here.
      if (!live) draw()
    }

    function draw() {
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      ctx.clearRect(0, 0, w, h)

      if (live && analyserRef?.current) {
        const now = performance.now()
        if (now - lastPushRef.current >= PUSH_INTERVAL_MS) {
          lastPushRef.current = now
          analyserRef.current.getByteTimeDomainData(timeBuf)
          let sum = 0
          for (let i = 0; i < timeBuf.length; i++) {
            const v = (timeBuf[i] - 128) / 128
            sum += v * v
          }
          const rms = Math.sqrt(sum / timeBuf.length)
          rollingRef.current.push(rms)
          if (rollingRef.current.length > bars) rollingRef.current.shift()
        }
      }

      const series = live ? rollingRef.current : (data ?? [])
      const count  = bars

      if (variant === 'dots') {
        // Hand-drawn waveform — rounded vertical strokes with per-stroke
        // tilt so the row reads as ink marks done by hand. Height carries
        // the volume signal; quiet bits become tiny dashes, loud bits
        // become tall strokes.
        const cellW = w / count
        const cyMid = h / 2
        const maxH  = h - 2
        const minH  = Math.max(2.0, minBarHeight)
        const baseBarW = Math.max(2.0, Math.min(4.6, cellW * 0.45))

        for (let i = 0; i < count; i++) {
          const v = Math.max(0, Math.min(1, series[i] ?? 0))
          const eased = Math.pow(v, 0.55)
          const j = jitterFor(i)
          const barH = Math.max(minH, eased * maxH * j.size)
          // Subtle width variance too — ±10% — so adjacent strokes
          // don't read as a perfect ruler line.
          const barW = baseBarW * (0.92 + Math.abs(j.size - 1) * 0.6)
          const cx   = (i + 0.5) * cellW + j.x * cellW * 0.10
          const cy   = cyMid + j.y * 1.2
          // Per-stroke tilt: ~±2.5°. Subtle hand-drawn wobble, not chaos.
          const rot  = j.rot * 0.085   // ±0.0425 rad ≈ ±2.5°

          // Inverted dimming: default is the strong colour (so an unplayed
          // recording is still fully visible); played portion dims to mark
          // progress as the user listens.
          let fill = color
          if (!live && progress != null && progress > 0) {
            const t = (i + 0.5) / count
            fill = t <= progress ? dimColor : color
          }
          ctx.fillStyle = fill

          ctx.save()
          ctx.translate(cx, cy)
          ctx.rotate(rot)
          const radius = barW / 2
          if (ctx.roundRect) {
            ctx.beginPath()
            ctx.roundRect(-barW / 2, -barH / 2, barW, barH, radius)
            ctx.fill()
          } else {
            ctx.fillRect(-barW / 2, -barH / 2, barW, barH)
          }
          ctx.restore()
        }
      } else {
        // Default — rounded vertical bars (clean, no jitter).
        const gap  = Math.max(1, Math.round(w / count / 4))
        const barW = Math.max(1.5, (w - gap * (count - 1)) / count)
        const maxH = h - 2

        for (let i = 0; i < count; i++) {
          const v = Math.max(0, Math.min(1, series[i] ?? 0))
          const eased = Math.pow(v, 0.65)
          const barH  = Math.max(minBarHeight, eased * maxH)
          const x     = i * (barW + gap)
          const y     = (h - barH) / 2

          let fill = color
          if (!live && progress != null && progress > 0) {
            const t = (i + 0.5) / count
            fill = t <= progress ? dimColor : color
          }
          ctx.fillStyle = fill

          const r = Math.min(barW / 2, 2.2)
          if (ctx.roundRect) {
            ctx.beginPath()
            ctx.roundRect(x, y, barW, barH, r)
            ctx.fill()
          } else {
            ctx.fillRect(x, y, barW, barH)
          }
        }
      }

      if (live) {
        rafRef.current = requestAnimationFrame(draw)
      }
    }

    sizeToParent()
    const ro = new ResizeObserver(sizeToParent)
    ro.observe(canvas)

    if (live) {
      // Reset the rolling window on entry so stale data doesn't briefly
      // flash on a new recording session.
      rollingRef.current = new Array(bars).fill(0)
      lastPushRef.current = 0
      rafRef.current = requestAnimationFrame(draw)
    } else {
      draw()
    }

    return () => {
      ro.disconnect()
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
    }
  }, [analyserRef, data, progress, bars, color, dimColor, minBarHeight, variant])

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ width: '100%', height: `${height}px`, display: 'block', ...(styleOverride || {}) }}
      aria-hidden
    />
  )
}

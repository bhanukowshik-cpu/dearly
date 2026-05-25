/**
 * DrawingLayer — the SVG overlay that lives on top of the paper.
 *
 *   • Persisted strokes always render (read-only) so previous ink stays
 *     visible whether the user is drawing or not.
 *   • When `activeTool` is null, the layer is pointer-events:none — the
 *     paper's stickers / frames / text remain interactive.
 *   • When `activeTool` is set, the layer captures pointer events, builds a
 *     vector stroke as the user draws, and emits it to the parent on lift.
 *
 * Coordinates are stored in normalised 0..1 (relative to the paper). On
 * render we denormalise to current paper pixel size and feed those numbers
 * into perfect-freehand. This way strokes scale with the paper and exports
 * stay crisp at any resolution.
 */

import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { getStroke } from 'perfect-freehand'
import inkAudio from '../../audio/inkSoundManager'
import {
  TOOL_CONFIG,
  strokeOutlineToSvgPath,
} from '../../lib/drawingPresets'
import styles from './DrawingLayer.module.css'

function readPressure(e) {
  if (e.pointerType === 'pen' || e.pointerType === 'touch') {
    // PointerEvent.pressure is 0..1 on a real stylus / touch. Some browsers
    // report 0 for non-pressure-capable styli — treat as a moderate baseline
    // rather than silent so the stroke still has audible character.
    const raw = e.pressure
    if (raw > 0) return Math.min(1, raw)
    return 0.55
  }
  // Mouse / trackpad: no pressure at all. Synthesise a moderate one so
  // perfect-freehand's simulatePressure (velocity-driven) does the rest.
  return 0.55
}

function renderStrokePath(stroke, paperW, paperH) {
  const cfg = TOOL_CONFIG[stroke.tool]
  if (!cfg || !stroke.points.length) return ''
  const size = paperW * cfg.sizeRatio
  // Denormalise [0..1] → pixel coords for getStroke().
  const inputs = stroke.points.map(p => [p.x * paperW, p.y * paperH, p.pressure])
  const outline = getStroke(inputs, { ...cfg.freehand, size })
  return strokeOutlineToSvgPath(outline)
}

export default function DrawingLayer({
  activeTool        = null,          // 'pen' | 'highlighter' | 'eraser' | null
  /* penOnly: iPad mode where the layer stays mounted + active but ONLY
     captures Apple Pencil. Finger taps + mouse fall through to whatever
     sits beneath (the contenteditable paper) so text input still works.
     Implemented via parent-scoped capture-phase listeners that filter on
     pointerType === 'pen'; the root keeps pointer-events:none so other
     pointer types are never hit-tested onto the layer. */
  penOnly           = false,
  toolColor         = '#1F2024',
  strokes           = [],
  onStrokeComplete  = () => {},
  onEraseStrokes    = () => {},      // called with array of stroke ids to remove
  /* toolFilter: when set ('pen' | 'highlighter'), only render persisted
     strokes that match that tool. Used by PaperCanvas to split highlighter
     strokes (behind text) from pen strokes (above text) into two layers. */
  toolFilter        = null,
  /* passive: no pointer events, no input refs, no eraser cursor. Used for
     the back-layer (highlighter) instance — it's purely visual; all input
     is handled by the interactive front-layer instance. */
  passive           = false,
}) {
  const rootRef        = useRef(null)
  const svgRef         = useRef(null)
  const pointerIdRef   = useRef(null)
  const lastSampleRef  = useRef(null)   // { x, y, t } in client coords for velocity
  const inFlightRef    = useRef(null)   // accumulating point buffer for current stroke

  // Granular audio:
  //   • distance trigger — every SCRATCH_INTERVAL_PX of accumulated cursor
  //     travel fires one short slice. Fast strokes accumulate quickly →
  //     dense scratching; slow strokes accumulate slowly → sparse.
  //   • time trigger     — if too long has passed since the last scratch
  //     (longer than the slice length), fire one anyway as long as there's
  //     been *some* movement. Stops slow careful writing on long letters
  //     like "H" or "A" from leaving audible gaps between slices.
  //   • speed → volume   — each slice's intensity is driven by the
  //     smoothed cursor speed at the moment it fires. Slow drag → near
  //     silent; fast drag → full volume. Below MIN_AUDIBLE_SPEED nothing
  //     fires at all, so deliberate slow drawing is true silence.
  // Holding the cursor still means neither trigger fires → silence by
  // construction. No looping player anywhere, no idle timers to mis-fire.
  const distAccumRef     = useRef(0)
  const lastScratchAtRef = useRef(0)
  const smoothedSpeedRef = useRef(0)   // CSS px / ms, EWMA over recent moves

  const [size, setSize] = useState({ w: 0, h: 0 })
  const [livePath, setLivePath] = useState(null)  // { d, color, tool, opacity }
  // When the eraser is active we render a small ring under the cursor so it's
  // obvious what's about to disappear. Null when the cursor isn't over the
  // paper or the eraser isn't selected.
  const [eraserCursor, setEraserCursor] = useState(null)  // { x, y } in paper px

  // Observe paper size so the SVG viewBox + cached stroke paths track resizes.
  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const measure = () => {
      const r = el.getBoundingClientRect()
      setSize({ w: r.width, h: r.height })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Persisted strokes recompute only when strokes or paper size changes.
  // Vector data is the source of truth; SVG paths are derived/cached.
  // When `toolFilter` is set, only render strokes whose tool matches —
  // lets the back layer render highlighter-only and the front layer
  // render pen-only, so highlighter naturally sits behind text.
  const persistedPaths = useMemo(() => {
    if (size.w === 0 || size.h === 0) return []
    const filtered = toolFilter
      ? strokes.filter(s => s.tool === toolFilter)
      : strokes
    return filtered.map(s => ({
      id:      s.id,
      tool:    s.tool,
      color:   s.color,
      opacity: TOOL_CONFIG[s.tool]?.opacity ?? 1,
      d:       renderStrokePath(s, size.w, size.h),
    }))
  }, [strokes, size, toolFilter])

  /* ── Eraser: hit-test stored stroke points against the cursor disk ──── */

  // We hit-test against the raw stroke data, not the rendered SVG. The
  // SVG isPointInFill approach was unreliable for thin pen strokes — even
  // multi-sample coverage missed when the line happened to slip between
  // the sample points. Direct point-vs-cursor distance is foolproof:
  // each stroke stores its own points in normalised 0..1 coords; we
  // denormalise to pixels and check if any point lies inside the eraser
  // ring. perfect-freehand resamples densely (~every few px), so even a
  // long stroke has enough points that any cursor overlap finds one.
  //
  // `strokes` is read via a ref so the eraseAt callback stays stable
  // across renders — otherwise rebuilding it every time the user draws
  // would invalidate downstream useCallbacks and add per-stroke overhead.
  const strokesRef = useRef(strokes)
  useEffect(() => { strokesRef.current = strokes }, [strokes])

  const eraseAt = useCallback((clientX, clientY) => {
    const root = rootRef.current
    if (!root) return
    const rect = root.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return
    const localX = clientX - rect.left
    const localY = clientY - rect.top
    const baseRadius = rect.width * TOOL_CONFIG.eraser.cursorRadiusRatio

    const removed = []
    for (const s of strokesRef.current) {
      // Highlighter strokes are wide — give them a slight bonus radius
      // since the rendered band extends beyond the recorded centre-line
      // points. Squared once per stroke so the inner loop is multiply +
      // compare only.
      const cfg        = TOOL_CONFIG[s.tool]
      const widthBonus = (cfg?.sizeRatio ?? 0) * rect.width * 0.5
      const rSq        = (baseRadius + widthBonus) ** 2

      for (const p of s.points) {
        const dx = p.x * rect.width  - localX
        const dy = p.y * rect.height - localY
        if (dx * dx + dy * dy <= rSq) {
          // ANY point of the stroke inside the ring → remove the
          // whole stroke. No partial erasure.
          removed.push(s.id)
          break
        }
      }
    }
    if (removed.length > 0) onEraseStrokes(removed)
  }, [onEraseStrokes])

  /* ── Pointer event flow ─────────────────────────────────────────────── */

  const beginStroke = useCallback((e) => {
    if (!activeTool) return
    if (pointerIdRef.current !== null) return
    // penOnly mode (iPad write surface): finger taps + mouse fall through
    // to whatever parent handles them (eg. pinch zoom). Pen is the only
    // valid drawing input. Don't preventDefault/stopPropagation here so
    // the parent listener still receives the event for its own gestures.
    if (penOnly && e.pointerType !== 'pen') return
    const el = rootRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return

    pointerIdRef.current = e.pointerId
    try { el.setPointerCapture(e.pointerId) } catch { /* fine */ }

    // Eraser branch — short-circuits the drawing/audio path entirely.
    if (activeTool === 'eraser') {
      setEraserCursor({ x: e.clientX - rect.left, y: e.clientY - rect.top })
      eraseAt(e.clientX, e.clientY)
      return
    }

    const x = (e.clientX - rect.left) / rect.width
    const y = (e.clientY - rect.top)  / rect.height
    const pressure = readPressure(e)
    const t = e.timeStamp

    inFlightRef.current = {
      id:    `stk-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      tool:  activeTool,
      color: toolColor,
      points: [{ x, y, pressure, t }],
    }
    lastSampleRef.current = { x: e.clientX, y: e.clientY, t }

    // Reset the granular trigger state and fire one very soft scratch as
    // the tactile "contact" cue. Volume here is intentionally low because
    // there's no movement yet — subsequent scratches will scale up with
    // actual drawing speed.
    // init() is fire-and-forget — the synchronous call below covers the
    // common case where the buffer is already decoded; .then() covers the
    // very first stroke before init has finished.
    distAccumRef.current     = 0
    lastScratchAtRef.current = performance.now()
    smoothedSpeedRef.current = 0
    inkAudio.init().then(() => inkAudio.playScratch(activeTool, 0.3))
    inkAudio.playScratch(activeTool, 0.3)

    // Render the first point immediately so the stroke appears under the
    // cursor before pointermove fires.
    setLivePath({
      d:       renderStrokePath(inFlightRef.current, rect.width, rect.height),
      color:   toolColor,
      tool:    activeTool,
      opacity: TOOL_CONFIG[activeTool]?.opacity ?? 1,
    })
  }, [activeTool, toolColor])

  const extendStroke = useCallback((e) => {
    const el = rootRef.current
    if (!el) return

    // Eraser branch — runs whether or not a pointer is captured, so just
    // hovering with the mouse moves the indicator ring around.
    if (activeTool === 'eraser') {
      const rect = el.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return
      setEraserCursor({ x: e.clientX - rect.left, y: e.clientY - rect.top })
      if (e.pointerId === pointerIdRef.current) {
        // Coalesced events catch fast swipes so we don't miss strokes
        // between samples on high-frequency pointers.
        const events = (typeof e.getCoalescedEvents === 'function'
          ? e.getCoalescedEvents() : null) ?? null
        const samples = events && events.length ? events : [e]
        for (const s of samples) eraseAt(s.clientX, s.clientY)
      }
      return
    }

    if (e.pointerId !== pointerIdRef.current) return
    const live = inFlightRef.current
    if (!live) return
    const rect = el.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return

    // Distance + speed measurement for this segment.
    const last = lastSampleRef.current
    const segDist = Math.hypot(e.clientX - last.x, e.clientY - last.y)
    const segDt   = Math.max(1, e.timeStamp - last.t)   // ms, never zero
    const instantSpeed = segDist / segDt                // CSS px / ms
    lastSampleRef.current = { x: e.clientX, y: e.clientY, t: e.timeStamp }

    // Exponential moving average — keeps the speed reading from spiking
    // on a single noisy pointer sample. Heavier weight on new samples
    // (0.5) so it tracks acceleration responsively but isn't jittery.
    smoothedSpeedRef.current = smoothedSpeedRef.current * 0.5 + instantSpeed * 0.5

    // Granular firing — see the ref declaration for the rationale.
    //
    //   SCRATCH_INTERVAL_PX  — fast strokes fire one slice per this many
    //                          CSS px of travel. Density tracks speed.
    //   SCRATCH_MAX_GAP_MS   — never let more than this elapse between
    //                          slices while moving. Keeps slow, careful
    //                          letters (H, A, lowercase l, etc.) sounding
    //                          continuous instead of dotted.
    //   MIN_INTERVAL_MS      — floor between consecutive triggers — caps
    //                          density on very fast flicks so we don't
    //                          stack 20+ overlapping slices.
    //   MIN_MOVE_FOR_TIME_PX — the time trigger requires at least this
    //                          much movement since the last scratch, so
    //                          sub-pixel pen jitter alone can't fire it.
    //   MIN_AUDIBLE_SPEED    — below this speed (px/ms) we skip the
    //                          scratch entirely. Deliberate slow drawing
    //                          is then truly silent, not just very quiet.
    //   SPEED_TO_FULL_VOLUME — speed at which intensity hits 1.0. Tuned
    //                          to ~"fast handwriting" so normal writing
    //                          lands somewhere in the comfortable middle.
    const SCRATCH_INTERVAL_PX  = 22
    const SCRATCH_MAX_GAP_MS   = 130
    const MIN_INTERVAL_MS      = 35
    const MIN_MOVE_FOR_TIME_PX = 1.5
    const MIN_AUDIBLE_SPEED    = 0.05
    const SPEED_TO_FULL_VOLUME = 1.5

    distAccumRef.current += segDist
    const nowMs = performance.now()
    const sinceScratch = nowMs - lastScratchAtRef.current

    if (sinceScratch >= MIN_INTERVAL_MS) {
      const distTrigger = distAccumRef.current >= SCRATCH_INTERVAL_PX
      const timeTrigger = sinceScratch >= SCRATCH_MAX_GAP_MS &&
                          distAccumRef.current >= MIN_MOVE_FOR_TIME_PX
      if (distTrigger || timeTrigger) {
        const speed = smoothedSpeedRef.current
        if (speed >= MIN_AUDIBLE_SPEED) {
          // Linear ramp from MIN_AUDIBLE_SPEED → SPEED_TO_FULL_VOLUME
          // mapped onto intensity 0 → 1. Below the floor: no scratch at
          // all (early-returned above). Above the ceiling: capped at 1.
          const t = (speed - MIN_AUDIBLE_SPEED) /
                    (SPEED_TO_FULL_VOLUME - MIN_AUDIBLE_SPEED)
          const intensity = Math.max(0, Math.min(1, t))
          distAccumRef.current     = 0
          lastScratchAtRef.current = nowMs
          inkAudio.playScratch(live.tool, intensity)
        } else {
          // Speed too low — still consume the accumulators so we don't
          // immediately re-trigger on the next sample. Slow movement
          // == silence by design.
          distAccumRef.current     = 0
          lastScratchAtRef.current = nowMs
        }
      }
    }

    // Coalesced events on PointerEvent give sub-frame fidelity on Pencil /
    // high-Hz pointers. Fall back to the single event for browsers that
    // don't implement getCoalescedEvents.
    const events = (typeof e.getCoalescedEvents === 'function'
      ? e.getCoalescedEvents()
      : null) ?? null
    const samples = events && events.length ? events : [e]
    for (const s of samples) {
      live.points.push({
        x: (s.clientX - rect.left) / rect.width,
        y: (s.clientY - rect.top)  / rect.height,
        pressure: readPressure(s),
        t: s.timeStamp,
      })
    }

    setLivePath({
      d:       renderStrokePath(live, rect.width, rect.height),
      color:   live.color,
      tool:    live.tool,
      opacity: TOOL_CONFIG[live.tool]?.opacity ?? 1,
    })
    // Deps include activeTool so the eraser branch above sees the *current*
    // tool. Without this the callback was frozen with whatever activeTool
    // was at first mount (typically null) and the eraser cursor stopped
    // tracking the pointer entirely.
  }, [activeTool, eraseAt])

  const endStroke = useCallback((e) => {
    const el = rootRef.current

    if (activeTool === 'eraser') {
      if (e.pointerId === pointerIdRef.current) {
        pointerIdRef.current = null
        try { el?.releasePointerCapture?.(e.pointerId) } catch { /* fine */ }
      }
      return
    }

    if (e.pointerId !== pointerIdRef.current) return
    const live = inFlightRef.current

    pointerIdRef.current = null
    try { el?.releasePointerCapture?.(e.pointerId) } catch { /* fine */ }

    // Reset granular trigger state. Any in-flight scratch slices finish
    // playing themselves and dispose — no explicit stop needed.
    distAccumRef.current     = 0
    lastScratchAtRef.current = 0
    smoothedSpeedRef.current = 0

    if (live && live.points.length > 0) {
      // Single-tap (no movement at all): drop a dot rather than a zero-len
      // stroke. perfect-freehand handles single-point input fine.
      onStrokeComplete(live)
    }
    inFlightRef.current = null
    setLivePath(null)
  }, [activeTool, onStrokeComplete])

  // Defensive panic on unmount — kills any in-flight scratch slices
  // during HMR or the panel closing rather than letting them ring out.
  useEffect(() => () => {
    distAccumRef.current     = 0
    lastScratchAtRef.current = 0
    smoothedSpeedRef.current = 0
    inkAudio.panic()
  }, [])

  // Hide the eraser cursor whenever the eraser isn't the active tool.
  useEffect(() => {
    if (activeTool !== 'eraser' && eraserCursor) setEraserCursor(null)
  }, [activeTool, eraserCursor])

  // Global safety net for pointer state. Catches releases that miss the
  // captured element (DevTools / modal stealing focus mid-stroke) and
  // tab-switch / window-blur cases. Drops the in-flight stroke and any
  // mid-play one-shot rather than leaving the layer in a half-state.
  useEffect(() => {
    function killActive() {
      if (pointerIdRef.current !== null) {
        pointerIdRef.current = null
        inFlightRef.current  = null
        setLivePath(null)
      }
      distAccumRef.current     = 0
      lastScratchAtRef.current = 0
      smoothedSpeedRef.current = 0
    }
    function onHide() {
      if (document.visibilityState === 'hidden') {
        killActive()
        inkAudio.panic()
      }
    }
    function onBlur() { killActive() }
    window.addEventListener('pointerup',     killActive, { passive: true })
    window.addEventListener('pointercancel', killActive, { passive: true })
    window.addEventListener('blur',          onBlur)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      window.removeEventListener('pointerup',     killActive)
      window.removeEventListener('pointercancel', killActive)
      window.removeEventListener('blur',          onBlur)
      document.removeEventListener('visibilitychange', onHide)
    }
  }, [])

  // Hide the eraser cursor when the pointer leaves the paper.
  const handlePointerLeave = useCallback(() => {
    if (activeTool === 'eraser') setEraserCursor(null)
  }, [activeTool])

  /* penOnly mode (iPad) is just a filter in the existing handlers above
     — same desktop pipeline (React onPointerDown/Move/Up on the layer
     root + setPointerCapture), but non-pen pointers fall through so
     finger pinch / tap can be handled by parent elements. No parent-
     element listeners, no contenteditable suppression — the paper has
     no contenteditable to defend against. Smooth strokes via the
     vanilla perfect-freehand pipeline that desktop uses. */

  const interactive = !!activeTool
  const isEraser    = activeTool === 'eraser'
  const eraserRadiusPx = isEraser && size.w > 0
    ? size.w * TOOL_CONFIG.eraser.cursorRadiusRatio
    : 0

  /* In penOnly mode the root must remain pointer-events:none so non-pen
     pointers fall through to the contenteditable below. Pen events are
     penOnly is just a per-event filter inside beginStroke now — same
     pointer pipeline as desktop, finger / mouse events fall through to
     parent gestures without preventDefault. In `passive` mode the
     layer is purely visual (no React handlers, no rootActive class). */
  const reactCapture = interactive && !passive
  return (
    <div
      ref={rootRef}
      className={`${styles.root} ${reactCapture ? styles.rootActive : ''} ${isEraser && !passive ? styles.rootEraser : ''}`}
      data-drawing-layer
      onPointerDown={reactCapture ? beginStroke : undefined}
      onPointerMove={reactCapture ? extendStroke : undefined}
      onPointerUp={reactCapture ? endStroke : undefined}
      onPointerCancel={reactCapture ? endStroke : undefined}
      onPointerLeave={isEraser && !passive ? handlePointerLeave : undefined}
    >
      {size.w > 0 && size.h > 0 && (
        <svg
          ref={svgRef}
          className={styles.svg}
          viewBox={`0 0 ${size.w} ${size.h}`}
          preserveAspectRatio="none"
          aria-hidden
        >
          {persistedPaths.map(p => (
            <path
              key={p.id}
              data-stroke-id={p.id}
              d={p.d}
              fill={p.color}
              fillRule="nonzero"
              opacity={p.opacity}
            />
          ))}
          {/* Live preview + eraser cursor are owned by the interactive
              front layer. In passive mode (the back layer) we render
              only persisted strokes — the in-flight preview keeps
              showing on top while drawing and "snaps" to its proper
              z-layer on release, which is fine for the brief moment
              involved. */}
          {!passive && livePath && (
            <path
              d={livePath.d}
              fill={livePath.color}
              fillRule="nonzero"
              opacity={livePath.opacity}
            />
          )}
          {!passive && isEraser && eraserCursor && (
            <circle
              cx={eraserCursor.x}
              cy={eraserCursor.y}
              r={eraserRadiusPx}
              fill="rgba(255,255,255,0.18)"
              stroke="rgba(40,40,40,0.55)"
              strokeWidth={1.25}
            />
          )}
        </svg>
      )}
    </div>
  )
}

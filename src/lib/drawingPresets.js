/**
 * drawingPresets — pen + highlighter configuration for the handwritten
 * drawing layer. Sizes are expressed as a fraction of paper width so
 * strokes scale visually with the paper at any viewport size.
 *
 * `freehand` is passed straight into perfect-freehand's getStroke():
 *   thinning   — how much pressure shrinks the stroke (0 = constant width)
 *   smoothing  — corner softening
 *   streamline — input damping (higher = lazier, more polished)
 *   easing     — pressure curve
 *   simulatePressure — synthesise pressure from velocity when device has none
 */

// Warm, minimal palette — three colours per tool. Both palettes share the
// same three hues; for the highlighter the same swatches read as soft
// washes thanks to the layer's ~42 % opacity + multiply blend.
//   black — soft graphite, never pure #000
//   blue  — warm navy/slate, not icy
//   green — warm olive/moss, not emerald
export const PEN_COLORS = [
  '#252525', // soft black
  '#0077B6', // ink blue
  '#007200', // ink green
]

/* Highlighter swatches — kept in lockstep with the text-selection
   highlight palette in InputPanel + PaperCanvas (.highlight,
   .highlightPink, .highlightSage). One palette for both ways of
   highlighting so the canvas reads as a single system, not two. */
export const HIGHLIGHTER_COLORS = [
  '#FFD028', // yellow — matches .highlight     (rgba(255,208,40,…))
  '#FF82A0', // pink   — matches .highlightPink (rgba(255,130,160,…))
  '#4BB98C', // sage   — matches .highlightSage (rgba(75,185,140,…))
]

export const PEN = {
  // Base size in *fraction of paper width* — ~0.28% feels like a fine-tip
  // gel pen at any paper size. Halved from 0.0055 per user request so the
  // default sm / md / lg presets all draw 50% thinner. Highlighter
  // sizeRatio below is intentionally untouched (chisel-tip needs its
  // bulk). Multiplied by paperWidth to get px feed to getStroke().
  sizeRatio: 0.00275,
  opacity:   1,
  freehand: {
    thinning:           0.55,
    // smoothing tames the *outline* between sample points; streamline
    // damps the input itself. Lowered both — high streamline made the
    // rendered line lag/cut corners vs the actual pen movement, which
    // read as "snapping" to a smoother curve than the user drew.
    smoothing:          0.35,
    streamline:         0.18,
    simulatePressure:   true,
    easing:             (t) => Math.sin((t * Math.PI) / 2),
    last:               true,
    // Soft rounded caps on both ends — the previous 24-unit end taper
    // gave every stroke a pointy "spike" that read as harsh.
    start: { taper: 0, cap: true },
    end:   { taper: 0, cap: true },
  },
}

export const HIGHLIGHTER = {
  // Broader chisel — ~2.8% of paper width.
  sizeRatio: 0.028,
  opacity:   0.42,
  freehand: {
    thinning:           0.18,    // mostly constant width — felt-tip
    smoothing:          0.6,
    streamline:         0.55,
    simulatePressure:   true,
    easing:             (t) => t,
    last:               true,
    start: { taper: 0,  cap: true },
    end:   { taper: 0,  cap: true },
  },
}

/**
 * Eraser — not a drawing tool in the same sense. It hit-tests against
 * persisted stroke paths and removes any it crosses. No `sizeRatio` or
 * freehand options because we never run `getStroke` for it; the radius
 * below is only used for the on-screen cursor indicator.
 */
export const ERASER = {
  cursorRadiusRatio: 0.022,   // hit-test cursor circle, fraction of paper width
}

export const TOOL_CONFIG = { pen: PEN, highlighter: HIGHLIGHTER, eraser: ERASER }

/**
 * Thickness multipliers applied to TOOL_CONFIG[tool].sizeRatio when
 * rendering a stroke. 'md' = 1×, 'sm' is thinner, 'lg' is thicker.
 * Same scale used for pen and highlighter (each tool's natural width
 * just gets scaled). The eraser radius is not multiplied.
 */
export const STROKE_THICKNESS = {
  sm: 0.65,
  md: 1.00,
  lg: 1.55,
}
export const DEFAULT_STROKE_THICKNESS = 'md'

export const DEFAULT_PEN_COLOR         = PEN_COLORS[0]
export const DEFAULT_HIGHLIGHTER_COLOR = HIGHLIGHTER_COLORS[0]

/**
 * Convert perfect-freehand outline points into an SVG path "d" string.
 * Outline is an array of [x, y] pairs forming a closed polygon around the
 * stroke. Q-curves between midpoints give the soft, ink-like edges that a
 * polyline would miss.
 */
export function strokeOutlineToSvgPath(outline) {
  if (!outline || outline.length === 0) return ''
  const d = outline.reduce((acc, [x, y], i, arr) => {
    const [x1, y1] = arr[(i + 1) % arr.length]
    acc.push(x, y, (x + x1) / 2, (y + y1) / 2)
    return acc
  }, ['M', ...outline[0], 'Q'])
  d.push('Z')
  return d.join(' ')
}

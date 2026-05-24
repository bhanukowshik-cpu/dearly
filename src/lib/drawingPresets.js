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

export const HIGHLIGHTER_COLORS = [
  '#252525', // soft black
  '#0077B6', // ink blue
  '#007200', // ink green
]

export const PEN = {
  // Base size in *fraction of paper width* — 0.5% feels like a fine-tip pen
  // at any paper size. Multiplied by paperWidth to get px feed to getStroke().
  sizeRatio: 0.0055,
  opacity:   1,
  freehand: {
    thinning:           0.55,
    smoothing:          0.5,
    streamline:         0.45,
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

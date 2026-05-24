// Loads all hand-drawn SVG glyphs at build time via Vite's import.meta.glob.
// Replaces the hardcoded salmon stroke color with CSS currentColor so the
// glyph inherits the paper's ink color at render time.
import { typographyMetadata } from './typographyMetadata'

const rawSmall = import.meta.glob(
  '../../Dearly V2/Glyphs/Small Letters/*.svg',
  { as: 'raw', eager: true }
)
const rawCapital = import.meta.glob(
  '../../Dearly V2/Glyphs/Capital Letters/*.svg',
  { as: 'raw', eager: true }
)
const rawNumbers = import.meta.glob(
  '../../Dearly V2/Glyphs/Numbers/*.svg',
  { as: 'raw', eager: true }
)
const rawSpecial = import.meta.glob(
  '../../Dearly V2/Glyphs/Special Characters/*.svg',
  { as: 'raw', eager: true }
)

// Maps word-based filenames to actual characters.
// Required for chars that break Vite's import resolver (URL/glob metacharacters)
// and for OS-reserved chars that can't appear literally in filenames.
const SPECIAL_NAME_MAP = {
  ' back slash':   '\\',
  ' colon':        ':',
  'forward slash': '/',
  'hash':          '#',
  'percent':       '%',
  'ampersand':     '&',
  'question':      '?',
  'dquote':        '"',
  'lt':            '<',
  'gt':            '>',
  'asterisk':      '*',
  'lbracket':      '[',
  'rbracket':      ']',
  'lbrace':        '{',
  'rbrace':        '}',
}

function processGlyph(raw) {
  const str = typeof raw === 'string' ? raw : (raw?.default ?? '')
  return str
    .replace(/stroke:#[a-fA-F0-9]{3,8}/gi, 'stroke:currentColor')
    // Baseline stroke-weight multiplier — controls the default boldness of
    // the handwritten glyphs. Per-size overrides (e.g. medium = 10% bolder)
    // are applied at render time in GlyphChar so only specific sizes change.
    // Handles both "stroke-width:Xpx" (inline style) and stroke-width="X" (attribute).
    .replace(/stroke-width:([0-9.]+)px/g,  (_, w) => `stroke-width:${(parseFloat(w) * 1.26).toFixed(3)}px`)
    .replace(/stroke-width="([0-9.]+)"/g,  (_, w) => `stroke-width="${(parseFloat(w) * 1.26).toFixed(3)}"`)
    .replace(/<svg([^>]*)>/, (_, attrs) => {
      const cleaned = attrs
        .replace(/\s+width="[^"]*"/, '')
        .replace(/\s+height="[^"]*"/, '')
      return `<svg${cleaned} width="100%" height="100%" preserveAspectRatio="xMinYMid meet" overflow="visible">`
    })
}

const GLYPH_MAP = {}

for (const [path, raw] of Object.entries(rawSmall)) {
  const m = path.match(/glyph-(.+)\.svg$/)
  if (m) GLYPH_MAP[m[1]] = processGlyph(raw)
}
for (const [path, raw] of Object.entries(rawCapital)) {
  const m = path.match(/glyph-(.+)\.svg$/)
  if (m) GLYPH_MAP[m[1]] = processGlyph(raw)
}
for (const [path, raw] of Object.entries(rawNumbers)) {
  const m = path.match(/glyph-(.+)\.svg$/)
  if (m) GLYPH_MAP[m[1]] = processGlyph(raw)
}
for (const [path, raw] of Object.entries(rawSpecial)) {
  const m = path.match(/glyph-(.+)\.svg$/)
  if (!m) continue
  const ch = SPECIAL_NAME_MAP[m[1]] ?? m[1]
  if (ch.length === 1) GLYPH_MAP[ch] = processGlyph(raw)
}

export function getGlyphSvg(ch) {
  return GLYPH_MAP[ch] ?? null
}

export function hasGlyph(ch) {
  return ch in GLYPH_MAP
}

// Lazily measures each glyph's natural ink bounding box in SVG user-space coordinates
// (0–100 × 0–120, matching viewBox="0 0 100 120") using getBoundingClientRect on a
// hidden 100×120px container, where 1 rendered pixel = 1 SVG user unit.
// getBBox() is NOT used here because it returns coordinates in the <g>'s local space
// (pre-transform), not in SVG user space.
const boundsCache = {}

// Character class determines optical side bearing ratios.
// narrow: thin strokes (i, l, j, t, f, r)
// round:  circular/oval shapes (o, c, e, a, d, g, q, s, u)
// wide:   broad strokes (m, w, M, W, capital wide letters)
// default (unclassified): mid-range bearings
const GLYPH_CLASS = {
  i: 'narrow', l: 'narrow', j: 'narrow', t: 'narrow', f: 'narrow', r: 'narrow',
  I: 'narrow', J: 'narrow', T: 'narrow', F: 'narrow',
  o: 'round',  c: 'round',  e: 'round',  a: 'round',  d: 'round',
  g: 'round',  q: 'round',  s: 'round',  u: 'round',  O: 'round',
  C: 'round',  G: 'round',  Q: 'round',  S: 'round',  U: 'round',
  m: 'wide',   w: 'wide',   M: 'wide',   W: 'wide',
}

export function getGlyphClass(ch) {
  return GLYPH_CLASS[ch] ?? 'default'
}

// Returns left/right side bearings in pixels given scaledHeight and character class.
// Bearings are expressed as a fraction of the scaled glyph height (120 * scale).
export function getSideBearings(ch, scaledHeight) {
  const cls = getGlyphClass(ch)
  const ratios = typographyMetadata.sideBearings
  const r = ratios[cls] ?? ratios.default
  return { left: scaledHeight * r.left, right: scaledHeight * r.right }
}

export function getGlyphBounds(ch) {
  if (boundsCache[ch] !== undefined) return boundsCache[ch]
  const svgStr = GLYPH_MAP[ch]
  if (!svgStr) { boundsCache[ch] = null; return null }
  try {
    const div = document.createElement('div')
    // 100×120px container → 1 SVG user unit = 1 screen pixel (viewBox "0 0 100 120")
    div.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;overflow:visible;width:100px;height:120px;top:0;left:0'
    div.innerHTML = svgStr
    document.body.appendChild(div)
    const svgEl = div.querySelector('svg')
    // Query <path> elements only — the invisible artboard <rect> inflates every
    // outer-<g> bbox to the same size and must be excluded.
    const paths = svgEl ? [...svgEl.querySelectorAll('path')] : []
    let bounds = null
    if (svgEl && paths.length > 0) {
      const svgRect = svgEl.getBoundingClientRect()
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
      for (const p of paths) {
        const r = p.getBoundingClientRect()
        if (r.width > 0 || r.height > 0) {
          minX = Math.min(minX, r.left  - svgRect.left)
          maxX = Math.max(maxX, r.right - svgRect.left)
          minY = Math.min(minY, r.top   - svgRect.top)
          maxY = Math.max(maxY, r.bottom - svgRect.top)
        }
      }
      if (maxX > minX + 0.1) {
        bounds = { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
      }
    }
    document.body.removeChild(div)
    boundsCache[ch] = bounds ?? { x: 0, y: 0, width: 100, height: 120 }
  } catch (_) {
    boundsCache[ch] = { x: 0, y: 0, width: 100, height: 120 }
  }
  return boundsCache[ch]
}

// ─── Glyph frame & ruler ────────────────────────────────────────────────────
export const typographyMetadata = {
  glyphFrame: {
    width:                  100,
    height:                 120,
    // scale = fontSize / usableHeight (NOT full frame height)
    usableHeight:            85,   // 120 - topPadding(20) - bottomDescenderPadding(15)
    topPadding:              20,
    bottomDescenderPadding:  15,
    // Semantic vertical metrics — all in SVG user-space units (viewBox 0 0 100 120)
    capHeightY:              20,   // where uppercase tops reach (= topPadding)
    xHeightY:                47,   // where lowercase x/a/e/o tops reach (measured)
    baselineY:               80,
    descenderBoundaryY:      105,  // = height - bottomDescenderPadding
    baselineFromBottom:      40,
  },
  ruler: {
    alignTo:          'baseline',
    y:                 80,
    visibleByDefault:  false,
  },
  // lineHeightMultiplier per token — font sizes live in responsiveTypography below.
  //
  // Line spacing recipe (each tier's spacing = the previous tier's old spacing,
  // shifted up by one; large gets a wider value, ~20% above the previous large).
  // At desktop font sizes (15 / 20 / 30):
  //   small  → 20px  (matches the old medium spacing)
  //   medium → 30px  (matches the old large spacing)
  //   large  → 36px  (~20% wider than the old large)
  sizes: {
    small:  { lineHeightMultiplier: 20 / 15 },   // 1.333  → 20px line spacing
    medium: { lineHeightMultiplier: 30 / 20 },   // 1.5    → 30px line spacing
    large:  { lineHeightMultiplier: 36 / 30, spacingMultiplier: 0.95 },  // 1.2 → 36px line spacing
  },
  defaultSize:       'medium',
  defaultFontWeight:  700,
  spacing: {
    // letterSpacingRatio kept for reference; active spacing = sideBearings + minLetterGapRatio.
    // Reduced ~5% from the previous values (0.08 → 0.076, 0.0599 → 0.0569)
    // to tighten the gap between characters. wordSpacingRatio is unchanged
    // so the gap between words stays exactly the same.
    letterSpacingRatio: 0.076,
    wordSpacingRatio:   0.44,   // wordSpacingPx  = fontSize * 0.44
    minLetterGapRatio:  0.0569, // minLetterGapPx = fontSize * 0.0569
  },
  // Optical side bearing ratios as fraction of scaledHeight (120 * scale).
  // Baked into SVG viewBox so left/right distribute correctly on both sides.
  sideBearings: {
    narrow:  { left: 0.036, right: 0.045 }, // i, l, j, t, f, r
    round:   { left: 0.045, right: 0.063 }, // o, c, e, a, d, g, q, s, u
    wide:    { left: 0.054, right: 0.081 }, // m, w, M, W
    default: { left: 0.045, right: 0.072 },
  },
}

// ─── Responsive typography — single source of truth ─────────────────────────
// Desktop sizes are the design reference. Tablet and mobile scale them down
// proportionally via scaleFactor. Only font sizes change — letter/word spacing,
// baseline, ruler, and glyph paths are all derived from fontSize and stay intact.
export const responsiveTypography = {
  desktop: {
    breakpoint:  '>=1024px',
    scaleFactor: 1,
    sizes: { small: 15, medium: 20, large: 30 },
  },
  tablet: {
    breakpoint:  '768px–1023px',
    scaleFactor: 0.85,
    sizes: { small: 12.75, medium: 17, large: 25.5 },
  },
  mobile: {
    breakpoint:  '<768px',
    scaleFactor: 0.72,
    sizes: { small: 10.8, medium: 14.4, large: 21.6 },
  },
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const SIZE_ALIAS = { sm: 'small', md: 'medium', lg: 'large' }

export function getSizeTokens(size) {
  const key = SIZE_ALIAS[size] ?? size
  return typographyMetadata.sizes[key] ?? typographyMetadata.sizes[typographyMetadata.defaultSize]
}

// Returns 'desktop' | 'tablet' | 'mobile' for a given viewport width (px).
// Passing null or undefined defaults to 'desktop' (server-side / unknown).
export function getViewportTier(viewportWidth) {
  if (!viewportWidth || viewportWidth >= 1024) return 'desktop'
  if (viewportWidth >= 768) return 'tablet'
  return 'mobile'
}

// Scale based on usable glyph height, not the full frame height.
export function computeScale(fontSize) {
  return fontSize / typographyMetadata.glyphFrame.usableHeight
}

// Returns all rendering metrics for a given size token and viewport width.
// viewportWidth drives breakpoint selection; null → desktop defaults.
export function getScaledMetrics(size, viewportWidth = null) {
  const key   = SIZE_ALIAS[size] ?? size
  const token = typographyMetadata.sizes[key] ?? typographyMetadata.sizes[typographyMetadata.defaultSize]
  const tier  = getViewportTier(viewportWidth)
  // Resolve font size from the responsive tier; fall back to desktop if key missing.
  const fontSize = responsiveTypography[tier]?.sizes[key]
    ?? responsiveTypography.desktop.sizes[key]
    ?? responsiveTypography.desktop.sizes.medium
  const spacingMult = token.spacingMultiplier ?? 1.0
  return getScaledMetricsForPx(fontSize, {
    lineHeightMultiplier: token.lineHeightMultiplier,
    spacingMultiplier:    spacingMult,
  })
}

// Returns metrics for an arbitrary pixel font-size — used for hero / display
// text that lives outside the sm/md/lg scale (LoadingScreen, LaunchFilm, etc).
// Same math as getScaledMetrics, but driven by a raw px input instead of a
// size token. This is the unified source for per-glyph advance widths,
// baselines, line-height — so spacing stays tight at any size.
//
// Without this, custom-sized callers had to use GlyphChar's legacy em-based
// fallback which reserved a fixed 0.68em wide slot per character — making
// every glyph take the same width regardless of its actual ink, producing
// the "D e a r l y" gappy look that was the bug we're fixing here.
export function getScaledMetricsForPx(fontSize, { lineHeightMultiplier = 1.5, spacingMultiplier = 1.0 } = {}) {
  const { width: fw, capHeightY, xHeightY, baselineY, descenderBoundaryY } = typographyMetadata.glyphFrame
  const { letterSpacingRatio, wordSpacingRatio, minLetterGapRatio } = typographyMetadata.spacing
  const scale       = computeScale(fontSize)
  const scaledWidth = fw * scale
  return {
    scale,
    fontSize,
    scaledWidth,
    spacingMultiplier,
    scaledHeight:        (descenderBoundaryY - capHeightY) * scale,
    scaledBaselineY:     (baselineY - capHeightY) * scale,
    descentHeight:       (descenderBoundaryY - baselineY) * scale,
    rulerCapHeightPx:    capHeightY         * scale,
    rulerXHeightPx:      xHeightY           * scale,
    rulerDescBoundaryPx: descenderBoundaryY * scale,
    letterSpacingRatio,
    letterSpacing:       scaledWidth * letterSpacingRatio * spacingMultiplier,
    wordSpacingPx:       fontSize * wordSpacingRatio      * spacingMultiplier,
    minLetterGapPx:      fontSize * minLetterGapRatio     * spacingMultiplier,
    computedLineHeight:  fontSize * lineHeightMultiplier,
  }
}

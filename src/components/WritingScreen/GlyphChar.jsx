import { useEffect, useRef } from 'react'
import { getGlyphSvg, hasGlyph, getGlyphBounds, getSideBearings } from '../../lib/glyphLoader'
import { getScaledMetrics, typographyMetadata } from '../../lib/typographyMetadata'

// Renders a single character using the hand-drawn SVG glyph, animating each
// stroke path from invisible to fully drawn via stroke-dashoffset on mount.
//
// We set innerHTML imperatively (not via dangerouslySetInnerHTML) so React
// never re-creates the DOM nodes on parent re-renders — otherwise each
// re-render would wipe the inline animation styles we applied.
//
// Falls back to a plain Caveat span for punctuation, emoji, and any char
// not in the glyph set.
//
// Pass `size` ('sm'|'md'|'lg') for metadata-driven pixel sizing (body text).
// Pass `fontSize` (CSS string) for legacy em-based sizing (greeting text).
// Pass `customMetrics` (object from getScaledMetricsForPx) for arbitrary px
// sizes outside the sm/md/lg token scale — used by AnimatedGlyphText so
// hero/display text gets per-glyph advance widths instead of the legacy
// fixed-0.68em-per-char fallback (which spaces characters way too wide).
export default function GlyphChar({ ch, inkColor, fontWeight = 700, fontSize = 'inherit', size = null, viewportWidth = null, customMetrics = null, strokeSpeedMultiplier = 1 }) {
  const containerRef = useRef(null)
  const glyphSvg = hasGlyph(ch) ? getGlyphSvg(ch) : null
  // Metric resolution priority:
  //   1. customMetrics — caller passed a fully-computed metrics object
  //   2. size token (sm/md/lg) — viewport-tier-aware
  //   3. neither → legacy em-based fallback
  const metrics = customMetrics ?? (size ? getScaledMetrics(size, viewportWidth) : null)

  // Measure natural ink bounds per glyph; only when we have both SVG and metadata
  const bounds = (glyphSvg && metrics) ? getGlyphBounds(ch) : null
  const naturalScaledWidth = bounds ? bounds.width * metrics.scale : metrics?.scaledWidth

  // Optical advance width: visible ink width + side bearings based on character class.
  // minLetterGap is applied as marginRight (space after each glyph, not baked into width).
  const rawBearings = (metrics && naturalScaledWidth != null)
    ? getSideBearings(ch, metrics.scaledHeight)
    : null
  const spacingMult = metrics?.spacingMultiplier ?? 1.0
  const bearings = rawBearings
    ? { left: rawBearings.left * spacingMult, right: rawBearings.right * spacingMult }
    : null
  const advanceWidth = (naturalScaledWidth != null && bearings)
    ? naturalScaledWidth + bearings.left + bearings.right
    : naturalScaledWidth ?? metrics?.scaledWidth
  const minLetterGap = metrics ? metrics.minLetterGapPx : 0

  // Bake bearing space into the viewBox so left bearing appears LEFT of the ink and right
  // bearing appears RIGHT — not stacked entirely to the right due to xMinYMid anchoring.
  // leftBearingUnits converts px bearing → SVG user-space units (inverse of scale).
  const leftBearingUnits  = (bearings && metrics) ? bearings.left  / metrics.scale : 0
  const rightBearingUnits = (bearings && metrics) ? bearings.right / metrics.scale : 0
  const { capHeightY, descenderBoundaryY } = typographyMetadata.glyphFrame
  const inkHeight = descenderBoundaryY - capHeightY  // 85 user units = usableHeight
  const svgForRender = (glyphSvg && bounds)
    ? glyphSvg.replace(/viewBox="[^"]*"/, `viewBox="${bounds.x - leftBearingUnits} ${capHeightY} ${bounds.width + leftBearingUnits + rightBearingUnits} ${inkHeight}"`)
    : glyphSvg

  useEffect(() => {
    const container = containerRef.current
    if (!container || !svgForRender) return

    container.innerHTML = svgForRender

    const paths = container.querySelectorAll('path')
    // Per-size stroke-weight overrides. 1× = baseline. Multipliers scale
    // *inversely* with font size — small text has thinner absolute strokes
    // (stroke-width gets multiplied by fontSize/usableHeight) so it needs the
    // largest multiplier to stay readable. Large text is already heavy in pixels
    // so it needs the smallest bump. Values above ~2 start to blur glyph detail.
    //
    //   sm (15px font) → 1.6× — most aggressive bump so thin strokes don't disappear
    //   md (20px font) → 1.5× — the design "anchor"
    //   lg (30px font) → 1.125× — light bump; large text already reads bold
    const STROKE_MULT_BY_SIZE = { sm: 1.6, md: 1.5, lg: 1.125 }
    const strokeMult = (size && STROKE_MULT_BY_SIZE[size]) || 1
    paths.forEach((path, i) => {
      path.style.transition = 'none'
      if (strokeMult !== 1) {
        // Compute from the rendered (post-load) attribute so we don't compound
        // across re-renders. getComputedStyle on inline SVG returns "1.26px"
        // even when set via attribute, so prefer the attribute when present.
        const attrW   = path.getAttribute('stroke-width')
        const styleW  = path.style.strokeWidth
        const baseW   = parseFloat(styleW || attrW || '1') || 1
        path.style.strokeWidth = `${(baseW * strokeMult).toFixed(3)}px`
      }
      const len = path.getTotalLength()
      path.style.strokeDasharray = `${len}`
      path.style.strokeDashoffset = `${len}`
      // GPU promotion so the stroke draw doesn't repaint on the main
      // thread per frame. Without this hint, long SVG paths visibly
      // stutter at slower draw speeds because the rasterizer re-tiles
      // the path on every frame.
      path.style.willChange = 'stroke-dashoffset'
      void path.getBoundingClientRect() // force reflow before transition
      // Per-path draw duration + stagger — bumped so the pen-stroke
      // animation is clearly visible per character. 0.18s draw + 0.09s
      // stagger gives a multi-stroke letter ~0.4–0.6s of animation,
      // visible even when typing at moderate pace.
      //
      // strokeSpeedMultiplier scales BOTH the per-stroke draw and the
      // inter-stroke stagger by the same factor — values > 1 make the
      // letter visibly write more slowly (used for hero/signature text);
      // 1 = baseline (used everywhere else). Scaling both keeps the
      // stagger : draw ratio constant so the writing rhythm stays the same.
      //
      // Timing function: cubic-bezier(0.25, 0.46, 0.45, 0.94) — a gentle
      // ease-out that approximates how a pen naturally decelerates as
      // each stroke ends. `linear` was the source of the perceived
      // "stutter" — uniform progress on a stroke draw reads as choppy
      // because the eye expects acceleration/deceleration on natural
      // pen motion. Easing kills the stutter without changing duration.
      const drawSec = (0.18 / strokeSpeedMultiplier).toFixed(3)
      const lagSec  = ((i * 0.09) / strokeSpeedMultiplier).toFixed(3)
      path.style.transition = `stroke-dashoffset ${drawSec}s cubic-bezier(0.25, 0.46, 0.45, 0.94) ${lagSec}s`

      // Kick the transition on the NEXT frame (not immediately after the
      // reflow read) so the browser has a clean paint commit before we
      // start animating. Without this rAF, the transition occasionally
      // starts mid-paint and the first ~30ms drops frames — visible as
      // a jump at the start of each stroke.
      requestAnimationFrame(() => {
        path.style.strokeDashoffset = '0'
      })
    })

    // Reset on cleanup so StrictMode's double-invoke re-triggers the animation
    return () => { container.innerHTML = '' }
  }, [svgForRender, size, strokeSpeedMultiplier])

  // Caveat fallback for punctuation, emoji, unknown chars
  if (!glyphSvg) {
    return (
      <span
        style={{
          display:       'inline-block',
          fontFamily:    "'Caveat', cursive",
          fontSize:      metrics ? `${metrics.fontSize}px` : fontSize,
          fontWeight,
          color:         inkColor,
          verticalAlign: metrics ? 'top' : 'text-bottom',
          lineHeight:    1,
          ...(metrics && { marginRight: `${metrics.letterSpacing}px` }),
        }}
      >
        {ch}
      </span>
    )
  }

  // Metadata-driven path: advance width (ink + side bearings), full 120-unit frame height for baseline
  if (metrics) {
    return (
      <span
        data-glyph
        style={{
          display:       'inline-block',
          width:         `${advanceWidth}px`,
          height:        `${metrics.scaledHeight}px`,
          verticalAlign: 'top',
          lineHeight:    1,
          color:         inkColor,
          flexShrink:    0,
          marginRight:   `${minLetterGap}px`,
        }}
      >
        <span ref={containerRef} style={{ display: 'block', width: '100%', height: '100%' }} />
      </span>
    )
  }

  // Legacy em-based path (greeting text with clamp fontSize)
  return (
    <span
      style={{
        display:       'inline-block',
        verticalAlign: 'text-bottom',
        lineHeight:    1,
        fontSize,
        width:         '0.68em',
        height:        '1.1em',
        color:         inkColor,
        flexShrink:    0,
      }}
    >
      <span ref={containerRef} style={{ display: 'block', width: '100%', height: '100%' }} />
    </span>
  )
}

import { useEffect, useState, useRef, useMemo } from 'react'
import GlyphChar from './GlyphChar'
import { useCharList } from '../../lib/useCharList'
import { getScaledMetricsForPx } from '../../lib/typographyMetadata'

/**
 * useTypewriter — progressively reveals a string one character at a time.
 *
 * Returns the substring revealed so far. When the text prop changes, the
 * reveal restarts from empty. Calls `onComplete` once the full string is
 * shown (fired exactly once per text value).
 *
 * Each new character that appears in the returned substring gets a fresh
 * stable ID from useCharList downstream, which remounts the corresponding
 * GlyphChar — the stroke-dashoffset animation kicks off automatically.
 * That's how we get sequential "pen writing" without any explicit per-glyph
 * delay machinery.
 *
 * `msPerChar` is in real time (wall-clock); the actual glyph draw animation
 * (~0.18s per stroke + 0.09s stagger) overlaps with the next character's
 * reveal, so smaller msPerChar values produce a fluid hand-of-the-writer
 * feel, larger values give a more deliberate "engraver" pacing.
 */
function useTypewriter(text, { msPerChar = 80, startDelayMs = 0, onComplete } = {}) {
  const [revealed, setRevealed] = useState('')
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete

  useEffect(() => {
    // Restart from empty whenever the text changes.
    setRevealed('')
    const chars  = Array.from(text)
    const timers = []

    for (let i = 0; i < chars.length; i++) {
      timers.push(setTimeout(() => {
        setRevealed(text.slice(0, charIndexToCodeUnitIndex(chars, i + 1)))
      }, startDelayMs + (i + 1) * msPerChar))
    }

    // Fire onComplete a beat AFTER the last char reveals so the draw
    // animation has time to finish visibly before downstream code runs.
    timers.push(setTimeout(() => {
      onCompleteRef.current?.()
    }, startDelayMs + (chars.length + 1) * msPerChar + 200))

    return () => timers.forEach(clearTimeout)
  }, [text, msPerChar, startDelayMs])

  return revealed
}

// String.prototype.slice operates on UTF-16 code units; Array.from(text)
// gives us proper code-point chars (so emoji and astral chars stay intact).
// Map a code-point index → code-unit index so revealed slices align.
function charIndexToCodeUnitIndex(chars, k) {
  let out = 0
  for (let i = 0; i < k && i < chars.length; i++) out += chars[i].length
  return out
}

/**
 * AnimatedGlyphText — renders a string with the same hand-drawn SVG-stroke
 * animation used by PaperCanvas, optionally sequenced character-by-character
 * via the internal typewriter.
 *
 * Props
 *   text          string to draw
 *   size          'sm' | 'md' | 'lg'   metadata-driven pixel sizing (body)
 *   fontSize      CSS string (e.g. 'clamp(52px, 7vw, 82px)') — legacy em-based
 *                  path; used when you need a custom size outside the sm/md/lg scale
 *   inkColor      glyph color (defaults to currentColor inheritance)
 *   typewriter    bool — true = sequential reveal (default), false = all at once
 *   msPerChar     reveal pacing (typewriter only)
 *   startDelayMs  delay before the first char appears
 *   onComplete    fired once after the final char reveals
 *   className     applied to the outer wrapper span
 *   style         merged into the outer wrapper span style
 *
 * The wrapper is `inline-block` with `lineHeight: 1` so it sits cleanly
 * inside flex/center containers without inheriting weird line-box leading.
 * `wordBreak: keep-all` + `whiteSpace: normal` lets words wrap naturally
 * at word boundaries (since glyphs are individual inline-block spans, the
 * browser will break between them at spaces).
 */
// Pick a responsive pixel size from a {mobile, tablet, desktop} map based on
// current viewport width. Mirrors the breakpoints used by typographyMetadata
// so hero/body sizes scale alongside the writing-screen text.
function pickResponsivePx(sizes, viewportWidth) {
  if (typeof sizes === 'number') return sizes
  if (!sizes) return null
  const w = viewportWidth ?? (typeof window !== 'undefined' ? window.innerWidth : 1024)
  if (w < 768)  return sizes.mobile  ?? sizes.tablet ?? sizes.desktop
  if (w < 1024) return sizes.tablet  ?? sizes.desktop ?? sizes.mobile
  return sizes.desktop ?? sizes.tablet ?? sizes.mobile
}

export default function AnimatedGlyphText({
  text,
  size         = null,
  // NEW: pixel-driven sizing path. Pass a number (e.g. 82) for a fixed size,
  // or an object { mobile, tablet, desktop } for responsive sizing. Either
  // form routes through the metadata system so per-glyph advance widths,
  // line-height, and side bearings all come out correct.
  fontSizePx   = null,
  // Optional line-height multiplier when fontSizePx is used (default 1.5
  // matches the medium body recipe — comfortable for handwritten reading).
  lineHeightMultiplier = 1.5,
  // CSS string fontSize for callers that don't want metric-driven sizing
  // (kept for backwards compat; uses GlyphChar's legacy em path → wider gaps).
  fontSize     = 'inherit',
  fontWeight   = 700,
  inkColor     = 'currentColor',
  typewriter   = true,
  msPerChar    = 80,
  startDelayMs = 0,
  onComplete   = null,
  className    = '',
  style        = null,
  // Scales each glyph's per-stroke draw + stagger. >1 = visibly slower
  // writing motion (used for hero/signature text); 1 = baseline.
  strokeSpeedMultiplier = 1,
}) {
  // Track viewport width so the responsive fontSizePx form updates on resize.
  // Cheap — same pattern PaperCanvas uses for its breakpoint switch.
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth : 1024
  )
  useEffect(() => {
    if (typeof window === 'undefined') return
    const onResize = () => setViewportWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Resolve fontSizePx → numeric value → full metrics object. Memoized so
  // resize-driven viewport changes don't churn the metrics object for
  // GlyphChar (which would force innerHTML re-writes per character).
  const resolvedPx = useMemo(
    () => pickResponsivePx(fontSizePx, viewportWidth),
    [fontSizePx, viewportWidth]
  )
  const customMetrics = useMemo(
    () => resolvedPx ? getScaledMetricsForPx(resolvedPx, { lineHeightMultiplier }) : null,
    [resolvedPx, lineHeightMultiplier]
  )

  // Always call both hooks unconditionally (rules-of-hooks). When typewriter
  // mode is off we still call useTypewriter but ignore its output and feed
  // the full text into the renderer directly. The hook's setState is cheap
  // and its onComplete callback also stays useful in non-typewriter mode.
  const revealed    = useTypewriter(text, { msPerChar, startDelayMs, onComplete: typewriter ? onComplete : null })
  const visibleText = typewriter ? revealed : text

  // Stable IDs so existing chars don't remount when new ones append.
  const chars = useCharList(visibleText)

  // Fire onComplete immediately in non-typewriter mode (single tick after mount).
  useEffect(() => {
    if (!typewriter && onComplete) {
      const id = setTimeout(() => onComplete(), startDelayMs + 200)
      return () => clearTimeout(id)
    }
  }, [typewriter, text]) // eslint-disable-line react-hooks/exhaustive-deps

  // Wrapper line-height comes from the metrics' computedLineHeight (px) when
  // available, so multi-line paragraphs space correctly. Falls back to 1 for
  // the inherit/legacy path which expects the parent to control line-height.
  const wrapperLineHeight = customMetrics ? `${customMetrics.computedLineHeight}px` : 1
  const wrapperFontSize   = customMetrics ? `${customMetrics.fontSize}px` : fontSize

  // Word grouping — mirrors PaperCanvas's renderWordWrapped pattern.
  //   • Letters group into word units rendered as inline-block + nowrap
  //     so a single word never breaks across lines mid-glyph.
  //   • Spaces between words are explicit fixed-width spans set to
  //     wordSpacingPx (from the metrics) — this is the gap the writing
  //     screen uses between words. Without it, GlyphChar's fallback
  //     for ' ' renders a 5–6 px Caveat space and words read as
  //     "Mynameis" / "obsessover".
  //   • Newlines emit a <br/>.
  // First-char ID per word is reused as the React key, so appending
  // characters during typewriter reveal doesn't remount the whole word
  // (only the new glyph mounts and animates in).
  const wordSpacingPx = customMetrics ? customMetrics.wordSpacingPx : null
  const rendered = renderWordGroups(chars, {
    inkColor,
    fontWeight,
    fontSize:      wrapperFontSize,
    size,
    customMetrics,
    viewportWidth,
    wordSpacingPx,
    strokeSpeedMultiplier,
  })

  return (
    <span
      className={className}
      style={{
        display:      'inline-block',
        lineHeight:   wrapperLineHeight,
        color:        inkColor,
        fontFamily:   "'Caveat', cursive", // affects only the punctuation/emoji fallback
        fontSize:     wrapperFontSize,
        fontWeight,
        // Glyphs are inline-block; the word-group wrappers handle the
        // no-break-within-word rule, the inter-word spacers act as the
        // break opportunities. whiteSpace:normal lets the browser wrap.
        whiteSpace:   'normal',
        wordBreak:    'normal',
        overflowWrap: 'normal',
        ...(style || {}),
      }}
    >
      {rendered}
    </span>
  )
}

// Splits a list of {id, ch} chars into renderable units:
//   • Sequences of non-space chars become a <span> word-group (inline-block,
//     nowrap) containing one GlyphChar per char.
//   • Each ' ' becomes a fixed-width spacer span (wordSpacingPx) — sits
//     between groups as a break-opportunity for the browser to wrap on.
//   • Each '\n' becomes a <br/>.
function renderWordGroups(chars, opts) {
  const { inkColor, fontWeight, fontSize, size, customMetrics, viewportWidth, wordSpacingPx, strokeSpeedMultiplier } = opts
  const out = []
  let word = []
  const flush = () => {
    if (word.length === 0) return
    const firstId = word[0].id
    out.push(
      <span
        key={`w-${firstId}`}
        style={{
          display:    'inline-block',
          whiteSpace: 'nowrap',
          // Keep the word's baseline aligned with neighbouring spacers.
          verticalAlign: 'top',
          lineHeight:    1,
        }}
      >
        {word.map(({ id, ch }) => (
          <GlyphChar
            key={id}
            ch={ch}
            inkColor={inkColor}
            fontWeight={fontWeight}
            fontSize={fontSize}
            size={size}
            viewportWidth={viewportWidth}
            customMetrics={customMetrics}
            strokeSpeedMultiplier={strokeSpeedMultiplier}
          />
        ))}
      </span>
    )
    word = []
  }
  for (const item of chars) {
    if (item.ch === '\n') { flush(); out.push(<br key={`br-${item.id}`} />); continue }
    if (item.ch === ' ')  {
      flush()
      out.push(
        <span
          key={`sp-${item.id}`}
          aria-hidden
          style={{
            display:       'inline-block',
            // Without explicit metrics (legacy em path), fall back to
            // 0.28em — wide enough to read as a word gap at any size.
            width:         wordSpacingPx != null ? `${wordSpacingPx}px` : '0.28em',
            verticalAlign: 'top',
          }}
        />
      )
      continue
    }
    word.push(item)
  }
  flush()
  return out
}

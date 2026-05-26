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
  // Tightens or loosens inter-character spacing. Multiplies both the
  // letterSpacing (between glyphs) and the side bearings. <1 = tighter
  // (used on hero text where the default 1.0 spreads big letters too far
  // apart visually); 1 = baseline (matches the editor body text).
  spacingMultiplier = 1.0,
  // Per-pair kerning overrides — keyed by the two-char sequence, value
  // in pixels applied as negative marginLeft on the SECOND char. Useful
  // for tightening specific optical-gap pairs (e.g. 'rl', 'ly' on the
  // hero) that the universal side-bearings can't fix without crushing
  // every other pair. Example: { 'rl': -8, 'ly': -6 }
  kerningPairsPx = null,
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
    () => resolvedPx ? getScaledMetricsForPx(resolvedPx, { lineHeightMultiplier, spacingMultiplier }) : null,
    [resolvedPx, lineHeightMultiplier, spacingMultiplier]
  )

  // FULL text rendered from frame 1 — even in typewriter mode. This locks
  // the wrapper width so the layout doesn't shift as each char appears.
  // (The OLD model appended chars as they were "revealed" → wrapper grew
  // wider on every reveal → centered parents pushed the existing chars
  // leftward, making it look like the word was expanding outward from the
  // center instead of writing left-to-right in a fixed position.)
  //
  // Sequencing instead happens via per-char extraDelaySec passed to each
  // GlyphChar — its stroke-dashoffset transition delay-starts so the glyph
  // appears blank until its turn, then draws. The wrapper layout never
  // moves; chars just "ink in" left-to-right one by one.
  const chars = useCharList(text)

  // Fire onComplete once the last char's stroke draw would have finished:
  // chars.length × msPerChar + a buffer for the final stroke duration.
  // Skipped in non-typewriter mode (just fire immediately).
  useEffect(() => {
    if (!onComplete) return
    if (!typewriter) {
      const id = setTimeout(() => onComplete(), startDelayMs + 200)
      return () => clearTimeout(id)
    }
    // Stroke draws are ~0.36s per character at strokeSpeedMultiplier=0.5,
    // ~0.18s at 1×; use 600ms as a generous floor for the final flourish.
    const totalMs = startDelayMs + chars.length * msPerChar + 600
    const id = setTimeout(() => onComplete(), totalMs)
    return () => clearTimeout(id)
  }, [typewriter, text, msPerChar, startDelayMs]) // eslint-disable-line react-hooks/exhaustive-deps

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
    kerningPairsPx,
    // Per-char stroke delay sequencer — only active in typewriter mode.
    // Each char gets extraDelaySec = (charIndex × msPerChar)/1000 + startDelayMs/1000
    // so the wrapper width is fixed but strokes draw in left-to-right order.
    perCharDelaySec:  typewriter ? msPerChar / 1000 : 0,
    startDelaySec:    typewriter ? startDelayMs / 1000 : 0,
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
  const { inkColor, fontWeight, fontSize, size, customMetrics, viewportWidth, wordSpacingPx, strokeSpeedMultiplier, kerningPairsPx, perCharDelaySec = 0, startDelaySec = 0 } = opts
  // Lookup helper: returns negative px to apply as marginLeft on `ch`
  // when the immediately preceding glyph was `prevCh`. Pair keys are
  // case-sensitive ("rl" ≠ "rL"). Returns 0 for any pair not listed.
  const kernFor = (prevCh, ch) => {
    if (!kerningPairsPx || !prevCh) return 0
    return kerningPairsPx[prevCh + ch] || 0
  }
  const out = []
  let word = []
  // Global index across ALL chars in the text (incl. spaces) — drives the
  // per-char extraDelaySec so each char draws on its own beat without the
  // wrapper width shifting. Tracked outside the word array because spaces
  // and newlines need to count toward the cadence too (otherwise gaps in
  // the text would have characters drawing too early).
  let globalCharIndex = 0
  const flush = () => {
    if (word.length === 0) return
    const firstId = word[0].id
    const wordChars = word.slice()
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
        {wordChars.map(({ id, ch, charIndex }, idx) => {
          // Look at the preceding glyph IN THE SAME WORD for kerning.
          // (Cross-word kerning would also need to consider the prior
          // word's last char — but our word groups are separated by
          // spacers, so cross-word visual gap is already controlled by
          // wordSpacingPx and doesn't need pair tuning.)
          const prevCh = idx > 0 ? wordChars[idx - 1].ch : null
          return (
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
              extraDelaySec={startDelaySec + charIndex * perCharDelaySec}
              kerningLeftPx={kernFor(prevCh, ch)}
            />
          )
        })}
      </span>
    )
    word = []
  }
  for (const item of chars) {
    if (item.ch === '\n') {
      flush()
      out.push(<br key={`br-${item.id}`} />)
      globalCharIndex++
      continue
    }
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
      globalCharIndex++
      continue
    }
    // Tag char with its position so the per-char delay can be computed
    // by the GlyphChar inside flush(). Tracked here (in iteration order)
    // not on `chars` itself so the typewriter sequencing matches the
    // actual visual left-to-right reading order, accounting for spaces.
    word.push({ ...item, charIndex: globalCharIndex })
    globalCharIndex++
  }
  flush()
  return out
}

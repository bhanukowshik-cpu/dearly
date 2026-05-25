import { useEffect, useState, useRef } from 'react'
import GlyphChar from './GlyphChar'
import { useCharList } from '../../lib/useCharList'

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
export default function AnimatedGlyphText({
  text,
  size         = null,
  fontSize     = 'inherit',
  fontWeight   = 700,
  inkColor     = 'currentColor',
  typewriter   = true,
  msPerChar    = 80,
  startDelayMs = 0,
  onComplete   = null,
  className    = '',
  style        = null,
  viewportWidth = null,
}) {
  // Always call both hooks unconditionally (rules-of-hooks). When typewriter
  // mode is off we still call useTypewriter but ignore its output and feed
  // the full text into the renderer directly. The hook's setState is cheap
  // and its onComplete callback also stays useful in non-typewriter mode.
  const revealed     = useTypewriter(text, { msPerChar, startDelayMs, onComplete: typewriter ? onComplete : null })
  const visibleText  = typewriter ? revealed : text

  // Stable IDs so existing chars don't remount when new ones append.
  const chars = useCharList(visibleText)

  // Fire onComplete immediately in non-typewriter mode (single tick after mount).
  useEffect(() => {
    if (!typewriter && onComplete) {
      const id = setTimeout(() => onComplete(), startDelayMs + 200)
      return () => clearTimeout(id)
    }
  }, [typewriter, text]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <span
      className={className}
      style={{
        display:      'inline-block',
        lineHeight:   1,
        color:        inkColor,
        fontFamily:   "'Caveat', cursive", // affects only the punctuation/emoji fallback
        fontSize,
        fontWeight,
        ...(style || {}),
      }}
    >
      {chars.map(({ id, ch }) => (
        <GlyphChar
          key={id}
          ch={ch}
          inkColor={inkColor}
          fontWeight={fontWeight}
          fontSize={fontSize}
          size={size}
          viewportWidth={viewportWidth}
        />
      ))}
    </span>
  )
}

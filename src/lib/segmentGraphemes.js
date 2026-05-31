/**
 * Split a string into grapheme clusters (user-perceived characters) rather
 * than Unicode code points.
 *
 * `Array.from(text)` splits by code point, which shatters ZWJ emoji sequences
 * (e.g. "face in clouds" 😶‍🌫️ = face + ZWJ + fog + VS) and skin-tone modifier
 * sequences into separate units — each then renders as its own glyph, so the
 * emoji appears broken (a face followed by a grey box, etc).
 *
 * `Intl.Segmenter` groups those code points back into one grapheme so the whole
 * emoji is treated as a single character. Falls back to `Array.from` where the
 * API is unavailable (very old browsers / non-browser contexts).
 */

const segmenter =
  typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function'
    ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    : null

export function segmentGraphemes(text) {
  if (!text) return []
  if (!segmenter) return Array.from(text)
  const out = []
  for (const { segment } of segmenter.segment(text)) out.push(segment)
  return out
}

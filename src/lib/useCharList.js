import { useState, useEffect, useRef } from 'react'

/* Module-level monotonic counter — survives HMR, never collides */
let _uid = 0
function newId() { return ++_uid }

/**
 * useCharList(text)
 *
 * Tracks a string as an array of { id, ch } objects with stable IDs.
 *
 * When the text changes:
 *  - Common prefix/suffix characters keep their IDs  → no re-animation
 *  - Characters added in the middle get fresh IDs    → animate in
 *  - Deleted characters vanish from the array        → instant removal (no AnimatePresence needed)
 *
 * Diff is done on Unicode codepoints (Array.from) so emoji and other astral-plane
 * characters count as one unit — avoids index drift from UTF-16 surrogate pairs.
 */
export function useCharList(text) {
  const [chars, setChars] = useState(() =>
    Array.from(text).map(ch => ({ id: newId(), ch }))
  )
  const prev = useRef(text)

  useEffect(() => {
    if (text === prev.current) return
    const oldArr = Array.from(prev.current)
    const newArr = Array.from(text)
    prev.current = text

    /* ── Find common prefix ─────────────────────────────────────────── */
    const minLen = Math.min(oldArr.length, newArr.length)
    let p = 0
    while (p < minLen && oldArr[p] === newArr[p]) p++

    /* ── Find common suffix (must not overlap the prefix) ───────────── */
    let s = 0
    while (
      s < oldArr.length - p &&
      s < newArr.length - p &&
      oldArr[oldArr.length - 1 - s] === newArr[newArr.length - 1 - s]
    ) s++

    /* ── Splice in new middle characters ────────────────────────────── */
    setChars(existing => {
      const prefix    = existing.slice(0, p)
      const suffix    = s > 0 ? existing.slice(existing.length - s) : []
      const newMiddle = newArr
        .slice(p, s > 0 ? newArr.length - s : undefined)
        .map(ch => ({ id: newId(), ch }))
      return [...prefix, ...newMiddle, ...suffix]
    })
  }, [text])

  return chars
}

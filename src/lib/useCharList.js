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
 * This gives O(n) diff per keystroke and ≤1 setState call.
 */
export function useCharList(text) {
  const [chars, setChars] = useState(() =>
    Array.from(text).map(ch => ({ id: newId(), ch }))
  )
  const prev = useRef(text)

  useEffect(() => {
    if (text === prev.current) return
    const oldT = prev.current
    const newT = text
    prev.current = newT

    /* ── Find common prefix ─────────────────────────────────────────── */
    const minLen = Math.min(oldT.length, newT.length)
    let p = 0
    while (p < minLen && oldT[p] === newT[p]) p++

    /* ── Find common suffix (must not overlap the prefix) ───────────── */
    let s = 0
    while (
      s < oldT.length - p &&
      s < newT.length - p &&
      oldT[oldT.length - 1 - s] === newT[newT.length - 1 - s]
    ) s++

    /* ── Splice in new middle characters ────────────────────────────── */
    setChars(existing => {
      const prefix    = existing.slice(0, p)
      const suffix    = s > 0 ? existing.slice(existing.length - s) : []
      const midStr    = newT.slice(p, s > 0 ? newT.length - s : undefined)
      const newMiddle = Array.from(midStr).map(ch => ({ id: newId(), ch }))
      return [...prefix, ...newMiddle, ...suffix]
    })
  }, [text])

  return chars
}

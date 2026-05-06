import { useRef } from 'react'

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
 *  - Deleted characters vanish from the array        → instant removal
 *
 * Implemented with a ref updated synchronously during render (not via
 * useEffect) so buildSegments always sees up-to-date IDs on the same render
 * that the text changed. The previous useState+useEffect approach left chars
 * one render stale, causing all characters after an insertion to fall back to
 * positional 's${i}' keys, remounting their CharPath and re-triggering the
 * draw animation (visible jitter).
 */
export function useCharList(text) {
  const ref = useRef(null)

  /* First render — initialise directly from text */
  if (!ref.current) {
    ref.current = {
      text,
      chars: Array.from(text).map(ch => ({ id: newId(), ch })),
    }
  }

  /* Subsequent renders — diff synchronously so keys are correct this render */
  if (ref.current.text !== text) {
    const oldArr   = Array.from(ref.current.text)
    const newArr   = Array.from(text)
    const existing = ref.current.chars

    /* Find common prefix */
    const minLen = Math.min(oldArr.length, newArr.length)
    let p = 0
    while (p < minLen && oldArr[p] === newArr[p]) p++

    /* Find common suffix (must not overlap the prefix) */
    let s = 0
    while (
      s < oldArr.length - p &&
      s < newArr.length - p &&
      oldArr[oldArr.length - 1 - s] === newArr[newArr.length - 1 - s]
    ) s++

    const prefix    = existing.slice(0, p)
    const suffix    = s > 0 ? existing.slice(existing.length - s) : []
    const newMiddle = newArr
      .slice(p, s > 0 ? newArr.length - s : undefined)
      .map(ch => ({ id: newId(), ch }))

    ref.current = { text, chars: [...prefix, ...newMiddle, ...suffix] }
  }

  return ref.current.chars
}

/**
 * TextPopup — iPad-only small floating text input.
 *
 * Sits just to the LEFT of the Text FAB (bottom-right). Replaces the
 * make-the-whole-paper-contenteditable model, which was bad UX because
 * casual taps on the paper opened the keyboard and got in the way of
 * pen drawing.
 *
 * The popup is a small textarea — the iOS native keyboard opens on
 * mount, the user types here, and the rendered text appears on the
 * paper above (via the existing BodyText render). When focus leaves
 * the popup, it closes.
 */

import { useEffect, useRef } from 'react'
import styles from './TextPopup.module.css'

export default function TextPopup({ value = '', onChange, onClose }) {
  const ref = useRef(null)

  // Auto-focus on mount so the iOS keyboard opens without an extra tap.
  useEffect(() => {
    ref.current?.focus()
    // Move caret to end so the user types where existing content left off.
    const el = ref.current
    if (el) {
      const len = el.value.length
      try { el.setSelectionRange(len, len) } catch { /* fine */ }
    }
  }, [])

  function handleBlur(e) {
    // Don't close if focus is moving INTO the popup container (eg. the
    // user tapped the wrapper instead of the textarea by accident).
    const next = e.relatedTarget
    const wrap = ref.current?.closest(`.${styles.popup}`)
    if (wrap && next && wrap.contains(next)) return
    onClose?.()
  }

  return (
    <div className={styles.popup} role="group" aria-label="Type your message">
      <textarea
        ref={ref}
        className={styles.input}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        onBlur={handleBlur}
        placeholder="Write your heart out…"
        rows={3}
        spellCheck
        autoCorrect="on"
        autoCapitalize="sentences"
        aria-label="Letter text"
      />
    </div>
  )
}

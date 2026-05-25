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

const SIZES = [
  { id: 'sm', label: 'S' },
  { id: 'md', label: 'M' },
  { id: 'lg', label: 'L' },
]

export default function TextPopup({
  value = '',
  onChange,
  onClose,
  textSize = 'md',
  onChangeTextSize,
}) {
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
    // user tapped a size button instead of the textarea).
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
      {/* S / M / L inside the popup — same affordance as the desktop
          InputPanel. preventDefault on pointerdown keeps focus + caret
          in the textarea so picking a size doesn't dismiss the keyboard. */}
      <div className={styles.sizeRow} role="radiogroup" aria-label="Text size">
        {SIZES.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            className={`${styles.sizeBtn} ${textSize === id ? styles.sizeBtnActive : ''}`}
            onClick={() => onChangeTextSize?.(id)}
            onPointerDown={(e) => { e.preventDefault(); e.stopPropagation() }}
            role="radio"
            aria-checked={textSize === id}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}

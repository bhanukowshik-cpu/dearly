/**
 * TextPopup — iPad-only small floating text input.
 *
 * Sits just to the LEFT of the Text FAB (bottom-right). The user types
 * here and the rendered text appears on the paper above. When focus
 * leaves the popup, it closes.
 *
 * Two modes:
 *   • Legacy "live message" — `value` + `onChange` bind to the paragraph
 *     body. Used on desktop and as the iPad fallback when no
 *     `onCommitElement` callback is provided.
 *   • Element commit mode — when `onCommitElement` is set, hitting
 *     "Add" (or Enter) drops the current text as a draggable text
 *     element on the paper and clears the textarea for the next entry.
 *     This is the iPad authoring flow.
 */

import { useEffect, useRef, useState } from 'react'
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
  /* When set, the popup enters "element commit" mode — typing happens
     in a local draft buffer, and Add (or Enter) calls this with the
     draft so the parent can drop it as a draggable text card. The
     `value` / `onChange` props are then ignored. */
  onCommitElement = null,
}) {
  const ref = useRef(null)
  const isElementMode = typeof onCommitElement === 'function'
  // In element-commit mode, the textarea is a local draft (not the
  // paragraph body), so we manage its value here.
  const [draft, setDraft] = useState('')

  // Auto-focus on mount so the iOS keyboard opens without an extra tap.
  useEffect(() => {
    ref.current?.focus()
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

  function commit() {
    const text = (isElementMode ? draft : value).trim()
    if (!text) return
    onCommitElement?.({ text, size: textSize })
    setDraft('')
    // Re-focus so the user can keep dropping entries without extra taps.
    requestAnimationFrame(() => ref.current?.focus())
  }

  function handleKeyDown(e) {
    // Enter (without Shift) commits in element mode; Shift+Enter inserts
    // a newline for multi-line cards. In legacy mode Enter still inserts
    // newlines as before (textarea default).
    if (isElementMode && e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      commit()
    }
  }

  // Which buffer drives the textarea depends on mode.
  const displayValue = isElementMode ? draft : value
  const onChangeHandler = isElementMode
    ? (e) => setDraft(e.target.value)
    : (e) => onChange?.(e.target.value)

  return (
    <div className={styles.popup} role="group" aria-label="Type your message">
      <textarea
        ref={ref}
        className={styles.input}
        value={displayValue}
        onChange={onChangeHandler}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        placeholder={isElementMode ? 'Type, then tap Add (or Enter)' : 'Write your heart out…'}
        rows={3}
        spellCheck
        autoCorrect="on"
        autoCapitalize="sentences"
        aria-label="Letter text"
      />

      <div className={styles.controlsRow}>
        {/* S / M / L — inside the popup, same affordance as the desktop
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

        {/* Add — only in element-commit mode. Same preventDefault trick
            on pointerdown so tapping it doesn't blur the textarea (which
            would close the popup). */}
        {isElementMode && (
          <button
            type="button"
            className={`${styles.addBtn} ${draft.trim() ? styles.addBtnEnabled : ''}`}
            onClick={commit}
            onPointerDown={(e) => { e.preventDefault(); e.stopPropagation() }}
            disabled={!draft.trim()}
            aria-label="Add text to paper"
          >
            Add to paper
          </button>
        )}
      </div>
    </div>
  )
}

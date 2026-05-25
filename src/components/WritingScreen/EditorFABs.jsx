/**
 * EditorFABs — iPad-only floating action buttons (bottom-right, above the
 * Write toolbar). Stacked vertically:
 *
 *   ┌──┐
 *   │😊│  emoji  — opens the system emoji picker, drops choice as a sticker
 *   └──┘
 *   ┌──┐
 *   │T │  text   — focuses the paper contenteditable & summons the keyboard
 *   └──┘
 *
 * Bottom-right is the standard touch FAB zone (thumb-reachable in landscape
 * iPad held two-handed). Stacking keeps the visual weight contained.
 */

import { useRef, useState } from 'react'
import EmojiPicker from './EmojiPicker'
import styles from './EditorFABs.module.css'

function IconText({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 6h16M9 6v14M15 6v14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/* Native unicode emoji rendered at FAB-size — uses the system's color
   emoji font (Apple Color Emoji on iOS), no SVG outline needed. */
function IconEmoji() {
  return (
    <span className={styles.emojiGlyph} aria-hidden>😊</span>
  )
}

function IconPen({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M3 21l3.5-1L18 8.5 15.5 6 4 17.5 3 21z"
        stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" fill="rgba(255,255,255,0.10)" />
      <path d="M15.5 6l2.5-2.5 2.5 2.5L18 8.5" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  )
}

export default function EditorFABs({
  onRequestFocusEditor,
  onAddEmoji,
  drawFabVisible = false,
  onRequestDrawMode,
}) {
  const emojiBtnRef = useRef(null)
  const [pickerOpen, setPickerOpen] = useState(false)

  function handleEmojiPick(emoji) {
    // emoji-mart returns an object with `native` for the unicode char.
    const char = emoji?.native ?? (typeof emoji === 'string' ? emoji : '')
    if (char) onAddEmoji?.(char)
    setPickerOpen(false)
  }

  /* preventDefault on pointerdown stops the FAB from stealing focus from
     the contenteditable paper — so when the user picks an emoji,
     getSelection() still points at their actual caret in the paper. */
  const preserveFocus = (e) => { e.preventDefault() }

  return (
    <>
      <div className={styles.root}>
        {drawFabVisible && (
          /* Replacement for the bottom WriteToolbar while typing — one
             tap dismisses the editor + restores the drawing toolbar. */
          <button
            type="button"
            className={styles.fab}
            onClick={() => onRequestDrawMode?.()}
            aria-label="Switch to drawing tools"
            title="Draw"
          >
            <IconPen />
          </button>
        )}
        <button
          ref={emojiBtnRef}
          type="button"
          className={styles.fab}
          onPointerDown={preserveFocus}
          onClick={() => setPickerOpen(p => !p)}
          aria-label="Add an emoji"
          title="Add an emoji"
        >
          <IconEmoji />
        </button>
        <button
          type="button"
          className={styles.fab}
          /* Text FAB intentionally does NOT preserveFocus — clicking it is
             the explicit "summon keyboard" action which requires focusing
             the editor anyway. */
          onClick={() => onRequestFocusEditor?.()}
          aria-label="Type on the paper"
          title="Type"
        >
          <IconText />
        </button>
      </div>
      {pickerOpen && (
        <EmojiPicker
          triggerRef={emojiBtnRef}
          placement="up"
          onSelect={handleEmojiPick}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </>
  )
}

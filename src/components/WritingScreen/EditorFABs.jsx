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

function IconEmoji({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="9" cy="10" r="1" fill="currentColor" />
      <circle cx="15" cy="10" r="1" fill="currentColor" />
      <path d="M8.5 14.5c1 1.2 2.2 1.8 3.5 1.8s2.5-.6 3.5-1.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

export default function EditorFABs({ onRequestFocusEditor, onAddEmoji }) {
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

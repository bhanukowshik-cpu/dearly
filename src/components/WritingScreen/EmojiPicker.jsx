import { useEffect, useLayoutEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import Picker from '@emoji-mart/react'
import data from '@emoji-mart/data'
import styles from './EmojiPicker.module.css'

const PICKER_W  = 352   // emoji-mart default width
const PICKER_H  = 435   // approximate height
const NAV_H     = 56    // app top-bar height — picker must stay below this
const MARGIN    = 8     // min gap from viewport edges

/* ─────────────────────────────────────────────────────────────────────────
   EmojiPicker — portalled to document.body so overflow/stacking contexts
   in parent elements (sticky leftCol, backdrop-filter boxes, etc.) never
   clip or z-order-hide the picker.
   ───────────────────────────────────────────────────────────────────────── */
export default function EmojiPicker({ onSelect, onClose, triggerRef, placement = 'up' }) {
  const [style, setStyle] = useState(null)

  /* Compute position once on mount, after the trigger is painted */
  useLayoutEffect(() => {
    if (!triggerRef?.current) return

    const rect = triggerRef.current.getBoundingClientRect()
    const vw   = window.innerWidth
    const vh   = window.innerHeight

    /* Horizontal: align left edge of picker to left edge of trigger,
       clamped so the picker never bleeds past the right viewport edge. */
    let left = rect.left
    if (left + PICKER_W > vw - MARGIN) left = vw - PICKER_W - MARGIN
    if (left < MARGIN) left = MARGIN

    /* Vertical: open upward or downward, flip if there isn't enough room */
    let top
    if (placement === 'up') {
      top = rect.top - PICKER_H - 8
      if (top < NAV_H) top = rect.bottom + 8   // not enough room above → flip down
    } else {
      top = rect.bottom + 8
      if (top + PICKER_H > vh - MARGIN) top = rect.top - PICKER_H - 8  // flip up
    }

    /* Final clamp: never obscure the nav bar */
    if (top < NAV_H) top = NAV_H

    setStyle({ position: 'fixed', left, top, zIndex: 9999 })
  }, [triggerRef, placement])

  /* Close when the user clicks outside — ignore clicks on the trigger itself */
  useEffect(() => {
    function handlePointerDown(e) {
      if (triggerRef?.current?.contains(e.target)) return
      onClose()
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [onClose, triggerRef])

  if (!style) return null

  const yOffset = placement === 'up' ? 8 : -8

  return createPortal(
    <motion.div
      style={style}
      className={styles.wrap}
      initial={{ opacity: 0, scale: 0.93, y: yOffset }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.93, y: yOffset / 2 }}
      transition={{ duration: 0.16, ease: 'easeOut' }}
      onPointerDown={e => e.stopPropagation()}
    >
      <Picker
        data={data}
        onEmojiSelect={emoji => onSelect(emoji.native)}
        theme="dark"
        set="native"
        skinTonePosition="search"
        previewPosition="none"
        navPosition="top"
        searchPosition="sticky"
        perLine={8}
        emojiSize={20}
        emojiButtonSize={32}
        maxFrequentRows={2}
        autoFocus={false}
      />
    </motion.div>,
    document.body
  )
}

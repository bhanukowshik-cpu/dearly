/**
 * TextElementRenderer + TextElementControls — draggable text elements.
 *
 * iPad authoring drops typed entries as individual text cards on the
 * paper (instead of appending to one paragraph body). Each element is
 * an object with {uid, text, x, y, scale, rotation, size, color}, where
 * x/y are percentages of paper dimensions. The user can:
 *   • drag the body to move
 *   • drag the corner handle to resize (font scale)
 *   • drag the rotation handle to rotate
 *   • tap the × to delete
 *
 * Architecture mirrors StickerIcon + StickerControls in PaperCanvas.jsx
 * exactly so behaviour, hit-testing, and z-index stacking all match.
 * Two components, both exported:
 *   - TextElementRenderer — the rendered text (scaled motion.div)
 *   - TextElementControls — selection chrome (fixed-size handles)
 *
 * Recipient view + non-iPad authoring still render these elements (they
 * persist with the note); only the *creation* flow lives in the iPad
 * Text FAB.
 */

import { useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import styles from './TextElementRenderer.module.css'

/* Base font-size in pixels for each `size` tier. Final pixel size at
   render time = BASE_FONT_SIZE[size] * element.scale. Kept on the same
   sm/md/lg axis as the rest of the writing system so a Style toggle
   could expose it later. */
const BASE_FONT_SIZE = {
  sm: 18,
  md: 26,
  lg: 36,
}

/* ─────────────────────────────────────────────────────────────────────────
   TextElementRenderer — the text itself.
   Positioned absolutely at (x%, y%) of the paper. The motion.div scales
   + rotates per element state; the text inside uses Caveat so it reads
   handwritten alongside the pen strokes. Drag-to-move uses the same
   pointerdown + window-listener pattern as StickerIcon.
   ───────────────────────────────────────────────────────────────────────── */
export function TextElementRenderer({
  element,
  isSelected,
  paperRef,
  onSelect,
  onMove,
}) {
  const cleanupRef = useRef(null)
  useEffect(() => () => { cleanupRef.current?.() }, [])

  function handlePointerDown(e) {
    // Don't start a drag with a pen pointer — those go to the drawing
    // layer for ink strokes. Finger / mouse only.
    if (e.pointerType === 'pen') return
    e.stopPropagation()
    onSelect?.(element.uid)

    const paper = paperRef.current
    if (!paper) return
    const startX = e.clientX
    const startY = e.clientY
    let dragging = false

    function onPM(me) {
      if (!dragging && Math.hypot(me.clientX - startX, me.clientY - startY) > 4) {
        dragging = true
      }
      if (dragging) {
        const rect = paper.getBoundingClientRect()
        onMove?.(
          element.uid,
          Math.max(2, Math.min(98, ((me.clientX - rect.left) / rect.width)  * 100)),
          Math.max(2, Math.min(98, ((me.clientY - rect.top)  / rect.height) * 100)),
        )
      }
    }
    function onPU() {
      window.removeEventListener('pointermove', onPM)
      window.removeEventListener('pointerup',   onPU)
      cleanupRef.current = null
    }
    cleanupRef.current = onPU
    window.addEventListener('pointermove', onPM)
    window.addEventListener('pointerup',   onPU)
  }

  const baseFs = BASE_FONT_SIZE[element.size] ?? BASE_FONT_SIZE.md
  const fontSize = baseFs * (element.scale ?? 1)

  return (
    <motion.div
      className={`${styles.elementRoot} ${isSelected ? styles.elementRootSelected : ''}`}
      style={{
        left:   `${element.x}%`,
        top:    `${element.y}%`,
        // Sit above DrawingLayer (z-12) so finger taps reach the text
        // for selection / drag. Same recipe as stickers (z-13 default).
        zIndex: isSelected ? 16 : 14,
        color:  element.color || '#1F2024',
        fontSize: `${fontSize}px`,
      }}
      initial={{ scale: 0.92, opacity: 0 }}
      animate={{
        scale:    1,
        rotate:   element.rotation || 0,
        opacity:  1,
      }}
      exit={{ scale: 0.92, opacity: 0 }}
      transition={{
        scale:   { type: 'spring', stiffness: 600, damping: 42 },
        rotate:  { type: 'tween',  duration: 0.04 },
        opacity: { duration: 0.15 },
      }}
      onPointerDown={handlePointerDown}
    >
      <span className={styles.elementText}>{element.text}</span>
    </motion.div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────
   TextElementControls — selection frame + handles + delete button.
   Rendered OUTSIDE the scaled motion.div above so the chrome stays at
   a constant pixel size regardless of element scale (just like
   StickerControls).
   ───────────────────────────────────────────────────────────────────────── */
export function TextElementControls({ element, paperRef, onRemove, onResize, onRotate }) {
  const cleanupRef = useRef(null)
  useEffect(() => () => { cleanupRef.current?.() }, [])

  /* Approximate the element's pixel centre on the paper. Uses the same
     x%/y% as the renderer; that's the element's anchor point. */
  function getCenter() {
    const pr = paperRef.current?.getBoundingClientRect()
    if (!pr) return { cx: 0, cy: 0 }
    return {
      cx: pr.left + (element.x / 100) * pr.width,
      cy: pr.top  + (element.y / 100) * pr.height,
    }
  }

  function handleCornerResize(e) {
    if (e.pointerType === 'pen') return
    e.stopPropagation()
    e.preventDefault()
    const { cx, cy } = getCenter()
    const d0 = Math.max(Math.hypot(e.clientX - cx, e.clientY - cy), 1)
    const s0 = element.scale ?? 1
    function onPM(me) {
      const d = Math.hypot(me.clientX - cx, me.clientY - cy)
      onResize?.(element.uid, Math.max(0.4, Math.min(4, s0 * (d / d0))))
    }
    function onPU() {
      window.removeEventListener('pointermove', onPM)
      window.removeEventListener('pointerup',   onPU)
      cleanupRef.current = null
    }
    cleanupRef.current = onPU
    window.addEventListener('pointermove', onPM)
    window.addEventListener('pointerup',   onPU)
  }

  function handleRotateHandle(e) {
    if (e.pointerType === 'pen') return
    e.stopPropagation()
    e.preventDefault()
    const { cx, cy } = getCenter()
    const a0 = Math.atan2(e.clientY - cy, e.clientX - cx)
    const r0 = element.rotation || 0
    function onPM(me) {
      const a = Math.atan2(me.clientY - cy, me.clientX - cx)
      const delta = ((a - a0) * 180) / Math.PI
      onRotate?.(element.uid, r0 + delta)
    }
    function onPU() {
      window.removeEventListener('pointermove', onPM)
      window.removeEventListener('pointerup',   onPU)
      cleanupRef.current = null
    }
    cleanupRef.current = onPU
    window.addEventListener('pointermove', onPM)
    window.addEventListener('pointerup',   onPU)
  }

  return (
    <div
      className={styles.controlsRoot}
      style={{
        left: `${element.x}%`,
        top:  `${element.y}%`,
        transform: `translate(-50%, -50%) rotate(${element.rotation || 0}deg)`,
      }}
    >
      {/* Selection frame — sized to roughly bound the text via padding */}
      <div className={styles.frame} aria-hidden />

      {/* Corner resize handle (bottom-right) */}
      <button
        type="button"
        className={`${styles.handle} ${styles.handleCornerBR}`}
        aria-label="Resize text"
        onPointerDown={handleCornerResize}
      />

      {/* Rotation handle (top, with a connector tick) */}
      <button
        type="button"
        className={`${styles.handle} ${styles.handleRotate}`}
        aria-label="Rotate text"
        onPointerDown={handleRotateHandle}
      />
      <div className={styles.rotateTick} aria-hidden />

      {/* Delete (top-right small × button) */}
      <button
        type="button"
        className={styles.deleteBtn}
        aria-label="Delete text"
        onClick={(e) => { e.stopPropagation(); onRemove?.(element.uid) }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        ×
      </button>
    </div>
  )
}

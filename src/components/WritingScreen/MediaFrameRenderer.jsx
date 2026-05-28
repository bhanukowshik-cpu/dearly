import { useRef, useEffect } from 'react'
import { ACCEPT_ATTR } from '../../lib/mediaFrameConfig'
import {
  validateMediaFile, getMediaType,
  getFilterStyle, getFrameClass,
} from '../../lib/mediaFrameHelpers'
import { IconClose, IconRotate, IconAdd } from './editorIcons'
import styles from './MediaFrameRenderer.module.css'

/* ─────────────────────────────────────────────────────────────────────────
   MediaFrameRenderer — renders a single media-frame canvas object.
   Renders the rotated frame body with drag/resize/rotate/× handles when
   selected. Frame-style / filter / replace / remove controls live in
   MediaFramePicker (the side panel), so the canvas stays uncluttered.
   ───────────────────────────────────────────────────────────────────────── */
// NOOP fallback for handlers — used in read-only renders (RecipientScreen,
// Preview) where no edit-state is wired up. Avoids "undefined is not a
// function" crashes on pointer events.
const NOOP = () => {}

export default function MediaFrameRenderer({
  frame,
  isSelected,
  paperRef,
  onSelect   = NOOP,
  onMove     = NOOP,
  onResize   = NOOP,
  onRotate   = NOOP,
  onRemove   = NOOP,
  onUpdate   = NOOP,
  onInvalidFile = NOOP,
}) {
  const inputRef     = useRef(null)
  const cleanupRef   = useRef(null)
  const prevUrlRef   = useRef(null)

  /* Revoke the previous blob URL ONLY when the user replaces it with a new
     one. We deliberately do NOT revoke on unmount: this component remounts
     whenever the paper element does (paper-style change, view-mode switch,
     undo-restore), and revoking on unmount would leave the next mount with
     a dead URL and a broken <img>. The blob URL outlives the component;
     it gets GC'd when the page closes or when a deliberate Replace runs. */
  useEffect(() => {
    if (prevUrlRef.current && prevUrlRef.current !== frame.mediaUrl) {
      URL.revokeObjectURL(prevUrlRef.current)
    }
    prevUrlRef.current = frame.mediaUrl
  }, [frame.mediaUrl])

  /* Cleanup only the in-flight pointer listeners on unmount — leave the
     blob URL alone (see comment above). */
  useEffect(() => () => {
    cleanupRef.current?.()
  }, [])

  function openFilePicker() {
    inputRef.current?.click()
  }

  function handleFileChange(e) {
    const file = e.target.files?.[0]
    e.target.value = ''  // allow re-selecting the same file later
    if (!file) return
    const v = validateMediaFile(file)
    if (!v.ok) {
      onInvalidFile?.(v.reason)
      return
    }
    const url = URL.createObjectURL(file)
    onUpdate(frame.id, { mediaUrl: url, mediaType: getMediaType(file) })
  }

  /* Drag from anywhere on the frame body. Empty frames open the file
     picker on a click without movement (drag threshold = 4px). */
  function handleBodyPointerDown(e) {
    if (e.target.closest(`.${styles.handle}, .${styles.removeBtn}, .${styles.rotateBtn}`)) return
    e.stopPropagation()
    onSelect(frame.id)

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
        // Clamp by the frame's BOUNDING BOX, not just its center — otherwise
        // a large frame can have its edges hang off the paper while the
        // center is still in-bounds. (Rotated frames may peek slightly at
        // the corners; that's acceptable.)
        const halfW = (frame.width  ?? 0) / 2
        const halfH = (frame.height ?? 0) / 2
        const xMin = Math.min(halfW, 50)
        const xMax = Math.max(100 - halfW, 50)
        const yMin = Math.min(halfH, 50)
        const yMax = Math.max(100 - halfH, 50)
        const rawX = ((me.clientX - rect.left) / rect.width)  * 100
        const rawY = ((me.clientY - rect.top)  / rect.height) * 100
        const xPct = Math.max(xMin, Math.min(xMax, rawX))
        const yPct = Math.max(yMin, Math.min(yMax, rawY))
        onMove(frame.id, xPct, yPct)
      }
    }
    function onPU() {
      window.removeEventListener('pointermove', onPM)
      window.removeEventListener('pointerup',   onPU)
      cleanupRef.current = null
      if (!dragging && !frame.mediaUrl) {
        openFilePicker()
      }
    }
    cleanupRef.current = onPU
    window.addEventListener('pointermove', onPM)
    window.addEventListener('pointerup',   onPU)
  }

  function getCenter() {
    const pr = paperRef.current?.getBoundingClientRect()
    if (!pr) return { cx: 0, cy: 0 }
    return {
      cx: pr.left + (frame.x / 100) * pr.width,
      cy: pr.top  + (frame.y / 100) * pr.height,
    }
  }

  function handleCornerResize(e) {
    e.stopPropagation()
    e.preventDefault()
    const { cx, cy } = getCenter()
    const d0 = Math.max(Math.hypot(e.clientX - cx, e.clientY - cy), 1)
    const w0 = frame.width
    const h0 = frame.height
    function onPM(me) {
      const d = Math.hypot(me.clientX - cx, me.clientY - cy)
      const ratio = d / d0
      // Both dimensions scale proportionally — keeps the frame's aspect ratio
      // stable while resizing, which feels right for photos.
      const w = Math.max(8,  Math.min(90, w0 * ratio))
      const h = Math.max(8,  Math.min(90, h0 * ratio))
      onResize(frame.id, w, h)
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

  function handleRotateStart(e) {
    e.stopPropagation()
    e.preventDefault()
    const { cx, cy } = getCenter()
    const a0 = Math.atan2(e.clientY - cy, e.clientX - cx) * (180 / Math.PI)
    const r0 = frame.rotation ?? 0
    function onPM(me) {
      const a = Math.atan2(me.clientY - cy, me.clientX - cx) * (180 / Math.PI)
      onRotate(frame.id, r0 + (a - a0))
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

  const frameClass = getFrameClass(frame.frameStyle, styles)
  const imgFilter  = getFilterStyle(frame.filter)
  const rotation   = frame.rotation ?? 0

  // Auto-flip the rotate handle above the frame when the frame is sitting
  // near the bottom of the paper, so the handle never lands off-paper.
  const frameBottomPct = (frame.y ?? 0) + (frame.height ?? 0) / 2
  const flipRotateUp   = frameBottomPct > 88

  return (
    <>
      {/* ── Rotated body: frame visual + handles ──────────────────────────
          Plain <div> — not motion.div — because Framer Motion overrides
          inline `transform` once its enter animation settles, which would
          drop our rotate. Position + size + rotation all live in style. */}
      <div
        className={styles.body}
        style={{
          left:      `${frame.x}%`,
          top:       `${frame.y}%`,
          width:     `${frame.width}%`,
          height:    `${frame.height}%`,
          transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
          zIndex:    isSelected ? 16 : 6,
        }}
        onPointerDown={handleBodyPointerDown}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT_ATTR}
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />

        <div className={`${styles.frame} ${frameClass}`}>
          <div className={styles.media}>
            {frame.mediaUrl ? (
              <img
                src={frame.mediaUrl}
                alt=""
                draggable={false}
                style={{
                  width:     '100%',
                  height:    '100%',
                  objectFit: 'contain',
                  display:   'block',
                  filter:    imgFilter,
                  pointerEvents: 'none',
                }}
              />
            ) : (
              <div className={styles.empty}>
                <span className={styles.emptyIcon}><IconAdd size={18} /></span>
                <span className={styles.emptyLabel}>Add photo</span>
              </div>
            )}
          </div>

          {frame.frameStyle === 'polaroid' && (() => {
            // Display-only — captions are edited from the Pictures side panel,
            // not on the canvas, so this is a plain <div> with pointer-events
            // disabled (so clicks still go to the frame's drag handler).
            // Placeholder shows only when the frame is selected so unselected
            // polaroids without a caption stay clean.
            const hasCaption    = !!frame.caption
            const showPlaceholder = !hasCaption && isSelected
            return (
              <div
                className={`${styles.caption} ${showPlaceholder ? styles.captionPlaceholder : ''}`}
                aria-hidden={!hasCaption}
              >
                {hasCaption ? frame.caption : (showPlaceholder ? 'Write something' : '')}
              </div>
            )
          })()}
        </div>

        {isSelected && (
          <>
            <div className={styles.selFrame} />
            <button
              className={styles.removeBtn}
              onPointerDown={e => e.stopPropagation()}
              onClick={e => { e.stopPropagation(); onRemove(frame.id) }}
              aria-label="Remove frame"
            >
              <IconClose size={10} />
            </button>
            <div className={`${styles.handle} ${styles.handleTL}`} onPointerDown={handleCornerResize} />
            <div className={`${styles.handle} ${styles.handleTR}`} onPointerDown={handleCornerResize} />
            <div className={`${styles.handle} ${styles.handleBL}`} onPointerDown={handleCornerResize} />
            <div className={`${styles.handle} ${styles.handleBR}`} onPointerDown={handleCornerResize} />
            <button
              className={`${styles.rotateBtn} ${flipRotateUp ? styles.rotateBtnAbove : ''}`}
              onPointerDown={handleRotateStart}
              title="Rotate"
              aria-label="Rotate frame"
            >
              <IconRotate size={15} />
            </button>
          </>
        )}
      </div>
    </>
  )
}

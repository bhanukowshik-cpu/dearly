import { useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ACCEPT_ATTR,
  FRAME_ORDER, FRAME_STYLES,
  FILTER_ORDER, FILTERS,
} from '../../lib/mediaFrameConfig'
import {
  validateMediaFile, getMediaType,
  getFilterStyle, getFrameClass,
  loadImageMeta,
  computeFrameHeight,
} from '../../lib/mediaFrameHelpers'
import rendererStyles from './MediaFrameRenderer.module.css'
import styles from './MediaFramePicker.module.css'
import { IconUpload, IconDelete, IconCaution } from './editorIcons'

/* Loading spinner — CSS-animated stroke arc (see .spinner in module CSS).
   This one stays as a stroked arc on purpose: a hand-drawn icon wouldn't
   read as motion when rotated by a keyframe. */
function Spinner() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden className={styles.spinner}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.4" strokeOpacity="0.22"/>
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"/>
    </svg>
  )
}

/* Replace — no V2/Icons asset for this one yet, so a small geometric
   arrow pair is kept. Easy to swap when an SVG arrives. */
function IconReplace() {
  return (
    <svg width="14" height="14" viewBox="0 0 15 15" fill="none" aria-hidden>
      <path d="M3 6L6 3L9 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M6 3V11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M12 9L9 12L6 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

/* Tiny color swatch that has the real CSS filter applied — so users see
   the actual effect on a representative gradient. */
function FilterSwatch({ filterId }) {
  return (
    <span
      className={styles.filterSwatch}
      style={{ filter: FILTERS[filterId].css }}
      aria-hidden
    />
  )
}

/* Frame-shape preview chip. Re-uses MediaFrameRenderer's variant classes
   (.frame_polaroid, etc) so the chip matches the rendered shape. */
function FramePreview({ frameId }) {
  const cls = getFrameClass(frameId, rendererStyles)
  return (
    <span className={`${styles.framePreview} ${cls}`} aria-hidden>
      <span className={styles.framePreviewMedia} />
    </span>
  )
}

/* ─────────────────────────────────────────────────────────────────────────
   MediaFramePicker — side panel.
   Empty state shows just the upload zone.
   With a selected frame, it expands to show a live preview of that photo
   inside its current frame + filter, plus controls to change frame style,
   change filter, replace the photo, or remove the whole frame.
   ───────────────────────────────────────────────────────────────────────── */
export default function MediaFramePicker({
  selectedFrame,
  onAddFrame,
  onUpdateFrame,
  onRemoveFrame,
  // onInvalidFile is kept in the prop list for backward compat but no longer
  // used — picker errors render inside the upload box, not as toasts.
  onInvalidFile,           // eslint-disable-line no-unused-vars
  frameCount = 0,
  maxFrames = 6,
}) {
  const inputRef        = useRef(null)
  const replaceInputRef = useRef(null)
  const [isDragOver,   setIsDragOver]   = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [error,        setError]        = useState(null)
  const atLimit = frameCount >= maxFrames

  /* Show an inline error inside the upload box. Stays until the user
     takes another action (next click on the upload zone, a new file is
     accepted, etc.) so users who looked away don't miss it. */
  function showError(msg) {
    setError(msg)
  }
  function clearError() {
    if (error !== null) setError(null)
  }

  function openPicker() {
    clearError()                  // any prior error is the previous attempt
    if (atLimit) {
      showError(`You've added the max of ${maxFrames} photos — remove one to add another.`)
      return
    }
    inputRef.current?.click()
  }
  function openReplacePicker() { replaceInputRef.current?.click() }

  async function acceptNewFile(file) {
    if (!file) return
    if (atLimit) {
      showError(`You've added the max of ${maxFrames} photos — remove one to add another.`)
      return
    }
    const v = validateMediaFile(file)
    if (!v.ok) { showError(v.reason); return }
    setError(null)
    setIsProcessing(true)
    try {
      const { url, width, height } = await loadImageMeta(file)
      onAddFrame({
        mediaUrl:    url,
        mediaType:   getMediaType(file),
        imageWidth:  width,
        imageHeight: height,
      })
    } catch (err) {
      showError(err.message || 'Could not process that image.')
    } finally {
      setIsProcessing(false)
    }
  }
  async function acceptReplaceFile(file) {
    if (!file || !selectedFrame) return
    const v = validateMediaFile(file)
    if (!v.ok) { showError(v.reason); return }
    setError(null)
    setIsProcessing(true)
    try {
      const { url, width, height } = await loadImageMeta(file)
      onUpdateFrame(selectedFrame.id, {
        mediaUrl:    url,
        mediaType:   getMediaType(file),
        imageWidth:  width,
        imageHeight: height,
      })
    } catch (err) {
      showError(err.message || 'Could not process that image.')
    } finally {
      setIsProcessing(false)
    }
  }

  function handleNewChange(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    acceptNewFile(file)
  }
  function handleReplaceChange(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    acceptReplaceFile(file)
  }

  function handleDragOver(e) {
    e.preventDefault()
    if (!atLimit) setIsDragOver(true)
  }
  function handleDragLeave(e) { e.preventDefault(); setIsDragOver(false) }
  function handleDrop(e) {
    e.preventDefault(); setIsDragOver(false)
    if (atLimit) return
    acceptNewFile(e.dataTransfer.files?.[0])
  }

  return (
    <div className={styles.root}>
      {/* Upload zone — also serves as the inline surface for progress and
          error feedback (per design: no toast for picker-originated issues).
          Drag-and-drop still works; help line + count were removed. */}
      <motion.button
        type="button"
        className={`${styles.dropZone}
          ${selectedFrame ? styles.dropZoneCompact : ''}
          ${isDragOver ? styles.dropZoneActive : ''}
          ${isProcessing ? styles.dropZoneProcessing : ''}
          ${error ? styles.dropZoneError : ''}
          ${atLimit && !error && !isProcessing ? styles.dropZoneDisabled : ''}`}
        onClick={openPicker}
        onDragOver={handleDragOver}
        onDragEnter={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        whileHover={(atLimit || isProcessing) ? {} : { y: -1 }}
        whileTap={(atLimit || isProcessing) ? {} : { scale: 0.98 }}
        transition={{ duration: 0.12 }}
        disabled={isProcessing}
        aria-busy={isProcessing}
        aria-label={selectedFrame ? 'Add another image or GIF' : 'Upload photo or GIF'}
      >
        {isProcessing ? (
          <>
            <span className={styles.dropZoneIcon}><Spinner /></span>
            <span className={styles.dropZoneTitle}>Adding photo…</span>
            <span className={styles.progressBar} aria-hidden>
              <span className={styles.progressBarFill} />
            </span>
          </>
        ) : error ? (
          <>
            <span className={`${styles.dropZoneIcon} ${styles.dropZoneIconError}`}><IconCaution size={22} /></span>
            <span className={styles.dropZoneTitle}>{error}</span>
            <span className={styles.dropZoneSub}>Click to try again</span>
          </>
        ) : (
          <>
            <span className={styles.dropZoneIcon}><IconUpload size={26} /></span>
            <span className={styles.dropZoneTitle}>
              {isDragOver
                ? 'Drop to add'
                : selectedFrame ? 'Add another image / gif' : 'Upload photo or GIF'}
            </span>
            {!selectedFrame && !isDragOver && (
              <span className={styles.dropZoneSub}>Supported formats: PNG, JPG, GIF, HEIC</span>
            )}
          </>
        )}
      </motion.button>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_ATTR}
        style={{ display: 'none' }}
        onChange={handleNewChange}
      />
      <input
        ref={replaceInputRef}
        type="file"
        accept={ACCEPT_ATTR}
        style={{ display: 'none' }}
        onChange={handleReplaceChange}
      />

      {/* Editor — only when a frame is selected */}
      <AnimatePresence initial={false}>
        {selectedFrame && (
          <motion.div
            className={styles.editor}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* Live preview using the same frame+filter pipeline as the canvas.
                Dimensions are inline (not CSS) so .frame's `width/height: 100%`
                rule can't override them — without that, the preview frame
                collapses vertically inside the flex container and hides the
                photo. We also mirror the canvas's aspect by running the same
                computeFrameHeight() against the image's natural aspect. */}
            <div className={styles.previewWrap}>
              {(() => {
                const previewWidth = 160
                const imgAspect = (selectedFrame.imageWidth > 0 && selectedFrame.imageHeight > 0)
                  ? selectedFrame.imageWidth / selectedFrame.imageHeight
                  : 1
                const naturalH = computeFrameHeight(previewWidth, imgAspect, selectedFrame.frameStyle)
                // Cap height so very tall portraits don't dominate the panel —
                // scale both dims together if we hit the cap.
                const MAX_H = 200
                const previewHeight = Math.min(naturalH, MAX_H)
                const effectiveWidth = naturalH > MAX_H ? previewWidth * (MAX_H / naturalH) : previewWidth
                return (
                  <div
                    className={`${rendererStyles.frame} ${getFrameClass(selectedFrame.frameStyle, rendererStyles)} ${styles.previewFrame}`}
                    style={{ width: effectiveWidth, height: previewHeight }}
                  >
                    <div className={rendererStyles.media}>
                      {selectedFrame.mediaUrl ? (
                        <img
                          src={selectedFrame.mediaUrl}
                          alt=""
                          draggable={false}
                          style={{
                            width:     '100%',
                            height:    '100%',
                            objectFit: 'contain',
                            display:   'block',
                            filter:    getFilterStyle(selectedFrame.filter),
                            pointerEvents: 'none',
                          }}
                        />
                      ) : (
                        <div className={rendererStyles.empty}>
                          <span className={rendererStyles.emptyLabel}>No photo</span>
                        </div>
                      )}
                    </div>
                    {selectedFrame.frameStyle === 'polaroid' && (
                      <div
                        className={`${rendererStyles.caption} ${!selectedFrame.caption ? rendererStyles.captionPlaceholder : ''}`}
                        aria-hidden={!selectedFrame.caption}
                      >
                        {selectedFrame.caption || 'Write something'}
                      </div>
                    )}
                  </div>
                )
              })()}
            </div>

            {/* FRAME STYLE — chips + (when polaroid) a caption input nested
                inside the same container, right below the chips. */}
            <div className={styles.section}>
              <span className={styles.sectionLabel}>Frame style</span>
              <div className={styles.chipRow}>
                {FRAME_ORDER.map(id => (
                  <button
                    key={id}
                    type="button"
                    className={`${styles.chip} ${styles.chipFrame} ${selectedFrame.frameStyle === id ? styles.chipActive : ''}`}
                    onClick={() => onUpdateFrame(selectedFrame.id, { frameStyle: id })}
                    title={FRAME_STYLES[id].label}
                    aria-label={`Frame: ${FRAME_STYLES[id].label}`}
                    aria-pressed={selectedFrame.frameStyle === id}
                  >
                    <FramePreview frameId={id} />
                    <span className={styles.chipLabel}>{FRAME_STYLES[id].label}</span>
                  </button>
                ))}
              </div>
              {selectedFrame.frameStyle === 'polaroid' && (() => {
                const CAPTION_MAX = 40
                const count = (selectedFrame.caption ?? '').length
                // Counter fades in as the user approaches the cap so it
                // doesn't add visual noise until it's useful.
                const showCount = count >= CAPTION_MAX - 10
                return (
                  <div className={styles.captionField}>
                    <input
                      id="mediaFrame-caption"
                      className={styles.captionInput}
                      type="text"
                      value={selectedFrame.caption ?? ''}
                      placeholder="Write something"
                      maxLength={CAPTION_MAX}
                      onChange={e => onUpdateFrame(selectedFrame.id, { caption: e.target.value })}
                      aria-label="Polaroid caption"
                    />
                    {showCount && (
                      <span
                        className={`${styles.captionCount} ${count >= CAPTION_MAX ? styles.captionCountAtMax : ''}`}
                        aria-live="polite"
                      >
                        {count} / {CAPTION_MAX}
                      </span>
                    )}
                  </div>
                )
              })()}
            </div>

            <div className={styles.section}>
              <span className={styles.sectionLabel}>Filter</span>
              <div className={styles.chipRow}>
                {FILTER_ORDER.map(id => (
                  <button
                    key={id}
                    type="button"
                    className={`${styles.chip} ${selectedFrame.filter === id ? styles.chipActive : ''}`}
                    onClick={() => onUpdateFrame(selectedFrame.id, { filter: id })}
                    title={FILTERS[id].label}
                    aria-label={`Filter: ${FILTERS[id].label}`}
                    aria-pressed={selectedFrame.filter === id}
                  >
                    <FilterSwatch filterId={id} />
                    <span className={styles.chipLabel}>{FILTERS[id].label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.actionRow}>
              <button
                type="button"
                className={styles.actionBtn}
                onClick={openReplacePicker}
                title="Swap this photo for a different one"
                aria-label="Replace this photo"
              >
                <IconReplace /><span>Replace</span>
              </button>
              <button
                type="button"
                className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
                onClick={() => onRemoveFrame(selectedFrame.id)}
                title="Remove this photo frame from the paper"
                aria-label="Remove this photo frame"
              >
                <IconDelete size={14} /><span>Remove</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

import { useMemo, useRef, useState, useEffect, useLayoutEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useCharList } from '../../lib/useCharList'
import { PAPER_TYPES, PAPER_SIZES } from './stylePresets'
import { STICKER_REGISTRY } from './handDrawnStickers'
import GlyphChar from './GlyphChar'
import MediaFrameRenderer from './MediaFrameRenderer'
import VoiceNoteRenderer from './VoiceNoteRenderer'
import DrawingLayer from './DrawingLayer'
import { IconClose, IconRotate } from './editorIcons'
import { getScaledMetrics } from '../../lib/typographyMetadata'
import styles from './PaperCanvas.module.css'

const BASE_SIZE = 52

/* IconClose + IconRotate come from editorIcons.jsx now (hand-drawn).
   IconMove stays geometric below — there isn't a hand-drawn move/drag
   asset in Dearly V2/Icons yet. Easy to swap when one arrives. */
function IconMove() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden>
      <path d="M 7.5 1.5 L 7.5 13.5 M 1.5 7.5 L 13.5 7.5"
            stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      <path d="M 5.5 3.5 L 7.5 1.5 L 9.5 3.5"
            stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M 5.5 11.5 L 7.5 13.5 L 9.5 11.5"
            stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M 3.5 5.5 L 1.5 7.5 L 3.5 9.5"
            stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M 11.5 5.5 L 13.5 7.5 L 11.5 9.5"
            stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

/* Collapse double-wrapped formatting corruption before parsing */
function normalizeMarkup(text) {
  if (!text) return ''
  return text
    .replace(/~{2,}([^~\n]+)~{2,}/g,   '~~$1~~')
    .replace(/\*{2,}([^*\n]+)\*{2,}/g, '**$1**')
    .replace(/={4,}([^=]+)={4,}/g,   '==$1==')
}

/* ─────────────────────────────────────────────────────────────────────────
   computeCharTypes — tags every character in the raw string:
   'text' | 'highlight' | 'highlight-pink' | 'highlight-sage' |
   'strike' | 'bold' | 'size-sm' | 'size-lg' | 'delim'
   ───────────────────────────────────────────────────────────────────────── */
function computeCharTypes(text) {
  // Replace astral-plane codepoints (emoji etc.) with a single BMP placeholder so
  // regex match indices align with codepoint indices, not UTF-16 code units.
  const codepoints = Array.from(text)
  const safeText   = codepoints.map(cp => cp.length > 1 ? '' : cp).join('')
  const types = new Array(codepoints.length).fill('text')
  /* ==text==  ==pink::text==  ==sage::text==  ~~text~~  **text**  @@sm::text@@  @@lg::text@@ */
  const re = /==((?:pink|sage)::)?([^=]+)==|~~([^~\n]+)~~|\*\*([^*\n]+)\*\*|@@(sm|lg)::([^@\n]+)@@/g
  let m
  while ((m = re.exec(safeText)) !== null) {
    const s = m.index, e = s + m[0].length
    if (m[0].startsWith('~~')) {
      types[s] = types[s + 1] = types[e - 2] = types[e - 1] = 'delim'
      for (let i = s + 2; i < e - 2; i++) types[i] = 'strike'
    } else if (m[0].startsWith('**')) {
      types[s] = types[s + 1] = types[e - 2] = types[e - 1] = 'delim'
      for (let i = s + 2; i < e - 2; i++) types[i] = 'bold'
    } else if (m[0].startsWith('@@')) {
      // @@sm:: or @@lg:: → openL = 2 + 2 + 2 = 6
      const sizeStr = m[5]
      const openL   = 2 + sizeStr.length + 2
      const sType   = sizeStr === 'sm' ? 'size-sm' : 'size-lg'
      for (let i = s; i < s + openL; i++) types[i] = 'delim'
      for (let i = s + openL; i < e - 2; i++) types[i] = sType
      types[e - 2] = types[e - 1] = 'delim'
    } else {
      const pfx    = m[1] || ''
      const openL  = 2 + pfx.length
      const hlType = pfx.startsWith('pink') ? 'highlight-pink'
                   : pfx.startsWith('sage') ? 'highlight-sage'
                   : 'highlight'
      for (let i = s; i < s + openL; i++) types[i] = 'delim'
      types[e - 2] = types[e - 1] = 'delim'
      for (let i = s + openL; i < e - 2; i++) types[i] = hlType
    }
  }
  return types
}

/* ─────────────────────────────────────────────────────────────────────────
   buildSegments — groups consecutive same-type visible characters.
   Driven by `text` (always in sync with `types`) to avoid index drift when
   the `chars` state hasn't flushed its useEffect update yet. `chars` is
   used only as a stable-ID lookup — falls back to a positional key.
   ───────────────────────────────────────────────────────────────────────── */
function buildSegments(text, types, chars) {
  const segs = []
  let cur = null
  const textArr = Array.from(text)
  for (let i = 0; i < textArr.length; i++) {
    const ch = textArr[i]
    const t  = types[i] ?? 'text'
    const id = chars[i]?.ch === ch ? chars[i].id : `s${i}`
    if (t === 'delim')  { cur = null; continue }
    if (ch === '\n')    { cur = null; segs.push({ type: 'br', id }); continue }
    if (!cur || cur.type !== t) { cur = { type: t, firstId: id, items: [] }; segs.push(cur) }
    cur.items.push({ id, ch })
  }
  return segs
}

/* ─────────────────────────────────────────────────────────────────────────
   CharPath — single character, drawn via hand-made SVG glyph animation.
   Space chars are plain inline spans so word-wrapping works naturally.
   ───────────────────────────────────────────────────────────────────────── */
function CharPath({ ch, inkColor, fontWeight, fontSize, size, viewportWidth }) {
  if (ch === ' ') {
    return <span>{' '}</span>
  }
  return (
    <GlyphChar
      ch={ch}
      inkColor={inkColor}
      fontWeight={fontWeight ?? 700}
      fontSize={fontSize ?? 'inherit'}
      size={size ?? null}
      viewportWidth={viewportWidth ?? null}
    />
  )
}

/* ─────────────────────────────────────────────────────────────────────────
   renderWordWrapped — groups character-level inline-blocks into word-level
   inline-block containers with real text-node spaces between them.
   This gives the browser natural soft-wrap opportunities at word boundaries
   while keeping individual characters together as atomic units.

   In reading mode, `wordIndexStart` is the global word index where this
   segment begins. A local counter increments purely within this call —
   no shared mutable state across components or segments.
   ───────────────────────────────────────────────────────────────────────── */
function renderWordWrapped(items, renderChar, readingConfig = null, wordStyle = null, wordIndexStart = 0, wordSpacingPx = null) {
  const result    = []
  let wordItems   = []
  let wordKey     = null
  let localIdx    = wordIndexStart   // purely local — no external mutation

  function flushWord() {
    if (!wordItems.length) return

    if (readingConfig) {
      // Reading mode: word fades + slides up when revealed.
      // Keep the same key always so React reconciles in place and the CSS
      // transition fires (no unmount/remount needed).
      const idx      = localIdx++
      const revealed = idx < readingConfig.revealedWordIdx
      const wordText = wordItems.map(w => w.ch).join('')
      const s        = wordStyle
      result.push(
        <span
          key={`w-${wordKey}`}
          style={{
            display:       'inline-block',
            verticalAlign: 'bottom',
            whiteSpace:    'nowrap',
            fontFamily:    "'Caveat', cursive",
            fontSize:      s.fontSize,
            color:         s.inkColor,
            fontWeight:    s.fontWeight,
            lineHeight:    1,
            opacity:       revealed ? 1 : 0,
            transform:     revealed ? 'translateY(0)' : 'translateY(5px)',
            transition:    revealed ? 'opacity 0.28s ease, transform 0.28s ease' : 'none',
          }}
        >
          {wordText}
        </span>
      )
    } else {
      result.push(
        <span
          key={`w-${wordKey}`}
          style={{ display: 'inline-block', whiteSpace: 'nowrap', verticalAlign: 'bottom', lineHeight: 0 }}
        >
          {wordItems.map(({ id, ch }) => renderChar(id, ch))}
        </span>
      )
    }

    wordItems = []
    wordKey   = null
  }

  for (const { id, ch } of items) {
    if (ch === ' ') {
      flushWord()
      result.push(
        wordSpacingPx
          ? <span key={`sp-${id}`} style={{ display: 'inline-block', width: `${wordSpacingPx}px`, flexShrink: 0 }} />
          : <span key={`sp-${id}`}>{' '}</span>
      )
    } else {
      if (!wordKey) wordKey = id
      wordItems.push({ id, ch })
    }
  }
  flushWord()
  // Return elements and how many words were consumed so callers can
  // chain wordIndexStart across multiple segments.
  return { els: result, nextIdx: localIdx }
}

/* ─────────────────────────────────────────────────────────────────────────
   GreetingText — supports the same markup as BodyText (highlight, bold,
   strike, @@sm/lg:: size) so the recipient contenteditable formats
   correctly appear on the canvas.
   ───────────────────────────────────────────────────────────────────────── */
const GREETING_FS_MAP = {
  sm: 'clamp(18px, 2.4vw, 26px)',
  md: 'clamp(24px, 3.2vw, 34px)',
  lg: 'clamp(30px, 4.0vw, 42px)',
}
const GREETING_FS = GREETING_FS_MAP.md

function GreetingText({ text, inkColor, readingConfig, wordIndexStart = 0 }) {
  const normText = useMemo(() => normalizeMarkup(text), [text])
  const chars = useCharList(normText)
  const types = useMemo(() => computeCharTypes(normText), [normText])
  const segs  = useMemo(() => buildSegments(normText, types, chars), [normText, types, chars])

  // Each segment's wordIndexStart chains from the previous segment's nextIdx.
  // This is a plain variable mutated during render — safe because it's local
  // to this render call only (no shared state with other components).
  let segWordIdx = wordIndexStart

  return (
    <span style={{
      fontFamily: "'Caveat', cursive",
      fontSize:   GREETING_FS,
      fontWeight: 700,
      color:      inkColor,
      lineHeight: 1.5,
      display:    'block',
      whiteSpace: 'pre-wrap',
    }}>
      {segs.map(seg => {
        if (seg.type === 'br') return <br key={seg.id} />
        const segFs = seg.type === 'size-sm' ? GREETING_FS_MAP.sm
                    : seg.type === 'size-lg' ? GREETING_FS_MAP.lg
                    : GREETING_FS
        const ws  = readingConfig ? { inkColor, fontWeight: 700, fontSize: segFs } : null
        const { els, nextIdx } = renderWordWrapped(seg.items, (id, ch) => (
          <CharPath key={id} ch={ch} inkColor={inkColor} fontWeight={700} fontSize={segFs} />
        ), readingConfig, ws, segWordIdx)
        const allRevealed = !readingConfig || readingConfig.revealedWordIdx >= nextIdx
        segWordIdx = nextIdx
        if (seg.type.startsWith('highlight')) {
          return <mark key={seg.firstId} className={allRevealed ? (HL_CLASS[seg.type] || styles.highlight) : undefined}>{els}</mark>
        }
        if (seg.type === 'strike') {
          return <span key={seg.firstId} className={styles.strike}>{els}</span>
        }
        if (seg.type === 'bold') {
          return <span key={seg.firstId} style={{ fontStyle: 'italic' }}>{els}</span>
        }
        return <span key={seg.firstId}>{els}</span>
      })}
    </span>
  )
}

/* ─────────────────────────────────────────────────────────────────────────
   BodyText — with ==highlight== ==pink::== ==sage::== ~~strike~~ **bold**
   Sizing is metadata-driven via typographyMetadata size tokens.
   ───────────────────────────────────────────────────────────────────────── */
const HL_CLASS = {
  'highlight':      styles.highlight,
  'highlight-pink': styles.highlightPink,
  'highlight-sage': styles.highlightSage,
}

function BodyText({ text, inkColor, textSize = 'lg', readingConfig, wordIndexStart = 0, viewportWidth = null }) {
  const normText = useMemo(() => normalizeMarkup(text), [text])
  const chars  = useCharList(normText)
  const types  = useMemo(() => computeCharTypes(normText), [normText])
  const segs   = useMemo(() => buildSegments(normText, types, chars), [normText, types, chars])
  const baseMetrics = getScaledMetrics(textSize, viewportWidth)

  // Chain wordIndexStart across segments locally — no shared external state.
  let segWordIdx = wordIndexStart

  return (
    <span style={{
      fontFamily:   "'Caveat', cursive",
      fontSize:     `${baseMetrics.fontSize}px`,
      fontWeight:   700,
      color:        inkColor,
      lineHeight:   `${baseMetrics.computedLineHeight}px`,
      whiteSpace:   'pre-wrap',
      overflowWrap: 'break-word',
      display:      'block',
    }}>
      {segs.map(seg => {
        if (seg.type === 'br') return <br key={seg.id} />
        // @@sm:: and @@lg:: markup tokens switch the size token for that segment
        const segSizeKey = seg.type === 'size-sm' ? 'sm'
                         : seg.type === 'size-lg' ? 'lg'
                         : textSize
        const segMetrics = getScaledMetrics(segSizeKey, viewportWidth)
        const isBold     = seg.type === 'bold'
        const ws         = readingConfig ? { inkColor, fontWeight: 700, fontSize: `${segMetrics.fontSize}px` } : null
        const { els, nextIdx } = renderWordWrapped(seg.items, (id, ch) => (
          <CharPath key={id} ch={ch} inkColor={inkColor} fontWeight={700} size={segSizeKey} viewportWidth={viewportWidth} />
        ), readingConfig, ws, segWordIdx, segMetrics.wordSpacingPx)
        const allRevealed = !readingConfig || readingConfig.revealedWordIdx >= nextIdx
        segWordIdx = nextIdx
        if (seg.type.startsWith('highlight')) {
          return <mark key={seg.firstId} className={allRevealed ? (HL_CLASS[seg.type] || styles.highlight) : undefined}>{els}</mark>
        }
        if (seg.type === 'strike') {
          return <span key={seg.firstId} className={styles.strike}>{els}</span>
        }
        return <span key={seg.firstId}>{els}</span>
      })}
    </span>
  )
}

/* ─────────────────────────────────────────────────────────────────────────
   StickerIcon — the scaled, animated sticker graphic.
   Drag anywhere on the icon to move it immediately (no move button needed).
   ───────────────────────────────────────────────────────────────────────── */
function StickerIcon({ sticker, isSelected, onSelect, paperRef, onMove, paperScale = 1 }) {
  const StickerComp = sticker.Component ?? STICKER_REGISTRY[sticker.id]
  const cleanupRef = useRef(null)
  useEffect(() => () => { cleanupRef.current?.() }, [])

  function handlePointerDown(e) {
    e.stopPropagation()
    onSelect(sticker.uid)

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
        onMove(
          sticker.uid,
          Math.max(4, Math.min(96, ((me.clientX - rect.left) / rect.width)  * 100)),
          Math.max(4, Math.min(96, ((me.clientY - rect.top)  / rect.height) * 100)),
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

  return (
    <motion.div
      className={styles.stickerRoot}
      style={{
        left:   `${sticker.x}%`,
        top:    `${sticker.y}%`,
        zIndex: isSelected ? 15 : 5,
      }}
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: sticker.scale * paperScale, rotate: sticker.rotation, opacity: 1 }}
      exit={{ scale: 0, opacity: 0 }}
      transition={{
        scale:   { type: 'spring', stiffness: 600, damping: 42 },
        rotate:  { type: 'tween',  duration: 0.04 },
        opacity: { duration: 0.15 },
      }}
      onPointerDown={handlePointerDown}
    >
      <div className={styles.stickerInner}>
        <div className={styles.stickerContent}>
          {StickerComp && <StickerComp />}
        </div>
      </div>
    </motion.div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────
   StickerControls — selection frame + handles + action buttons.
   Rendered OUTSIDE the scaled motion.div so all chrome is fixed pixel size.
   ───────────────────────────────────────────────────────────────────────── */
function StickerControls({ sticker, paperRef, onRemove, onMove, onResize, onRotate }) {
  const cleanupRef = useRef(null)
  useEffect(() => () => { cleanupRef.current?.() }, [])

  const size = BASE_SIZE * sticker.scale

  function getCenter() {
    const pr = paperRef.current?.getBoundingClientRect()
    if (!pr) return { cx: 0, cy: 0 }
    return {
      cx: pr.left + (sticker.x / 100) * pr.width,
      cy: pr.top  + (sticker.y / 100) * pr.height,
    }
  }

  function handleCornerResize(e) {
    e.stopPropagation()
    e.preventDefault()
    const { cx, cy } = getCenter()
    const d0 = Math.max(Math.hypot(e.clientX - cx, e.clientY - cy), 1)
    const s0 = sticker.scale
    function onPM(me) {
      const d = Math.hypot(me.clientX - cx, me.clientY - cy)
      onResize(sticker.uid, Math.max(0.25, Math.min(4, s0 * (d / d0))))
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
    const r0 = sticker.rotation
    function onPM(me) {
      const a = Math.atan2(me.clientY - cy, me.clientX - cx) * (180 / Math.PI)
      onRotate(sticker.uid, r0 + (a - a0))
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

  function handleMoveStart(e) {
    e.stopPropagation()
    e.preventDefault()
    const paper = paperRef.current
    if (!paper) return
    function onPM(me) {
      const rect = paper.getBoundingClientRect()
      onMove(
        sticker.uid,
        Math.max(4, Math.min(96, ((me.clientX - rect.left) / rect.width)  * 100)),
        Math.max(4, Math.min(96, ((me.clientY - rect.top)  / rect.height) * 100)),
      )
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
    <motion.div
      className={styles.stickerControls}
      style={{
        left:      `${sticker.x}%`,
        top:       `${sticker.y}%`,
        width:     `${size}px`,
        height:    `${size}px`,
        transform: `translate(-50%, -50%) rotate(${sticker.rotation}deg)`,
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.12 }}
    >
      {/* Dashed selection frame */}
      <div className={styles.stickerFrame} />

      {/* × Remove — top-left corner */}
      <button
        className={styles.stickerRemoveBtn}
        onClick={e => { e.stopPropagation(); onRemove(sticker.uid) }}
        aria-label="Remove sticker"
      >
        <IconClose size={10} />
      </button>

      {/* Corner resize handles — fixed 8px regardless of sticker scale */}
      <div className={`${styles.handle} ${styles.handleTL}`} onPointerDown={handleCornerResize} />
      <div className={`${styles.handle} ${styles.handleTR}`} onPointerDown={handleCornerResize} />
      <div className={`${styles.handle} ${styles.handleBL}`} onPointerDown={handleCornerResize} />
      <div className={`${styles.handle} ${styles.handleBR}`} onPointerDown={handleCornerResize} />

      {/* Rotate + Move action bar below the sticker */}
      <div className={styles.stickerActionsBar}>
        <button
          className={styles.stickerActionBtn}
          onPointerDown={handleRotateStart}
          title="Rotate"
          aria-label="Rotate sticker"
        >
          <IconRotate size={15} />
        </button>
        <button
          className={styles.stickerActionBtn}
          onPointerDown={handleMoveStart}
          title="Move"
          aria-label="Move sticker"
        >
          <IconMove />
        </button>
      </div>
    </motion.div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────
   computeColorRuler — derives a ruler line colour from the paper hex colour.
   For light pastels: a darker tint at ~32% opacity.
   For dark paper: a subtle white line.
   ───────────────────────────────────────────────────────────────────────── */
function hexLuminance(hexColor) {
  const r = parseInt(hexColor.slice(1, 3), 16)
  const g = parseInt(hexColor.slice(3, 5), 16)
  const b = parseInt(hexColor.slice(5, 7), 16)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255
}

// Returns a single baseline ruler color — grey tinted to the paper.
// Dark paper gets a lighter line; light paper gets a darker tint.
//
// 0.10 alpha was too faint to read as a guide on bright papers: the line
// existed but visually "disappeared" against the background, especially on
// empty paper where there were no glyph strokes nearby for reference. 0.14
// keeps the line subtle (still feels like a printed ruled-paper guide) while
// reading clearly at typical viewing distance.
function computeRulerColors(hexColor) {
  const lum = hexLuminance(hexColor)
  return lum < 0.4
    ? 'rgba(255,255,255,0.22)'
    : 'rgba(0,0,0,0.14)'
}

// Builds the repeating-linear-gradient with a single 1px baseline rule.
// Line sits at the end of the period; the rulerOffset positions it to the text baseline.
function buildRulerGradient(color, m) {
  const { computedLineHeight: period } = m
  const end = period.toFixed(2)
  const start = (period - 1).toFixed(2)
  return `repeating-linear-gradient(to bottom, transparent 0px, transparent ${start}px, ${color} ${start}px, ${color} ${end}px)`
}

function computeColorInk(hexColor) {
  return hexLuminance(hexColor) < 0.5 ? '#F0F0EE' : '#252525'
}

/* ─────────────────────────────────────────────────────────────────────────
   PaperCanvas
   ───────────────────────────────────────────────────────────────────────── */
export default function PaperCanvas({
  recipient,
  message,
  showRecipient,
  paperConfig,
  stickers = [],
  selectedStickerId,
  onSelectSticker,
  onRemoveSticker,
  onMoveSticker,
  onResizeSticker,
  onRotateSticker,
  mediaFrames = [],
  selectedFrameId = null,
  onSelectFrame,
  onRemoveFrame,
  onMoveFrame,
  onResizeFrame,
  onRotateFrame,
  onUpdateFrame,
  onFrameInvalidFile,
  voiceNotes = [],
  selectedVoiceNoteId = null,
  onSelectVoiceNote,
  onRemoveVoiceNote,
  onMoveVoiceNote,
  onResizeVoiceNote,
  onRotateVoiceNote,
  onBgClick,
  textSize = 'lg',
  readingMode = false,
  revealedWordIdx = 0,
  fitContent = false,
  // Drawing layer — vector strokes drawn directly on the paper.
  // When `drawingTool` is non-null, the overlay captures pointer events; when
  // null, the rendered strokes stay visible but are inert.
  strokes = [],
  drawingTool = null,
  drawingColor = '#1F2024',
  onAddStroke = null,
  onEraseStrokes = null,
}) {
  const { type = 'minimal', color = '#FAFAF8', size = 'postcard', showRuler = true, showZigzag = false } = paperConfig ?? {}
  const typeData = PAPER_TYPES[type] ?? PAPER_TYPES.minimal
  const sizeData = PAPER_SIZES[size] ?? PAPER_SIZES.postcard
  const bg       = type === 'color' ? color : typeData.bg
  const inkColor = type === 'color' ? computeColorInk(color) : typeData.inkColor

  const liveRecipient = showRecipient ? recipient : ''
  const isEmpty       = !liveRecipient && !message

  // readingConfig just carries the threshold — no shared mutable counter.
  // Each text component gets an explicit wordIndexStart computed below.
  const readingConfig = readingMode ? { revealedWordIdx } : null

  // Count how many words GreetingText will process so BodyText can start
  // its local counter at the correct global offset. Computed from the same
  // segments renderWordWrapped iterates, guaranteeing agreement.
  const greetingWordCount = useMemo(() => {
    if (!readingMode || !liveRecipient) return 0
    const norm  = normalizeMarkup(liveRecipient)
    const types = computeCharTypes(norm)
    const segs  = buildSegments(norm, types, [])
    let count = 0
    for (const seg of segs) {
      if (seg.type === 'br') continue
      let inWord = false
      for (const { ch } of seg.items) {
        if (ch === ' ') { if (inWord) { count++; inWord = false } }
        else            { inWord = true }
      }
      if (inWord) count++
    }
    return count
  }, [readingMode, liveRecipient])

  const paperRef      = useRef(null)
  const bodyRef       = useRef(null)
  const letterRef     = useRef(null)
  const [rulerOffset,    setRulerOffset]    = useState(21)
  const [contentScale,   setContentScale]   = useState(1)
  const [bodyFitStyle,   setBodyFitStyle]   = useState(null)
  const [viewportWidth, setViewportWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 1024
  )

  // Track viewport width for breakpoint-based font scaling (mobile/tablet/desktop).
  // useLayoutEffect fires before paint so the correct tier is applied from frame 1.
  useLayoutEffect(() => {
    const update = () => setViewportWidth(window.innerWidth)
    window.addEventListener('resize', update)
    update()
    return () => window.removeEventListener('resize', update)
  }, [])

  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 860px)').matches : false
  )
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 860px)')
    const h = e => setIsMobile(e.matches)
    mq.addEventListener('change', h)
    return () => mq.removeEventListener('change', h)
  }, [])

  // Ruler period and baseline position from metadata — responsive to paper width
  const { computedLineHeight, scaledBaselineY } = getScaledMetrics(textSize, viewportWidth)

  const hasMessage = !!message
  useEffect(() => {
    const paper = paperRef.current
    if (!paper || !showRuler) return

    function measure() {
      const pr = paper.getBoundingClientRect()
      const bd = bodyRef.current
      if (!bd || pr.height === 0) return

      const { computedLineHeight: period, scaledBaselineY: blY, scaledHeight } = getScaledMetrics(textSize, viewportWidth)

      // Prefer direct glyph measurement: find the first rendered glyph span,
      // measure its top from the paper, add scaledBaselineY → exact baseline.
      // data-glyph is set on every glyph container in GlyphChar — explicit, browser-independent.
      const firstGlyph = bd.querySelector('span[data-glyph]')
      let baseline
      if (firstGlyph) {
        baseline = firstGlyph.getBoundingClientRect().top - pr.top + blY
      } else {
        // Fallback for empty paper: body top + halfLeading + scaledBaselineY
        const halfLeading = (period - scaledHeight) / 2
        baseline = bd.getBoundingClientRect().top - pr.top + blY + halfLeading
      }

      // Gradient line occupies period-1 → period within each tile, so the
      // painted line ends up at (baseline + lineDrop) in body coords.
      //
      // We deliberately drop the line a couple px into the upper descender
      // area instead of placing it exactly on the baseline. At larger sizes
      // the glyph strokes are 2–3px thick on screen, and their anti-aliasing
      // wipes out a 1px, ~10%-alpha line drawn directly on the baseline (the
      // reason the ruler appeared to "disappear" under large text). Scaling
      // the drop with font size keeps the line clear of stroke endings at
      // every size while still hugging the baseline visually.
      const descentHeight = scaledHeight - blY
      const lineDrop = Math.max(1, Math.min(descentHeight * 0.35, scaledHeight * 0.085))
      const raw = ((baseline + lineDrop) % period + period) % period
      setRulerOffset(Math.round(raw))
    }

    const ro = new ResizeObserver(measure)
    ro.observe(paper)
    measure()
    return () => ro.disconnect()
  }, [showRuler, liveRecipient, hasMessage, textSize, viewportWidth]) // eslint-disable-line react-hooks/exhaustive-deps

  // Scale letter content to fit within the fixed paper dimensions.
  // Scale letter content to fit within the paper on the recipient screen.
  // Two challenges:
  // 1. position:absolute; inset:0 fixes the element height to paperH, so
  //    scrollHeight always equals paperH — we must break the constraint to
  //    measure true content height.
  // 2. The paper unfolds via a framer-motion animation that doesn't trigger
  //    React re-renders, so we use a ResizeObserver to re-apply the scale
  //    as the paper grows to its final size.
  useLayoutEffect(() => {
    const letter = letterRef.current
    const paper  = paperRef.current
    if (!letter) return
    if (!fitContent) {
      letter.style.overflow        = ''
      letter.style.width           = ''
      letter.style.height          = ''
      letter.style.transform       = ''
      letter.style.transformOrigin = ''
      return
    }
    if (!paper) return

    let measuring = false

    function applyScale() {
      if (measuring) return
      const paperH = paper.clientHeight
      const paperW = paper.clientWidth
      if (paperH < 10 || paperW < 10) return  // paper not yet at final size

      // Temporarily break inset constraint so scrollHeight reflects real content height
      measuring = true
      letter.style.position  = 'relative'
      letter.style.bottom    = 'auto'
      letter.style.height    = 'auto'
      letter.style.overflow  = 'visible'
      letter.style.width     = `${paperW}px`
      letter.style.transform = ''

      // Also let the body child expand freely so its content height is included.
      // Must reset `flex` entirely (not just flexShrink) because flex-basis:0
      // causes the body to measure at 0px in an auto-height flex container.
      const body = bodyRef.current
      if (body) {
        body.style.overflow = 'visible'
        body.style.flex     = 'none'
        body.style.height   = 'auto'
      }

      const contentH = letter.scrollHeight

      // Restore (CSS class reinstates position:absolute; inset:0)
      letter.style.position = ''
      letter.style.bottom   = ''
      letter.style.height   = ''
      letter.style.width    = ''
      if (body) {
        body.style.overflow = ''
        body.style.flex     = ''
        body.style.height   = ''
      }
      measuring = false

      if (contentH > paperH) {
        // Scale content to fit with equal visual padding on all sides (16px).
        // Widen the element so visual width = paperW - 2*PAD after scaling.
        // Translate to center the scaled content within the paper.
        const PAD     = 10
        const scale   = (paperH - 2 * PAD) / contentH
        const letterW = Math.round((paperW - 2 * PAD) / scale)
        const tx      = PAD
        const ty      = Math.round((paperH - contentH * scale) / 2)

        letter.style.overflow        = 'visible'
        letter.style.width           = `${letterW}px`
        letter.style.height          = `${contentH}px`
        letter.style.transform       = `translate(${tx}px, ${ty}px) scale(${scale})`
        letter.style.transformOrigin = '0 0'
        letter.setAttribute('data-body-free', '1')
        setContentScale(scale)
      } else {
        letter.style.overflow  = ''
        letter.style.width     = ''
        letter.style.height    = ''
        letter.style.transform = ''
        letter.removeAttribute('data-body-free')
        setContentScale(1)
      }
    }

    applyScale()

    // Re-run whenever the paper resizes (covers the unfolding animation)
    const ro = new ResizeObserver(applyScale)
    ro.observe(paper)
    return () => ro.disconnect()
  }, [fitContent])

  const bgHex = type === 'color' ? color : typeData.bg
  const rulerColors = computeRulerColors(bgHex)
  const fullMetrics = getScaledMetrics(textSize, viewportWidth)
  const rulerLines = showRuler ? buildRulerGradient(rulerColors, fullMetrics) : null
  const paperStyle = {
    backgroundColor: bg,
    aspectRatio: isMobile ? sizeData.mobileAspect : sizeData.aspectRatio,
  }
  const letterContentStyle = rulerLines
    ? { backgroundColor: bg, backgroundImage: rulerLines, backgroundSize: `100% ${fullMetrics.computedLineHeight}px`, backgroundPositionY: `${rulerOffset}px` }
    : typeData.hasStains ? {} : { backgroundColor: bg }

  return (
    <div className={styles.root}>
      <AnimatePresence mode="wait">
        <motion.div
          key={`${type}-${color}-${showZigzag}`}
          className={`${styles.paperWrap} ${showZigzag ? styles.paperWrapZigzag : ''}`}
          initial={{ opacity: 0.5 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0.5 }}
          transition={{ duration: 0.3, ease: 'easeInOut' }}
        >
          <div
            ref={paperRef}
            data-paper-canvas
            className={`${styles.paper} ${showZigzag ? styles.paperZigzag : ''}`}
            style={paperStyle}
            onPointerDown={() => { onSelectSticker?.(null); onSelectFrame?.(null); onSelectVoiceNote?.(null) }}
            onDoubleClick={() => onBgClick?.()}
          >
            {/* Stains at paper level so they cover the full paper even when letterContent is scaled */}
            {typeData.hasStains && <div className={styles.stains} data-stains aria-hidden />}
            <div
              ref={letterRef}
              className={styles.letterContent}
              style={letterContentStyle}
            >
              {isEmpty && (
                <motion.div
                  className={styles.emptyHint}
                  style={{ color: inkColor }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 0.30 }}
                  transition={{ duration: 0.5, delay: 0.2 }}
                >
                  Your letter will appear here…
                </motion.div>
              )}
              {liveRecipient && (
                <div className={styles.greeting}>
                  <GreetingText
                    text={liveRecipient} inkColor={inkColor}
                    readingConfig={readingConfig} wordIndexStart={0}
                  />
                </div>
              )}
              {message && (
                <div ref={bodyRef} data-paper-body className={styles.body} style={bodyFitStyle || undefined}>
                  <BodyText
                    text={message} inkColor={inkColor}
                    textSize={textSize} readingConfig={readingConfig}
                    wordIndexStart={greetingWordCount} viewportWidth={viewportWidth}
                  />
                </div>
              )}
            </div>

            {/* Media frames — DOM-based <img> so GIFs stay animated */}
            <AnimatePresence>
              {mediaFrames.map(frame => (
                <MediaFrameRenderer
                  key={frame.id}
                  frame={frame}
                  isSelected={selectedFrameId === frame.id}
                  paperRef={paperRef}
                  onSelect={onSelectFrame}
                  onMove={onMoveFrame}
                  onResize={onResizeFrame}
                  onRotate={onRotateFrame}
                  onRemove={onRemoveFrame}
                  onUpdate={onUpdateFrame}
                  onInvalidFile={onFrameInvalidFile}
                />
              ))}
            </AnimatePresence>

            {/* Voice notes — paper cards with playback + waveform */}
            {voiceNotes.map(note => (
              <VoiceNoteRenderer
                key={note.id}
                note={note}
                isSelected={selectedVoiceNoteId === note.id}
                paperRef={paperRef}
                paperBg={bg}
                onSelect={onSelectVoiceNote}
                onMove={onMoveVoiceNote}
                onResize={onResizeVoiceNote}
                onRotate={onRotateVoiceNote}
                onRemove={onRemoveVoiceNote}
              />
            ))}

            {/* Sticker icons — scaled via Framer Motion */}
            <AnimatePresence>
              {stickers.map(sticker => (
                <StickerIcon
                  key={sticker.uid}
                  sticker={sticker}
                  isSelected={selectedStickerId === sticker.uid}
                  onSelect={onSelectSticker}
                  paperRef={paperRef}
                  onMove={onMoveSticker}
                  paperScale={fitContent ? contentScale : 1}
                />
              ))}
            </AnimatePresence>

            {/* Handwritten drawing overlay — vector strokes on top of text/media. */}
            <DrawingLayer
              activeTool={drawingTool}
              toolColor={drawingColor}
              strokes={strokes}
              onStrokeComplete={onAddStroke ?? (() => {})}
              onEraseStrokes={onEraseStrokes ?? (() => {})}
            />

            {/* Selection controls — outside the scale context, handles stay fixed pixel size */}
            <AnimatePresence>
              {stickers
                .filter(s => s.uid === selectedStickerId)
                .map(sticker => (
                  <StickerControls
                    key={`ctrl-${sticker.uid}`}
                    sticker={sticker}
                    paperRef={paperRef}
                    onRemove={onRemoveSticker}
                    onMove={onMoveSticker}
                    onResize={onResizeSticker}
                    onRotate={onRotateSticker}
                  />
                ))
              }
            </AnimatePresence>
          </div>
        </motion.div>
      </AnimatePresence>

    </div>
  )
}

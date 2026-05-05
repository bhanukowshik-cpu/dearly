import { useMemo, useRef, useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { TegakiRenderer } from 'tegaki/react'
import { font } from '../../lib/tegakiFont'
import { useCharList } from '../../lib/useCharList'
import { PAPER_TYPES } from './stylePresets'
import { STICKER_REGISTRY } from './handDrawnStickers'
import styles from './PaperCanvas.module.css'

const BASE_SIZE = 52

/* ─────────────────────────────────────────────────────────────────────────
   Control icons
   ───────────────────────────────────────────────────────────────────────── */
function IconClose() {
  return (
    <svg width="9" height="9" viewBox="0 0 9 9" fill="none" aria-hidden>
      <path d="M1.5 1.5L7.5 7.5M7.5 1.5L1.5 7.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
    </svg>
  )
}

function IconRotate() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden>
      {/* 270° clockwise arc — start top (7.5,2), end left (2,7.5), radius 5.5 */}
      <path d="M 7.5 2 A 5.5 5.5 0 1 1 2 7.5"
            stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none"/>
      {/* Arrowhead at end pointing downward (clockwise tangent at 9 o'clock) */}
      <path d="M 0 5.5 L 2 7.5 L 4 5.5"
            stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

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
    .replace(/={4,}([^=\n]+)={4,}/g,   '==$1==')
}

/* ─────────────────────────────────────────────────────────────────────────
   computeCharTypes — tags every character in the raw string:
   'text' | 'highlight' | 'highlight-pink' | 'highlight-sage' |
   'strike' | 'bold' | 'size-sm' | 'size-lg' | 'delim'
   ───────────────────────────────────────────────────────────────────────── */
function computeCharTypes(text) {
  const types = new Array(text.length).fill('text')
  /* ==text==  ==pink::text==  ==sage::text==  ~~text~~  **text**  @@sm::text@@  @@lg::text@@ */
  const re = /==((?:pink|sage)::)?([^=\n]+)==|~~([^~\n]+)~~|\*\*([^*\n]+)\*\*|@@(sm|lg)::([^@\n]+)@@/g
  let m
  while ((m = re.exec(text)) !== null) {
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
   CharPath — single character, animates in via TegakiRenderer stroke-draw.
   Space chars are plain inline spans so word-wrapping works naturally.
   ───────────────────────────────────────────────────────────────────────── */
function CharPath({ ch, inkColor, fontWeight, fontSize }) {
  if (ch === ' ') {
    return <span>{' '}</span>
  }
  return (
    <span style={{ display: 'inline-block', verticalAlign: 'text-bottom', lineHeight: 1 }}>
      <TegakiRenderer
        font={font}
        time={{ mode: 'uncontrolled', duration: 0.085 }}
        style={{
          fontSize:   fontSize ?? 'inherit',
          color:      inkColor,
          fontWeight: fontWeight ?? 400,
          lineHeight: 1,
        }}
      >
        {ch}
      </TegakiRenderer>
    </span>
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
function renderWordWrapped(items, renderChar, readingConfig = null, wordStyle = null, wordIndexStart = 0) {
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
          style={{ display: 'inline-block', whiteSpace: 'nowrap', verticalAlign: 'bottom' }}
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
      result.push(<span key={`sp-${id}`}>{' '}</span>)
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
        segWordIdx = nextIdx
        if (seg.type.startsWith('highlight')) {
          return <mark key={seg.firstId} className={HL_CLASS[seg.type] || styles.highlight}>{els}</mark>
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
   ───────────────────────────────────────────────────────────────────────── */
const HL_CLASS = {
  'highlight':      styles.highlight,
  'highlight-pink': styles.highlightPink,
  'highlight-sage': styles.highlightSage,
}

const BODY_FS_MAP = {
  sm: 'clamp(11px, 1.4vw, 14px)',
  md: 'clamp(13px, 1.7vw, 17px)',
  lg: 'clamp(15px, 2.0vw, 20px)',
}
const BODY_FS = BODY_FS_MAP.lg

function BodyText({ text, inkColor, textSize = 'lg', readingConfig, lineSpacing = 32, wordIndexStart = 0 }) {
  const normText = useMemo(() => normalizeMarkup(text), [text])
  const chars  = useCharList(normText)
  const types  = useMemo(() => computeCharTypes(normText), [normText])
  const segs   = useMemo(() => buildSegments(normText, types, chars), [normText, types, chars])
  const baseFz = BODY_FS_MAP[textSize] ?? BODY_FS_MAP.lg

  // Chain wordIndexStart across segments locally — no shared external state.
  let segWordIdx = wordIndexStart

  return (
    <span style={{
      fontFamily:   "'Caveat', cursive",
      fontSize:     baseFz,
      fontWeight:   400,
      color:        inkColor,
      lineHeight:   `${lineSpacing}px`,
      whiteSpace:   'pre-wrap',
      overflowWrap: 'break-word',
      display:      'block',
    }}>
      {segs.map(seg => {
        if (seg.type === 'br') return <br key={seg.id} />
        const segFs  = seg.type === 'size-sm' ? BODY_FS_MAP.sm
                     : seg.type === 'size-lg' ? BODY_FS_MAP.lg
                     : baseFz
        const isBold = seg.type === 'bold'
        const ws     = readingConfig ? { inkColor, fontWeight: isBold ? 700 : 400, fontSize: segFs } : null
        const { els, nextIdx } = renderWordWrapped(seg.items, (id, ch) => (
          <CharPath key={id} ch={ch} inkColor={inkColor} fontWeight={isBold ? 700 : 400} fontSize={segFs} />
        ), readingConfig, ws, segWordIdx)
        segWordIdx = nextIdx
        if (seg.type.startsWith('highlight')) {
          return <mark key={seg.firstId} className={HL_CLASS[seg.type] || styles.highlight}>{els}</mark>
        }
        if (seg.type === 'strike') {
          return <span key={seg.firstId} className={styles.strike}>{els}</span>
        }
        if (seg.type === 'bold') {
          return <span key={seg.firstId}>{els}</span>
        }
        if (seg.type === 'size-sm' || seg.type === 'size-lg') {
          return <span key={seg.firstId} style={{ fontSize: segFs }}>{els}</span>
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
function StickerIcon({ sticker, isSelected, onSelect, paperRef, onMove }) {
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
      animate={{ scale: sticker.scale, rotate: sticker.rotation, opacity: 1 }}
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
        <IconClose />
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
          <IconRotate />
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

function computeColorRuler(hexColor) {
  const lum = hexLuminance(hexColor)
  if (lum < 0.4) return 'rgba(255,255,255,0.10)'
  const r = parseInt(hexColor.slice(1, 3), 16)
  const g = parseInt(hexColor.slice(3, 5), 16)
  const b = parseInt(hexColor.slice(5, 7), 16)
  return `rgba(${Math.round(r * 0.68)},${Math.round(g * 0.68)},${Math.round(b * 0.68)},0.32)`
}

function computeColorInk(hexColor) {
  return hexLuminance(hexColor) < 0.5 ? '#F0F0EE' : '#1C1C1E'
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
  onBgClick,
  textSize = 'lg',
  readingMode = false,
  revealedWordIdx = 0,
}) {
  const { type = 'minimal', color = '#FAFAF8', showRuler = true, showZigzag = false } = paperConfig ?? {}
  const typeData = PAPER_TYPES[type] ?? PAPER_TYPES.minimal
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

  const paperRef = useRef(null)
  const bodyRef  = useRef(null)
  const [rulerOffset, setRulerOffset] = useState(21)

  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 860px)').matches : false
  )
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 860px)')
    const h = e => setIsMobile(e.matches)
    mq.addEventListener('change', h)
    return () => mq.removeEventListener('change', h)
  }, [])
  const lineSpacing = isMobile ? 22 : 26

  const hasMessage = !!message
  useEffect(() => {
    const paper = paperRef.current
    if (!paper || !showRuler) return

    function measure() {
      const pr = paper.getBoundingClientRect()
      const bd = bodyRef.current
      if (!bd || pr.height === 0) return
      const bodyTopRel = bd.getBoundingClientRect().top - pr.top
      const raw = ((bodyTopRel - 10) % lineSpacing + lineSpacing) % lineSpacing
      setRulerOffset(Math.round(raw))
    }

    const ro = new ResizeObserver(measure)
    ro.observe(paper)
    measure()
    return () => ro.disconnect()
  }, [showRuler, liveRecipient, hasMessage, lineSpacing])

  const rulerColor = type === 'color' ? computeColorRuler(color) : typeData.rulerColor
  const rulerLines = showRuler
    ? `repeating-linear-gradient(to bottom, transparent, transparent ${lineSpacing - 1}px, ${rulerColor} ${lineSpacing - 1}px, ${rulerColor} ${lineSpacing}px)`
    : null
  const paperStyle = { backgroundColor: bg }
  const letterContentStyle = rulerLines
    ? { backgroundColor: bg, backgroundImage: rulerLines, backgroundSize: `100% ${lineSpacing}px`, backgroundPositionY: `${rulerOffset}px` }
    : { backgroundColor: bg }

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
            onPointerDown={() => onSelectSticker?.(null)}
            onDoubleClick={() => onBgClick?.()}
          >
            <div className={styles.letterContent} style={letterContentStyle}>
              {/* Stains at z-index:-1 paint above letterContent's solid bg but below text */}
              {typeData.hasStains && <div className={styles.stains} aria-hidden />}
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
                <div ref={bodyRef} className={styles.body}>
                  <BodyText
                    text={message} inkColor={inkColor}
                    textSize={textSize} readingConfig={readingConfig}
                    lineSpacing={lineSpacing} wordIndexStart={greetingWordCount}
                  />
                </div>
              )}
            </div>

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
                />
              ))}
            </AnimatePresence>

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

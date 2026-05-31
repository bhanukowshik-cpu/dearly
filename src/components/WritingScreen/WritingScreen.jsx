import { useState, useCallback, useRef, useEffect, useLayoutEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import PaperCanvas    from './PaperCanvas'
import InputPanel     from './InputPanel'
import NamePanel      from './NamePanel'
import CanvasSidebar  from './CanvasSidebar'
import StickerPicker  from './StickerPicker'
import ShareSheet     from './ShareSheet'
import EditorToolbar  from './EditorToolbar'
import MediaFramePicker from './MediaFramePicker'
import VoiceRecorderPanel from './VoiceRecorderPanel'
import DrawingPanel from './DrawingPanel'
import WriteToolbar from './WriteToolbar'
import ZoomControls, { clampZoom } from './ZoomControls'
import EditorFABs from './EditorFABs'
import TextPopup from './TextPopup'
import PaperSizePicker from './PaperSizePicker'
import styles from './WritingScreen.module.css'
import { DEFAULT_PAPER, PAPER_SIZES } from './stylePresets'
import { extractName } from './nameUtils'
import { DEFAULT_FRAME } from '../../lib/mediaFrameConfig'
import { computeFrameHeight } from '../../lib/mediaFrameHelpers'
import { maybeShowStorageNotice } from '../../lib/storageNotice'
import { trackCTA, trackEvent, markWritingStart, trackFirstShareClick } from '../../lib/analytics'
import FeedbackToast from '../FeedbackToast/FeedbackToast'

// One-time-per-device flag so the authoring feedback prompt never nags.
const AUTHORING_FEEDBACK_KEY = 'dearly_authoring_feedback_done'
import { exportNoteToJson, copyToClipboard, downloadAsFile, buildExportFilename, importNoteFromFile, pickJsonFile, exportPaperAsPng } from '../../lib/exportNoteJson'
import {
  DEFAULT_PEN_COLOR,
  DEFAULT_HIGHLIGHTER_COLOR,
  DEFAULT_STROKE_THICKNESS,
} from '../../lib/drawingPresets'
/* Top-bar + mobile-tab icons — sourced from editorIcons.jsx so the whole
   chrome reads as hand-drawn. Mobile bottom nav mirrors the desktop
   EditorToolbar so the same tool labels/icons show across breakpoints. */
import {
  IconShare,
  IconLook  as IconEye,
  IconPlane,
  IconText,
  IconImage as IconUpload,
  IconMic,
  IconPen,
  IconSticker,
  IconPalette,
} from './editorIcons'

/* ── Hand-drawn action buttons ───────────────────────────────────────────── */
function HandButton({ label, icon, disabled, onClick, viewBox = "0 0 200 44", pathD }) {
  return (
    <motion.button
      className={`${styles.handBtn} ${disabled ? styles.handBtnDisabled : ''}`}
      onClick={onClick}
      disabled={disabled}
      whileHover={disabled ? {} : { scale: 1.04 }}
      whileTap={disabled   ? {} : { scale: 0.96 }}
      transition={{ duration: 0.1 }}
    >
      <svg className={styles.handBorder} viewBox={viewBox} preserveAspectRatio="none" fill="none" aria-hidden>
        {pathD}
      </svg>
      <span className={styles.handBtnLabel}>
        {icon}
        {label}
      </span>
    </motion.button>
  )
}

function PreviewButton({ onClick }) {
  const label = "Preview"
  return (
    <HandButton
      label={label}
      icon={<IconEye />}
      disabled={false}
      onClick={onClick}
      viewBox="0 0 220 38"
      pathD={<>
        <path d="M 12,4   C 72,2   148,2   208,4"   stroke="rgba(255,255,255,0.82)" strokeWidth="1.6" strokeLinecap="round"/>
        <path d="M 208,4  C 211,13  211,25  208,34"  stroke="rgba(255,255,255,0.82)" strokeWidth="1.6" strokeLinecap="round"/>
        <path d="M 208,34 C 148,37  72,37   12,34"   stroke="rgba(255,255,255,0.82)" strokeWidth="1.6" strokeLinecap="round"/>
        <path d="M 12,34  C 9,25    9,13    12,4"    stroke="rgba(255,255,255,0.82)" strokeWidth="1.6" strokeLinecap="round"/>
      </>}
    />
  )
}

/* ── Preview nudge ──────────────────────────────────────────────────────────
   A thought-bubble that drops down from the Preview button when the user
   tries to preview their letter without filling in either name. Contains
   two inputs bound to the real senderName / recipientName state plus a
   "Preview anyway" CTA. The pointer at the top is a small CSS triangle
   that visually attaches the bubble to the Preview button above it.

   Renders inline next to the Preview button; uses absolute positioning
   so it overlays the page rather than reflowing the layout. AnimatePresence
   in the parent handles the open/close transition.
   ─────────────────────────────────────────────────────────────────────────── */
function PreviewNudge({ side, senderName, recipientName, onSenderChange, onRecipientChange, onPreviewAnyway, onClose }) {
  /* CTA copy is conditional:
     - both names filled  → "Preview →" (user supplied data, no skipping)
     - either name empty  → "Preview anyway →" (signals they're proceeding
       without one or both names)
     `.trim()` so whitespace-only inputs still count as empty. */
  const bothNamesFilled = senderName.trim() !== '' && recipientName.trim() !== ''
  const ctaLabel = bothNamesFilled ? 'Preview →' : 'Preview anyway →'

  return (
    <motion.div
      className={`${styles.previewNudge} ${side === 'left' ? styles.previewNudgeLeft : styles.previewNudgeRight}`}
      initial={{ opacity: 0, y: -8, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{    opacity: 0, y: -8, scale: 0.96 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
    >
      <span className={styles.previewNudgePointer} aria-hidden />

      <p className={styles.previewNudgeTitle}>
        Sender's and recipient's name not found
      </p>

      <label className={styles.previewNudgeField}>
        <span className={styles.previewNudgeLabel}>Your name</span>
        <input
          type="text"
          autoFocus
          placeholder="e.g. Maya"
          value={senderName}
          onChange={e => onSenderChange(e.target.value)}
          maxLength={40}
          className={styles.previewNudgeInput}
        />
      </label>

      <label className={styles.previewNudgeField}>
        <span className={styles.previewNudgeLabel}>Recipient's name</span>
        <input
          type="text"
          placeholder="e.g. Leo"
          value={recipientName}
          onChange={e => onRecipientChange(e.target.value)}
          maxLength={40}
          className={styles.previewNudgeInput}
        />
      </label>

      {/* Crooked filled-pill CTA — same hand-drawn shape language as the
          "Write a Dearly Letter" button on the landing page. The SVG
          path is stretched via preserveAspectRatio="none" so the wobble
          adapts to the button's width. */}
      <button
        type="button"
        className={styles.previewNudgeCta}
        onClick={onPreviewAnyway}
      >
        <svg
          className={styles.previewNudgeCtaBg}
          viewBox="0 0 340 62"
          preserveAspectRatio="none"
          fill="none"
          aria-hidden
        >
          <path
            d="M 14,8 C 95,4 245,5 326,8 C 330,22 331,40 326,54 C 245,58 95,57 14,54 C 10,40 10,22 14,8 Z"
            fill="#2a1d0a"
          />
        </svg>
        <span className={styles.previewNudgeCtaLabel}>
          {ctaLabel}
        </span>
      </button>

      {/* Plain text close link under the CTA — quieter than a corner ✕ */}
      <button
        type="button"
        className={styles.previewNudgeCloseLink}
        onClick={onClose}
      >
        Close
      </button>
    </motion.div>
  )
}

/* ── Sticker slot positions (% of paper) ────────────────────────────────── */
const STICKER_SLOTS = [
  { x: 80, y: 12 }, { x: 72, y: 70 }, { x: 84, y: 42 },
  { x: 68, y: 20 }, { x: 78, y: 82 }, { x: 88, y: 57 },
]

/* Dev-only toolbar buttons (Export JSON / Import JSON / Export PNG) — these
   are designer workflow utilities used to capture reference letters for
   the LoadingScreen carousel, not features for real end users. Hidden in
   production builds via Vite's import.meta.env.DEV flag, which evaluates
   to true under `vite dev` and false under `vite build`. The button JSX
   below is gated on IS_DEV && !isMobile, so production users never see
   them while local dev still has the full export toolkit. */
const IS_DEV = import.meta.env.DEV

/* ─────────────────────────────────────────────────────────────────────────
   WritingScreen
   ───────────────────────────────────────────────────────────────────────── */
export default function WritingScreen({ onBack = () => {}, onShare = null, onPreview = null }) {
  const [recipient,          setRecipient]          = useState('')
  const [message,            setMessage]            = useState('')
  const [senderName,         setSenderName]         = useState('')
  // Recipient name is metadata only — never rendered onto the paper canvas.
  const [showRecipient,      setShowRecipient]      = useState(false)
  const [paperConfig,        setPaperConfig]        = useState(DEFAULT_PAPER)
  // Paper sizes whose body is too short for the current message (smaller sizes
  // can't hold what fits on a bigger sheet). Computed in a layout effect below;
  // PaperSizePicker greys these out and toasts when one is tapped.
  const [disabledSizes,      setDisabledSizes]      = useState([])
  /* Default text size is Large everywhere. */
  const [textSize,           setTextSize]           = useState('lg')
  const [stickers,           setStickers]           = useState([])
  const [selectedStickerId,  setSelectedStickerId]  = useState(null)
  /* iPad text-element layer — typed entries from the TextPopup get
     dropped here as individual draggable cards (on iPad only). On
     desktop / mobile the existing `message` paragraph is still the
     primary input. textElements coexist with `message`: both render
     on the paper, both persist with the note. */
  const [textElements,         setTextElements]         = useState([])
  const [selectedTextElementId, setSelectedTextElementId] = useState(null)
  const [mediaFrames,        setMediaFrames]        = useState([])
  const [selectedFrameId,    setSelectedFrameId]    = useState(null)
  const nextFrameIdRef = useRef(1)
  // Stack of recently-removed media frames, newest last. Cmd/Ctrl-Z pops
  // the top and re-adds that frame so accidental removes are recoverable.
  // Bounded so memory doesn't grow unbounded; 5 is plenty for "oops".
  const removedFramesRef = useRef([])
  const [voiceNotes,         setVoiceNotes]         = useState([])
  const [selectedVoiceNoteId, setSelectedVoiceNoteId] = useState(null)
  const nextVoiceNoteIdRef = useRef(1)
  const [shakeKey,           setShakeKey]           = useState(0)
  const [showShare,          setShowShare]          = useState(false)
  const [showHelpMenu,       setShowHelpMenu]       = useState(false)

  // Start the time-to-first-send clock the moment the editor opens.
  useEffect(() => { markWritingStart() }, [])
  // Fire a one-time "drawing" media-attach the first time ink is laid down.
  const drawingTrackedRef = useRef(false)

  /* Authoring feedback prompt — appears once the user has spent ~45s
     actively in the editor (counting only foreground time), and only if
     they haven't already rated/dismissed it on this device. */
  const [showFeedback, setShowFeedback] = useState(false)
  useEffect(() => {
    let done = false
    try { done = localStorage.getItem(AUTHORING_FEEDBACK_KEY) === '1' } catch { /* storage blocked */ }
    if (done) return
    let activeSeconds = 0
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') activeSeconds += 1
      if (activeSeconds >= 45) {
        clearInterval(id)
        setShowFeedback(true)
        trackEvent('feedback_prompt_shown', { source: 'authoring' })
      }
    }, 1000)
    return () => clearInterval(id)
  }, [])
  const dismissFeedback = useCallback(() => {
    setShowFeedback(false)
    try { localStorage.setItem(AUTHORING_FEEDBACK_KEY, '1') } catch { /* storage blocked */ }
  }, [])
  const [toast,              setToast]              = useState(null)
  const toastTimerRef  = useRef(null)
  const toastCounterRef = useRef(0)
  const activeToastRef = useRef(null)
  const [shakeId, setShakeId] = useState(0)
  /* iPad detection — UA-based so it works in both orientations (iPadOS 13+
     reports as Macintosh, so we also require maxTouchPoints > 1 to
     distinguish a real iPad from a Mac). Stable for the session — orientation
     changes don't toggle device identity. */
  const isIpadDevice = (() => {
    if (typeof navigator === 'undefined') return false
    const ua = navigator.userAgent
    if (/iPad/.test(ua)) return true
    if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) return true
    return false
  })()
  const [isMobile,           setIsMobile]           = useState(() => {
    if (typeof window === 'undefined') return false
    if (isIpadDevice) return true
    return window.matchMedia('(max-width: 599px), (max-width: 1180px) and (orientation: portrait)').matches
  })
  /* iPad gets a contenteditable paper (Scribble-ready) + a Write-mode UX
     (centered canvas, zoom controls, floating Write toolbar, FABs). Phones
     keep the InputPanel below the paper since the paper itself is too small
     to comfortably write on with a finger. */
  const [isIpad,             setIsIpad]             = useState(() => {
    if (typeof window === 'undefined') return false
    if (isIpadDevice) return true
    return window.matchMedia('(min-width: 600px) and (max-width: 1366px) and (any-pointer: coarse)').matches
  })
  /* iPad defaults to Write (so the user lands ready to type/scribble on the
     paper); everything else defaults to To/From so the first thing you see
     is the recipient picker. */
  const [activeTool,         setActiveTool]         = useState(() => {
    if (typeof window === 'undefined') return 'people'
    if (isIpadDevice) return 'text'
    const ipadInit = window.matchMedia('(min-width: 600px) and (max-width: 1366px) and (any-pointer: coarse)').matches
    return ipadInit ? 'text' : 'people'
  })

  // ── Drawing layer state ────────────────────────────────────────────────
  // Strokes are vector records — the SVG path is derived on the fly so we
  // can re-rasterise crisply at any export resolution. `drawingTool` mirrors
  // the toolbar selection but only "activates" when the Draw side-panel is
  // open, so the overlay doesn't swallow pointer events on other tabs.
  const [strokes,            setStrokes]            = useState([])
  /* True while a pen stroke is in flight (and for 300 ms after lift).
     Used to lock the bottom nav so palm-rest taps don't switch tabs
     mid-stroke or right at the moment the user finishes a letter.
     The debounce window catches palm contacts that linger past the
     pen-up event by a fraction of a second. */
  const [strokeActive,       setStrokeActive]       = useState(false)
  const strokeReleaseTimerRef = useRef(null)

  const handleStrokeActiveChange = useCallback((active) => {
    if (active) {
      if (strokeReleaseTimerRef.current) {
        clearTimeout(strokeReleaseTimerRef.current)
        strokeReleaseTimerRef.current = null
      }
      setStrokeActive(true)
    } else {
      // Debounced release — keeps the nav locked for 300 ms after the
      // pen lifts. Without this, a palm that touches the nav as the
      // user finishes the last stroke of a word would fire a tab swap.
      if (strokeReleaseTimerRef.current) clearTimeout(strokeReleaseTimerRef.current)
      strokeReleaseTimerRef.current = setTimeout(() => {
        setStrokeActive(false)
        strokeReleaseTimerRef.current = null
      }, 300)
    }
  }, [])
  useEffect(() => () => {
    if (strokeReleaseTimerRef.current) clearTimeout(strokeReleaseTimerRef.current)
  }, [])
  // Default to the pen so the user can start drawing the instant they open
  // the Draw tab — no "pick a tool first" friction. The effect below also
  // re-applies this default whenever the user returns to the Draw tab.
  const [drawingTool,        setDrawingTool]        = useState('pen') // 'pen' | 'highlighter' | 'eraser' | null
  const [penColor,           setPenColor]           = useState(DEFAULT_PEN_COLOR)
  const [highlighterColor,   setHighlighterColor]   = useState(DEFAULT_HIGHLIGHTER_COLOR)
  /* Stroke thickness — 'sm' | 'md' | 'lg'. Affects new strokes only;
     persisted strokes carry their own thickness. */
  const [strokeThickness,    setStrokeThickness]    = useState(DEFAULT_STROKE_THICKNESS)

  /* iPad zoom — applies a CSS transform: scale() on the paper container.
     Pinch-to-zoom on the paper container shares this state. */
  const [zoomLevel, setZoomLevel] = useState(1)

  /* iPad text-edit mode. False by default → paper has no contenteditable
     surface → iOS Scribble can never engage on pen contact. The user
     enters edit mode explicitly via the Text FAB or by tapping with a
     finger; the contenteditable mounts, auto-focuses, and the keyboard
     opens. Blur returns to false so pen strokes stay as ink again. */
  const [editorActive, setEditorActive] = useState(false)

  /* Visual-viewport tracking (iPad). When the user focuses the paper
     contenteditable the iOS keyboard slides up and visualViewport.height
     shrinks by the keyboard height. We mirror that onto a CSS variable
     (`--vv-height`) on the document element — pure DOM mutation, no
     React re-render. The previous useState approach caused a re-render
     of the entire WritingScreen tree on every visualViewport change
     (including the noisy predictive-bar height adjustments mid-typing)
     which disturbed the contenteditable's focus and lost keystrokes.
     CSS-variable-only is invisible to React, so the editor stays put.
     The root container's height uses this variable on iPad — the flex
     layout re-centers the paper inside the still-visible area, using
     the empty top space too. Paper-size agnostic (strip / postcard / A4). */
  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return
    const vv = window.visualViewport
    function update() {
      document.documentElement.style.setProperty('--vv-height', `${vv.height}px`)
    }
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    update()
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
      document.documentElement.style.removeProperty('--vv-height')
    }
  }, [])

  const paperRef    = useRef(null)
  const shareWrapRef = useRef(null)
  const helpWrapRef  = useRef(null)
  const selectedStickerIdRef = useRef(selectedStickerId)
  useEffect(() => { selectedStickerIdRef.current = selectedStickerId }, [selectedStickerId])
  const selectedTextElementIdRef = useRef(selectedTextElementId)
  useEffect(() => { selectedTextElementIdRef.current = selectedTextElementId }, [selectedTextElementId])
  const selectedFrameIdRef = useRef(selectedFrameId)
  useEffect(() => { selectedFrameIdRef.current = selectedFrameId }, [selectedFrameId])
  const selectedVoiceNoteIdRef = useRef(selectedVoiceNoteId)
  useEffect(() => { selectedVoiceNoteIdRef.current = selectedVoiceNoteId }, [selectedVoiceNoteId])

  /* ── Overflow guard: prevent text from spilling outside the paper ───────────
     Last-known-good message + a sync token. After every message change we
     synchronously measure the rendered paper body; if it overflows we revert
     to the previous valid value and bump editorResyncKey so the contenteditable
     (which is the source of truth while focused) flushes back to that value.
     A toast nudges the user toward a smaller text size.                       */
  const lastValidMessageRef = useRef(message)
  const [editorResyncKey, setEditorResyncKey] = useState(0)
  const overflowRevertedRef = useRef(false)
  useLayoutEffect(() => {
    const paper = paperRef.current
    if (!paper) { lastValidMessageRef.current = message; return }
    const bodyEl = paper.querySelector('[data-paper-body]')
    if (!bodyEl) { lastValidMessageRef.current = message; return }
    // 2px slop covers sub-pixel rounding so we don't false-trip on edge cases.
    const overflowing = bodyEl.scrollHeight > bodyEl.clientHeight + 2
    if (overflowing && message !== lastValidMessageRef.current) {
      const reverted = lastValidMessageRef.current
      overflowRevertedRef.current = true
      setMessage(reverted)
      setEditorResyncKey(k => k + 1)
      const size = paperConfig?.size ?? 'postcard'
      const paperLabel = size === 'strip' ? 'strip' : size === 'a4' ? 'sheet' : 'card'
      // Stepping the text size down is the least disruptive fix, so lead with
      // it whenever there's a smaller size to drop to (Large to Medium, Medium
      // to Small). Once at Small, fall back to nudging toward a larger paper;
      // an A4 sheet at Small has no further room, so we ask to trim instead.
      const sizeStep  = textSize === 'lg' ? 'Medium' : textSize === 'md' ? 'Small' : null
      const paperStep = size === 'strip' ? 'a postcard' : size === 'postcard' ? 'an A4 sheet' : null
      const fix =
        sizeStep && paperStep
          ? `Try reducing the text size to ${sizeStep}, or switch to ${paperStep}.`
          : sizeStep
            ? `Try reducing the text size to ${sizeStep} to fit more.`
            : paperStep
              ? `Switch to ${paperStep} to fit your full message.`
              : 'Try shortening your message a little to fit.'
      showToast(`Your message is overflowing the ${paperLabel}. ${fix}`, 'overflow')
    } else {
      lastValidMessageRef.current = message
    }
  }, [message, textSize, paperConfig])

  /* ── Keep photo frames the same physical size across paper sizes ────────────
     Paper WIDTH is constant across sizes (the center column is fixed-width),
     but HEIGHT changes with each size's aspect ratio. A frame stores width as
     a % of paper width and height as a % of paper height — so leaving height%
     untouched on a size change stretches the photo (taller paper) or squashes
     it (shorter paper).

     The frame's width% already maps to a constant pixel width. So after a size
     change we re-derive each frame's height% from its width% using the NEW
     paper height: the pixel height that keeps the image's aspect is constant,
     only the % needs to track the new denominator. Result: the photo's
     orientation and size stay put — resizing remains the user's call.        */
  const prevPaperSizeRef = useRef(paperConfig?.size)
  useLayoutEffect(() => {
    const size = paperConfig?.size
    if (size === prevPaperSizeRef.current) return
    prevPaperSizeRef.current = size
    if (mediaFrames.length === 0) return
    const paperEl = paperRef.current?.querySelector('[data-paper-canvas]')
                 ?? document.querySelector('[data-paper-canvas]')
    if (!paperEl) return
    const paperW = paperEl.clientWidth
    const paperH = paperEl.clientHeight
    if (paperW <= 0 || paperH <= 0) return
    setMediaFrames(prev => prev.map(f => {
      if (!(f.imageWidth > 0 && f.imageHeight > 0)) return f
      const frameW_px = (f.width / 100) * paperW
      const newH_px   = computeFrameHeight(frameW_px, f.imageWidth / f.imageHeight, f.frameStyle)
      const newHeight = (newH_px / paperH) * 100
      return Math.abs(newHeight - f.height) < 0.01 ? f : { ...f, height: newHeight }
    }))
  }, [paperConfig?.size, mediaFrames.length])

  /* ── Predict which paper sizes the message would overflow ───────────────────
     "No content may spill off the sheet" is the rule. The overflow guard above
     enforces it for the CURRENT size by reverting edits. This effect looks
     ahead: it greys out any OTHER size whose body is too short for the message
     the writer already has, so they can't switch into an overflow.

     Paper WIDTH is fixed across sizes, so the message's natural height is the
     same everywhere (it wraps identically) — we read it once from the live
     body's scrollHeight. For each candidate size we reconstruct the body's
     available height from that size's paper height and padding:

       paperH(size)  = paperW × (h ÷ w)          // from the size's aspect ratio
       padV(size)    = strip ? clamp(20,16%,36) : clamp(16,5%,32), ×2 sides
       constChrome   = greeting + gaps + borders  // size-independent; measured
       bodyClient(s) = paperH(s) − padV(s) − constChrome

     constChrome is derived from the current measured state so we never hardcode
     the greeting/gap pixels — only the padding clamp (which keys off the fixed
     width) is replicated from CSS.                                            */
  useLayoutEffect(() => {
    const paperEl = paperRef.current?.querySelector('[data-paper-canvas]')
                 ?? document.querySelector('[data-paper-canvas]')
    if (!paperEl) return
    // No body element ⇒ the message is empty, so nothing can overflow any size.
    // Clear any stale disabled state rather than leaving the last computation.
    const bodyEl = paperEl.querySelector('[data-paper-body]')
    if (!bodyEl) { setDisabledSizes(prev => (prev.length ? [] : prev)); return }
    const paperW       = paperEl.clientWidth
    const curPaperH    = paperEl.clientHeight
    const curBodyClient = bodyEl.clientHeight
    const contentH     = bodyEl.scrollHeight   // natural message height (width-fixed → size-independent)
    if (paperW <= 0 || curPaperH <= 0) return

    const clampPx = (min, pct, max) => Math.min(Math.max(min, pct * paperW), max)
    const padV    = size => 2 * (size === 'strip' ? clampPx(20, 0.16, 36) : clampPx(16, 0.05, 32))
    const paperHFor = size => {
      const d = PAPER_SIZES[size]
      const aspect = isMobile ? d.mobileAspect : d.aspectRatio
      const [w, h] = aspect.split('/').map(parseFloat)
      return paperW * (h / w)
    }

    const curSize    = paperConfig?.size ?? 'postcard'
    const constChrome = curPaperH - curBodyClient - padV(curSize)

    const blocked = Object.keys(PAPER_SIZES).filter(size => {
      if (size === curSize) return false   // current size already fits (guard enforces it)
      const bodyClient = paperHFor(size) - padV(size) - constChrome
      return contentH > bodyClient + 2     // +2 mirrors the overflow guard's slop
    })
    setDisabledSizes(prev =>
      prev.length === blocked.length && prev.every(s => blocked.includes(s)) ? prev : blocked
    )
  }, [message, textSize, paperConfig, isMobile, recipient])

  /* Respond to viewport width changes. On a real iPad device the flags stay
     true regardless of orientation; the matchMedia only matters for
     browsers without iPad UA (eg. desktop Chrome simulating a tablet). */
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 599px), (max-width: 1180px) and (orientation: portrait)')
    const handler = e => setIsMobile(e.matches || isIpadDevice)
    mq.addEventListener('change', handler)
    const ipadMq = window.matchMedia('(min-width: 600px) and (max-width: 1366px) and (any-pointer: coarse)')
    const ipadHandler = e => setIsIpad(e.matches || isIpadDevice)
    ipadMq.addEventListener('change', ipadHandler)
    return () => {
      mq.removeEventListener('change', handler)
      ipadMq.removeEventListener('change', ipadHandler)
    }
  }, [isIpadDevice])


  /* Cleanup toast timer on unmount */
  useEffect(() => () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
  }, [])

  /* Close share dropdown when clicking outside or pressing Escape */
  useEffect(() => {
    if (!showShare) return
    function handleOutside(e) {
      // On mobile the sheet has its own backdrop — skip the document listener
      // so tapping inside the sheet doesn't close it immediately.
      if (isMobile) return
      if (shareWrapRef.current && !shareWrapRef.current.contains(e.target)) {
        setShowShare(false)
      }
    }
    function handleEscape(e) {
      if (e.key === 'Escape') setShowShare(false)
    }
    document.addEventListener('pointerdown', handleOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('pointerdown', handleOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [showShare, isMobile])

  /* Close the help/legal overflow menu when clicking outside or pressing Escape */
  useEffect(() => {
    if (!showHelpMenu) return
    function handleOutside(e) {
      if (helpWrapRef.current && !helpWrapRef.current.contains(e.target)) {
        setShowHelpMenu(false)
      }
    }
    function handleEscape(e) {
      if (e.key === 'Escape') setShowHelpMenu(false)
    }
    document.addEventListener('pointerdown', handleOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('pointerdown', handleOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [showHelpMenu])

  // The canvas counts as "empty" only when there's truly nothing on it —
  // no typed message, no placed stickers, no uploaded pictures, no recorded
  // voice notes, no drawings. Any one of these is enough to let the user
  // share / download.
  const isEmpty = (
    message.trim() === '' &&
    stickers.length === 0 &&
    mediaFrames.length === 0 &&
    voiceNotes.length === 0 &&
    strokes.length === 0
  )
  const recipientName = extractName(recipient)

  // tone: 'caution' (default — warnings, limits, failures) or 'info'
  // (non-emergency: in-progress / sent / downloaded). Drives color + icon.
  const showToast = useCallback((msg, tone = 'caution') => {
    const active = activeToastRef.current
    // Repeating the same action while its toast is still up: don't stack a
    // duplicate — shake the existing one to reinforce the nudge and refresh
    // its dismiss timer.
    if (active && active.msg === msg) {
      setShakeId(n => n + 1)
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
      toastTimerRef.current = setTimeout(() => setToast(null), 3800)
      return
    }
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    const id = ++toastCounterRef.current
    setShakeId(0)
    setToast({ msg, id, tone })
    toastTimerRef.current = setTimeout(() => setToast(null), 3800)
  }, [])

  const dismissToast = useCallback(() => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToast(null)
  }, [])

  /* Tapping a paper size the message can't fit into. Both size pickers call
     this instead of switching, so the writer gets a clear reason rather than a
     silently dead button. */
  const handleBlockedSize = useCallback((size) => {
    const label = PAPER_SIZES[size]?.label ?? 'that size'
    showToast(`Too much message for the ${label}. Trim it or keep a larger size.`, 'overflow')
  }, [showToast])

  // Keep a ref of the visible toast so showToast can detect a repeated action
  // without a stale closure.
  useEffect(() => { activeToastRef.current = toast }, [toast])

  const getNoteData = useCallback(() => ({
    senderName, recipient, recipientName, message, paperConfig, stickers, mediaFrames, voiceNotes, showRecipient, textSize,
    strokes, textElements,
  }), [senderName, recipient, recipientName, message, paperConfig, stickers, mediaFrames, voiceNotes, showRecipient, textSize, strokes, textElements])

  /* ── Drawing handlers ────────────────────────────────────────────────── */
  //
  // History is an action log — covers "added a stroke" AND "erased one or
  // more strokes" symmetrically. Each entry is one of:
  //
  //   { type: 'add',   stroke }
  //   { type: 'erase', items: [{ stroke, index }, ...], t }
  //
  // For erase actions we store each removed stroke's original z-order
  // index so undo splices them back in the right place, preserving any
  // highlighter/pen layering that existed before.
  //
  // Erase actions within ERASE_BATCH_MS of the previous erase merge into
  // the same entry. A sweeping eraser drag that removes many strokes is
  // "one intent" → one Cmd+Z undoes the whole sweep, not stroke-by-stroke.
  const undoStackRef = useRef([])
  const redoStackRef = useRef([])
  // Flags mirror stack-length into state so the panel's Undo/Redo buttons
  // re-render when they should be enabled/disabled. The stacks themselves
  // stay in refs so mutating them during a fast erase doesn't churn React.
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const ERASE_BATCH_MS = 500

  const syncHistoryFlags = useCallback(() => {
    setCanUndo(undoStackRef.current.length > 0)
    setCanRedo(redoStackRef.current.length > 0)
  }, [])

  const pushAction = useCallback((action) => {
    undoStackRef.current.push(action)
    redoStackRef.current = []
    syncHistoryFlags()
  }, [syncHistoryFlags])

  const addStroke = useCallback((stroke) => {
    setStrokes(prev => [...prev, stroke])
    pushAction({ type: 'add', stroke })
  }, [pushAction])

  const eraseStrokes = useCallback((ids) => {
    if (!ids || ids.length === 0) return
    const idSet = new Set(ids)
    let removed = []
    setStrokes(prev => {
      removed = prev
        .map((stroke, index) => ({ stroke, index }))
        .filter(({ stroke }) => idSet.has(stroke.id))
      if (removed.length === 0) return prev
      return prev.filter(s => !idSet.has(s.id))
    })
    if (removed.length === 0) return

    const now  = performance.now()
    const last = undoStackRef.current[undoStackRef.current.length - 1]
    if (last && last.type === 'erase' && (now - last.t) < ERASE_BATCH_MS) {
      // Same logical sweep — fold into the existing entry. Redo was
      // already cleared on the first erase in this batch.
      last.items.push(...removed)
      last.t = now
    } else {
      pushAction({ type: 'erase', items: removed, t: now })
    }
  }, [pushAction])

  // Returns true iff something was actually undone — lets the keyboard
  // handler decide whether to swallow the event (preventDefault).
  const undoStroke = useCallback(() => {
    const stack = undoStackRef.current
    if (stack.length === 0) return false
    const action = stack.pop()
    redoStackRef.current.push(action)
    syncHistoryFlags()

    if (action.type === 'add') {
      setStrokes(prev => prev.filter(s => s.id !== action.stroke.id))
    } else if (action.type === 'erase') {
      // Restore in ascending index order so each splice index stays valid.
      setStrokes(prev => {
        const next = [...prev]
        const sorted = [...action.items].sort((a, b) => a.index - b.index)
        for (const { stroke, index } of sorted) {
          next.splice(Math.min(index, next.length), 0, stroke)
        }
        return next
      })
    }
    return true
  }, [syncHistoryFlags])

  const redoStroke = useCallback(() => {
    const stack = redoStackRef.current
    if (stack.length === 0) return false
    const action = stack.pop()
    undoStackRef.current.push(action)
    syncHistoryFlags()

    if (action.type === 'add') {
      setStrokes(prev => [...prev, action.stroke])
    } else if (action.type === 'erase') {
      const idSet = new Set(action.items.map(({ stroke }) => stroke.id))
      setStrokes(prev => prev.filter(s => !idSet.has(s.id)))
    }
    return true
  }, [syncHistoryFlags])

  useEffect(() => {
    if (!drawingTrackedRef.current && strokes.length > 0) {
      drawingTrackedRef.current = true
      trackEvent('media_attached', { type: 'drawing' })
    }
  }, [strokes.length])

  const clearStrokes = useCallback(() => {
    if (strokes.length === 0) return
    // Wipe both stacks — clear is a deliberate reset, not an undo point.
    undoStackRef.current = []
    redoStackRef.current = []
    syncHistoryFlags()
    setStrokes([])
  }, [strokes.length, syncHistoryFlags])

  /* The drawing layer only intercepts pointer events when the Draw tab is
     open — EXCEPT on iPad, where the pen is always armed so Apple Pencil
     strokes become ink anywhere on the paper (preserving the handwritten
     look instead of getting converted to text by iOS Scribble). On iPad we
     additionally pass `penOnly` to DrawingLayer so finger taps still focus
     the contenteditable. Leaving the Draw tab on non-iPad releases the
     layer so other tools (stickers, frames…) get pointer events back. */
  useEffect(() => {
    if (activeTool === 'draw') {
      if (drawingTool === null) setDrawingTool('pen')
    } else if (drawingTool !== null && !isIpad) {
      setDrawingTool(null)
    } else if (drawingTool === null && isIpad) {
      // Re-arm the pen after returning from Draw mode on iPad.
      setDrawingTool('pen')
    }
  }, [activeTool, drawingTool, isIpad])

  /* Mirror activeTool into a ref so the [] keydown handler below can read
     the *current* tab without re-binding listeners on every change. */
  const activeToolRef = useRef(activeTool)
  useEffect(() => { activeToolRef.current = activeTool }, [activeTool])

  const handleSend = useCallback(() => {
    if (isEmpty) {
      showToast("Your note is still blank. Add a message, sticker, picture, voice note, or drawing first.")
      setShakeKey(k => k + 1)
      return
    }
    setShowShare(v => {
      if (!v) { trackCTA('open_share'); trackFirstShareClick() }
      return !v
    })
  }, [isEmpty, showToast])

  /* Preview-nudge state. Most users skip the sender/recipient fields and
     hit Preview anyway, which produces an unsigned, unaddressed letter.
     When that happens we don't silently let them through — we pop a
     small thought-bubble below the Preview button with two inputs and a
     "Preview anyway" CTA. The inputs are bound directly to the existing
     senderName / recipientName state, so whatever they type updates the
     real note (and the From/To labels on the envelope) before the
     preview opens. */
  const [nudgeOpen, setNudgeOpen] = useState(false)
  const namesMissing = !senderName.trim() || !recipientName.trim()

  const handlePreview = useCallback(() => {
    if (namesMissing) {
      setNudgeOpen(open => !open)
      return
    }
    trackCTA('preview')
    if (onPreview) onPreview(getNoteData())
  }, [namesMissing, onPreview, getNoteData])

  // "Preview anyway" — close the nudge, then proceed with whatever
  // values are currently in senderName / recipientName (could still be
  // blank if the user chose to skip).
  const handlePreviewAnyway = useCallback(() => {
    setNudgeOpen(false)
    trackCTA('preview', { names_missing: true })
    if (onPreview) onPreview(getNoteData())
  }, [onPreview, getNoteData])

  // ─── Dev: export the whole note as a portable JSON file ───────────────
  // Used to design reference letters in the editor and ship them to the
  // loading screen / docs as static fixtures. Async because uploaded images
  // and voice notes have to be fetched + base64-inlined (their blob: URLs
  // would otherwise die the moment the tab closes). Both copies to clipboard
  // AND triggers a .json download so you can paste OR drag-and-drop the file.
  const [exporting, setExporting] = useState(false)
  const handleExportJson = useCallback(async () => {
    if (exporting) return
    setExporting(true)
    try {
      const exported = await exportNoteToJson(getNoteData())
      const text     = JSON.stringify(exported, null, 2)
      const filename = buildExportFilename(getNoteData())
      const copied   = await copyToClipboard(text)
      downloadAsFile(text, filename)
      // ~size hint so you can sanity-check the export landed something real
      const kb = Math.max(1, Math.round(text.length / 1024))
      showToast(
        copied
          ? `Note exported, copied to clipboard and downloaded (${filename}, ${kb} KB).`
          : `Note exported, downloaded ${filename} (${kb} KB). Clipboard copy failed; use the file.`
      )
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[export] failed', err)
      showToast('Export failed. See browser console for details.')
    } finally {
      setExporting(false)
    }
  }, [exporting, getNoteData, showToast])

  // ─── Dev: export the current paper as a high-DPI PNG ──────────────────
  // Captures the live [data-paper-canvas] element including every floating
  // child (stickers, mediaFrames, voice notes, drawings) at 2× pixel ratio
  // — so the PNG is sharp on retina screens. Used to bake designed letters
  // into static images for the LoadingScreen carousel: rendering live
  // PaperCanvas inside a smaller slot causes layout drift between editor
  // and carousel; a static image is the design FROZEN at desktop-native
  // resolution and just scales via CSS like any normal image.
  const [exportingPng, setExportingPng] = useState(false)
  const handleExportPng = useCallback(async () => {
    if (exportingPng) return
    setExportingPng(true)
    try {
      // Briefly deselect any selected sticker/frame/voice so the screenshot
      // doesn't capture the dashed selection rings. (UX nicety — without
      // this you'd see drag handles in the exported image.)
      setSelectedStickerId(null)
      setSelectedFrameId(null)
      setSelectedVoiceNoteId(null)
      // Two animation frames so the de-select unmounts the selection
      // chrome before we capture. One rAF flushes React; the second lets
      // the resulting paint settle.
      await new Promise(r => requestAnimationFrame(r))
      await new Promise(r => requestAnimationFrame(r))

      const note = getNoteData()
      const baseName = buildExportFilename(note).replace(/\.json$/, '')
      // result.width/height are the final output dimensions (captureCanvas
      // uses pixelRatio: 3 internally, so they're already 3× the natural
      // paper size — display them as-is).
      const result = await exportPaperAsPng({ filename: `${baseName}.png` })
      if (result.isGif) {
        showToast(`Paper exported as animated GIF, downloaded ${result.filename} (${result.width}×${result.height}, ${result.frames} frames).`, 'info')
      } else {
        showToast(`Paper exported as PNG, downloaded ${result.filename} (${result.width}×${result.height}).`, 'info')
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[exportPng] failed', err)
      showToast(`PNG export failed: ${err?.message || 'see console'}`)
    } finally {
      setExportingPng(false)
    }
  }, [exportingPng, getNoteData, showToast])

  // ─── Dev: import a previously exported note from a .json file ─────────
  // Inverse of Export. Hydrates every editor state field from the file so
  // you can keep iterating on a designed reference letter across sessions.
  // The picker opens immediately on click; if the user cancels (or picks a
  // non-JSON / wrong-format file), we surface a clear toast and do nothing
  // to the current state. If the current letter has unsaved content, we
  // confirm before clobbering so a stray click can't nuke 20 minutes of work.
  const [importing, setImporting] = useState(false)
  const handleImportJson = useCallback(async () => {
    if (importing) return
    try {
      const file = await pickJsonFile()
      if (!file) return                          // user cancelled — silent no-op
      setImporting(true)

      const incoming = await importNoteFromFile(file)

      // Soft confirm if there's anything to lose. isEmpty (computed below)
      // covers the five "anything on the canvas" predicates; we trust that.
      if (!isEmpty) {
        // eslint-disable-next-line no-alert
        const ok = window.confirm(
          "Loading this note will replace everything on your current canvas. Continue?"
        )
        if (!ok) { setImporting(false); return }
      }

      // Hydrate state. Order doesn't really matter (React batches), but we
      // clear selections first so old selected-uid pointers don't outlive
      // the items they referenced (selected sticker uid from previous note
      // would otherwise reference an object that no longer exists).
      setSelectedStickerId(null)
      setSelectedFrameId(null)
      setSelectedVoiceNoteId(null)

      setRecipient(incoming.recipient)
      setSenderName(incoming.senderName)
      setShowRecipient(incoming.showRecipient)
      setMessage(incoming.message)
      lastValidMessageRef.current = incoming.message
      setEditorResyncKey(k => k + 1)             // force contenteditable re-sync
      setPaperConfig(incoming.paperConfig ?? DEFAULT_PAPER)
      setTextSize(incoming.textSize ?? 'md')
      setStickers(incoming.stickers)
      setMediaFrames(incoming.mediaFrames)
      setVoiceNotes(incoming.voiceNotes)
      setStrokes(incoming.strokes)
      setTextElements(incoming.textElements ?? [])
      setSelectedTextElementId(null)

      // Bump auto-increment refs past the max id from the imported note so
      // any subsequent add doesn't collide with an existing item id.
      // Frame IDs are strings like "mf-7" and voice IDs are strings like
      // "vn-3"; we extract the numeric tail with a regex. Math.max on a
      // string returns NaN (which used to silently set the ref to NaN and
      // make every future add produce the SAME "mf-NaN" id — visible to
      // the user as "uploading a second image deletes the first" because
      // React keyed both frames identically and reconciled them into one).
      const extractIdTail = (s) => {
        const m = typeof s === 'string' && s.match(/(\d+)$/)
        return m ? parseInt(m[1], 10) : 0
      }
      const maxFrameId = incoming.mediaFrames.reduce((m, f) => Math.max(m, extractIdTail(f.id)), 0)
      const maxVoiceId = incoming.voiceNotes.reduce((m, v) => Math.max(m, extractIdTail(v.id)), 0)
      nextFrameIdRef.current     = maxFrameId + 1
      nextVoiceNoteIdRef.current = maxVoiceId + 1

      // Drop undo/redo history — the imported state is the new "start".
      undoStackRef.current = []
      redoStackRef.current = []
      syncHistoryFlags()

      showToast(`Note imported, ${file.name} loaded into the editor.`, 'info')
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[import] failed', err)
      showToast(`Import failed: ${err?.message || 'unknown error'}`)
    } finally {
      setImporting(false)
    }
    // isEmpty + syncHistoryFlags are referenced; both are declared earlier
    // in the component and stable across renders for our purposes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importing, showToast])

  const handleCanvasClick = useCallback(() => {
    if (isMobile) return
    if (message.trim() !== '') {
      setShakeKey(k => k + 1)
      showToast("Use the writing panel on the left to make edits, the canvas updates as you type.", 'info')
    } else {
      setShakeKey(k => k + 1)
      showToast("Start writing in the panel on the left, your letter will appear here as you type.", 'info')
    }
  }, [message, isMobile, showToast])

  /* Delete / Backspace removes the selected sticker / media-frame /
     voice note (unless focus is in a text field). Cmd/Ctrl-Z restores the
     last removed media-frame. */
  useEffect(() => {
    function onKeyDown(e) {
      const tag = document.activeElement?.tagName
      const isEditing = tag === 'INPUT' || tag === 'TEXTAREA' ||
        document.activeElement?.isContentEditable

      // Cmd/Ctrl-Z (without Shift) → undo
      //   • While the Draw tab is open: undo the last stroke. Falls back to
      //     frame-removal undo only when there's nothing to undo in the
      //     drawing — so opening Draw doesn't *lose* an in-flight frame undo.
      //   • Otherwise: undo last media-frame removal (original behaviour).
      // Skipped while typing so the OS undo on text inputs still works.
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
        if (isEditing) return
        if (activeToolRef.current === 'draw' && undoStroke()) {
          e.preventDefault()
          return
        }
        if (undoFrameRemoval()) e.preventDefault()
        return
      }

      // Cmd/Ctrl-Shift-Z → redo a stroke. Only meaningful while drawing —
      // frame removal doesn't have a redo concept.
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
        if (isEditing) return
        if (activeToolRef.current === 'draw' && redoStroke()) e.preventDefault()
        return
      }

      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      const stickerId = selectedStickerIdRef.current
      const frameId   = selectedFrameIdRef.current
      const voiceId   = selectedVoiceNoteIdRef.current
      const textId    = selectedTextElementIdRef.current
      if (!stickerId && !frameId && !voiceId && !textId) return
      if (isEditing) return
      e.preventDefault()
      if (stickerId) removeSticker(stickerId)
      if (frameId)   removeMediaFrame(frameId)
      if (voiceId)   removeVoiceNote(voiceId)
      if (textId)    removeTextElement(textId)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Sticker handlers ───────────────────────────────────────────────── */
  function addSticker(stickerData) {
    if (stickers.length >= 6) {
      showToast("You've added the maximum of 6 stickers, remove one to add another.")
      return
    }
    const slot = STICKER_SLOTS[stickers.length % STICKER_SLOTS.length]
    setStickers(prev => [...prev, {
      uid:      Date.now(),
      ...stickerData,
      x:        slot.x + (Math.random() - 0.5) * 4,
      y:        slot.y + (Math.random() - 0.5) * 4,
      rotation: (Math.random() - 0.5) * 18,
      scale:    1.0,
    }])
  }

  function removeSticker(uid) {
    setStickers(prev => prev.filter(s => s.uid !== uid))
    if (selectedStickerId === uid) setSelectedStickerId(null)
  }

  function moveSticker(uid, x, y) {
    setStickers(prev => prev.map(s => s.uid === uid ? { ...s, x, y } : s))
  }

  function resizeSticker(uid, scale) {
    setStickers(prev => prev.map(s => s.uid === uid ? { ...s, scale } : s))
  }

  function rotateSticker(uid, rotation) {
    setStickers(prev => prev.map(s => s.uid === uid ? { ...s, rotation } : s))
  }

  /* ── Text-element handlers (iPad authoring + cross-device render) ──── */

  /* Place a new text card at the next sequential row. First card sits
     near top-left; each subsequent card stacks ~12% below the previous
     one (wraps to a new column at 80% y). User can drag from there to
     fine-tune. */
  function addTextElement({ text, size = textSize, color = '#1F2024' }) {
    const trimmed = String(text || '').trim()
    if (!trimmed) return
    const last = textElements[textElements.length - 1]
    let x, y
    if (!last) {
      x = 18
      y = 14
    } else {
      x = last.x
      y = last.y + 12
      if (y > 82) { x = Math.min(80, last.x + 36); y = 14 }
    }
    const uid = `txt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    setTextElements(prev => [...prev, {
      uid, text: trimmed, x, y, scale: 1, rotation: 0, size, color,
    }])
    setSelectedTextElementId(uid)
  }

  function removeTextElement(uid) {
    setTextElements(prev => prev.filter(t => t.uid !== uid))
    if (selectedTextElementId === uid) setSelectedTextElementId(null)
  }

  function moveTextElement(uid, x, y) {
    setTextElements(prev => prev.map(t => t.uid === uid ? { ...t, x, y } : t))
  }

  function resizeTextElement(uid, scale) {
    setTextElements(prev => prev.map(t => t.uid === uid ? { ...t, scale } : t))
  }

  function rotateTextElement(uid, rotation) {
    setTextElements(prev => prev.map(t => t.uid === uid ? { ...t, rotation } : t))
  }

  /* Selection helpers — selecting one type clears the others so only one
     object shows controls at a time. */
  const selectSticker = useCallback((uid) => {
    setSelectedStickerId(uid)
    if (uid !== null) { setSelectedFrameId(null); setSelectedVoiceNoteId(null); setSelectedTextElementId(null) }
  }, [])
  const selectMediaFrame = useCallback((id) => {
    setSelectedFrameId(id)
    if (id !== null) { setSelectedStickerId(null); setSelectedVoiceNoteId(null); setSelectedTextElementId(null) }
  }, [])
  const selectVoiceNote = useCallback((id) => {
    setSelectedVoiceNoteId(id)
    if (id !== null) { setSelectedStickerId(null); setSelectedFrameId(null); setSelectedTextElementId(null) }
  }, [])
  const selectTextElement = useCallback((uid) => {
    setSelectedTextElementId(uid)
    if (uid !== null) { setSelectedStickerId(null); setSelectedFrameId(null); setSelectedVoiceNoteId(null) }
  }, [])

  /* ── Media-frame handlers ───────────────────────────────────────────── */
  function addMediaFrame(partial = {}) {
    if (mediaFrames.length >= 6) {
      showToast("You've added 6 photo frames already. Remove one to add another.")
      return
    }
    // First image upload: one-time heads-up that uploads are stored & shareable.
    maybeShowStorageNotice(showToast)
    trackEvent('media_attached', { type: 'image' })
    const id = `mf-${nextFrameIdRef.current++}`
    // Slight random offset so successive frames don't stack exactly
    const jitter = mediaFrames.length * 3

    // The dimensions hint isn't part of the frame data model directly, but
    // we DO persist it on the frame (imageWidth/Height) so the height can be
    // recomputed later when the frame style changes (each style has different
    // padding ratios — see computeFrameHeight).
    const { imageWidth, imageHeight, ...framePatch } = partial

    let widthPct  = DEFAULT_FRAME.width
    let heightPct = DEFAULT_FRAME.height
    const paperEl = paperRef.current?.querySelector('[data-paper-canvas]')
                 ?? document.querySelector('[data-paper-canvas]')
    const initialFrameStyle = framePatch.frameStyle ?? DEFAULT_FRAME.frameStyle
    if (imageWidth > 0 && imageHeight > 0 && paperEl) {
      const paperW = paperEl.clientWidth
      const paperH = paperEl.clientHeight
      if (paperW > 0 && paperH > 0) {
        const imgAspect = imageWidth / imageHeight
        // Target ~38% of paper width as the outer frame width. Then derive
        // the outer height so the INNER photo area (after padding) keeps
        // the image's aspect ratio — no cream bars, no crop.
        let targetW = paperW * 0.38
        let targetH = computeFrameHeight(targetW, imgAspect, initialFrameStyle)
        // Clamp so the frame can't dominate the letter — scale both dims
        // together to preserve the aspect-matching relationship.
        const maxH = paperH * 0.70
        if (targetH > maxH) {
          const scale = maxH / targetH
          targetW *= scale
          targetH = maxH
        }
        widthPct  = (targetW / paperW) * 100
        heightPct = (targetH / paperH) * 100
      }
    }

    const newFrame = {
      id,
      type: 'media-frame',
      ...DEFAULT_FRAME,
      width:       widthPct,
      height:      heightPct,
      x:           Math.min(75, 35 + jitter),
      y:           Math.min(75, 40 + jitter),
      rotation:    (Math.random() - 0.5) * 8,
      zIndex:      10 + mediaFrames.length,
      imageWidth,
      imageHeight,
      ...framePatch,
    }
    setMediaFrames(prev => [...prev, newFrame])
    selectMediaFrame(id)
  }

  function removeMediaFrame(id) {
    setMediaFrames(prev => {
      const target = prev.find(f => f.id === id)
      if (target) {
        // Save a snapshot for undo. We hold up to 5 entries; older ones
        // drop off the front. The blob URL on `mediaUrl` is intentionally
        // *not* revoked here — keeping it alive is what makes undo possible.
        removedFramesRef.current = [...removedFramesRef.current, target].slice(-5)
      }
      return prev.filter(f => f.id !== id)
    })
    if (selectedFrameId === id) setSelectedFrameId(null)
    showToast('Photo removed. Press ⌘Z to undo', 'info')
  }

  /* Pop the most recent removed frame and put it back where it was.
     Caller is the global keydown handler below. */
  function undoFrameRemoval() {
    const stack = removedFramesRef.current
    if (!stack.length) return false
    const frame = stack[stack.length - 1]
    removedFramesRef.current = stack.slice(0, -1)
    // Guard against the limit — if the user has added 6 frames since the
    // remove, restoring would exceed the cap. Toast and bail.
    setMediaFrames(prev => {
      if (prev.length >= 6) {
        showToast("Can't restore, you're already at the 6-photo limit.")
        return prev
      }
      return [...prev, frame]
    })
    selectMediaFrame(frame.id)
    return true
  }

  function moveMediaFrame(id, x, y) {
    setMediaFrames(prev => prev.map(f => f.id === id ? { ...f, x, y } : f))
  }

  function resizeMediaFrame(id, width, height) {
    setMediaFrames(prev => prev.map(f => f.id === id ? { ...f, width, height } : f))
  }

  function rotateMediaFrame(id, rotation) {
    setMediaFrames(prev => prev.map(f => f.id === id ? { ...f, rotation } : f))
  }

  function updateMediaFrame(id, patch) {
    setMediaFrames(prev => prev.map(f => {
      if (f.id !== id) return f
      const next = { ...f, ...patch }
      // If a fresh image is being loaded via Replace, capture its dims too
      // (the picker passes them on patch). Otherwise carry forward.
      const imgW = patch.imageWidth  ?? f.imageWidth
      const imgH = patch.imageHeight ?? f.imageHeight
      next.imageWidth  = imgW
      next.imageHeight = imgH

      const frameStyleChanged = 'frameStyle' in patch && patch.frameStyle !== f.frameStyle
      const imageChanged      = 'imageWidth' in patch || 'imageHeight' in patch
      // Re-fit the outer height so the inner photo area keeps the image's
      // aspect — done whenever the style changes OR a new image is loaded.
      if ((frameStyleChanged || imageChanged) && imgW > 0 && imgH > 0) {
        const paperEl = paperRef.current?.querySelector('[data-paper-canvas]')
                     ?? document.querySelector('[data-paper-canvas]')
        if (paperEl) {
          const paperW = paperEl.clientWidth
          const paperH = paperEl.clientHeight
          if (paperW > 0 && paperH > 0) {
            const imgAspect = imgW / imgH
            const frameW_px = (next.width / 100) * paperW
            const newH_px   = computeFrameHeight(frameW_px, imgAspect, next.frameStyle)
            next.height = (newH_px / paperH) * 100
          }
        }
      }
      return next
    }))
  }

  /* ── Voice-note handlers ────────────────────────────────────────────── */
  function addVoiceNote({ audioUrl, duration, waveformData }) {
    if (voiceNotes.length >= 4) {
      showToast("You've added 4 voice notes already. Remove one to add another.")
      return
    }
    // First voice note: one-time heads-up that uploads are stored & shareable.
    maybeShowStorageNotice(showToast)
    trackEvent('media_attached', { type: 'voice', duration_s: Math.round(duration || 0) })
    const id = `vn-${nextVoiceNoteIdRef.current++}`
    const jitter = voiceNotes.length * 4

    // Default y is paper-size aware. Voice notes have a fixed minimum
    // CONTENT height (~50px play+waveform row) that doesn't shrink with
    // paper height — on a strip (~150px tall) the old default y=55%
    // pushed the card's actual bottom flush against the paper edge,
    // with no visible padding. Drop strips at y=50% (dead center, since
    // VoiceNoteRenderer uses translate(-50%, -50%)) with reduced jitter
    // so even multiple notes stay inside the safe vertical zone. The
    // drag clamp in VoiceNoteRenderer enforces the same zone (25-75%
    // center y on strips).
    const isStrip = paperConfig?.size === 'strip'
    const defaultY = isStrip
      ? Math.min(60, 50 + jitter * 0.5)
      : Math.min(78, 55 + jitter)

    const newNote = {
      id,
      type: 'voice-note',
      x: Math.min(70, 30 + jitter),
      y: defaultY,
      width:  25,   // % of paper width — ~30% bigger than the prior 19, comfortable default
      height: 12,   // % of paper height
      rotation: (Math.random() - 0.5) * 6,
      zIndex: 20 + voiceNotes.length,
      audioUrl,
      duration: duration ?? 0,
      waveformData: waveformData ?? new Array(36).fill(0.2),
    }
    setVoiceNotes(prev => [...prev, newNote])
    selectVoiceNote(id)
  }

  function removeVoiceNote(id) {
    setVoiceNotes(prev => {
      const gone = prev.find(n => n.id === id)
      // Free the recording's memory now that the note is gone.
      if (gone?.audioUrl) {
        try { URL.revokeObjectURL(gone.audioUrl) } catch { /* ignore */ }
      }
      return prev.filter(n => n.id !== id)
    })
    if (selectedVoiceNoteId === id) setSelectedVoiceNoteId(null)
  }

  function moveVoiceNote(id, x, y) {
    setVoiceNotes(prev => prev.map(n => n.id === id ? { ...n, x, y } : n))
  }

  function resizeVoiceNote(id, width, height) {
    setVoiceNotes(prev => prev.map(n => n.id === id ? { ...n, width, height } : n))
  }

  function rotateVoiceNote(id, rotation) {
    setVoiceNotes(prev => prev.map(n => n.id === id ? { ...n, rotation } : n))
  }

  /* ── iPad helpers (Phase 2/3) ─────────────────────────────────────────
     Focus the contenteditable paper (Text FAB), add an emoji as a draggable
     sticker (Emoji FAB), and pinch-to-zoom on the paper container with
     finger only — Pencil pinch never fires since pen pointers go to
     DrawingLayer's pen-only capture instead. */
  /* Text FAB / finger tap entry into edit mode. Setting editorActive
     mounts the contenteditable, and its autoFocus effect focuses it +
     places the caret at end on mount. Setting it AFTER React's render
     pass via setState is correct — focus happens on the freshly-mounted
     element. */
  const focusPaperEditor = useCallback(() => {
    setEditorActive(true)
  }, [])

  const handleEditorBlur = useCallback((e) => {
    // Don't unmount if focus is moving INTO a portalled picker / popover —
    // the editor needs to stay alive so insertEmojiAtCaret can find it.
    const next = e?.relatedTarget
    if (next && (
      next.closest?.('em-emoji-picker') ||
      next.closest?.('[class*="emojiPickerRoot"]')
    )) return
    setEditorActive(false)
  }, [])

  /* Insert the picked emoji at the caret. Two surfaces to consider:
       - iPad: the TextPopup's <textarea> (when editorActive)
       - everywhere else: the paper's contenteditable (legacy paths)
     If neither surface is focused, append the emoji to message state
     directly as a fallback so the tap always does something visible. */
  const insertEmojiAtCaret = useCallback((char) => {
    if (!char) return
    // iPad path — textarea inside TextPopup. selectionStart/End give us
    // the caret offset, which is more reliable than getSelection on
    // input elements.
    const textarea = document.querySelector('textarea[aria-label="Letter text"]')
    if (textarea) {
      const start = textarea.selectionStart ?? textarea.value.length
      const end   = textarea.selectionEnd   ?? textarea.value.length
      const next  = textarea.value.slice(0, start) + char + textarea.value.slice(end)
      setMessage(next)
      // Restore focus + caret to right after the inserted emoji on the
      // next frame (after React commits the new value).
      requestAnimationFrame(() => {
        try {
          textarea.focus()
          const pos = start + char.length
          textarea.setSelectionRange(pos, pos)
        } catch { /* fine */ }
      })
      return
    }
    // Legacy path — contenteditable on the paper (still used on phones
    // before iPad mode, and in the InputPanel-rooted flow).
    const editor = paperRef.current?.querySelector('[contenteditable="true"]')
    if (!editor) {
      // Nothing focused — just append to state.
      setMessage((m) => (m ?? '') + char)
      return
    }
    editor.focus()
    const sel = window.getSelection()
    const hasRangeInEditor = sel && sel.rangeCount > 0 && editor.contains(sel.getRangeAt(0).commonAncestorContainer)
    if (hasRangeInEditor) {
      const range = sel.getRangeAt(0)
      range.deleteContents()
      const tn = document.createTextNode(char)
      range.insertNode(tn)
      range.setStartAfter(tn)
      range.collapse(true)
      sel.removeAllRanges()
      sel.addRange(range)
    } else {
      const tn = document.createTextNode(char)
      editor.appendChild(tn)
      const range = document.createRange()
      range.setStartAfter(tn)
      range.collapse(true)
      const newSel = window.getSelection()
      newSel.removeAllRanges()
      newSel.addRange(range)
    }
    editor.dispatchEvent(new InputEvent('input', { bubbles: true }))
  }, [])

  /* Pinch-to-zoom: track two simultaneous finger (touch) pointers on the
     paper container. Pen pointers are ignored — they belong to DrawingLayer.
     We compute the live finger-to-finger distance vs the starting distance
     and multiply the zoom level by the ratio. */
  const pinchStateRef = useRef(null)  // { p1: PointerEvent, p2: PointerEvent, startDist, startZoom }
  /* Tracks a potential single-finger tap so we can enter edit mode on
     pointerup. If a second finger joins, the gesture upgrades to a pinch
     and the tap intent is cancelled. */
  const tapStartRef = useRef(null)
  const handlePaperPointerDown = useCallback((e) => {
    if (!isIpad) return
    if (e.pointerType !== 'touch') return
    const st = pinchStateRef.current
    if (!st) {
      pinchStateRef.current = { p1: { id: e.pointerId, x: e.clientX, y: e.clientY }, p2: null, startDist: 0, startZoom: zoomLevel }
      tapStartRef.current = { t: Date.now(), x: e.clientX, y: e.clientY }
    } else if (!st.p2 && st.p1.id !== e.pointerId) {
      st.p2 = { id: e.pointerId, x: e.clientX, y: e.clientY }
      const dx = st.p2.x - st.p1.x
      const dy = st.p2.y - st.p1.y
      st.startDist = Math.hypot(dx, dy)
      st.startZoom = zoomLevel
      tapStartRef.current = null  // upgraded to a pinch
    }
  }, [isIpad, zoomLevel])
  const handlePaperPointerMove = useCallback((e) => {
    if (!isIpad) return
    if (e.pointerType !== 'touch') return
    const st = pinchStateRef.current
    if (!st || !st.p2 || st.startDist === 0) return
    if (e.pointerId === st.p1.id) { st.p1.x = e.clientX; st.p1.y = e.clientY }
    else if (e.pointerId === st.p2.id) { st.p2.x = e.clientX; st.p2.y = e.clientY }
    const dx = st.p2.x - st.p1.x
    const dy = st.p2.y - st.p1.y
    const dist = Math.hypot(dx, dy)
    const ratio = dist / st.startDist
    setZoomLevel(clampZoom(st.startZoom * ratio))
  }, [isIpad])
  const handlePaperPointerEnd = useCallback((e) => {
    const st = pinchStateRef.current
    if (!st) return
    if (e.pointerId === st.p1?.id || e.pointerId === st.p2?.id) {
      pinchStateRef.current = null
      tapStartRef.current = null
      // (Tap-to-enter-edit-mode was deliberately removed — casual taps
      // on the paper kept summoning the keyboard and getting in the way
      // of pen drawing. Edit mode is now FAB-only: tap the Text FAB →
      // small TextPopup opens to its left.)
    }
  }, [])

  /* ── Shared JSX fragments ───────────────────────────────────────────── */
  const paperCanvas = (
    <PaperCanvas
      recipient={recipient}
      senderName={senderName}
      message={message}
      onMessageChange={setMessage}
      isIpad={isIpad}
      editorActive={editorActive}
      onEditorBlur={handleEditorBlur}
      editorResyncKey={editorResyncKey}
      showRecipient={showRecipient}
      paperConfig={paperConfig}
      stickers={stickers}
      selectedStickerId={selectedStickerId}
      onSelectSticker={selectSticker}
      onRemoveSticker={removeSticker}
      onMoveSticker={moveSticker}
      onResizeSticker={resizeSticker}
      onRotateSticker={rotateSticker}
      textElements={textElements}
      selectedTextElementId={selectedTextElementId}
      onSelectTextElement={selectTextElement}
      onRemoveTextElement={removeTextElement}
      onMoveTextElement={moveTextElement}
      onResizeTextElement={resizeTextElement}
      onRotateTextElement={rotateTextElement}
      mediaFrames={mediaFrames}
      selectedFrameId={selectedFrameId}
      onSelectFrame={selectMediaFrame}
      onRemoveFrame={removeMediaFrame}
      onMoveFrame={moveMediaFrame}
      onResizeFrame={resizeMediaFrame}
      onRotateFrame={rotateMediaFrame}
      onUpdateFrame={updateMediaFrame}
      onFrameInvalidFile={showToast}
      voiceNotes={voiceNotes}
      selectedVoiceNoteId={selectedVoiceNoteId}
      onSelectVoiceNote={selectVoiceNote}
      onRemoveVoiceNote={removeVoiceNote}
      onMoveVoiceNote={moveVoiceNote}
      onResizeVoiceNote={resizeVoiceNote}
      onRotateVoiceNote={rotateVoiceNote}
      onBgClick={handleCanvasClick}
      textSize={textSize}
      strokes={strokes}
      drawingTool={drawingTool}
      /* iPad: outside of the Draw tab the pen still draws, but only pen
         pointers — finger taps + keyboard fall through to the contenteditable
         so the paper stays writable two ways. */
      drawingPenOnly={isIpad && activeTool !== 'draw'}
      drawingColor={drawingTool === 'highlighter' ? highlighterColor : penColor}
      drawingThickness={strokeThickness}
      onAddStroke={addStroke}
      onEraseStrokes={eraseStrokes}
      onStrokeActiveChange={handleStrokeActiveChange}
    />
  )

  const drawingPanel = (
    <DrawingPanel
      activeTool={drawingTool}
      onChangeTool={setDrawingTool}
      penColor={penColor}
      onChangePenColor={setPenColor}
      highlighterColor={highlighterColor}
      onChangeHighlighterColor={setHighlighterColor}
      strokeCount={strokes.length}
      onUndo={undoStroke}
      onRedo={redoStroke}
      canUndo={canUndo}
      canRedo={canRedo}
      onClear={clearStrokes}
    />
  )

  const inputPanel = (
    <InputPanel
      recipient={recipient}
      message={message}
      onMessageChange={setMessage}
      shakeKey={shakeKey}
      textSize={textSize}
      onTextSizeChange={setTextSize}
      editorResyncKey={editorResyncKey}
    />
  )

  const namePanel = (
    <NamePanel
      recipient={recipient}
      onRecipientChange={setRecipient}
      senderName={senderName}
      onSenderNameChange={setSenderName}
    />
  )

  const stickerPanel = (
    <StickerPicker
      onAdd={addSticker}
      stickerCount={stickers.length}
      maxStickers={6}
    />
  )

  /* Mobile "Style" tab — paper config (size + style + ruler/zig-zag) on top
     and the sticker picker below in the same panel. On desktop the paper
     controls live in the right-rail CanvasSidebar, so the desktop Stickers
     tab keeps just stickers — only mobile uses this combined version.

     NOTE: paper-size buttons (Strip / Postcard / A4) stay clickable even
     when there's content. The user explicitly preferred this over the
     previous "lock once written" behaviour — switching may resize the
     existing strokes proportionally, but that's a known trade-off the
     user accepted in favour of always being able to change size. */
  const stylePanel = (
    <>
      <CanvasSidebar
        paperConfig={paperConfig}
        onChangePaper={setPaperConfig}
        disabledSizes={disabledSizes}
        onBlocked={handleBlockedSize}
      />
      <div className={styles.sidebarDivider} />
      {stickerPanel}
    </>
  )

  const selectedFrame = selectedFrameId
    ? mediaFrames.find(f => f.id === selectedFrameId) ?? null
    : null

  const mediaPanel = (
    <MediaFramePicker
      selectedFrame={selectedFrame}
      onAddFrame={addMediaFrame}
      onUpdateFrame={updateMediaFrame}
      onRemoveFrame={removeMediaFrame}
      onInvalidFile={showToast}
      frameCount={mediaFrames.length}
      maxFrames={6}
    />
  )

  const voicePanel = (
    <VoiceRecorderPanel
      onAddVoiceNote={addVoiceNote}
      voiceNoteCount={voiceNotes.length}
      maxVoiceNotes={4}
      onLimitToast={showToast}
    />
  )

  return (
    <div
      className={styles.root}
      // iPad only — height pinned to visualViewport via the --vv-height
      // CSS var set on documentElement (see effect above). No transition:
      // the iOS keyboard slides in ~250ms and a CSS transition was racing
      // with it, which read as "snapping".
      style={isIpad ? { height: 'var(--vv-height, 100svh)' } : undefined}
    >

      <div className={styles.bgImage} aria-hidden />
      <div className={styles.bgTint}  aria-hidden />
      <div className={styles.bgNoise} aria-hidden />

      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <header className={styles.topBar}>
        <div className={styles.topBarLeft}>
          {isMobile ? (
            <div className={styles.previewBtnWrap}>
              <motion.button
                className={styles.previewNavBtn}
                onClick={handlePreview}
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                transition={{ duration: 0.1 }}
              >
                <IconEye size={13} />
                <span>{recipientName ? `${recipientName.length > 14 ? recipientName.slice(0, 14) + '…' : recipientName}'s view` : "Preview"}</span>
              </motion.button>
              <AnimatePresence>
                {nudgeOpen && (
                  <PreviewNudge
                    key="nudge-left"
                    side="left"
                    senderName={senderName}
                    recipientName={recipientName}
                    onSenderChange={setSenderName}
                    onRecipientChange={setRecipient}
                    onPreviewAnyway={handlePreviewAnyway}
                    onClose={() => setNudgeOpen(false)}
                  />
                )}
              </AnimatePresence>
            </div>
          ) : (
            <>
              <span className={styles.topBarBrand}>dearly</span>
              <span className={styles.topBarSep}>|</span>
              <span className={styles.topBarTagline}>A product by the thoughtful designer.</span>
            </>
          )}
        </div>
        <div className={styles.topBarRight}>
          {!isMobile && (
            <div className={styles.previewBtnWrap}>
              <motion.button
                className={styles.previewNavBtn}
                onClick={handlePreview}
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                transition={{ duration: 0.1 }}
              >
                <IconEye size={13} />
                <span>Preview</span>
              </motion.button>
              <AnimatePresence>
                {nudgeOpen && (
                  <PreviewNudge
                    key="nudge-right"
                    side="right"
                    senderName={senderName}
                    recipientName={recipientName}
                    onSenderChange={setSenderName}
                    onRecipientChange={setRecipient}
                    onPreviewAnyway={handlePreviewAnyway}
                    onClose={() => setNudgeOpen(false)}
                  />
                )}
              </AnimatePresence>
            </div>
          )}
          {/* Dev-only: export current note state as portable JSON. Hidden
             in production builds (IS_DEV gate) — this is a designer
             reference-capture tool, not an end-user feature. Desktop-only
             since the workflow involves downloading files. Disabled while
             an in-flight export is serializing so a double-click can't
             queue two downloads. */}
          {IS_DEV && !isMobile && (
            <motion.button
              className={styles.exportNavBtn}
              onClick={handleExportJson}
              disabled={exporting}
              title="Export this note as JSON (for use as a reference letter)"
              whileHover={exporting ? {} : { scale: 1.04 }}
              whileTap={exporting ? {} : { scale: 0.96 }}
              transition={{ duration: 0.1 }}
            >
              <span className={styles.exportNavBtnGlyph} aria-hidden>{'{ }'}</span>
              <span>{exporting ? 'Exporting…' : 'Export'}</span>
            </motion.button>
          )}
          {/* Dev-only: import a previously exported note. Hidden in prod
             (IS_DEV gate). Mirrors the Export styling (dashed border +
             monospaced glyph) so the pair reads as one tool. The ↑ glyph
             signals "load in" without needing a separate icon component. */}
          {IS_DEV && !isMobile && (
            <motion.button
              className={styles.exportNavBtn}
              onClick={handleImportJson}
              disabled={importing}
              title="Import a previously exported .json note into the editor"
              whileHover={importing ? {} : { scale: 1.04 }}
              whileTap={importing ? {} : { scale: 0.96 }}
              transition={{ duration: 0.1 }}
            >
              <span className={styles.exportNavBtnGlyph} aria-hidden>{'↑{}'}</span>
              <span>{importing ? 'Importing…' : 'Import'}</span>
            </motion.button>
          )}
          {/* Dev-only: export the live paper as a high-DPI PNG. Hidden in
             prod (IS_DEV gate). Used for capturing frozen "showcase"
             images for the LoadingScreen carousel + marketing — bypasses
             the layout-drift problems of rendering live PaperCanvas in a
             smaller container. Same dashed-border style family as
             Export/Import so it reads as one tool group. */}
          {IS_DEV && !isMobile && (
            <motion.button
              className={styles.exportNavBtn}
              onClick={handleExportPng}
              disabled={exportingPng}
              title="Export this paper as a 2× DPI PNG (showcase image)"
              whileHover={exportingPng ? {} : { scale: 1.04 }}
              whileTap={exportingPng ? {} : { scale: 0.96 }}
              transition={{ duration: 0.1 }}
            >
              <span className={styles.exportNavBtnGlyph} aria-hidden>{'🖼'}</span>
              <span>{exportingPng ? 'Capturing…' : 'PNG'}</span>
            </motion.button>
          )}
          {/* Overflow menu — support + legal. Only on iPad/phone, where the
              tool nav sits at the bottom edge; on desktop the bottom-of-screen
              footer carries these links instead. Legal pages open in a new tab
              so an in-progress letter is never lost. */}
          {(isMobile || isIpad) && (
          <div className={styles.helpWrap} ref={helpWrapRef}>
            <motion.button
              className={styles.helpBtn}
              onClick={() => setShowHelpMenu(v => !v)}
              aria-label="Support and legal"
              aria-haspopup="menu"
              aria-expanded={showHelpMenu}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              transition={{ duration: 0.1 }}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor" aria-hidden>
                <circle cx="4" cy="9" r="1.5" />
                <circle cx="9" cy="9" r="1.5" />
                <circle cx="14" cy="9" r="1.5" />
              </svg>
            </motion.button>
            <AnimatePresence>
              {showHelpMenu && (
                <motion.div
                  className={styles.helpMenu}
                  role="menu"
                  initial={{ opacity: 0, y: -6, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.98 }}
                  transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                >
                  <span className={styles.helpMenuLabel}>Get in touch</span>
                  <a
                    className={styles.helpMenuItem}
                    href="mailto:hello@dearlynotes.app"
                    role="menuitem"
                    onClick={() => setShowHelpMenu(false)}
                  >
                    hello@dearlynotes.app
                  </a>
                  <div className={styles.helpMenuDivider} />
                  <a
                    className={styles.helpMenuItem}
                    href="/privacy"
                    target="_blank"
                    rel="noopener noreferrer"
                    role="menuitem"
                    onClick={() => setShowHelpMenu(false)}
                  >
                    Privacy Policy
                  </a>
                  <a
                    className={styles.helpMenuItem}
                    href="/terms"
                    target="_blank"
                    rel="noopener noreferrer"
                    role="menuitem"
                    onClick={() => setShowHelpMenu(false)}
                  >
                    Terms of Service
                  </a>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          )}
          <div className={styles.shareWrap} ref={shareWrapRef}>
            <motion.button
              className={`${styles.shareNavBtn} ${isEmpty ? styles.shareNavBtnDisabled : ''}`}
              onClick={handleSend}
              whileHover={isEmpty ? {} : { scale: 1.04 }}
              whileTap={isEmpty ? {} : { scale: 0.96 }}
              transition={{ duration: 0.1 }}
            >
              <svg className={styles.shareNavBg} viewBox="0 0 180 38" preserveAspectRatio="none" fill="none" aria-hidden>
                <path
                  d="M 10,5 C 55,2 125,3 170,5 C 172,14 173,24 170,33 C 125,36 55,35 10,33 C 7,24 7,14 10,5 Z"
                  fill="white"
                />
              </svg>
              <IconShare size={13} />
              <span className={styles.shareNavBtnLabel}>Share this note</span>
            </motion.button>
            {/* Desktop dropdown,lives inside topBar (absolute positioning works fine) */}
            {!isMobile && (
              <AnimatePresence>
                {showShare && (
                  <ShareSheet
                    noteData={getNoteData()}
                    paperRef={paperRef}
                    onClose={() => setShowShare(false)}
                    onToast={showToast}
                  />
                )}
              </AnimatePresence>
            )}
          </div>
        </div>
      </header>

      {/* Mobile share,at root level so position:fixed anchors to viewport,
          bypassing the topBar's backdrop-filter stacking context */}
      {isMobile && showShare && (
        <>
          <div
            className={styles.shareBackdrop}
            onClick={() => setShowShare(false)}
          />
          <ShareSheet
            noteData={getNoteData()}
            paperRef={paperRef}
            onClose={() => setShowShare(false)}
            onToast={showToast}
            isMobileSheet
          />
        </>
      )}

      {/* ── Mobile layout ─────────────────────────────────────────────── */}
      {isMobile && (
        <>

          <div className={`${styles.mobileStage} ${isIpad ? styles.mobileStageIpad : ''}`}>

            {/* Zoom controls — iPad-only, top-right of the writing surface */}
            {isIpad && activeTool === 'text' && (
              <ZoomControls zoomLevel={zoomLevel} onChangeZoom={setZoomLevel} />
            )}

            {/* (Text-size picker moved INSIDE the TextPopup so the controls
                live together — matches the desktop InputPanel pattern.) */}

            {/* Paper size picker — tabs variant, sits flush on the paper's
                top edge. Renders on phones AND iPad; desktop uses the
                pill variant via centerCol below. */}
            <div className={styles.mobileSizePickerRow}>
              <PaperSizePicker
                variant="tabs"
                paperConfig={paperConfig}
                onChangePaper={setPaperConfig}
                disabledSizes={disabledSizes}
                onBlocked={handleBlockedSize}
              />
            </div>

            {/* Paper preview. On iPad in Write mode the paper grows to fill
                the stage (no panel area below) and scales via zoomLevel. */}
            <div
              className={`${styles.mobilePaper} ${isIpad && activeTool === 'text' ? styles.mobilePaperFull : ''}`}
              onPointerDown={handlePaperPointerDown}
              onPointerMove={handlePaperPointerMove}
              onPointerUp={handlePaperPointerEnd}
              onPointerCancel={handlePaperPointerEnd}
            >
              <div
                ref={paperRef}
                className={styles.mobilePaperInner}
                style={isIpad && activeTool === 'text' ? {
                  transform: `scale(${zoomLevel})`,
                  transformOrigin: 'center center',
                  transition: pinchStateRef.current ? 'none' : 'transform 0.18s ease',
                } : undefined}
              >
                {paperCanvas}
              </div>
            </div>

            {/* Animated tool panel — mirrors desktop EditorToolbar tools.
                On iPad in Write mode the panel area is suppressed since the
                paper itself is the input surface (Scribble + tap-to-type). */}
            <div className={`${styles.mobilePanelArea} ${isIpad && activeTool === 'text' ? styles.mobilePanelAreaHidden : ''}`}>
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={activeTool ?? 'none'}
                  className={styles.mobilePanel}
                  initial={{ opacity: 0, x: 18 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -18 }}
                  transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                >
                  {activeTool === 'people'   && namePanel}
                  {activeTool === 'text'     && inputPanel}
                  {activeTool === 'upload'   && mediaPanel}
                  {activeTool === 'record'   && voicePanel}
                  {activeTool === 'draw'     && drawingPanel}
                  {activeTool === 'stickers' && stylePanel}
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Bottom tab bar — same tool set + order as desktop EditorToolbar.
                On iPad the paper is contenteditable so Write also lets you
                type via the panel below as a secondary input. */}
            <nav
              className={`${styles.mobileTabBar} ${strokeActive ? styles.mobileTabBarLocked : ''}`}
              aria-label="Editor tools"
              // Hard-block all pointer events while a pen stroke is in
              // flight (and for 300 ms after lift). Without this, the
              // user's palm — which naturally rests on the bottom of
              // the iPad while writing — would tap nav tabs and switch
              // tools mid-letter. The lock is invisible (no opacity
              // change) so the user doesn't see the nav "going away"
              // every time they draw.
              style={strokeActive ? { pointerEvents: 'none' } : undefined}
            >
              {/* Floating Write toolbar (iPad-only). Hidden while the user
                  is actively typing — the drawing tools have no use mid-
                  text-entry and the toolbar took up canvas room next to
                  the keyboard. A small "Draw" FAB takes its place; tapping
                  it blurs the editor and the toolbar comes back. */}
              <AnimatePresence>
                {isIpad && activeTool === 'text' && !editorActive && (
                  <WriteToolbar
                    drawingTool={drawingTool}
                    onChangeDrawingTool={setDrawingTool}
                    penColor={penColor}
                    onChangePenColor={setPenColor}
                    highlighterColor={highlighterColor}
                    onChangeHighlighterColor={setHighlighterColor}
                    strokeThickness={strokeThickness}
                    onChangeStrokeThickness={setStrokeThickness}
                  />
                )}
              </AnimatePresence>
              {/* Text + Emoji FABs — iPad Write mode only, anchored above
                  the nav so calc() math stays in sync with WriteToolbar.
                  drawFabVisible flips on while typing so the user has a
                  one-tap way back to the drawing tools. */}
              {isIpad && activeTool === 'text' && (
                <EditorFABs
                  onRequestFocusEditor={focusPaperEditor}
                  onAddEmoji={insertEmojiAtCaret}
                  drawFabVisible={editorActive}
                  onRequestDrawMode={handleEditorBlur}
                />
              )}
              {/* Small floating text input that opens to the LEFT of the
                  Text FAB. Replaces the make-the-paper-contenteditable
                  model — the paper stays a pure visual + pen surface
                  and typing happens in this popup instead. The S/M/L
                  size selector lives INSIDE the popup so the controls
                  travel together (matches the desktop InputPanel). */}
              {isIpad && activeTool === 'text' && editorActive && (
                <TextPopup
                  value={message}
                  onChange={setMessage}
                  onClose={() => setEditorActive(false)}
                  textSize={textSize}
                  onChangeTextSize={setTextSize}
                  /* iPad: typed entries drop as draggable text cards on
                     the paper, not appended to the paragraph body. The
                     popup clears the textarea after each commit so the
                     user can rapid-fire several entries. */
                  onCommitElement={addTextElement}
                />
              )}
              {[
                { tool: 'people',   label: 'To/From',  icon: <IconPlane size={20} /> },
                { tool: 'text',     label: 'Write',    icon: <IconText size={20} /> },
                { tool: 'upload',   label: 'Pictures', icon: <IconUpload size={20} /> },
                { tool: 'record',   label: 'Voice',    icon: <IconMic size={20} /> },
                /* Draw tab is hidden on iPad — drawing tools live in the
                   floating WriteToolbar above the bottom nav when Write is
                   active, so Draw + Write are unified into one experience. */
                ...(isIpad ? [] : [{ tool: 'draw', label: 'Draw', icon: <IconPen size={20} /> }]),
                { tool: 'stickers', label: 'Style',    icon: <IconPalette size={20} /> },
              ].map(({ tool, label, icon }) => (
                <button
                  key={tool}
                  className={`${styles.mobileTabBtn} ${activeTool === tool ? styles.mobileTabBtnActive : ''}`}
                  onClick={() => setActiveTool(tool)}
                  aria-pressed={activeTool === tool}
                >
                  <span className={styles.mobileTabIcon}>{icon}</span>
                  <span className={styles.mobileTabLabel}>{label}</span>
                  {activeTool === tool && (
                    <motion.span
                      className={styles.mobileTabPip}
                      layoutId="tab-pip"
                      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                    />
                  )}
                </button>
              ))}
            </nav>

          </div>
        </>
      )}

      {/* ── Desktop layout ────────────────────────────────────────────── */}
      {!isMobile && (
        <main className={styles.stage}>
          <motion.div
            className={styles.twoCol}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
          >
            <EditorToolbar
              activeTool={activeTool}
              onToolChange={setActiveTool}
              textPanel={inputPanel}
              peoplePanel={namePanel}
              stickersPanel={stickerPanel}
              mediaPanel={mediaPanel}
              voicePanel={voicePanel}
              drawPanel={drawingPanel}
              recipientName={recipientName}
            />

            <div className={styles.centerCol}>
              <div ref={paperRef}>
                {paperCanvas}
              </div>
            </div>

            <CanvasSidebar
              paperConfig={paperConfig}
              onChangePaper={setPaperConfig}
              disabledSizes={disabledSizes}
              onBlocked={handleBlockedSize}
            />
          </motion.div>
        </main>
      )}

      {/* ── Toast notifications ─────────────────────────────────────────── */}
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            className={styles.toastAnchor}
            initial={{ opacity: 0, y: -14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -14 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* Inner pill carries the visible glass + tone glow. The shake is a
                self-contained CSS keyframe (x-axis only) so it composes with the
                anchor's enter/exit y-translate. Re-keying by shakeId remounts
                just the pill on a repeated action, which replays the animation
                reliably (re-adding the class wouldn't restart it). Plain div —
                binding framer controls here stalled the anchor's enter. */}
            <div
              key={shakeId}
              className={`${styles.toast} ${toast.tone === 'info' ? styles.toastInfo : toast.tone === 'error' ? styles.toastError : toast.tone === 'overflow' ? styles.toastOverflow : styles.toastCaution} ${shakeId > 0 ? styles.toastShake : ''}`}
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              <span className={styles.toastIcon} aria-hidden="true" />
              <span className={styles.toastMsg}>{toast.msg}</span>
              <button
                type="button"
                className={styles.toastClose}
                onClick={dismissToast}
                aria-label="Dismiss notification"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Authoring feedback prompt — bottom-center, after ~45s of active use */}
      <AnimatePresence>
        {showFeedback && (
          <FeedbackToast key="authoring-feedback" onDone={dismissFeedback} source="authoring" />
        )}
      </AnimatePresence>

    </div>
  )
}

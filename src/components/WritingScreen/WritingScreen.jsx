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
import styles from './WritingScreen.module.css'
import { DEFAULT_PAPER } from './stylePresets'
import { extractName } from './nameUtils'
import { DEFAULT_FRAME } from '../../lib/mediaFrameConfig'
import { computeFrameHeight } from '../../lib/mediaFrameHelpers'
import {
  DEFAULT_PEN_COLOR,
  DEFAULT_HIGHLIGHTER_COLOR,
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

/* ── Sticker slot positions (% of paper) ────────────────────────────────── */
const STICKER_SLOTS = [
  { x: 80, y: 12 }, { x: 72, y: 70 }, { x: 84, y: 42 },
  { x: 68, y: 20 }, { x: 78, y: 82 }, { x: 88, y: 57 },
]

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
  const [textSize,           setTextSize]           = useState('md')
  const [stickers,           setStickers]           = useState([])
  const [selectedStickerId,  setSelectedStickerId]  = useState(null)
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
  const [toast,              setToast]              = useState(null)
  const toastTimerRef  = useRef(null)
  const toastCounterRef = useRef(0)
  const [isMobile,           setIsMobile]           = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 599px), (max-width: 1180px) and (orientation: portrait)').matches : false
  )
  /* iPad portrait gets a contenteditable paper (Scribble-ready). Phones keep
     the InputPanel below the paper because the paper itself is too small to
     comfortably write on. */
  const [isIpad,             setIsIpad]             = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 600px) and (max-width: 1180px) and (orientation: portrait)').matches : false
  )
  /* iPad defaults to Write (so the user lands ready to type/scribble on the
     paper); everything else defaults to To/From so the first thing you see
     is the recipient picker. */
  const [activeTool,         setActiveTool]         = useState(() => {
    if (typeof window === 'undefined') return 'people'
    const ipadInit = window.matchMedia('(min-width: 600px) and (max-width: 1180px) and (orientation: portrait)').matches
    return ipadInit ? 'text' : 'people'
  })

  // ── Drawing layer state ────────────────────────────────────────────────
  // Strokes are vector records — the SVG path is derived on the fly so we
  // can re-rasterise crisply at any export resolution. `drawingTool` mirrors
  // the toolbar selection but only "activates" when the Draw side-panel is
  // open, so the overlay doesn't swallow pointer events on other tabs.
  const [strokes,            setStrokes]            = useState([])
  // Default to the pen so the user can start drawing the instant they open
  // the Draw tab — no "pick a tool first" friction. The effect below also
  // re-applies this default whenever the user returns to the Draw tab.
  const [drawingTool,        setDrawingTool]        = useState('pen') // 'pen' | 'highlighter' | 'eraser' | null
  const [penColor,           setPenColor]           = useState(DEFAULT_PEN_COLOR)
  const [highlighterColor,   setHighlighterColor]   = useState(DEFAULT_HIGHLIGHTER_COLOR)

  const paperRef    = useRef(null)
  const shareWrapRef = useRef(null)
  const selectedStickerIdRef = useRef(selectedStickerId)
  useEffect(() => { selectedStickerIdRef.current = selectedStickerId }, [selectedStickerId])
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
      showToast("Your letter is full — switch to a smaller text size to fit more.")
    } else {
      lastValidMessageRef.current = message
    }
  }, [message, textSize, paperConfig])

  /* Respond to viewport width changes */
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 599px), (max-width: 1180px) and (orientation: portrait)')
    const handler = e => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    const ipadMq = window.matchMedia('(min-width: 600px) and (max-width: 1180px) and (orientation: portrait)')
    const ipadHandler = e => setIsIpad(e.matches)
    ipadMq.addEventListener('change', ipadHandler)
    return () => {
      mq.removeEventListener('change', handler)
      ipadMq.removeEventListener('change', ipadHandler)
    }
  }, [])


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

  const showToast = useCallback((msg) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    const id = ++toastCounterRef.current
    setToast({ msg, id })
    toastTimerRef.current = setTimeout(() => setToast(null), 3800)
  }, [])

  const getNoteData = useCallback(() => ({
    senderName, recipient, recipientName, message, paperConfig, stickers, mediaFrames, voiceNotes, showRecipient, textSize,
    strokes,
  }), [senderName, recipient, recipientName, message, paperConfig, stickers, mediaFrames, voiceNotes, showRecipient, textSize, strokes])

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
      showToast("Your note is still blank — add a message, sticker, picture, voice note, or drawing first.")
      setShakeKey(k => k + 1)
      return
    }
    setShowShare(v => !v)
  }, [isEmpty, showToast])

  const handlePreview = useCallback(() => {
    if (onPreview) onPreview(getNoteData())
  }, [onPreview, getNoteData])

  const handleCanvasClick = useCallback(() => {
    if (isMobile) return
    if (message.trim() !== '') {
      setShakeKey(k => k + 1)
      showToast("Use the writing panel on the left to make edits, the canvas updates as you type.")
    } else {
      setShakeKey(k => k + 1)
      showToast("Start writing in the panel on the left, your letter will appear here as you type.")
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
      if (!stickerId && !frameId && !voiceId) return
      if (isEditing) return
      e.preventDefault()
      if (stickerId) removeSticker(stickerId)
      if (frameId)   removeMediaFrame(frameId)
      if (voiceId)   removeVoiceNote(voiceId)
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

  /* Selection helpers — selecting one type clears the others so only one
     object shows controls at a time. */
  const selectSticker = useCallback((uid) => {
    setSelectedStickerId(uid)
    if (uid !== null) { setSelectedFrameId(null); setSelectedVoiceNoteId(null) }
  }, [])
  const selectMediaFrame = useCallback((id) => {
    setSelectedFrameId(id)
    if (id !== null) { setSelectedStickerId(null); setSelectedVoiceNoteId(null) }
  }, [])
  const selectVoiceNote = useCallback((id) => {
    setSelectedVoiceNoteId(id)
    if (id !== null) { setSelectedStickerId(null); setSelectedFrameId(null) }
  }, [])

  /* ── Media-frame handlers ───────────────────────────────────────────── */
  function addMediaFrame(partial = {}) {
    if (mediaFrames.length >= 6) {
      showToast("You've added 6 photo frames already — remove one to add another.")
      return
    }
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
    showToast('Photo removed — press ⌘Z to undo')
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
        showToast("Can't restore — you're already at the 6-photo limit.")
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
      showToast("You've added 4 voice notes already — remove one to add another.")
      return
    }
    const id = `vn-${nextVoiceNoteIdRef.current++}`
    const jitter = voiceNotes.length * 4
    const newNote = {
      id,
      type: 'voice-note',
      x: Math.min(70, 30 + jitter),
      y: Math.min(78, 55 + jitter),
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

  /* ── Shared JSX fragments ───────────────────────────────────────────── */
  const paperCanvas = (
    <PaperCanvas
      recipient={recipient}
      message={message}
      onMessageChange={setMessage}
      isIpad={isIpad}
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
      onAddStroke={addStroke}
      onEraseStrokes={eraseStrokes}
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
      onLimitToast={showToast}
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
     tab keeps just stickers — only mobile uses this combined version. */
  const stylePanel = (
    <>
      <CanvasSidebar
        paperConfig={paperConfig}
        onChangePaper={setPaperConfig}
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
    <div className={styles.root}>

      <div className={styles.bgImage} aria-hidden />
      <div className={styles.bgTint}  aria-hidden />
      <div className={styles.bgNoise} aria-hidden />

      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <header className={styles.topBar}>
        <div className={styles.topBarLeft}>
          {isMobile ? (
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

          <div className={styles.mobileStage}>

            {/* Paper preview,clipped so it never dominates the screen */}
            <div className={styles.mobilePaper}>
              <div ref={paperRef} className={styles.mobilePaperInner}>
                {paperCanvas}
              </div>
            </div>

            {/* Animated tool panel — mirrors desktop EditorToolbar tools */}
            <div className={styles.mobilePanelArea}>
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

            {/* Attribution pill — sits just above the bottom tab bar with
                a small breathing gap. Reads as a quiet footer credit. */}
            <div className={styles.designedByRow}>
              <span className={styles.designedByPill} aria-label="Designed by The thoughtful designer">
                <span className={styles.designedByPill_label}>Designed by</span>
                <span className={styles.designedByPill_name}>The thoughtful designer</span>
              </span>
            </div>

            {/* Bottom tab bar — same tool set + order as desktop EditorToolbar.
                On iPad the paper is contenteditable so Write also lets you
                type via the panel below as a secondary input. */}
            <nav className={styles.mobileTabBar} aria-label="Editor tools">
              {/* Floating Write toolbar (iPad-only) — pen/highlighter/eraser +
                  colors + paper toggles. Hovers above the nav, hugged width. */}
              <AnimatePresence>
                {isIpad && activeTool === 'text' && (
                  <WriteToolbar
                    drawingTool={drawingTool}
                    onChangeDrawingTool={setDrawingTool}
                    penColor={penColor}
                    onChangePenColor={setPenColor}
                    highlighterColor={highlighterColor}
                    onChangeHighlighterColor={setHighlighterColor}
                  />
                )}
              </AnimatePresence>
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
            />
          </motion.div>
        </main>
      )}

      {/* ── Toast notifications ─────────────────────────────────────────── */}
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            className={styles.toast}
            role="status"
            aria-live="polite"
            aria-atomic="true"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 14 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          >
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>


    </div>
  )
}

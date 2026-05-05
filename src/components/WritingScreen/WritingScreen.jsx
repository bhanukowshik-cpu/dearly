import { useState, useCallback, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import PaperCanvas    from './PaperCanvas'
import InputPanel     from './InputPanel'
import PaperControls  from './PaperControls'
import StickerPicker  from './StickerPicker'
import ShareSheet     from './ShareSheet'
import styles from './WritingScreen.module.css'
import { DEFAULT_PAPER } from './stylePresets'
import { extractName } from './nameUtils'

/* ── Icons ────────────────────────────────────────────────────────────────── */
function IconShare() {
  return (
    <svg width="13" height="13" viewBox="0 0 15 15" fill="none" aria-hidden>
      <path d="M7.5 1.5V10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M4.5 4.5L7.5 1.5L10.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M2.5 10V12.5C2.5 13.05 2.95 13.5 3.5 13.5H11.5C12.05 13.5 12.5 13.05 12.5 12.5V10"
        stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  )
}

function IconEye() {
  return (
    <svg width="13" height="13" viewBox="0 0 15 15" fill="none" aria-hidden>
      <path d="M1.5 7.5C1.5 7.5 4 3.5 7.5 3.5C11 3.5 13.5 7.5 13.5 7.5C13.5 7.5 11 11.5 7.5 11.5C4 11.5 1.5 7.5 1.5 7.5Z"
        stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="7.5" cy="7.5" r="1.8" stroke="currentColor" strokeWidth="1.4"/>
    </svg>
  )
}

function IconWrite() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path d="M3.5 14.5L7 13L15 5L13.5 3.5L5.5 11.5L3.5 14.5Z"
        stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M13 5.5C13 5.5 14.5 4 15 3.5C15.55 2.95 16.45 2.95 17 3.5C17.55 4.05 17.55 4.95 17 5.5L15.5 7"
        stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  )
}

function IconPalette() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path d="M10 2C5.58 2 2 5.58 2 10C2 14.42 5.58 18 10 18C10.55 18 11 17.55 11 17C11 16.73 10.89 16.49 10.72 16.31C10.55 16.13 10.44 15.89 10.44 15.62C10.44 15.07 10.89 14.62 11.44 14.62H13C15.76 14.62 18 12.38 18 9.62C18 5.48 14.42 2 10 2Z"
        stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="6.5" cy="10.5" r="1.2" fill="currentColor"/>
      <circle cx="8.5" cy="7" r="1.2" fill="currentColor"/>
      <circle cx="12.5" cy="7" r="1.2" fill="currentColor"/>
      <circle cx="14.5" cy="10.5" r="1.2" fill="currentColor"/>
    </svg>
  )
}

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

function PreviewButton({ onClick, recipientName }) {
  const display = recipientName && recipientName.length > 18
    ? recipientName.slice(0, 18) + '…'
    : recipientName
  const label = display ? `See ${display}'s view` : "Preview recipient's view"
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
  const [showRecipient,      setShowRecipient]      = useState(true)
  const [paperConfig,        setPaperConfig]        = useState(DEFAULT_PAPER)
  const [textSize,           setTextSize]           = useState('lg')
  const [stickers,           setStickers]           = useState([])
  const [selectedStickerId,  setSelectedStickerId]  = useState(null)
  const [shakeKey,           setShakeKey]           = useState(0)
  const [showShare,          setShowShare]          = useState(false)
  const [toast,              setToast]              = useState(null)
  const toastTimerRef  = useRef(null)
  const toastCounterRef = useRef(0)
  const [isMobile,           setIsMobile]           = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 860px)').matches : false
  )
  const [mobileTab,          setMobileTab]          = useState('write')

  const paperRef    = useRef(null)
  const shareWrapRef = useRef(null)
  const selectedStickerIdRef = useRef(selectedStickerId)
  useEffect(() => { selectedStickerIdRef.current = selectedStickerId }, [selectedStickerId])

  /* Respond to viewport width changes */
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 860px)')
    const handler = e => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  /* Cleanup toast timer on unmount */
  useEffect(() => () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
  }, [])

  /* Close share dropdown when clicking outside or pressing Escape */
  useEffect(() => {
    if (!showShare) return
    function handleOutside(e) {
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
  }, [showShare])

  const isEmpty       = message.trim() === ''
  const recipientName = extractName(recipient)

  const showToast = useCallback((msg) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    const id = ++toastCounterRef.current
    setToast({ msg, id })
    toastTimerRef.current = setTimeout(() => setToast(null), 3800)
  }, [])

  const getNoteData = useCallback(() => ({
    senderName, recipient, recipientName, message, paperConfig, stickers, showRecipient, textSize,
  }), [senderName, recipient, recipientName, message, paperConfig, stickers, showRecipient, textSize])

  const handleSend = useCallback(() => {
    if (isEmpty) {
      showToast("Your note is still blank, write something heartfelt first, then share it.")
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

  /* Delete / Backspace removes the selected sticker (unless focus is in a text field) */
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      if (!selectedStickerIdRef.current) return
      const tag = document.activeElement?.tagName
      const isEditing = tag === 'INPUT' || tag === 'TEXTAREA' ||
        document.activeElement?.isContentEditable
      if (isEditing) return
      e.preventDefault()
      removeSticker(selectedStickerIdRef.current)
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

  /* ── Shared JSX fragments ───────────────────────────────────────────── */
  const paperCanvas = (
    <PaperCanvas
      recipient={recipient}
      message={message}
      showRecipient={showRecipient}
      paperConfig={paperConfig}
      stickers={stickers}
      selectedStickerId={selectedStickerId}
      onSelectSticker={setSelectedStickerId}
      onRemoveSticker={removeSticker}
      onMoveSticker={moveSticker}
      onResizeSticker={resizeSticker}
      onRotateSticker={rotateSticker}
      onBgClick={handleCanvasClick}
      textSize={textSize}
    />
  )

  const inputPanel = (
    <InputPanel
      recipient={recipient}
      onRecipientChange={setRecipient}
      message={message}
      onMessageChange={setMessage}
      showRecipient={showRecipient}
      onToggleRecipient={() => setShowRecipient(v => !v)}
      shakeKey={shakeKey}
      textSize={textSize}
      onTextSizeChange={setTextSize}
      senderName={senderName}
      onSenderNameChange={setSenderName}
    />
  )

  const stylePanel = (
    <>
      <PaperControls paperConfig={paperConfig} onChange={setPaperConfig} />
      <div className={styles.sidebarDivider} />
      <StickerPicker
        onAdd={addSticker}
        stickerCount={stickers.length}
        maxStickers={6}
      />
    </>
  )

  return (
    <div className={styles.root}>

      <div className={styles.bgImage} aria-hidden />
      <div className={styles.bgTint}  aria-hidden />
      <div className={styles.bgNoise} aria-hidden />

      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <header className={styles.topBar}>
        <div className={styles.topBarLeft}>
          {isMobile && (
            <motion.button
              className={styles.previewNavBtn}
              onClick={handlePreview}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              transition={{ duration: 0.1 }}
            >
              <IconEye />
              <span>{recipientName ? `${recipientName.length > 14 ? recipientName.slice(0, 14) + '…' : recipientName}'s view` : "Preview"}</span>
            </motion.button>
          )}
        </div>
        <div className={styles.topBarRight}>
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
              <IconShare />
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

            {/* Animated tab panels */}
            <div className={styles.mobilePanelArea}>
              <AnimatePresence mode="wait" initial={false}>
                {mobileTab === 'write' ? (
                  <motion.div
                    key="write"
                    className={styles.mobilePanel}
                    initial={{ opacity: 0, x: 18 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -18 }}
                    transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                  >
                    {inputPanel}
                  </motion.div>
                ) : (
                  <motion.div
                    key="style"
                    className={styles.mobilePanel}
                    initial={{ opacity: 0, x: 18 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -18 }}
                    transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                  >
                    {stylePanel}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Bottom tab bar */}
            <nav className={styles.mobileTabBar} aria-label="Editor sections">
              <button
                className={`${styles.mobileTabBtn} ${mobileTab === 'write' ? styles.mobileTabBtnActive : ''}`}
                onClick={() => setMobileTab('write')}
              >
                <span className={styles.mobileTabIcon}><IconWrite /></span>
                <span className={styles.mobileTabLabel}>Write</span>
                {mobileTab === 'write' && (
                  <motion.span
                    className={styles.mobileTabPip}
                    layoutId="tab-pip"
                    transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                  />
                )}
              </button>
              <button
                className={`${styles.mobileTabBtn} ${mobileTab === 'style' ? styles.mobileTabBtnActive : ''}`}
                onClick={() => setMobileTab('style')}
              >
                <span className={styles.mobileTabIcon}><IconPalette /></span>
                <span className={styles.mobileTabLabel}>Style</span>
                {mobileTab === 'style' && (
                  <motion.span
                    className={styles.mobileTabPip}
                    layoutId="tab-pip"
                    transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                  />
                )}
              </button>
            </nav>

          </div>
        </>
      )}

      {/* ── Desktop layout ────────────────────────────────────────────── */}
      {!isMobile && (
        <main className={styles.stage}>
          <motion.div
            className={styles.threeCol}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* Left,guided inputs */}
            <div className={styles.leftCol}>
              {inputPanel}
            </div>

            {/* Center,postcard + action buttons */}
            <div className={styles.centerCol}>
              <div ref={paperRef}>
                {paperCanvas}
              </div>
              <div className={styles.postcardActions}>
                <PreviewButton onClick={handlePreview} recipientName={recipientName} />
              </div>
            </div>

            {/* Right,paper controls + stickers */}
            <div className={styles.rightSidebar}>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.35 }}
                className={styles.sidebarInner}
              >
                {stylePanel}
              </motion.div>
            </div>
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

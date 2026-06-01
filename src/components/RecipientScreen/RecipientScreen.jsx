import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import AnimatedGlyphText from '../WritingScreen/AnimatedGlyphText'
import PaperCanvas from '../WritingScreen/PaperCanvas'
import { PAPER_TYPES } from '../WritingScreen/stylePresets'
import VideoBackground from '../VideoBackground/VideoBackground'
import { captureCanvas } from '../../lib/captureUtils'
import { submitFeedback } from '../../lib/supabase'
import { trackEvent, trackTiming, trackCTA, clarityTag } from '../../lib/analytics'
import styles from './RecipientScreen.module.css'
import speakerEnabledUrl  from '../../assets/icons/fab/speaker-enabled.svg'
import speakerDisabledUrl from '../../assets/icons/fab/speaker-disabled.svg'
import musicUrl           from '../../assets/icons/fab/music.svg'
import downloadUrl        from '../../assets/icons/fab/download.svg'
import writeUrl           from '../../assets/icons/fab/write.svg'
import softMusicUrl   from '../../assets/music/soft-music-1.mp3'
import pathsWeWalkUrl from '../../assets/music/the-paths-we-walk.mp3'
import earthInBloomUrl from '../../assets/music/earth-in-bloom.mp3'

// ── Ambient audio ──────────────────────────────────────────────────────────────
// Imported through the Vite asset pipeline (src/assets/music/) so the tracks
// become hashed build outputs under dist/assets/. Public-folder serving was
// unreliable — files kept getting stripped by .gitignore/.vercelignore or the
// SPA catch-all rewrite returned index.html instead of the mp3.
const MUSIC_TRACKS = [
  softMusicUrl,
  pathsWeWalkUrl,
  earthInBloomUrl,
]

function makeAmbient() {
  try {
    // Shuffle into a random non-repeating playlist
    const playlist = [...MUSIC_TRACKS]
    for (let i = playlist.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [playlist[i], playlist[j]] = [playlist[j], playlist[i]]
    }

    let trackIdx  = 0
    let audio     = null
    let active    = false
    let fadeId    = null

    function cancelFade() {
      if (fadeId) { clearInterval(fadeId); fadeId = null }
    }

    // Shared fade — used for setVolume AND track-to-track transitions
    function fadeTo(target, durationMs = 1200) {
      if (!audio) return
      cancelFade()
      const from  = audio.volume
      const steps = Math.max(1, Math.round(durationMs / 30))
      const step  = (target - from) / steps
      let   i     = 0
      fadeId = setInterval(() => {
        if (!audio) { cancelFade(); return }
        audio.volume = Math.max(0, Math.min(1, from + step * ++i))
        if (i >= steps) cancelFade()
      }, durationMs / steps)
    }

    function buildAudio(idx) {
      if (audio) { audio.pause(); audio.onended = null }
      cancelFade()
      audio = new Audio(playlist[idx % playlist.length])
      audio.preload = 'auto'
      audio.volume = 0
      audio.onended = () => {
        if (!active) return
        trackIdx++
        loadAndPlay(trackIdx, audio.volume)
      }
    }

    function loadAndPlay(idx, targetVol) {
      buildAudio(idx)
      if (active) {
        const promise = audio.play()
        if (promise) promise.then(() => fadeTo(targetVol ?? 0.08, 800)).catch(() => {})
      }
    }

    loadAndPlay(0)

    return {
      // Returns raw play() Promise so caller can detect autoplay blocks.
      // Rebuilds the <audio> if it died (network error / ended / was closed)
      // so a failed first attempt — common on Edge's stricter autoplay — can
      // still recover on the next user click instead of staying silent.
      play(volume) {
        active = true
        if (!audio || audio.error || audio.ended || !audio.src) buildAudio(trackIdx)
        const promise = audio.play()
        if (promise) promise.then(() => fadeTo(volume ?? 0.08, 600)).catch(() => {})
        return promise ?? Promise.resolve()
      },
      pause() { active = false; cancelFade(); audio?.pause() },
      setVolume(v, durationMs = 1200) { fadeTo(v, durationMs) },
      close() {
        active = false
        cancelFade()
        if (audio) { audio.pause(); audio.onended = null; audio.src = '' }
      },
    }
  } catch {
    return { play: () => Promise.resolve(), pause: () => {}, setVolume: () => {}, close: () => {} }
  }
}

// ── Message parser → word tokens with formatting ──────────────────────────────
function buildWordItems(recipient, message) {
  const items = []
  let wordIdx = 0

  function pushWords(text, type, extra = {}) {
    const parts = text.split(/(\s+)/)
    for (const p of parts) {
      if (!p) continue
      if (/^\s+$/.test(p)) {
        items.push({ type: 'space', text: p })
      } else {
        items.push({ type, text: p, wordIdx: wordIdx++, ...extra })
      }
    }
  }

  // Greeting line — use the exact text from PaperCanvas (e.g. "Dear Busra,")
  if (recipient) {
    pushWords(recipient, 'greeting')
    items.push({ type: 'newline' })
    items.push({ type: 'newline' })
  }

  // Parse message markup
  let rem = (message || '')
  while (rem.length > 0) {
    const hm = rem.match(/^==((?:pink::|sage::)?)([^=]+)==/)
    const bm = rem.match(/^\*\*([^*\n]+)\*\*/)
    const sm = rem.match(/^~~([^~\n]+)~~/)
    const zm = rem.match(/^@@(sm|lg)::([^@\n]+)@@/)

    if (hm) {
      const variant = hm[1].includes('sage') ? 'sage' : 'pink'
      pushWords(hm[2], 'highlight', { variant })
      rem = rem.slice(hm[0].length)
    } else if (bm) {
      pushWords(bm[1], 'bold')
      rem = rem.slice(bm[0].length)
    } else if (sm) {
      pushWords(sm[1], 'strike')
      rem = rem.slice(sm[0].length)
    } else if (zm) {
      pushWords(zm[2], 'size', { size: zm[1] })
      rem = rem.slice(zm[0].length)
    } else if (rem[0] === '\n') {
      items.push({ type: 'newline' })
      rem = rem.slice(1)
    } else {
      const end = rem.search(/==|\*\*|~~|@@|\n/)
      const chunk = end === -1 ? rem : rem.slice(0, end)
      if (!chunk) { rem = rem.slice(1); continue }
      pushWords(chunk, 'plain')
      rem = rem.slice(chunk.length)
    }
  }

  return { items, totalWords: wordIdx }
}

// ── Strip markup tags → plain text for ElevenLabs ────────────────────────────
function stripMarkup(text) {
  return (text || '')
    .replace(/==(?:pink::|sage::)?([^=]+)==/g, '$1')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/~~([^~\n]+)~~/g, '$1')
    .replace(/@@(?:sm|lg)::([^@\n]+)@@/g, '$1')
    .replace(/\n/g, ' ')
}

// Map ElevenLabs character-level alignment → word start times.
// Returns an array of floats the same length as ttsText.split(/\s+/).
function buildWordTimes(ttsText, alignment) {
  const chars  = alignment?.characters ?? []
  const starts = alignment?.character_start_times_seconds ?? []
  const words  = ttsText.split(/\s+/)
  const times  = []
  let ci = 0
  for (const word of words) {
    while (ci < chars.length && (chars[ci] === ' ' || chars[ci] === '\n')) ci++
    times.push(starts[ci] ?? 0)
    ci += word.length
  }
  return times
}

const NOOP = () => {}

// Touch devices (iPad + phones) get the FAB layout: the controls become a
// stacked column of circular icon buttons, the share prompt becomes a write
// FAB + thought bubble, and the rating becomes a bottom-center toast. Desktop
// keeps the horizontal bar / two-column A4 layout. Detected via coarse pointer
// (covers modern iPads that report as desktop Safari) + maxTouchPoints + UA.
const IS_TOUCH = typeof window !== 'undefined' && (
  /forcetouch/.test(window.location.search) ||
  window.matchMedia?.('(pointer: coarse)')?.matches ||
  (navigator.maxTouchPoints ?? 0) > 1 ||
  /iPad|iPhone|iPod|Android/i.test(navigator.userAgent || '')
)

// ── FAB glyphs (icon-only controls on touch) ─────────────────────────────────
// The speaker / music / download / write glyphs use custom artwork (512×512
// solid-fill SVGs) recolored to the FAB's text color via CSS masking, so a
// single asset works on both the dark idle FAB (white ink) and the cream
// active FAB (dark ink). Stop / Check / Spinner stay inline since there's no
// bespoke artwork for them.
function MaskIcon({ src, size = 22 }) {
  return (
    <span
      className={styles.fabMaskIcon}
      style={{
        width: size,
        height: size,
        WebkitMaskImage: `url(${src})`,
        maskImage: `url(${src})`,
      }}
      aria-hidden
    />
  )
}
// Icon reflects current state: muted speaker when idle, active speaker while
// the letter is being read aloud. (Render site picks which one to show.)
function SpeakerIcon() {
  return <MaskIcon src={speakerDisabledUrl} />
}
function StopIcon() {
  return <MaskIcon src={speakerEnabledUrl} />
}
function MusicIcon({ off = false }) {
  return (
    <span className={styles.fabMaskWrap}>
      <MaskIcon src={musicUrl} />
      {off && <span className={styles.fabMaskCross} aria-hidden />}
    </span>
  )
}
function DownloadIcon() {
  return <MaskIcon src={downloadUrl} />
}
function CheckIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M5 12.5l4.5 4.5L19 7" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}
function SpinnerIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.8" strokeDasharray="5 4"/>
    </svg>
  )
}
function WriteIcon() {
  return <MaskIcon src={writeUrl} />
}

// ── Hand-drawn star SVG ───────────────────────────────────────────────────────
function HandStar({ size = 24, filled = false }) {
  const c = filled ? 'rgba(255,210,80,0.92)' : 'currentColor'
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" aria-hidden>
      <path
        d="M12.1 2.4 C12.4 5.0 13.1 7.2 13.9 8.8 C16.1 8.6 19.5 8.2 21.1 8.9 C19.7 10.7 17.2 12.8 15.7 13.9 C16.6 16.6 18.1 20.7 17.3 21.3 C15.5 20.1 13.4 18.0 12.1 16.8 C10.8 18.0 8.7 20.1 6.9 21.3 C6.1 20.7 7.6 16.6 8.5 13.9 C7.0 12.8 4.5 10.7 3.1 8.9 C4.7 8.2 8.1 8.6 10.3 8.8 C11.1 7.2 11.8 5.0 12.1 2.4 Z"
        fill={filled ? c : 'none'}
        stroke={c}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}

// ── Folded paper reveal ────────────────────────────────────────────────────────
function FoldedLetter({
  phase, recipientName, onUnfoldDone,
  recipient, senderName, message, showRecipient, paperConfig, stickers, textSize,
  /* iPad-authored draggable text cards — forwarded straight through to
     PaperCanvas. Missing this destructure was crashing the preview /
     recipient render with a ReferenceError (textElements undefined)
     even though line 262 below was already trying to pass it down. */
  textElements = [],
  /* Voice notes + media frames — same forwarding pattern. Without
     destructuring these, scanning the QR code would crash the
     recipient page with "Can't find variable: senderName" / voiceNotes
     because the PaperCanvas call below references identifiers that
     aren't in FoldedLetter's scope. */
  voiceNotes  = [],
  mediaFrames = [],
  readingMode, revealedWordIdx, paperRef,
  /* A4 reading layout: drop the viewport-height cap so the card renders at
     full column width and the left column scrolls instead of shrinking it. */
  freeHeight = false,
}) {
  const isOpening = phase === 'opening'
  const isLetter  = phase === 'letter'
  const ease      = [0.25, 0.46, 0.45, 0.94]

  // Warm glow pulses once when the letter first opens
  const [glowing, setGlowing] = useState(false)
  useEffect(() => {
    if (!isLetter) return
    const t = setTimeout(() => setGlowing(true), 120)
    return () => clearTimeout(t)
  }, [isLetter])

  const { type = 'minimal', color = '#FAFAF8', size = 'postcard' } = paperConfig ?? {}
  const typeData  = PAPER_TYPES[type] ?? PAPER_TYPES.minimal
  const panelBg   = type === 'color' ? color : '#F3E9D4'

  // Card aspect ratio (height ÷ width) so the CSS width calc can also cap
  // by available height. A4 is tall (1.414) and would otherwise overflow the
  // viewport and push the "Open your note" CTA off-screen; strip/postcard are
  // short enough that the height term never wins, so they're unaffected.
  const cardAspect = { strip: 1 / 4, postcard: 2 / 3, a4: 1.414 }[size] ?? 2 / 3

  function panelAnimate(axis, deg) {
    if (isLetter)  return { [axis]: deg, opacity: 0 }
    if (isOpening) return { [axis]: deg, opacity: [1, 1, 0.35, 0] }
    return { [axis]: 0, opacity: 1 }
  }
  function panelTransition(delay) {
    if (isLetter)  return { duration: 0 }
    if (isOpening) return { duration: 0.52, ease, delay }
    return { duration: 0.04 }
  }

  return (
    <div className={styles.foldScene}>
      <AnimatePresence>
        {isOpening && (
          <motion.div
            className={styles.foldBackdrop}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.55 }}
          />
        )}
      </AnimatePresence>

      <motion.div
        className={styles.foldOuter}
        animate={{ rotate: phase === 'envelope' ? -2 : 0 }}
        transition={{ duration: 0.44, ease }}
      >
        <motion.div
          animate={phase === 'envelope' ? {
            y: [0, -3, 3, -2, 2, 0], rotate: [0, -0.6, 0.6, -0.4, 0.4, 0],
          } : { y: 0, rotate: 0 }}
          transition={phase === 'envelope' ? {
            duration: 1.4, delay: 1.2, repeat: Infinity, repeatDelay: 5, ease: 'easeInOut',
          } : { duration: 0.3 }}
        >
          <div className={`${styles.foldCard} ${glowing ? styles.foldCardGlow : ''} ${freeHeight ? styles.foldCardFree : ''} ${!isLetter ? styles.foldCardFlat : ''}`} style={{ '--card-ar': cardAspect }}>
            <div className={styles.foldPaper} ref={paperRef}>
              <PaperCanvas
                recipient={recipient} senderName={senderName} message={message}
                showRecipient={showRecipient} paperConfig={paperConfig}
                stickers={stickers} textSize={textSize}
                textElements={textElements}
                voiceNotes={voiceNotes}
                mediaFrames={mediaFrames}
                selectedStickerId={null}
                onSelectSticker={NOOP} onRemoveSticker={NOOP}
                onMoveSticker={NOOP}  onResizeSticker={NOOP} onRotateSticker={NOOP}
                readingMode={readingMode}
                revealedWordIdx={revealedWordIdx}
                fitContent
              />
            </div>

            {/* Fold panels */}
            <motion.div className={`${styles.foldPanel} ${styles.foldPanelRight}`}
              style={{ background: `linear-gradient(160deg, color-mix(in srgb, ${panelBg} 80%, #fff) 0%, ${panelBg} 100%)` }}
              animate={panelAnimate('rotateY', -180)} transition={panelTransition(0.20)} />
            <motion.div className={`${styles.foldPanel} ${styles.foldPanelLeft}`}
              style={{ background: `linear-gradient(200deg, color-mix(in srgb, ${panelBg} 80%, #fff) 0%, ${panelBg} 100%)` }}
              animate={panelAnimate('rotateY', 180)} transition={panelTransition(0.52)} />
            <motion.div className={`${styles.foldPanel} ${styles.foldPanelTop}`}
              style={{ background: `linear-gradient(175deg, color-mix(in srgb, ${panelBg} 75%, #fff) 0%, ${panelBg} 100%)` }}
              animate={panelAnimate('rotateX', -180)} transition={panelTransition(1.02)} />
            <motion.div className={`${styles.foldPanel} ${styles.foldPanelBottom}`}
              style={{ background: `linear-gradient(5deg, color-mix(in srgb, ${panelBg} 75%, #fff) 0%, ${panelBg} 100%)` }}
              animate={panelAnimate('rotateX', 180)} transition={panelTransition(1.28)}
              onAnimationComplete={() => phase === 'opening' && onUnfoldDone()} />

            {/* Creases */}
            <motion.div className={styles.foldCreaseV}
              animate={{ opacity: (isOpening || isLetter) ? 0 : 1 }}
              transition={{ delay: isOpening ? 0.20 : 0, duration: 0.28 }} />
            <motion.div className={styles.foldCreaseH}
              animate={{ opacity: (isOpening || isLetter) ? 0 : 1 }}
              transition={{ delay: isOpening ? 1.02 : 0, duration: 0.28 }} />

            {/* Vertical thread — runs full card height, fades at edges */}
            <motion.div
              className={styles.threadV}
              animate={{ opacity: phase === 'envelope' ? 1 : 0 }}
              transition={{ duration: 0.18 }}
            />

            {/* Knot — sits exactly at the crease intersection (50% × 50%) */}
            <motion.div
              className={styles.knotContainer}
              animate={{ opacity: phase === 'envelope' ? 1 : 0 }}
              transition={{ duration: 0.22 }}
            >
              <svg className={styles.knotSvg} viewBox="0 0 600 80" preserveAspectRatio="xMidYMid meet" fill="none">
                <defs>
                  <linearGradient id="threadL" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#8c6d3f" stopOpacity="0"/>
                    <stop offset="16%" stopColor="#8c6d3f" stopOpacity="0.50"/>
                    <stop offset="100%" stopColor="#8c6d3f" stopOpacity="0.50"/>
                  </linearGradient>
                  <linearGradient id="threadR" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#8c6d3f" stopOpacity="0.50"/>
                    <stop offset="84%" stopColor="#8c6d3f" stopOpacity="0.50"/>
                    <stop offset="100%" stopColor="#8c6d3f" stopOpacity="0"/>
                  </linearGradient>
                </defs>

                {/* Horizontal thread */}
                <line x1="0" y1="40" x2="256" y2="40" stroke="url(#threadL)" strokeWidth="1.7" strokeLinecap="round"/>
                <line x1="344" y1="40" x2="600" y2="40" stroke="url(#threadR)" strokeWidth="1.7" strokeLinecap="round"/>

                {/* Left bow loop */}
                <path
                  d="M 294 42 C 276 22, 212 4, 190 19 C 176 30, 216 60, 294 42"
                  fill="rgba(155,123,78,0.10)"
                  stroke="#9b7b4e"
                  strokeWidth="2"
                  strokeLinecap="round"
                  opacity="0.90"
                />
                {/* Right bow loop */}
                <path
                  d="M 306 42 C 324 22, 388 4, 410 19 C 424 30, 384 60, 306 42"
                  fill="rgba(155,123,78,0.10)"
                  stroke="#9b7b4e"
                  strokeWidth="2"
                  strokeLinecap="round"
                  opacity="0.90"
                />

                {/* Knot — depth shadow */}
                <ellipse cx="300" cy="43.5" rx="14" ry="9.5" fill="#3a2008" opacity="0.22"/>
                {/* Knot — outer body */}
                <ellipse cx="300" cy="42" rx="12" ry="8.5" fill="#5c3d18" opacity="0.70"/>
                {/* Knot — main */}
                <ellipse cx="300" cy="40.5" rx="9" ry="6.5" fill="#9b7b4e" opacity="0.94"/>
                {/* Knot — mid highlight */}
                <ellipse cx="300" cy="39.5" rx="5.5" ry="4" fill="#c49558" opacity="0.86"/>
                {/* Knot — top catch-light */}
                <ellipse cx="298.5" cy="38" rx="2.4" ry="1.8" fill="#e0c080" opacity="0.65"/>

                {/* Left tail */}
                <path d="M 290 51 C 281 65, 265 72, 260 80" stroke="#9b7b4e" strokeWidth="1.9" strokeLinecap="round" opacity="0.80"/>
                {/* Right tail */}
                <path d="M 310 51 C 319 65, 335 72, 340 80" stroke="#9b7b4e" strokeWidth="1.9" strokeLinecap="round" opacity="0.80"/>
              </svg>
            </motion.div>

            {/* Sender label — top-left quadrant of the envelope. Reads
                "From [senderName]" so the recipient knows who wrote it
                before they even open the letter. Hidden cleanly when no
                sender name is set so the corner doesn't show a bare
                "From" with nothing after it. */}
            {senderName && (
              <motion.div className={styles.foldFromLabel}
                animate={{ opacity: phase === 'envelope' ? 1 : 0 }}
                transition={{ duration: 0.18 }}
              >
                <span className={styles.foldFor}>From</span>
                <span className={styles.foldName}>{senderName}</span>
              </motion.div>
            )}

            {/* Recipient label — bottom-right quadrant, "To [recipientName]".
                Mirrors the From label diagonally so the envelope reads
                like a real piece of mail (sender top-left, addressee
                bottom-right). When no name is set we show a small ✦ as
                a quiet placeholder rather than a bare label. */}
            <motion.div className={styles.foldLabel}
              animate={{ opacity: phase === 'envelope' ? 1 : 0 }}
              transition={{ duration: 0.18 }}
            >
              {recipientName
                ? <><span className={styles.foldFor}>To</span><span className={styles.foldName}>{recipientName}</span></>
                : <span className={styles.foldFor}>✦</span>
              }
            </motion.div>

          </div>

          <motion.div className={styles.foldShadow}
            animate={{ opacity: isOpening ? 0.38 : 0.22, scaleX: isOpening ? 1.05 : 1 }}
            transition={{ duration: 0.42 }} />
        </motion.div>
      </motion.div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
export default function RecipientScreen({
  senderName    = '',
  recipientName = '',
  recipient     = '',
  message       = '',
  paperConfig,
  stickers      = [],
  /* iPad-authored draggable text cards. Render-only on this screen
     (no edit). Coexist with `message` so legacy notes still display. */
  textElements  = [],
  /* Voice notes + media frames as authored in WritingScreen. Their audio
     URLs are PERMANENT Supabase Storage URLs (the QR-export pipeline in
     captureUtils swaps blob: URLs for these before saveNote()). */
  voiceNotes    = [],
  mediaFrames   = [],
  showRecipient = true,
  textSize      = 'lg',
  onWriteOwn    = () => {},
}) {
  const [phase,            setPhase]            = useState('greeting')
  const [writeDone,        setWriteDone]        = useState(false)
  const [subtitleOn,       setSubtitleOn]       = useState(false)
  const [musicOn,          setMusicOn]          = useState(false)
  const [isSpeaking,       setIsSpeaking]       = useState(false)
  const [isLoadingAudio,   setIsLoadingAudio]   = useState(false)
  const [ttsError,         setTtsError]         = useState(null)
  const [showToast,        setShowToast]        = useState(false)
  const [showRatingToast,  setShowRatingToast]  = useState(false)
  const [rating,           setRating]           = useState(0)
  const [hoveredStar,      setHoveredStar]      = useState(0)
  const [ratingDone,       setRatingDone]       = useState(false)
  const [feedbackText,     setFeedbackText]     = useState('')
  const [readingMode,      setReadingMode]      = useState(false)
  const [revealedWordIdx,  setRevealedWordIdx]  = useState(0)
  const [loadingPng,       setLoadingPng]       = useState(false)
  const [downloadDone,     setDownloadDone]     = useState(false)
  const [imageOverlayUrl,  setImageOverlayUrl]  = useState(null)
  const ambientRef   = useRef(null)
  const elevenAudio  = useRef(null)
  const elevenRaf    = useRef(null)
  const elevenTimer  = useRef(null)
  const paperRef     = useRef(null)
  const prefetchRef  = useRef(null)

  useEffect(() => {
    if (!writeDone) return
    const t = setTimeout(() => setSubtitleOn(true), 250)
    return () => clearTimeout(t)
  }, [writeDone])


  useEffect(() => {
    if (!subtitleOn) return
    const t = setTimeout(() => setPhase('envelope'), 1100)
    return () => clearTimeout(t)
  }, [subtitleOn])

  // Start music immediately on mount — try autoplay, fall back to first interaction
  useEffect(() => {
    const ambient = makeAmbient()
    ambientRef.current = ambient

    function startMusic() {
      ambient.play(0.08)
        .then(() => setMusicOn(true))
        .catch(() => {})
    }

    // Try immediate autoplay
    ambient.play(0.08)
      .then(() => setMusicOn(true))
      .catch(() => {
        // Browser blocked it — unlock on first user gesture
        function onGesture() {
          startMusic()
          document.removeEventListener('click',      onGesture)
          document.removeEventListener('touchstart', onGesture)
          document.removeEventListener('keydown',    onGesture)
        }
        document.addEventListener('click',      onGesture, { once: true })
        document.addEventListener('touchstart', onGesture, { once: true })
        document.addEventListener('keydown',    onGesture, { once: true })
      })

    return () => {
      ambient.close()
      ambientRef.current = null
      setMusicOn(false)
    }
  }, []) // mount only

  // When the letter opens — swell volume and schedule both toasts
  useEffect(() => {
    if (phase !== 'letter') return
    trackEvent('letter_reached')
    ambientRef.current?.setVolume(0.16)
    const t1 = setTimeout(() => setShowRatingToast(true), 12000)
    const t2 = setTimeout(() => setShowToast(true), 9000)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [phase])

  // Recipient engagement time: from "opened" until the reader leaves
  // (tab hidden / closed / send-back). Fires at most once.
  useEffect(() => {
    const flush = () => {
      if (engagementSentRef.current || openedAtRef.current == null) return
      engagementSentRef.current = true
      trackTiming('recipient_engagement', performance.now() - openedAtRef.current)
    }
    const onHide = () => { if (document.visibilityState === 'hidden') flush() }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', flush)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', flush)
      flush()
    }
  }, [])

  // Defer persistence so re-picking a star never writes duplicate rows — the
  // rating is captured once, on Send or on dismiss/unmount (matches the
  // authoring FeedbackToast). Refs keep the unmount cleanup on the latest values.
  const ratingRef            = useRef(0)
  const feedbackTextRef      = useRef('')
  const feedbackSubmittedRef = useRef(false)
  ratingRef.current       = rating
  feedbackTextRef.current = feedbackText

  const persistFeedback = () => {
    if (feedbackSubmittedRef.current) return
    const score = ratingRef.current
    if (score <= 0) return
    feedbackSubmittedRef.current = true
    const text = feedbackTextRef.current.trim()
    submitFeedback(score, text || undefined)
    trackEvent('feedback_submitted', { stars: score, ...(text ? { has_text: true } : {}) })
  }

  useEffect(() => () => persistFeedback(), [])

  const handleRate = (star) => setRating(star)

  // Pre-fetch TTS on mount so audio is ready when user clicks "listen"
  useEffect(() => {
    const ttsText = [recipient || '', stripMarkup(message)]
      .filter(Boolean).join(' ').trim()
    if (!ttsText) return
    prefetchRef.current = fetch('/api/tts', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ text: ttsText }),
    }).then(res => {
      if (!res.ok) throw new Error(`TTS ${res.status}`)
      return res.json()
    }).catch(() => null)
  }, []) // mount only — recipient/message are stable from URL params

  // Cleanup ElevenLabs audio on unmount
  useEffect(() => () => {
    cancelAnimationFrame(elevenRaf.current)
    clearInterval(elevenTimer.current)
    if (elevenAudio.current) { elevenAudio.current.pause(); elevenAudio.current = null }
  }, [])

  const openedAtRef      = useRef(null)
  const engagementSentRef = useRef(false)
  const openNote         = useCallback(() => {
    setPhase('opening')
    trackEvent('note_opened')
    clarityTag('opened', 'yes')
    if (openedAtRef.current == null) openedAtRef.current = performance.now()
    if (!musicOn) {
      ambientRef.current?.play(0.08).then(() => setMusicOn(true)).catch(() => {})
    }
  }, [musicOn])
  const handleUnfoldDone = useCallback(() => setPhase('letter'),  [])

  const toggleMusic = useCallback(() => {
    const a = ambientRef.current
    if (!a) return
    if (musicOn) { a.pause(); setMusicOn(false) }
    // Only flip to "playing" once playback actually starts — otherwise a
    // blocked/failed play (seen on Edge) would leave the button reading
    // "pause music" with no sound. On failure it stays "play music" to retry.
    else { a.play(0.08).then(() => setMusicOn(true)).catch(() => setMusicOn(false)) }
  }, [musicOn])

  const downloadTimerRef = useRef(null)
  const isMobileDevice = /iPad|iPhone|iPod|Android/i.test(navigator.userAgent)

  const handleDownloadPng = useCallback(async () => {
    if (loadingPng) return
    setLoadingPng(true)
    setDownloadDone(false)
    try {
      // User-facing recipient download (also fires from the Preview
      // overlay) — swap voice pills for the QR export card so the saved
      // image carries a scannable link to the full letter.
      const canvas = await captureCanvas(paperRef, {
        swapVoiceForBarcode: true,
        noteData: {
          senderName, recipientName, recipient, message,
          paperConfig, stickers, textElements,
          voiceNotes, mediaFrames,
          showRecipient, textSize,
        },
      })
      if (isMobileDevice) {
        // Show image in an overlay on the same page — no popup needed,
        // works regardless of iOS popup blocker setting.
        setImageOverlayUrl(canvas.toDataURL('image/png'))
        setDownloadDone('ios')
      } else {
        await new Promise((resolve, reject) => {
          canvas.toBlob(blob => {
            if (!blob) { reject(new Error('toBlob failed')); return }
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = 'dearly-note.png'
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            setTimeout(() => URL.revokeObjectURL(url), 1000)
            setDownloadDone('done')
            resolve()
          }, 'image/png')
        })
      }
      if (downloadTimerRef.current) clearTimeout(downloadTimerRef.current)
      downloadTimerRef.current = setTimeout(() => setDownloadDone(false), 4000)
    } catch (e) {
      console.error('PNG export failed', e)
    } finally {
      setLoadingPng(false)
    }
  }, [loadingPng, isMobileDevice])

  function stopReading() {
    cancelAnimationFrame(elevenRaf.current)
    clearInterval(elevenTimer.current)
    elevenTimer.current = null
    if (elevenAudio.current) { elevenAudio.current.pause(); elevenAudio.current = null }
    setIsSpeaking(false)
    setIsLoadingAudio(false)
    setReadingMode(false)
    setRevealedWordIdx(0)
  }

  const handleReadAloud = useCallback(async () => {
    if (isSpeaking || isLoadingAudio) { stopReading(); return }

    const { totalWords } = buildWordItems(recipient, message)
    if (!totalWords) return

    trackCTA('listen_to_note')

    const ttsText = [recipient || '', stripMarkup(message)]
      .filter(Boolean).join(' ').trim()
    if (!ttsText) return

    setIsLoadingAudio(true)
    setRevealedWordIdx(0)
    setReadingMode(true)

    try {
      let data = null
      try { if (prefetchRef.current) data = await prefetchRef.current } catch {}
      if (!data) {
        const res = await fetch('/api/tts', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ text: ttsText }),
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          const msg  = body?.error ?? `TTS ${res.status}`
          throw new Error(msg)
        }
        data = await res.json()
      }
      const { audio_base64, alignment } = data

      // Build per-word start times from ElevenLabs character alignment.
      const wordTimes     = buildWordTimes(ttsText, alignment)
      const lastTime      = wordTimes[wordTimes.length - 1] ?? 0
      const hasTimestamps = wordTimes.length === totalWords && lastTime > 0.05

      // Decode base64 audio → Blob → object URL
      const raw   = atob(audio_base64)
      const bytes = new Uint8Array(raw.length)
      for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
      const url   = URL.createObjectURL(new Blob([bytes], { type: 'audio/mpeg' }))
      const audio = new Audio(url)
      elevenAudio.current = audio

      setIsLoadingAudio(false)
      setIsSpeaking(true)

      audio.addEventListener('play', () => {
        if (hasTimestamps) {
          // Poll audio.currentTime every 50 ms and reveal words whose
          // ElevenLabs timestamp has passed — captures pauses and rhythm.
          elevenTimer.current = setInterval(() => {
            const t = audio.currentTime
            let count = 0
            for (const wt of wordTimes) { if (wt <= t) count++; else break }
            setRevealedWordIdx(count)
          }, 50)
        } else {
          // Fallback: no valid timestamps → spread words evenly across duration.
          const dur       = isFinite(audio.duration) && audio.duration > 0
            ? audio.duration : totalWords * 0.40
          const msPerWord = Math.max(80, (dur / totalWords) * 1000)
          let count = 1
          setRevealedWordIdx(1)
          if (totalWords <= 1) return
          elevenTimer.current = setInterval(() => {
            count++
            setRevealedWordIdx(Math.min(count, totalWords))
            if (count >= totalWords) {
              clearInterval(elevenTimer.current)
              elevenTimer.current = null
            }
          }, msPerWord)
        }
      })
      audio.addEventListener('ended', () => {
        clearInterval(elevenTimer.current)
        elevenTimer.current = null
        URL.revokeObjectURL(url)
        elevenAudio.current = null
        setIsSpeaking(false)
        setRevealedWordIdx(totalWords)
        setTimeout(() => { setReadingMode(false); setRevealedWordIdx(0) }, 1800)
      })
      audio.addEventListener('error', () => {
        URL.revokeObjectURL(url)
        elevenAudio.current = null
        stopReading()
      })
      await audio.play()
    } catch (err) {
      stopReading()
      const msg = err?.message ?? ''
      if (msg.toLowerCase().includes('quota')) {
        setTtsError('Voice credits ran out. Try again later.')
      } else {
        setTtsError('Audio unavailable right now.')
      }
      setTimeout(() => setTtsError(null), 5000)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSpeaking, isLoadingAudio, message, recipient])

  const isLetterPhase = phase === 'letter'
  // A4 uses a 2-column layout for the whole experience (envelope → opening →
  // letter): the letter/envelope sits in the left column, the right column
  // holds the greeting + Open CTA before opening and the controls + toasts
  // after. The greeting types out centered (greeting phase), then slides to
  // the right column as the grid engages. Every other paper size keeps the
  // centered single-column layout.
  const isA4         = paperConfig?.size === 'a4'
  // Desktop-only A4 grid layout. On touch, A4 falls into the centered single
  // column + FAB layout (see fabMode) so the long sheet scrolls with the page.
  const a4Letter     = isA4 && isLetterPhase && !IS_TOUCH
  const a4Experience = isA4 && phase !== 'greeting' && !IS_TOUCH   // envelope, opening, letter
  // FAB layout: A4 letters on touch, once unfolded. The floating buttons exist
  // for the full-bleed scrollable A4 sheet that owns the whole viewport.
  // Postcard / strip stay compact and centered, so they keep the inline
  // control bar (listen / pause music / download) instead of the FAB stack.
  const fabMode      = IS_TOUCH && isLetterPhase && isA4
  const feedbackOpen = showRatingToast && !ratingDone
  // Render the A4 card at full width (overflowing + scrolling) on desktop for
  // the whole experience, and on touch only once unfolded (the envelope stays
  // height-capped so the Open CTA is reachable without scrolling).
  const a4FullCard   = a4Experience || (isA4 && IS_TOUCH && isLetterPhase)

  const tryStartMusic = useCallback(() => {
    if (musicOn) return
    ambientRef.current?.play(0.08).then(() => setMusicOn(true)).catch(() => {})
  }, [musicOn])

  // ── Reusable control + toast nodes ────────────────────────────────────────
  // Defined once, placed differently per layout: non-A4 uses the horizontal
  // controls bar below the letter + fixed-position toasts; A4 stacks the
  // controls and renders the toasts inline in the locked right column.
  const listenControl = (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
      <button
        className={`${styles.listenHint} ${isLoadingAudio ? styles.listenHintLoading : ''} ${isSpeaking ? styles.listenHintActive : ''}`}
        onClick={handleReadAloud}
        disabled={isLoadingAudio}
      >
        {isLoadingAudio ? '✦ a moment…' : isSpeaking ? '■ stop' : '✦ listen to your note'}
      </button>
      {ttsError && (
        <span style={{ fontSize: 11, color: 'rgba(255,180,100,0.85)', fontFamily: "'Caveat', cursive", paddingLeft: 4 }}>
          {ttsError}
        </span>
      )}
    </div>
  )

  const musicControl = (
    <button
      className={`${styles.musicCta} ${musicOn ? styles.musicCtaOn : ''}`}
      onClick={toggleMusic}
    >
      <svg className={styles.musicCtaBorder} viewBox="0 0 192 46" fill="none" aria-hidden>
        <path d="M 10,5  C 68,3  124,3  182,6"  stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
        <path d="M 182,6 C 184,15 184,31 182,41" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
        <path d="M 182,41 C 124,44 68,44 10,41" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
        <path d="M 10,41 C 8,31 8,15 10,5"      stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
      </svg>
      <span className={styles.musicCtaLabel}>
        {musicOn ? '♫ pause music' : '♫ play music'}
      </span>
    </button>
  )

  const downloadControl = (
    <button
      className={styles.downloadBtn}
      onClick={handleDownloadPng}
      disabled={loadingPng}
      aria-label="Save as image"
      title={downloadDone === 'ios' ? 'Long press the image to save' : downloadDone === 'done' ? 'Check your downloads!' : 'Save as image'}
    >
      {loadingPng
        ? <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
            <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.6" strokeDasharray="4 3"/>
          </svg>
        : downloadDone
          ? <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
              <path d="M4 10l4.5 4.5L16 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          : <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
              <path d="M10 3v10M6.5 9.5l3.5 3.5 3.5-3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M3.5 15.5h13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
            </svg>
      }
      {a4Letter && <span className={styles.downloadLabel}>save as image</span>}
    </button>
  )

  const controlsBar = isLetterPhase ? (
    <motion.div
      className={a4Letter ? styles.controlsStacked : styles.controls}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, delay: 0.8, ease: [0.16, 1, 0.3, 1] }}
    >
      {a4Letter ? (
        <>{listenControl}{musicControl}{downloadControl}</>
      ) : (
        <>
          {listenControl}
          <div className={styles.controlsRight}>{musicControl}{downloadControl}</div>
        </>
      )}
    </motion.div>
  ) : null

  // "Open your note" CTA — placed below the letter for non-A4, or in the A4
  // right column (under the greeting) for A4.
  const readCtaNode = (
    <motion.button
      key="read-cta"
      className={styles.readCta}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10, transition: { duration: 0.2 } }}
      transition={{ duration: 0.5, delay: a4Experience ? 0.75 : 0.35, ease: [0.16, 1, 0.3, 1] }}
      onClick={openNote}
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
    >
      <svg className={styles.readCtaBorder} viewBox="0 0 320 58" fill="none" aria-hidden>
        <path d="M 12,6  C 106,4  214,4  308,7"  stroke="rgba(255,255,255,0.82)" strokeWidth="1.8" strokeLinecap="round"/>
        <path d="M 308,7 C 310,20 310,40 308,54" stroke="rgba(255,255,255,0.82)" strokeWidth="1.8" strokeLinecap="round"/>
        <path d="M 308,54 C 214,57 106,57 12,54" stroke="rgba(255,255,255,0.82)" strokeWidth="1.8" strokeLinecap="round"/>
        <path d="M 12,54 C 10,40 10,20 12,6"     stroke="rgba(255,255,255,0.82)" strokeWidth="1.8" strokeLinecap="round"/>
      </svg>
      <span className={styles.readCtaLabel}>
        {senderName ? `Open ${senderName}'s note` : 'Open your note'}
      </span>
    </motion.button>
  )

  const ratingToastNode = (
    <AnimatePresence>
      {showRatingToast && !ratingDone && (
        <motion.div
          layout
          className={styles.toast}
          role="status"
          aria-live="polite"
          aria-atomic="true"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          transition={{ duration: 0.58, ease: [0.16, 1, 0.3, 1] }}
        >
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <motion.div layout="position" className={styles.toastHeader}>
              <p className={styles.toastText}>How well do you like this experience?</p>
              <button className={styles.toastClose} onClick={() => { persistFeedback(); setRatingDone(true) }} aria-label="Dismiss">✕</button>
            </motion.div>
            <motion.div layout="position" className={styles.stars}>
              {[1, 2, 3, 4, 5].map(star => (
                <button
                  key={star}
                  className={`${styles.star} ${(hoveredStar || rating) >= star ? styles.starFilled : ''}`}
                  onMouseEnter={() => setHoveredStar(star)}
                  onMouseLeave={() => setHoveredStar(0)}
                  onClick={() => handleRate(star)}
                  aria-label={`${star} star${star > 1 ? 's' : ''}`}
                >
                  <HandStar size={24} filled={(hoveredStar || rating) >= star} />
                </button>
              ))}
            </motion.div>
            <AnimatePresence initial={false}>
              {rating > 0 && (
                <motion.div
                  key="followup"
                  className={styles.feedbackFollowup}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                >
                  <textarea
                    className={styles.feedbackInput}
                    placeholder={rating >= 4 ? 'What part did you like?' : 'What was missing? What could we improve?'}
                    autoFocus
                    value={feedbackText}
                    onChange={e => setFeedbackText(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        persistFeedback()
                        setRatingDone(true)
                      }
                    }}
                  />
                  <motion.button
                    className={styles.toastCtaCompact}
                    onClick={() => { persistFeedback(); setRatingDone(true) }}
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.96 }}
                    transition={{ duration: 0.1 }}
                  >
                    <svg className={styles.toastCtaBg} viewBox="0 0 160 38" preserveAspectRatio="none" fill="none" aria-hidden>
                      <path d="M 10,5 C 48,2 112,3 150,5 C 152,14 153,24 150,33 C 112,36 48,35 10,33 C 7,24 7,14 10,5 Z" fill="white"/>
                    </svg>
                    <span>Send</span>
                  </motion.button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )

  const shareBannerNode = (
    <AnimatePresence>
      {showToast && (
        <motion.div
          layout
          className={a4Letter ? styles.shareBannerInline : styles.shareBanner}
          role="status"
          aria-live="polite"
          aria-atomic="true"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          transition={{ duration: 0.58, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className={styles.toastLeft}>
            <p className={styles.toastText}>
              {senderName
                ? <>You have a lovely smile. Pass it on by sending a note to <strong>{senderName}</strong> or anyone you care about.</>
                : <>You have a lovely smile. Pass it on by sending a note to someone you care about.</>
              }
            </p>
          </div>
          <div className={styles.toastRight}>
            <motion.button
              className={styles.toastCtaCompact}
              onClick={onWriteOwn}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              transition={{ duration: 0.1 }}
            >
              <svg className={styles.toastCtaBg} viewBox="0 0 160 38" preserveAspectRatio="none" fill="none" aria-hidden>
                <path d="M 10,5 C 48,2 112,3 150,5 C 152,14 153,24 150,33 C 112,36 48,35 10,33 C 7,24 7,14 10,5 Z" fill="white"/>
              </svg>
              <span>Write a note</span>
            </motion.button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )

  return (
    <div
      className={`${styles.root} ${a4Experience ? styles.rootA4Letter : ''} ${fabMode ? styles.rootTouch : ''} ${fabMode && isA4 ? styles.rootTouchA4 : ''}`}
      style={isLetterPhase && !a4Letter ? { justifyContent: 'flex-start', paddingTop: 64 } : undefined}
      onPointerDown={tryStartMusic}
    >
      <VideoBackground />
      <div className={styles.bgBlur}  aria-hidden />
      <div className={styles.bgTint}  aria-hidden />
      <div className={styles.bgNoise} aria-hidden />

      {/* ── Greeting — starts centered, layout-animates up when card appears ──── */}
      <AnimatePresence>
        {(phase === 'greeting' || phase === 'envelope') && (
          <motion.div
            layout="position"
            className={`${styles.greetingWrap} ${a4Experience && phase === 'envelope' ? styles.greetingRightCol : ''}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, y: -14, transition: { duration: 0.25 } }}
            transition={{ layout: { duration: 0.7, ease: [0.22, 1, 0.36, 1] } }}
          >
            <div className={styles.greetingTitle}>
              {/* Greeting renderer was Tegaki, swapped to our in-house
                  AnimatedGlyphText (SVG-path stroke animation) after Safari
                  proved hostile to Tegaki's FontFace constructor path. Same
                  pen-stroke feel; works in every browser; no font preload
                  dependency. fontSizePx mirrors the prior clamp(42px,7vw,72px)
                  responsive curve across mobile/tablet/desktop. msPerChar=110
                  is tuned so 'Hi Marcus!'-sized strings finish in ~1.1s,
                  matching Tegaki's previous duration so the subtitle/envelope
                  cascade timing feels unchanged. */}
              <AnimatedGlyphText
                text={`Hi ${recipientName || 'there'}!`}
                fontSizePx={{ mobile: 42, tablet: 56, desktop: 72 }}
                /* Tight line-height for the hero (default is 1.5, intended
                   for multi-line body paragraphs). At 72px, 1.5× line-height
                   adds ~36px of empty descender padding under the glyphs
                   that pushed the subtitle absurdly far down. 1.05 hugs the
                   actual glyph bounds — "Hi {name}!" has no real descenders
                   so we don't lose any visible character. */
                lineHeightMultiplier={1.05}
                /* Was 0.92 — tightened to 0.74 (~20% reduction) so the
                   characters in "Hi {name}!" sit closer together for a more
                   confident hand-written look at hero scale. */
                spacingMultiplier={0.74}
                strokeSpeedMultiplier={1.4}
                /* 1.5× stroke width — sits between the default (too spindly
                   at clamp(42-72px) hero scale) and 2× (felt-tip marker, too
                   loud). Picks up enough pen weight to feel confident without
                   crowding the inner counters of letters like 'o' and 'k'. */
                strokeWidthMultiplier={1.5}
                inkColor="#ffffff"
                typewriter
                msPerChar={110}
                onComplete={() => setWriteDone(true)}
                style={{ whiteSpace: 'nowrap', fontWeight: 700 }}
              />
            </div>
            <motion.p
              className={styles.greetingSub}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: subtitleOn ? 1 : 0, y: subtitleOn ? 0 : 12 }}
              transition={{ duration: 0.7, ease: 'easeOut' }}
            >
              {senderName ? `${senderName} wrote a message for you` : 'Someone wrote a message for you'}
            </motion.p>

            {/* Desktop A4: the Open CTA lives with the greeting in the right
                column. Other sizes — and touch A4, which uses the generic
                vertical layout — render it below the letter (experience block). */}
            <AnimatePresence>
              {a4Experience && phase === 'envelope' && readCtaNode}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Card + CTA + controls — only mounts after greeting ───────────────── */}
      <AnimatePresence>
        {phase !== 'greeting' && (
          <motion.div
            key="experience"
            className={`${a4Experience ? styles.experienceA4 : styles.experience} ${a4Experience && phase === 'envelope' ? styles.experienceA4Envelope : ''}`}
            initial={a4Experience ? { opacity: 0, x: -90 } : { opacity: 0, y: 28 }}
            animate={{ opacity: 1, x: 0, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.7, delay: a4Experience ? 0.45 : 0, ease: [0.16, 1, 0.3, 1] }}
          >
            <FoldedLetter
              phase={phase}
              recipientName={recipientName}
              onUnfoldDone={handleUnfoldDone}
              recipient={recipient}
              senderName={senderName}
              message={message}
              showRecipient={showRecipient}
              paperConfig={paperConfig}
              stickers={stickers}
              textElements={textElements}
              voiceNotes={voiceNotes}
              mediaFrames={mediaFrames}
              textSize={textSize}
              readingMode={readingMode && isLetterPhase}
              revealedWordIdx={revealedWordIdx}
              paperRef={paperRef}
              freeHeight={a4FullCard}
            />

            {/* Open envelope CTA — rendered below the letter for every layout
                except desktop A4 (which renders it in the right column with the
                greeting). Touch A4 falls here too, avoiding the card/CTA overlap. */}
            <AnimatePresence>
              {phase === 'envelope' && !a4Experience && readCtaNode}
            </AnimatePresence>

            {/* Controls — below the letter for non-A4 desktop. A4 desktop
                renders them in the locked right column (see rightCol below);
                touch renders the FAB stack instead (see fab layer below). */}
            {!a4Letter && !fabMode && controlsBar}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── A4 locked right column — controls on top, toasts below ───────────── */}
      {a4Letter && (
        <div className={styles.rightCol}>
          {controlsBar}
          <div className={styles.rightToasts}>
            {shareBannerNode}
            {ratingToastNode}
          </div>
        </div>
      )}

      {/* ── Image save overlay (mobile download) ─────────────────────────────── */}
      {imageOverlayUrl && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.93)',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            gap: 16, padding: 20, boxSizing: 'border-box',
          }}
          onClick={() => setImageOverlayUrl(null)}
        >
          <button
            onClick={e => { e.stopPropagation(); setImageOverlayUrl(null) }}
            style={{
              position: 'absolute', top: 16, right: 16,
              width: 36, height: 36, borderRadius: '50%',
              background: 'rgba(255,255,255,0.15)', border: 'none',
              color: '#fff', fontSize: 18, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            aria-label="Close"
          >✕</button>
          <img
            src={imageOverlayUrl}
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: '100%', maxHeight: '78vh', objectFit: 'contain', borderRadius: 10 }}
            alt="Your Dearly note"
          />
          <p style={{
            color: 'rgba(255,255,255,0.72)', fontFamily: 'sans-serif',
            fontSize: 14, margin: 0, textAlign: 'center', lineHeight: 1.5,
          }}>
            Long press the image to save it to your photos
          </p>
        </div>
      )}

      {/* ── Toasts — non-A4. Both live in one bottom-anchored dock so the
              share banner slides UP when the rating toast appears (the dock's
              bottom edge is pinned, so adding a second card grows it upward),
              and slides back DOWN when the rating toast is dismissed. A4
              renders these inline in the locked right column above. ───────── */}
      {!isA4 && !fabMode && (
        <div className={styles.toastDock}>
          {shareBannerNode}
          {ratingToastNode}
        </div>
      )}

      {/* ── Touch FAB layer — stacked circular controls bottom-right, write
              prompt as a thought-bubble FAB, feedback as a bottom-center
              toast. Replaces the bar/columns on iPad + phones. ───────────── */}
      {fabMode && (
        <>
          {/* Stacked controls — read aloud / music / download, plus the write
              prompt FAB that slides in beneath them when the share toast fires.
              Lifts up while the feedback toast is open so they don't collide. */}
          <motion.div
            className={styles.fabStack}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: feedbackOpen ? -196 : 0 }}
            transition={{ duration: 0.5, delay: 0.6, ease: [0.16, 1, 0.3, 1] }}
          >
            <button
              className={`${styles.fab} ${!isSpeaking && !isLoadingAudio ? styles.fabGold : ''} ${isSpeaking ? styles.fabActive : ''} ${isLoadingAudio ? styles.fabLoading : ''}`}
              onClick={handleReadAloud}
              disabled={isLoadingAudio}
              aria-label={isSpeaking ? 'Stop reading' : 'Read note aloud'}
            >
              {isLoadingAudio ? <SpinnerIcon /> : isSpeaking ? <StopIcon /> : <SpeakerIcon />}
            </button>
            <button
              className={`${styles.fab} ${musicOn ? styles.fabActive : ''}`}
              onClick={toggleMusic}
              aria-label={musicOn ? 'Pause music' : 'Play music'}
            >
              <MusicIcon off={!musicOn} />
            </button>
            <button
              className={`${styles.fab} ${downloadDone ? styles.fabActive : ''}`}
              onClick={handleDownloadPng}
              disabled={loadingPng}
              aria-label="Save as image"
            >
              {loadingPng ? <SpinnerIcon /> : downloadDone ? <CheckIcon /> : <DownloadIcon />}
            </button>

            <AnimatePresence>
              {showToast && (
                <motion.div
                  className={styles.fabWriteWrap}
                  initial={{ opacity: 0, y: 28, scale: 0.85 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 20, scale: 0.85 }}
                  transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                >
                  <motion.button
                    type="button"
                    className={styles.writeBubble}
                    onClick={onWriteOwn}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.22, duration: 0.36, ease: [0.16, 1, 0.3, 1] }}
                    whileTap={{ scale: 0.97 }}
                    aria-label="Write a note"
                  >
                    <span className={styles.writeBubbleText}>
                      {senderName
                        ? <>You have a lovely smile — pass it on with a note to <strong>{senderName}</strong>.</>
                        : <>You have a lovely smile — pass it on with a note.</>
                      }
                    </span>
                    <span className={styles.writeBubbleCta}>Write a note →</span>
                    <span className={styles.writeBubbleTail} aria-hidden />
                  </motion.button>
                  <motion.button
                    className={`${styles.fab} ${styles.fabWrite}`}
                    onClick={onWriteOwn}
                    whileTap={{ scale: 0.92 }}
                    aria-label="Write a note"
                  >
                    <WriteIcon />
                  </motion.button>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          {/* Feedback — slides in from the bottom centre, dismissable. */}
          <div className={styles.fabFeedbackDock}>
            {ratingToastNode}
          </div>
        </>
      )}
    </div>
  )
}


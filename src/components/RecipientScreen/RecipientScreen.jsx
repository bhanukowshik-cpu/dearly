import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { TegakiRenderer } from 'tegaki/react'
import { font } from '../../lib/tegakiFont'
import PaperCanvas from '../WritingScreen/PaperCanvas'
import { PAPER_TYPES } from '../WritingScreen/stylePresets'
import VideoBackground from '../VideoBackground/VideoBackground'
import { captureCanvas } from '../../lib/captureUtils'
import { submitFeedback } from '../../lib/supabase'
import { trackEvent } from '../../lib/analytics'
import styles from './RecipientScreen.module.css'

// ── Ambient audio ──────────────────────────────────────────────────────────────
const MUSIC_TRACKS = [
  'https://hdxswlhlbnbvfektdkuq.supabase.co/storage/v1/object/public/media/music/Soft%20Music%201.mp3',
  'https://hdxswlhlbnbvfektdkuq.supabase.co/storage/v1/object/public/media/music/the-paths-we-walk-aylex-main-version-29711-02-43.mp3',
  'https://hdxswlhlbnbvfektdkuq.supabase.co/storage/v1/object/public/media/music/earth-in-bloom-richard-bodgers-main-version-00-59-7489.mp3',
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

    function loadAndPlay(idx, targetVol) {
      if (audio) { audio.pause(); audio.onended = null }
      cancelFade()
      audio = new Audio(playlist[idx % playlist.length])
      audio.volume = 0
      audio.onended = () => {
        if (!active) return
        trackIdx++
        loadAndPlay(trackIdx, audio.volume)
      }
      if (active) {
        const promise = audio.play()
        if (promise) promise.then(() => fadeTo(targetVol ?? 0.08, 800)).catch(() => {})
      }
    }

    loadAndPlay(0)

    return {
      // Returns raw play() Promise so caller can detect autoplay blocks
      play(volume) {
        active = true
        if (!audio) return Promise.resolve()
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
  recipient, message, showRecipient, paperConfig, stickers, textSize,
  readingMode, revealedWordIdx, paperRef,
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

  const { type = 'minimal', color = '#FAFAF8' } = paperConfig ?? {}
  const typeData  = PAPER_TYPES[type] ?? PAPER_TYPES.minimal
  const panelBg   = type === 'color' ? color : '#F3E9D4'

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
          <div className={`${styles.foldCard} ${glowing ? styles.foldCardGlow : ''}`}>
            <div className={styles.foldPaper} ref={paperRef}>
              <PaperCanvas
                recipient={recipient} message={message}
                showRecipient={showRecipient} paperConfig={paperConfig}
                stickers={stickers} textSize={textSize}
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

            {/* Recipient label — sits in lower quarter, below the knot */}
            <motion.div className={styles.foldLabel}
              animate={{ opacity: phase === 'envelope' ? 1 : 0 }}
              transition={{ duration: 0.18 }}
            >
              {recipientName
                ? <><span className={styles.foldFor}>for</span><span className={styles.foldName}>{recipientName}</span></>
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
    const t = setTimeout(() => setSubtitleOn(true), 800)
    return () => clearTimeout(t)
  }, [writeDone])

  useEffect(() => {
    if (!subtitleOn) return
    const t = setTimeout(() => setPhase('envelope'), 2600)
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
    ambientRef.current?.setVolume(0.16)
    const t1 = setTimeout(() => setShowRatingToast(true), 12000)
    const t2 = setTimeout(() => setShowToast(true), 9000)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [phase])

  const handleRate = (star) => {
    setRating(star)
    submitFeedback(star)
    trackEvent('feedback_submitted', { stars: star })
    if (star >= 4) setTimeout(() => setRatingDone(true), 1200)
    // < 4: stay open and show the feedback textarea
  }

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

  const openNote         = useCallback(() => {
    setPhase('opening')
    trackEvent('note_opened')
    if (!musicOn) {
      ambientRef.current?.play(0.08).then(() => setMusicOn(true)).catch(() => {})
    }
  }, [musicOn])
  const handleUnfoldDone = useCallback(() => setPhase('letter'),  [])

  const toggleMusic = useCallback(() => {
    const a = ambientRef.current
    if (!a) return
    if (musicOn) { a.pause(); setMusicOn(false) }
    else         { a.play();  setMusicOn(true)  }
  }, [musicOn])

  const downloadTimerRef = useRef(null)
  const isMobileDevice = /iPad|iPhone|iPod|Android/i.test(navigator.userAgent)

  const handleDownloadPng = useCallback(async () => {
    if (loadingPng) return
    setLoadingPng(true)
    setDownloadDone(false)
    try {
      const canvas = await captureCanvas(paperRef)
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
        setTtsError('Voice credits ran out — try again later.')
      } else {
        setTtsError('Audio unavailable right now.')
      }
      setTimeout(() => setTtsError(null), 5000)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSpeaking, isLoadingAudio, message, recipient])

  const isLetterPhase = phase === 'letter'

  const tryStartMusic = useCallback(() => {
    if (musicOn) return
    ambientRef.current?.play(0.08).then(() => setMusicOn(true)).catch(() => {})
  }, [musicOn])

  return (
    <div
      className={styles.root}
      style={isLetterPhase ? { justifyContent: 'flex-start', paddingTop: 64 } : undefined}
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
            className={styles.greetingWrap}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, y: -14, transition: { duration: 0.25 } }}
            transition={{ layout: { duration: 0.7, ease: [0.22, 1, 0.36, 1] } }}
          >
            <div className={styles.greetingTitle}>
              <TegakiRenderer
                font={font}
                onComplete={() => setWriteDone(true)}
                time={{ mode: 'uncontrolled', duration: 1.1 }}
                style={{
                  fontSize: 'clamp(42px, 7vw, 72px)',
                  color: '#ffffff', fontWeight: 700,
                  whiteSpace: 'nowrap', lineHeight: 1, willChange: 'transform',
                }}
              >
                {`Hi ${recipientName || 'there'}!`}
              </TegakiRenderer>
            </div>
            <motion.p
              className={styles.greetingSub}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: subtitleOn ? 1 : 0, y: subtitleOn ? 0 : 12 }}
              transition={{ duration: 0.7, ease: 'easeOut' }}
            >
              {senderName ? `${senderName} wrote something for you` : 'Someone wrote something for you'}
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Card + CTA + controls — only mounts after greeting ───────────────── */}
      <AnimatePresence>
        {phase !== 'greeting' && (
          <motion.div
            key="experience"
            className={styles.experience}
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
          >
            <FoldedLetter
              phase={phase}
              recipientName={recipientName}
              onUnfoldDone={handleUnfoldDone}
              recipient={recipient}
              message={message}
              showRecipient={showRecipient}
              paperConfig={paperConfig}
              stickers={stickers}
              textSize={textSize}
              readingMode={readingMode && isLetterPhase}
              revealedWordIdx={revealedWordIdx}
              paperRef={paperRef}
            />

            {/* Open envelope CTA */}
            <AnimatePresence>
              {phase === 'envelope' && (
                <motion.button
                  key="read-cta"
                  className={styles.readCta}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10, transition: { duration: 0.2 } }}
                  transition={{ duration: 0.5, delay: 0.35, ease: [0.16, 1, 0.3, 1] }}
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
              )}
            </AnimatePresence>

            {/* Controls */}
            {isLetterPhase && (
              <motion.div
                className={styles.controls}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.8, ease: [0.16, 1, 0.3, 1] }}
              >
                {/* Left — de-emphasised listen hint */}
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

                {/* Right — music toggle + download */}
                <div className={styles.controlsRight}>
                  {/* Hand-drawn outline CTA — mirrors the "Open your note" button */}
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

                  {/* Download — icon + state label */}
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
                  </button>
                </div>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

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

      {/* ── Rating toast — bottom right ──────────────────────────────────────── */}
      <div className={styles.toastStack}>
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
              <button className={styles.toastClose} onClick={() => setRatingDone(true)} aria-label="Dismiss">✕</button>
              <AnimatePresence mode="wait" initial={false}>
                {rating === 0 ? (
                  <motion.div key="q" style={{ display: 'contents' }}
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    transition={{ duration: 0.18 }}
                  >
                    <div className={styles.toastLeft}>
                      <p className={styles.toastText}>How well do you like this experience?</p>
                    </div>
                    <div className={styles.toastRight}>
                      <div className={styles.stars}>
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
                      </div>
                    </div>
                  </motion.div>
                ) : rating >= 4 ? (
                  <motion.p key="thanks" className={styles.toastThanks}
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    transition={{ duration: 0.22 }}
                  >
                    Thanks for the feedback! ✦
                  </motion.p>
                ) : (
                  <motion.div key="feedback" style={{ flex: 1, minWidth: 0 }}
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    transition={{ duration: 0.22 }}
                  >
                    <textarea
                      className={styles.feedbackInput}
                      placeholder="What was missing? What could we improve?"
                      autoFocus
                      value={feedbackText}
                      onChange={e => setFeedbackText(e.target.value)}
                      onBlur={() => {
                        if (feedbackText.trim()) submitFeedback(rating, feedbackText.trim())
                        setRatingDone(true)
                      }}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          if (feedbackText.trim()) submitFeedback(rating, feedbackText.trim())
                          setRatingDone(true)
                        }
                      }}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>

      </div>

      {/* ── Share banner — full width, centered at bottom ─────────────────────── */}
      <AnimatePresence>
        {showToast && (
          <motion.div
            className={styles.shareBanner}
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
                  ? <>Just like the smile you just had reading this note, share one with <strong>{senderName}</strong>, a colleague, friend, family member, or anyone you love — and make their day with Dearly.</>
                  : <>Just like the smile you just had reading this note, share one with a colleague, friend, family member, or anyone you love — and make their day with Dearly.</>
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
                <span>Write a Note</span>
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}


import { useEffect, useRef, useState } from 'react'
import VoiceWaveform from './VoiceWaveform'
import { claim, release } from '../../lib/voiceNotePlayback'
import { VOICE_ACCENT, VOICE_ACCENT_FADE, deriveVoiceAccent, fadeVoiceAccent } from '../../lib/voiceNoteAccent'
import { IconClose, IconRotate } from './editorIcons'
import styles from './VoiceNoteRenderer.module.css'
/* Hand-drawn play triangle — slightly wonky vertices, rounded corners
   via stroke-linejoin, and a hint of the same line jitter the waveform
   uses so the icon feels sketched, not stamped. */
function IconPlay() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M 6.5 4.2 C 6.2 4.7 6.1 5.4 6.05 6.1 L 5.95 17.6 C 5.95 18.4 6.05 19.2 6.6 19.6 C 7.05 19.95 7.7 19.85 8.3 19.55 L 18.6 13.05 C 19.2 12.65 19.25 11.65 18.6 11.2 L 8.2 4.45 C 7.6 4.05 6.95 3.9 6.5 4.2 Z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}
/* Hand-drawn pause — two short ink strokes, not perfect rectangles. */
function IconPause() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M 8 4.5 C 7.6 4.7 7.5 5.4 7.5 6.1 L 7.55 17.8 C 7.55 18.5 7.7 19.2 8 19.4 C 8.4 19.6 9.1 19.5 9.4 19.2 C 9.7 18.9 9.7 18.2 9.7 17.5 L 9.55 6.2 C 9.55 5.5 9.5 4.8 9.2 4.5 C 8.9 4.3 8.4 4.3 8 4.5 Z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="0.6"
        strokeLinejoin="round"
      />
      <path
        d="M 14.7 4.5 C 14.3 4.7 14.25 5.4 14.25 6.1 L 14.3 17.8 C 14.3 18.5 14.4 19.2 14.7 19.4 C 15.1 19.6 15.8 19.5 16.1 19.2 C 16.4 18.9 16.4 18.2 16.4 17.5 L 16.3 6.2 C 16.3 5.5 16.2 4.8 15.9 4.5 C 15.6 4.3 15.1 4.3 14.7 4.5 Z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="0.6"
        strokeLinejoin="round"
      />
    </svg>
  )
}
function IconMicTiny() {
  return (
    <svg viewBox="0 0 14 14" fill="none" aria-hidden style={{ width: '100%', height: '100%' }}>
      <rect x="5.2" y="2" width="3.6" height="6.6" rx="1.8" stroke="currentColor" strokeWidth="1.1" fill="none"/>
      <path d="M3.5 7 C 3.5 9.4 5 10.8 7 10.8 C 9 10.8 10.5 9.4 10.5 7"
            stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" fill="none"/>
      <path d="M7 10.8 V12.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
    </svg>
  )
}

function fmtTime(seconds) {
  const s = Math.max(0, Math.floor(seconds))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${r.toString().padStart(2, '0')}`
}

/* Cheap luminance for picking a card variant. Returns 0..1; we don't need
   gamma-correct math here, just dark-vs-light bucketing. */
function paperLuminance(hex) {
  if (!hex || typeof hex !== 'string') return 1
  let h = hex.replace('#', '')
  if (h.length === 3) h = h.split('').map(c => c + c).join('')
  const n = parseInt(h, 16)
  if (Number.isNaN(n)) return 1
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255
}

/* "Warm paper" = enough red/yellow vs. blue that a vintage card tint
   will look natural. Used to gate the vintage card-fill override. */
function isWarmPaper(hex) {
  let h = (hex || '').replace('#', '')
  if (h.length === 3) h = h.split('').map(c => c + c).join('')
  const n = parseInt(h, 16)
  if (Number.isNaN(n)) return false
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
  // Warmth ≈ red+green dominance over blue, and red ≥ blue.
  return (r + g) > b * 2.0 && r >= b
}

/* For vintage-y warm papers, deepen the paper toward an aged cream so
   the pill reads as part of the same paper grain rather than a stark
   white sticker. We mix the paper toward a darker version of itself. */
function tintCardForVintage(hex) {
  let h = (hex || '').replace('#', '')
  if (h.length === 3) h = h.split('').map(c => c + c).join('')
  const n = parseInt(h, 16)
  if (Number.isNaN(n)) return '#FFFBF2'
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
  // Lighten toward off-white but keep ~20% of the paper hue so the
  // pill still reads as cream/aged, not bleach white.
  const lr = Math.round(r * 0.30 + 255 * 0.70)
  const lg = Math.round(g * 0.30 + 255 * 0.70)
  const lb = Math.round(b * 0.30 + 255 * 0.70)
  return '#' + [lr, lg, lb].map(v => v.toString(16).padStart(2, '0')).join('')
}

/* ─────────────────────────────────────────────────────────────────────────
   VoiceNoteRenderer — one voice-note canvas object.

   Mirrors MediaFrameRenderer:
     - plain (not motion.div) absolute body, % position, rotation transform
     - drag from anywhere on the card (4px threshold)
     - selection adds × remove, four corner resize handles, rotate button
     - revokes its audio blob URL on unmount

   Playback uses an HTMLAudioElement registered with the single-play module
   so only one voice note plays at a time across the canvas + panel.
   ───────────────────────────────────────────────────────────────────────── */
// NOOP fallback for handlers — used when the renderer is mounted in
// read-only contexts (RecipientScreen, Preview) where there's no
// edit-state plumbing. Calling an undefined function on a pointer event
// would otherwise crash the React tree.
const NOOP = () => {}

export default function VoiceNoteRenderer({
  note,
  isSelected,
  paperRef,
  paperBg = '#FAFAF8',
  onSelect = NOOP,
  onMove   = NOOP,
  onResize = NOOP,
  onRotate = NOOP,
  onRemove = NOOP,
}) {
  // Adaptive palette — derive everything from the paper colour so the
  // voice pill harmonises with whichever paper is selected.
  //   accent      → waveform strokes, play-button fill, timestamp text
  //   accentFade  → un-played stroke colour
  //   cardFill    → wobbly SVG background
  //   cardStroke  → wobbly SVG outline
  // Vintage / cream papers get a yellowed pill so it reads as part of
  // the same paper; dark papers flip to a dark pill so it doesn't pop
  // like a UI popup.
  const lum         = paperLuminance(paperBg)
  const isDarkPaper = lum < 0.4
  const isVintage   = !isDarkPaper && lum < 0.9 && isWarmPaper(paperBg)

  const accent      = deriveVoiceAccent(paperBg)
  const accentFade  = fadeVoiceAccent(accent, isDarkPaper ? 0.40 : 0.28)

  const cardFill    = isDarkPaper
    ? '#1F1B16'
    : isVintage
      ? tintCardForVintage(paperBg)
      : '#FFFBF2'
  const cardStroke  = isDarkPaper
    ? 'rgba(255,255,255,0.18)'
    : isVintage
      ? 'rgba(120,80,30,0.22)'
      : 'rgba(60,40,20,0.12)'
  const timestampColor = accent
  const audioRef     = useRef(null)
  const cleanupRef   = useRef(null)
  const [isPlaying,  setIsPlaying]  = useState(false)
  const [progress,   setProgress]   = useState(0)
  const [livePlayhead, setLivePlayhead] = useState(0)
  /* Visible playback error — surfaced when tapping play fails or when the
     <audio> element fires an error event. iOS Safari rejects webm/opus
     silently otherwise; we want the recipient to SEE why playback didn't
     start instead of just tapping a dead button. */
  const [playbackError, setPlaybackError] = useState(null)

  /* NOTE: blob URL revocation lives in WritingScreen.removeVoiceNote, not
     here. React StrictMode's double mount/unmount in dev would otherwise
     revoke the URL on the first unmount and leave a dead URL on remount.
     The parent state owns the URL's lifetime — when the note is removed
     from state, the parent revokes; when not, the URL stays valid for
     the page lifetime. */
  useEffect(() => () => {
    cleanupRef.current?.()
    const a = audioRef.current
    if (a) { try { a.pause() } catch { /* ignore */ }; release(a) }
  }, [])

  /* Wire audio events. */
  useEffect(() => {
    const a = audioRef.current
    if (!a) return
    function onPlay() {
      setIsPlaying(true)
      claim(a)
    }
    function onPause()  { setIsPlaying(false) }
    function onEnded()  { setIsPlaying(false); setProgress(0); setLivePlayhead(0); release(a) }
    function onTime() {
      const d = a.duration && isFinite(a.duration) ? a.duration : (note.duration || 0)
      if (!d) return
      setLivePlayhead(a.currentTime)
      setProgress(Math.min(1, a.currentTime / d))
    }
    function onError() {
      // MediaError.code → human label so the visible message reads
      // clearly. 4 = MEDIA_ERR_SRC_NOT_SUPPORTED, which is what iOS
      // Safari throws on webm/opus.
      const codes = {
        1: 'aborted',
        2: 'network',
        3: 'decode',
        4: 'format not supported by browser',
      }
      const code  = a.error?.code
      const label = codes[code] || `code ${code}`
      const detail = a.error?.message
      const url   = a.currentSrc || note.audioUrl
      const text = `Audio: ${label}${detail ? ' — ' + detail : ''}\nURL: ${url}`
      console.error('[VoiceNote] audio error', code, detail, url)
      setPlaybackError(text)
    }
    a.addEventListener('play',  onPlay)
    a.addEventListener('pause', onPause)
    a.addEventListener('ended', onEnded)
    a.addEventListener('timeupdate', onTime)
    a.addEventListener('error', onError)
    // MediaRecorder webm blobs sometimes report duration:Infinity until the
    // element is forced to load — call load() explicitly when the URL changes
    // so play() has metadata ready by the time the user clicks.
    if (note.audioUrl) {
      try { a.load() } catch { /* ignore */ }
    }
    return () => {
      a.removeEventListener('play',  onPlay)
      a.removeEventListener('pause', onPause)
      a.removeEventListener('ended', onEnded)
      a.removeEventListener('timeupdate', onTime)
      a.removeEventListener('error', onError)
    }
  }, [note.audioUrl, note.duration])

  function togglePlay(e) {
    e?.stopPropagation()
    const a = audioRef.current
    console.log('[VoiceNote] play tapped. audioRef=', !!a, 'src=', note.audioUrl, 'paused=', a?.paused, 'readyState=', a?.readyState, 'networkState=', a?.networkState, 'error=', a?.error?.code)
    if (!a) {
      setPlaybackError('Audio element not mounted yet — try again in a moment.')
      return
    }
    // Surface "no audio source" early — most common cause of a dead-feeling
    // tap on the recipient screen is the note having a stale blob: URL or
    // an unreachable Storage URL.
    if (!note.audioUrl) {
      setPlaybackError('No audio URL on this note. (The letter may have been saved before voice persistence was wired up.)')
      return
    }
    // Clear any previous error — fresh tap, fresh attempt.
    setPlaybackError(null)
    if (a.paused) {
      const p = a.play()
      if (p && typeof p.then === 'function') {
        p.catch(err => {
          const text = `Play failed: ${err.name} — ${err.message}\nreadyState=${a.readyState} networkState=${a.networkState} mediaError=${a.error?.code}\nURL: ${a.currentSrc || note.audioUrl}`
          console.error('[VoiceNote] play failed:', err.name, err.message, 'url:', a.currentSrc)
          setPlaybackError(text)
        })
      }
    } else {
      a.pause()
    }
  }

  /* Drag from anywhere on the card — same pattern as MediaFrameRenderer.
     If the user clicks (no drag), toggle playback. */
  function handleBodyPointerDown(e) {
    if (e.target.closest(`.${styles.handle}, .${styles.removeBtn}, .${styles.rotateBtn}, .${styles.playBtn}`)) return
    e.stopPropagation()
    onSelect(note.id)

    const paper = paperRef.current
    if (!paper) return
    const startX = e.clientX
    const startY = e.clientY
    let dragging = false

    // Read paper size from the data-paper-size attribute on the paper root
    // (set by PaperCanvas). Voice notes have a fixed minimum CONTENT height
    // (~50px for the play button + waveform row) that doesn't shrink with
    // the paper. On a strip (~150px tall), that 50px is a third of the
    // total height, so the default 2-98% clamp lets the user drag a voice
    // note such that its actual rendered card overflows the paper edge.
    // Tighten the vertical safe zone on strips so the card stays inside
    // the paper with visible breathing room at top + bottom.
    const paperSize = paper.getAttribute('data-paper-size') || 'postcard'
    const yMin = paperSize === 'strip' ? 25 : 2
    const yMax = paperSize === 'strip' ? 75 : 98

    function onPM(me) {
      if (!dragging && Math.hypot(me.clientX - startX, me.clientY - startY) > 4) {
        dragging = true
      }
      if (dragging) {
        const rect = paper.getBoundingClientRect()
        const xPct = Math.max(2,    Math.min(98,   ((me.clientX - rect.left) / rect.width)  * 100))
        const yPct = Math.max(yMin, Math.min(yMax, ((me.clientY - rect.top)  / rect.height) * 100))
        onMove(note.id, xPct, yPct)
      }
    }
    function onPU() {
      window.removeEventListener('pointermove', onPM)
      window.removeEventListener('pointerup',   onPU)
      cleanupRef.current = null
      if (!dragging) togglePlay()
    }
    cleanupRef.current = onPU
    window.addEventListener('pointermove', onPM)
    window.addEventListener('pointerup',   onPU)
  }

  function getCenter() {
    const pr = paperRef.current?.getBoundingClientRect()
    if (!pr) return { cx: 0, cy: 0 }
    return {
      cx: pr.left + (note.x / 100) * pr.width,
      cy: pr.top  + (note.y / 100) * pr.height,
    }
  }

  function handleCornerResize(e) {
    e.stopPropagation()
    e.preventDefault()
    const { cx, cy } = getCenter()
    const d0 = Math.max(Math.hypot(e.clientX - cx, e.clientY - cy), 1)
    const w0 = note.width
    const h0 = note.height
    function onPM(me) {
      const d = Math.hypot(me.clientX - cx, me.clientY - cy)
      const ratio = d / d0
      const w = Math.max(14, Math.min(80, w0 * ratio))
      const h = Math.max(8,  Math.min(40, h0 * ratio))
      onResize(note.id, w, h)
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
    const r0 = note.rotation ?? 0
    function onPM(me) {
      const a = Math.atan2(me.clientY - cy, me.clientX - cx) * (180 / Math.PI)
      onRotate(note.id, r0 + (a - a0))
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

  const rotation = note.rotation ?? 0
  const duration = isPlaying
    ? Math.max(0, (note.duration || 0) - livePlayhead)
    : (note.duration || 0)

  return (
    <div
      className={styles.body}
      // data-* attrs are read by captureUtils during export to swap this
      // voice pill for the export-mode card (waveform + caption + QR).
      // They have no effect on the live interactive experience.
      data-voice-note
      data-voice-note-id={note.id}
      data-voice-note-audio={note.audioUrl}
      data-voice-note-duration={note.duration ?? 0}
      data-voice-note-waveform={JSON.stringify(note.waveformData || [])}
      style={{
        left:        `${note.x}%`,
        top:         `${note.y}%`,
        width:       `${note.width}%`,
        // Height is DERIVED from width via aspect-ratio — not stored as a
        // separate paper-% so the card keeps the same visual shape on
        // every paper size. Storing height as % of paper height made
        // strips squash the card vertically (4:1 paper → height % maps
        // to far fewer px) and A4 stretch it (tall paper → height %
        // becomes too many px). Pinning aspect-ratio to ~3.1:1 matches
        // the postcard look the user signed off on as correct.
        // note.height is still kept in state for the resize handler
        // (which scales width + height proportionally via diagonal
        // distance) — it just doesn't drive rendering anymore.
        aspectRatio: '3.1 / 1',
        transform:   `translate(-50%, -50%) rotate(${rotation}deg)`,
        zIndex:      isSelected ? 17 : 7,
      }}
      onPointerDown={handleBodyPointerDown}
    >
      <div className={styles.card}>
        {/* Hand-drawn wobbly background — same shape family as the
            "Share this note" and "Add to postcard" CTAs so the voice
            card visually belongs to the postcard's hand-lettered chrome
            rather than a perfect digital rectangle. */}
        <svg
          className={styles.cardBg}
          viewBox="0 0 200 60"
          preserveAspectRatio="none"
          fill="none"
          aria-hidden
        >
          <path
            d="M 5,7 C 60,3 140,5 195,6 C 198,20 199,40 195,54 C 140,58 60,56 5,55 C 2,40 1,20 5,7 Z"
            fill={cardFill}
            stroke={cardStroke}
            strokeWidth="0.6"
          />
        </svg>
        <button
          className={styles.playBtn}
          onClick={togglePlay}
          onPointerDown={e => e.stopPropagation()}
          aria-label={isPlaying ? 'Pause voice note' : 'Play voice note'}
          style={{ color: accent }}
        >
          {isPlaying ? <IconPause /> : <IconPlay />}
        </button>
        <div className={styles.waveformBox}>
          <VoiceWaveform
            data={note.waveformData}
            progress={progress}
            /* 18 bars (was 26) reads as airy individual marks instead
               of a packed wash, especially on mobile where the pill is
               ~150px wide and 26 bars crammed in look solid. */
            bars={18}
            height={36}
            color={accent}
            dimColor={accentFade}
            variant="dots"
            minBarHeight={2}
          />
        </div>
        <span className={styles.duration} style={{ color: timestampColor }}>
          {fmtTime(duration)}
        </span>
      </div>

      <audio
        ref={audioRef}
        src={note.audioUrl || undefined}
        preload="auto"
        /* playsInline keeps audio playback inline on iOS (no full-screen
           takeover). Intentionally NOT setting crossOrigin — that would
           require Supabase Storage to send Access-Control-Allow-Origin
           headers, and if the bucket isn't configured to do so, iOS
           Safari refuses to load the audio entirely. Without crossOrigin,
           Safari treats the resource as opaque media (we can play it,
           we just can't read its pixel/sample data from JS — which we
           don't need to do). */
        playsInline
      />

      {/* Visible playback error — appears below the pill if the audio
          fails to load (e.g. iOS Safari can't decode webm). Lets the
          recipient see *why* nothing happened when they tapped play
          instead of getting a silent dead button. Tap dismisses. */}
      {playbackError && (
        <div
          onClick={(e) => { e.stopPropagation(); setPlaybackError(null) }}
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            marginTop: 6,
            padding: '8px 10px',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: 11,
            lineHeight: 1.35,
            color: '#fff',
            background: 'rgba(140, 30, 30, 0.92)',
            borderRadius: 6,
            boxShadow: '0 6px 16px rgba(0,0,0,0.30)',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            zIndex: 30,
            cursor: 'pointer',
            pointerEvents: 'auto',
          }}
        >
          {playbackError}
          <div style={{ marginTop: 6, opacity: 0.7, fontSize: 10 }}>tap to dismiss</div>
        </div>
      )}

      {isSelected && (
        <>
          <div className={styles.selFrame} />
          <button
            className={styles.removeBtn}
            onPointerDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); onRemove(note.id) }}
            aria-label="Remove voice note"
          >
            <IconClose size={10} />
          </button>
          <div className={`${styles.handle} ${styles.handleTL}`} onPointerDown={handleCornerResize} />
          <div className={`${styles.handle} ${styles.handleTR}`} onPointerDown={handleCornerResize} />
          <div className={`${styles.handle} ${styles.handleBL}`} onPointerDown={handleCornerResize} />
          <div className={`${styles.handle} ${styles.handleBR}`} onPointerDown={handleCornerResize} />
          <button
            className={styles.rotateBtn}
            onPointerDown={handleRotateStart}
            title="Rotate"
            aria-label="Rotate voice note"
          >
            <IconRotate size={15} />
          </button>
        </>
      )}
    </div>
  )
}

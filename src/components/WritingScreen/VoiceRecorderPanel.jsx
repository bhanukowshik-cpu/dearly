import { useEffect, useRef, useState } from 'react'
import { useVoiceRecorder } from '../../lib/useVoiceRecorder'
import VoiceWaveform from './VoiceWaveform'
import { claim, release } from '../../lib/voiceNotePlayback'
import { VOICE_ACCENT, VOICE_ACCENT_FADE } from '../../lib/voiceNoteAccent'
import {
  IconMic    as IconMicLarge,
  IconPlay,
  IconPause,
  IconDelete as IconTrash,
  IconChecked as IconCheck,
} from './editorIcons'
import styles from './VoiceRecorderPanel.module.css'

/* Redo doesn't have a hand-drawn asset yet — kept geometric here.
   Swap when an SVG is added to Dearly V2/Icons. */
function IconRedo() {
  return (
    <svg width="14" height="14" viewBox="0 0 15 15" fill="none" aria-hidden>
      <path d="M3 9 a4.5 4.5 0 1 0 1.4 -3.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
      <path d="M4.4 2.5 L4.4 5.8 L7.7 5.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function fmtTime(seconds) {
  const s = Math.max(0, Math.floor(seconds))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${r.toString().padStart(2, '0')}`
}

/* Score an audio input device by how likely it is to be the user's
   closest-proximity mic. AirPods / headsets / lavaliers sit on the body
   so they win; mic arrays come next (they're beamforming, which already
   prioritises the nearest voice); built-in laptop mics come last. The
   highest-scoring deviceId becomes the preferred mic, and we persist it
   so subsequent sessions skip the auto-detect. */
function micScore(label) {
  const L = (label || '').toLowerCase()
  if (/airpods|earpods|earbuds|earphone/.test(L)) return 100
  if (/headset|headphone/.test(L))                return 95
  if (/lavalier|lapel|lav\b/.test(L))             return 90
  if (/wireless|bluetooth/.test(L))               return 75
  if (/usb|external/.test(L))                     return 60
  if (/array|beamforming/.test(L))                return 50
  if (/built[\s-]?in|internal/.test(L))           return 15
  return 40
}

function pickClosestMicId(devices) {
  const inputs = (devices || []).filter(d => d.kind === 'audioinput' && d.deviceId)
  if (!inputs.length) return null
  let best = inputs[0]
  let bestScore = micScore(best.label)
  for (let i = 1; i < inputs.length; i++) {
    const s = micScore(inputs[i].label)
    if (s > bestScore) { best = inputs[i]; bestScore = s }
  }
  return best.deviceId
}

/* ─────────────────────────────────────────────────────────────────────────
   VoiceRecorderPanel
   - idle/requesting → big mic button to start
   - recording        → live waveform + timer + stop button
   - recorded         → static waveform + play/pause + delete + re-record +
                        "Add to postcard" CTA
   - error            → friendly message + retry
   ───────────────────────────────────────────────────────────────────────── */
export default function VoiceRecorderPanel({
  onAddVoiceNote,           // ({ audioUrl, duration, waveformData }) => void
  voiceNoteCount = 0,
  maxVoiceNotes  = 4,
  onLimitToast   = null,
}) {
  // Persisted preferred-mic deviceId. Empty === "use OS default" — first
  // recording falls back to that, then after permission is granted we auto-
  // detect the closest-proximity mic (headset / AirPods → preferred over
  // the built-in laptop mic) and lock it in for future recordings.
  const [deviceId, setDeviceId] = useState(() => {
    try { return localStorage.getItem('dearly:voiceMicId') || '' } catch { return '' }
  })
  const rec = useVoiceRecorder({ deviceId: deviceId || null })
  const audioRef = useRef(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [previewProgress, setPreviewProgress] = useState(0)

  const atLimit = voiceNoteCount >= maxVoiceNotes

  /* Auto-detect the best mic after permission has been granted. Device
     labels are blank without permission, so we can only score after a
     successful capture. Headsets/AirPods score highest (closest to mouth);
     built-in mics score lowest. Whichever wins is persisted so subsequent
     sessions use it directly — no permission re-prompt, no UI picker. */
  useEffect(() => {
    if (rec.state !== 'recorded' && rec.state !== 'recording') return
    if (!navigator.mediaDevices?.enumerateDevices) return
    let cancelled = false
    navigator.mediaDevices.enumerateDevices().then(devs => {
      if (cancelled) return
      const bestId = pickClosestMicId(devs)
      if (bestId && bestId !== deviceId) {
        setDeviceId(bestId)
        try { localStorage.setItem('dearly:voiceMicId', bestId) } catch { /* private mode */ }
      }
    }).catch(() => { /* ignore */ })
    return () => { cancelled = true }
  }, [rec.state, deviceId])

  /* Wire up the preview audio element when a recording finishes. The
     element is mounted lazily — it only exists in the 'recorded' render
     branch, so we re-run this effect on every state transition AND when
     audioUrl changes (e.g., processing → recorded with the same blob
     when enhancement was skipped/failed, the URL is unchanged but the
     element is brand-new and needs its listeners). */
  useEffect(() => {
    const a = audioRef.current
    if (!a) return
    function onPlay() {
      setIsPlaying(true)
      claim(a)
    }
    function onPause() { setIsPlaying(false) }
    function onEnded() { setIsPlaying(false); setPreviewProgress(0); release(a) }
    function onTime() {
      if (!a.duration || !isFinite(a.duration)) return
      setPreviewProgress(Math.min(1, a.currentTime / a.duration))
    }
    a.addEventListener('play',  onPlay)
    a.addEventListener('pause', onPause)
    a.addEventListener('ended', onEnded)
    a.addEventListener('timeupdate', onTime)
    // Reset previewProgress whenever we (re-)attach — covers the case
    // where the audio element is brand-new but the audioUrl hasn't
    // changed value, so prior progress would otherwise stick.
    setPreviewProgress(0)
    setIsPlaying(false)
    return () => {
      a.removeEventListener('play',  onPlay)
      a.removeEventListener('pause', onPause)
      a.removeEventListener('ended', onEnded)
      a.removeEventListener('timeupdate', onTime)
      try { a.pause() } catch { /* ignore */ }
      release(a)
    }
  }, [rec.audioUrl, rec.state])

  function togglePreview() {
    const a = audioRef.current
    if (!a) return
    if (a.paused) {
      a.play().catch(() => { /* user-gesture issues are handled by browser UI */ })
    } else {
      a.pause()
    }
  }

  function handleStartClick() {
    if (atLimit) {
      onLimitToast?.(`You've added ${maxVoiceNotes} voice notes already — remove one to add another.`)
      return
    }
    rec.start()
  }

  function handleAddToPostcard() {
    if (atLimit) {
      onLimitToast?.(`You've added ${maxVoiceNotes} voice notes already — remove one to add another.`)
      return
    }
    const payload = rec.consume()
    if (!payload) return
    // Stop any preview playback before handing the URL off.
    const a = audioRef.current
    if (a) { try { a.pause() } catch { /* ignore */ } }
    setIsPlaying(false)
    setPreviewProgress(0)
    onAddVoiceNote(payload)
  }

  /* ── Render branches ─────────────────────────────────────────────────── */
  if (rec.state === 'requesting') {
    return (
      <div className={styles.root}>
        <div className={`${styles.card} ${styles.cardRecording}`}>
          <div className={styles.spinnerBox}>
            <span className={styles.spinner} aria-label="Asking for mic permission" />
          </div>
          <div className={styles.hint}>Waiting for mic permission…</div>
        </div>
      </div>
    )
  }

  if (rec.state === 'recording') {
    return (
      <div className={styles.root}>
        <div className={`${styles.card} ${styles.cardRecording}`}>
          <div className={styles.waveformBox}>
            <VoiceWaveform
              analyserRef={rec.analyserRef}
              bars={32}
              height={60}
              variant="dots"
              color={VOICE_ACCENT}
            />
          </div>
          <div className={styles.timerRow}>
            <span className={styles.recDot} aria-hidden />
            <span className={styles.timer}>{fmtTime(rec.duration)}</span>
          </div>
          <div className={styles.actionRow}>
            <button
              className={styles.stopBtn}
              onClick={rec.stop}
            >
              <span className={styles.stopSquare} aria-hidden />
              Stop
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (rec.state === 'processing') {
    return (
      <div className={styles.root}>
        <div className={styles.card}>
          <div className={styles.waveformBox}>
            <VoiceWaveform
              data={rec.waveformData}
              bars={32}
              height={60}
              variant="dots"
              color={VOICE_ACCENT}
              dimColor={VOICE_ACCENT_FADE}
            />
          </div>
          <div className={styles.timerRow}>
            <span className={styles.timer}>{fmtTime(rec.duration)}</span>
          </div>
          <div className={styles.hint} role="status" aria-live="polite">
            <span className={styles.processingDot} aria-hidden /> Enhancing audio…
          </div>
          <div className={styles.actionRow}>
            <button
              className={styles.secondaryBtn}
              onClick={() => rec.useOriginal?.()}
              aria-label="Use original audio without enhancement"
              title="Use original"
            >
              Use original
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (rec.state === 'recorded') {
    return (
      <div className={styles.root}>
        <div className={styles.card}>
          <div className={styles.waveformBox}>
            <VoiceWaveform
              data={rec.waveformData}
              progress={previewProgress}
              bars={32}
              height={60}
              variant="dots"
              color={VOICE_ACCENT}
              dimColor={VOICE_ACCENT_FADE}
            />
          </div>
          <div className={styles.timerRow}>
            <span className={styles.timer}>{fmtTime(rec.duration)}</span>
          </div>
          <div className={styles.actionRow}>
            <button
              className={styles.secondaryBtn}
              onClick={togglePreview}
              aria-label={isPlaying ? 'Pause preview' : 'Play preview'}
            >
              {isPlaying ? <IconPause /> : <IconPlay />}
              {isPlaying ? 'Pause' : 'Play'}
            </button>
            <button
              className={styles.secondaryBtn}
              onClick={() => rec.reset()}
              aria-label="Re-record"
            >
              <IconRedo />
              Redo
            </button>
            <button
              className={`${styles.dangerBtn} ${styles.iconOnly}`}
              onClick={() => rec.reset()}
              aria-label="Delete recording"
              title="Delete"
            >
              <IconTrash />
            </button>
          </div>
          <div className={styles.actionRow}>
            <button
              className={styles.primaryBtn}
              onClick={handleAddToPostcard}
              disabled={atLimit}
            >
              {/* Hand-drawn wobbly rectangle — same shape family as the
                  top-bar "Share this note" button but with a wider inner
                  area so longer labels can't overshoot the white shape.
                  preserveAspectRatio="none" lets it stretch to the button. */}
              <svg
                className={styles.primaryBtnBg}
                viewBox="0 0 200 44"
                preserveAspectRatio="none"
                fill="none"
                aria-hidden
              >
                <path
                  d="M 4,6 C 60,3 140,4 196,6 C 198,15 199,30 196,39 C 140,42 60,41 4,39 C 1,30 1,15 4,6 Z"
                  fill="white"
                />
              </svg>
              <IconCheck />
              <span>Add to postcard</span>
            </button>
          </div>
        </div>

        <audio ref={audioRef} src={rec.audioUrl} preload="metadata" />
      </div>
    )
  }

  if (rec.state === 'error') {
    return (
      <div className={styles.root}>
        <div className={styles.error}>
          <span className={styles.errorTitle}>Mic isn't available</span>
          <span>{rec.error}</span>
          <button className={styles.secondaryBtn} onClick={() => rec.reset()}>
            Try again
          </button>
        </div>
      </div>
    )
  }

  // idle
  return (
    <div className={styles.root}>
      <div className={styles.idleCenter}>
        <button
          type="button"
          className={styles.primaryBtn}
          onClick={handleStartClick}
          disabled={atLimit}
          aria-label="Record your message"
        >
          {/* Hand-drawn wobbly background — same shape family as the
              "Share this note" / "Add to postcard" CTAs. */}
          <svg
            className={styles.primaryBtnBg}
            viewBox="0 0 200 44"
            preserveAspectRatio="none"
            fill="none"
            aria-hidden
          >
            <path
              d="M 4,6 C 60,3 140,4 196,6 C 198,15 199,30 196,39 C 140,42 60,41 4,39 C 1,30 1,15 4,6 Z"
              fill="white"
            />
          </svg>
          <IconMicLarge />
          <span>Record your message</span>
        </button>
      </div>
      {atLimit && (
        <div className={styles.atLimitNote}>
          You've added {maxVoiceNotes} voice notes already — remove one to add another.
        </div>
      )}
      <div className={styles.hint}>
        We'll ask for mic permission only when you start, and pick the
        closest microphone automatically.
      </div>
    </div>
  )
}

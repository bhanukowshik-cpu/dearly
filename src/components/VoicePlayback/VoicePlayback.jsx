/**
 * VoicePlayback — minimal landing page reached by scanning the PDF417
 * barcode that appears in place of a voice note on a downloaded letter.
 *
 *   URL shape:  https://<host>/v/<storage-path>
 *
 * The page resolves the storage path to a public audio URL via Supabase
 * and presents a single large play affordance. Intentionally tiny — no
 * router, no chrome — meant to feel like the letter "spoke" when scanned.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { getVoiceNoteUrl } from '../../lib/supabase'
import styles from './VoicePlayback.module.css'

export default function VoicePlayback() {
  // /v/<id>  → grab the id after the leading "/v/"
  const id = useMemo(() => {
    const m = window.location.pathname.match(/^\/v\/(.+)$/)
    return m ? decodeURIComponent(m[1]) : null
  }, [])

  const audioUrl = useMemo(() => (id ? getVoiceNoteUrl(id) : null), [id])

  const audioRef = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [error, setError]     = useState(null)

  useEffect(() => {
    const el = audioRef.current
    if (!el) return
    const onPlay  = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    const onEnd   = () => setPlaying(false)
    const onErr   = () => setError('Audio could not be loaded.')
    el.addEventListener('play',  onPlay)
    el.addEventListener('pause', onPause)
    el.addEventListener('ended', onEnd)
    el.addEventListener('error', onErr)
    return () => {
      el.removeEventListener('play',  onPlay)
      el.removeEventListener('pause', onPause)
      el.removeEventListener('ended', onEnd)
      el.removeEventListener('error', onErr)
    }
  }, [])

  function toggle() {
    const el = audioRef.current
    if (!el) return
    if (el.paused) el.play().catch(() => setError('Tap to allow audio.'))
    else el.pause()
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <p className={styles.kicker}>A voice note from a Dearly letter</p>

        <button
          type="button"
          className={`${styles.playBtn} ${playing ? styles.playing : ''}`}
          onClick={toggle}
          aria-label={playing ? 'Pause voice note' : 'Play voice note'}
        >
          {playing ? (
            <svg viewBox="0 0 24 24" width="42" height="42" aria-hidden>
              <rect x="6"  y="5" width="4" height="14" rx="1" fill="currentColor" />
              <rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="42" height="42" aria-hidden>
              <path d="M8 5v14l11-7L8 5z" fill="currentColor" />
            </svg>
          )}
        </button>

        <p className={styles.hint}>{playing ? 'Listening…' : 'Tap to listen'}</p>

        {error && <p className={styles.error}>{error}</p>}

        {audioUrl && (
          <audio
            ref={audioRef}
            src={audioUrl}
            preload="auto"
            playsInline
          />
        )}

        {!id && <p className={styles.error}>No voice note id in URL.</p>}
      </div>

      <p className={styles.footer}>dearly</p>
    </div>
  )
}

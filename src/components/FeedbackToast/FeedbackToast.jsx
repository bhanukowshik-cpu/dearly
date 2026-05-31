import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { submitFeedback } from '../../lib/supabase'
import { trackEvent } from '../../lib/analytics'
import styles from './FeedbackToast.module.css'

/* Hand-drawn star — same glyph as the recipient screen's rating so both
   feedback surfaces read identically. */
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

/**
 * A bottom-anchored feedback card. The star row stays visible the whole time,
 * so a rating can be re-picked at any point. Choosing a star layout-expands a
 * follow-up textarea whose prompt adapts to the score (praise vs. improvement),
 * then a Send button.
 *
 * To avoid duplicate rows when the user edits their pick, we do NOT persist on
 * every star click. Instead the latest rating is captured once — on Send, or on
 * dismiss/unmount if they leave without typing — guarded by a submitted ref.
 *
 * Props:
 *   onDone(submitted)  — called when the card should disappear (submit OR
 *                        dismiss). `submitted` is true only if a rating was
 *                        given. Parent decides what to persist.
 *   source             — analytics tag distinguishing where it was shown
 *                        (e.g. 'authoring' vs 'recipient'). Default 'authoring'.
 */
export default function FeedbackToast({ onDone = () => {}, source = 'authoring' }) {
  const [rating,       setRating]       = useState(0)
  const [hoveredStar,  setHoveredStar]  = useState(0)
  const [feedbackText, setFeedbackText] = useState('')

  const positive = rating >= 4

  // Refs so the unmount cleanup always sees the latest values without
  // re-running the effect (and without persisting more than once).
  const ratingRef    = useRef(0)
  const textRef       = useRef('')
  const submittedRef  = useRef(false)
  ratingRef.current = rating
  textRef.current   = feedbackText

  // Persist the rating (and any text) exactly once. Safe to call repeatedly —
  // subsequent calls no-op thanks to submittedRef.
  function persist() {
    if (submittedRef.current) return
    const score = ratingRef.current
    if (score <= 0) return
    submittedRef.current = true
    const text = textRef.current.trim()
    submitFeedback(score, text || undefined)
    trackEvent('feedback_submitted', { stars: score, source, ...(text ? { has_text: true } : {}) })
  }

  // Catch the case where the card unmounts (navigation away, parent dismiss)
  // without an explicit Send — we still want the chosen rating recorded.
  useEffect(() => {
    return () => { persist() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function pickStar(star) {
    // Just update local state — capture happens on Send / leave so editing
    // the pick never creates extra rows.
    setRating(star)
  }

  function send() {
    persist()
    onDone(true)
  }

  function dismiss() {
    // persist() runs in the unmount cleanup; report whether a rating existed.
    onDone(ratingRef.current > 0)
  }

  return (
    <div className={styles.wrap}>
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
        <div className={`${styles.col} ${styles.colCentered}`}>
          <motion.div layout="position" className={styles.header}>
            <p className={styles.prompt}>
              {rating === 0
                ? 'How’s your experience so far?'
                : positive
                  ? 'Love that! What did you like the most?'
                  : 'Thanks! What could we do better?'}
            </p>
            <button
              className={styles.close}
              onClick={dismiss}
              aria-label="Dismiss"
            >
              ✕
            </button>
          </motion.div>

          <motion.div layout="position" className={styles.stars}>
            {[1, 2, 3, 4, 5].map(star => (
              <button
                key={star}
                className={`${styles.star} ${(hoveredStar || rating) >= star ? styles.starFilled : ''}`}
                onMouseEnter={() => setHoveredStar(star)}
                onMouseLeave={() => setHoveredStar(0)}
                onClick={() => pickStar(star)}
                aria-label={`${star} star${star > 1 ? 's' : ''}`}
              >
                <HandStar size={38} filled={(hoveredStar || rating) >= star} />
              </button>
            ))}
          </motion.div>

          <AnimatePresence initial={false}>
            {rating > 0 && (
              <motion.div
                key="followup"
                className={styles.followup}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
              >
                <textarea
                  className={styles.input}
                  placeholder={positive
                    ? 'What stood out to you?'
                    : 'What felt off or missing? How can we improve?'}
                  autoFocus
                  value={feedbackText}
                  onChange={e => setFeedbackText(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      send()
                    }
                  }}
                />
                <button className={styles.submit} onClick={send}>
                  <svg className={styles.submitBg} viewBox="0 0 160 38" preserveAspectRatio="none" fill="none" aria-hidden>
                    <path d="M 10,5 C 48,2 112,3 150,5 C 152,14 153,24 150,33 C 112,36 48,35 10,33 C 7,24 7,14 10,5 Z" fill="white"/>
                  </svg>
                  <span>Send</span>
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  )
}

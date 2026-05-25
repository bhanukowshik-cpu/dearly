import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import AnimatedGlyphText from '../WritingScreen/AnimatedGlyphText'
import PaperCanvas from '../WritingScreen/PaperCanvas'
import VideoBackground from '../VideoBackground/VideoBackground'
import styles from './LoadingScreen.module.css'

// Reference letters exported from the editor, inlined as static modules.
// Each JSON contains the full PaperCanvas state (paperConfig, message,
// stickers, mediaFrames with base64 images, voiceNotes with base64 audio,
// strokes, etc.) — so each slide renders through the same component the
// editor uses, no manual reconstruction. Order matters: Priya (conference)
// → Marcus (manager) → Mai (friend). Builds emotional arc from professional
// acquaintance → important boss → oldest friend.
import priyaLetter   from '../../data/loadingLetters/priya.json'
import marcusLetter  from '../../data/loadingLetters/marcus.json'
import maiLetter     from '../../data/loadingLetters/mai.json'

function IconArrow() {
  return (
    <svg width="26" height="13" viewBox="0 0 29 15" fill="none" aria-hidden>
      <path
        d="M23.639 4.87137L5.72378 5.28607L0.668197 5.40637C-0.221121 5.42536 -0.224343 6.78343 0.668197 6.76444L18.5867 6.34657L23.639 6.23577C24.5283 6.20728 24.5316 4.84921 23.639 4.87137ZM28.6592 4.80489C25.495 3.34236 22.3867 1.77113 19.3342 0.0912199C18.5609 -0.336145 17.8617 0.854144 18.6382 1.26568C21.4028 2.78942 24.2126 4.2203 27.0674 5.55832C24.1864 8.08249 21.5934 10.907 19.3342 13.9821C19.2433 14.1383 19.2183 14.3233 19.2647 14.4973C19.3111 14.6713 19.4251 14.8205 19.5823 14.9129C19.7413 14.9996 19.9283 15.0226 20.1042 14.9772C20.2801 14.9318 20.4313 14.8214 20.5264 14.6691C22.9212 11.4258 25.6987 8.47276 28.8009 5.87172C28.8748 5.79773 28.9306 5.70821 28.964 5.60993C28.9975 5.51166 29.0078 5.40719 28.9941 5.30443C28.9805 5.20167 28.9432 5.1033 28.8852 5.01676C28.8272 4.93022 28.7499 4.85777 28.6592 4.80489Z"
        fill="currentColor"
      />
    </svg>
  )
}

// Static check — stable across renders, also safe for SSR
const reducedMotion =
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

// ─── Hero animation pacing ─────────────────────────────────────────────────
// "Dearly," is fewer chars but huge → slower pacing reads as deliberate
// signature writing rather than hurried scribbling. The per-stroke draw
// inside each glyph is independently slowed by strokeSpeedMultiplier=0.5
// on the AnimatedGlyphText call below.
const PACE_HERO = 360   // ≈ 7 chars × 360ms ≈ 2.5s

// ─── Responsive pixel sizes for the hero ──────────────────────────────────
// AnimatedGlyphText routes these through getScaledMetricsForPx, which gives
// real per-glyph advance widths from the typography metadata (instead of the
// legacy em-based fallback that produces the gappy "D e a r l y" look).
const HERO_PX = { mobile: 56, tablet: 70, desktop: 82 }

// ─── Carousel slides ──────────────────────────────────────────────────────
// Each slide is a real exported letter rendered through PaperCanvas. The
// eyebrow label sits above the paper as a one-line scenario header so the
// viewer instantly knows who the note is for. label is purely UI copy;
// it's not stored in the JSON itself.
const SLIDES = [
  { id: 'priya',   eyebrow: 'A note to someone you just met',  data: priyaLetter   },
  { id: 'marcus',  eyebrow: 'A thank-you to your manager',     data: marcusLetter  },
  { id: 'mai',     eyebrow: 'A voice memo for your best friend', data: maiLetter   },
]

const SLIDE_INTERVAL_MS = 5000

export default function LoadingScreen({ onCta = () => {} }) {
  // Sequencing:
  //   writeStarted → kicks off "Dearly," hero
  //   writeDone    → carousel + CTA mount
  //   slideIdx     → which letter is showing right now (0..SLIDES.length-1)
  const [writeStarted, setWriteStarted] = useState(reducedMotion)
  const [writeDone,    setWriteDone]    = useState(reducedMotion)
  const [ctaVisible,   setCtaVisible]   = useState(false)
  const [slideIdx,     setSlideIdx]     = useState(0)

  // Kick off the Dearly, handwriting after a beat (skip if reduced motion)
  useEffect(() => {
    if (reducedMotion) return
    const id = setTimeout(() => setWriteStarted(true), 350)
    return () => clearTimeout(id)
  }, [])

  // Safety floor — if AnimatedGlyphText's onComplete is delayed (e.g. a
  // missing glyph stalls the per-stroke draw) force writeDone so the card
  // still appears. Length-aware: 7 chars × PACE_HERO (360ms) ≈ 2.5s, plus
  // ~1s for the final char's slowed stroke draw + buffer. Bumped to 6s
  // to give the 2× slowdown its full runtime before forcing the gate.
  useEffect(() => {
    if (reducedMotion || writeDone) return
    const id = setTimeout(() => setWriteDone(true), 6000)
    return () => clearTimeout(id)
  }, [writeDone])

  // After writeDone → reveal the CTA + meta (and, eventually, the carousel)
  useEffect(() => {
    if (!writeDone) return
    const delay = reducedMotion ? 80 : 480
    const id = setTimeout(() => setCtaVisible(true), delay)
    return () => clearTimeout(id)
  }, [writeDone])

  // Carousel auto-rotation. Pauses entirely under reduced-motion so the
  // user isn't dragged through animations they explicitly opted out of.
  // Resets the interval when slideIdx changes from a manual dot-click so
  // the user always gets the full 5 s on whatever they just selected.
  useEffect(() => {
    if (reducedMotion || !ctaVisible || SLIDES.length <= 1) return
    const id = setInterval(() => {
      setSlideIdx(i => (i + 1) % SLIDES.length)
    }, SLIDE_INTERVAL_MS)
    return () => clearInterval(id)
  }, [ctaVisible, slideIdx])

  return (
    <div className={styles.root}>

      {/* ── Background ─────────────────────────────────────────────────── */}
      <VideoBackground />
      <div className={styles.bgBlur}  aria-hidden />
      <div className={styles.bgTint}  aria-hidden />
      <div className={styles.bgNoise} aria-hidden />

      {/* ── Hero — starts centered, slides up when card appears ────────── */}
      <motion.div
        layout="position"
        className={styles.hero}
        transition={{ layout: { duration: reducedMotion ? 0 : 0.72, ease: [0.22, 1, 0.36, 1] } }}
      >
        <div className={styles.heroTitle}>
          {writeStarted && (
            <AnimatedGlyphText
              text="Dearly,"
              fontSizePx={HERO_PX}
              lineHeightMultiplier={1.05}
              fontWeight={700}
              inkColor="#ffffff"
              msPerChar={PACE_HERO}
              strokeSpeedMultiplier={0.5}
              typewriter={!reducedMotion}
              onComplete={() => setWriteDone(true)}
            />
          )}
        </div>

        <motion.p
          className={styles.heroSub}
          initial={{ opacity: 0, y: reducedMotion ? 0 : 14 }}
          animate={{ opacity: writeDone ? 1 : 0, y: writeDone ? 0 : 14 }}
          transition={{ duration: 0.6, ease: 'easeOut', delay: writeDone ? 0.1 : 0 }}
        >
          Letters people actually keep.
        </motion.p>
      </motion.div>

      {/* ── Carousel: real letters rendered via PaperCanvas ─────────────
         Each slide loads a JSON export of a complete letter and feeds it
         straight into PaperCanvas as props — same component the editor
         uses, so what you see here is exactly what the user will design.
         Auto-rotates every 5 s; the dot indicators below let you jump. */}
      {ctaVisible && (
        <motion.div
          className={styles.carousel}
          initial={{ opacity: 0, y: reducedMotion ? 0 : 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={SLIDES[slideIdx].id}
              className={styles.slide}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className={styles.slideEyebrow}>{SLIDES[slideIdx].eyebrow}</div>
              <div className={styles.slidePaperWrap}>
                <PaperCanvas
                  recipient={SLIDES[slideIdx].data.recipient ?? ''}
                  message={SLIDES[slideIdx].data.message ?? ''}
                  senderName={SLIDES[slideIdx].data.senderName ?? ''}
                  showRecipient={SLIDES[slideIdx].data.showRecipient ?? false}
                  paperConfig={SLIDES[slideIdx].data.paperConfig}
                  stickers={SLIDES[slideIdx].data.stickers ?? []}
                  mediaFrames={SLIDES[slideIdx].data.mediaFrames ?? []}
                  voiceNotes={SLIDES[slideIdx].data.voiceNotes ?? []}
                  strokes={SLIDES[slideIdx].data.strokes ?? []}
                  textSize={SLIDES[slideIdx].data.textSize ?? 'md'}
                />
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Dot indicators — click to jump, also reflect auto-rotation */}
          <div className={styles.slideDots} role="tablist" aria-label="Choose a scenario">
            {SLIDES.map((s, i) => (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={i === slideIdx}
                aria-label={s.eyebrow}
                className={`${styles.slideDot} ${i === slideIdx ? styles.slideDotActive : ''}`}
                onClick={() => setSlideIdx(i)}
              />
            ))}
          </div>
        </motion.div>
      )}

      {/* ── CTA + meta ────────────────────────────────────────────────── */}
      {ctaVisible && (
        <>
          <motion.button
            className={styles.cta}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, ease: 'easeOut', delay: 0.2 }}
            onClick={onCta}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
          >
            <span className={styles.ctaLabel}>
              Write a Memorable Note <IconArrow />
            </span>
          </motion.button>

          <motion.p
            className={styles.meta}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.4 }}
          >
            No signup required / free to use
          </motion.p>
        </>
      )}

      {/* (The "A product by The Thoughtful Designer" credit pill used to
         sit here. Removed for now — the postcard already signs off as
         Bhanu Kowshik, which carries the personal attribution. If a
         real signature/handle is added later, this is where it'd go.) */}

    </div>
  )
}

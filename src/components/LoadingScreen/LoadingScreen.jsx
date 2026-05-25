import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import AnimatedGlyphText from '../WritingScreen/AnimatedGlyphText'
import VideoBackground from '../VideoBackground/VideoBackground'
import styles from './LoadingScreen.module.css'

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
// Placeholder for the use-case carousel — the user is designing the four
// reference letters (Partner / Friend / Manager / Client) in the writing
// editor and will send screenshots. Once those arrive, this constant + the
// rendering JSX below will be rebuilt to match each design 1:1.
// Until then the postcard area is intentionally omitted from the layout
// so the loading screen reads as clean (hero → CTA → meta) instead of
// half-finished. The carousel CSS classes are kept in the stylesheet so
// the rebuild is purely a JSX/data swap, not a styling exercise.

export default function LoadingScreen({ onCta = () => {} }) {
  // Sequencing:
  //   writeStarted → kicks off "Dearly," hero
  //   writeDone    → CTA + meta mount
  // (The postcard carousel will land between heroSub and CTA once the
  //  designed references are ready; gated by its own state when added.)
  const [writeStarted, setWriteStarted] = useState(reducedMotion)
  const [writeDone,    setWriteDone]    = useState(reducedMotion)
  const [ctaVisible,   setCtaVisible]   = useState(false)

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

  // (Carousel auto-rotation effect removed alongside the placeholder
  // carousel JSX. Will return when the real designed letters land.)

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

      {/* ── CTA + meta ────────────────────────────────────────────────────
         Card/carousel slot intentionally omitted — pending the four real
         designed letters (Partner / Friend / Manager / Client) coming
         back from the editor as screenshots. The carousel JSX + state +
         auto-rotation effect will be reintroduced once those land.
         Until then, the screen is clean: hero → tagline → CTA → meta. */}
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

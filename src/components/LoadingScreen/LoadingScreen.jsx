import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import AnimatedGlyphText from '../WritingScreen/AnimatedGlyphText'
import { StarCluster } from '../WritingScreen/handDrawnStickers'
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

function CardSticker({ children, style }) {
  return (
    <div aria-hidden style={{ position: 'absolute', pointerEvents: 'none', userSelect: 'none', ...style }}>
      {children}
    </div>
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

// ─── Use-case carousel slides ──────────────────────────────────────────────
// Each slide pitches a single recipient persona — Dearly handles all of them.
// Rotating one persona at a time keeps the value prop concrete instead of a
// generic "send notes to people" abstraction.
//
// Images are loaded from Unsplash's CDN with format/size/quality params so
// they ship tight (~30–60 KB each) and decode fast. No API key required —
// `images.unsplash.com/photo-{id}` is a public CDN path.
//
// Replace any photo by swapping just the URL. The `eyebrow` reads like a
// labelled scenario ("To my partner") and the `note` is the brand-voice
// handwritten one-liner that follows.
const SLIDES = [
  {
    id:      'partner',
    image:   'https://images.unsplash.com/photo-1522098635833-216c403d3cbe?auto=format&fit=crop&w=720&q=80',
    alt:     'A couple walking together at golden hour',
    eyebrow: 'To my partner',
    note:    "I love the way you laugh at your own jokes before the punchline lands. ♡",
  },
  {
    id:      'friend',
    image:   'https://images.unsplash.com/photo-1529068755536-a5ade0dcb4e8?auto=format&fit=crop&w=720&q=80',
    alt:     'Two friends laughing on a sunny street',
    eyebrow: 'To my oldest friend',
    note:    "Eighteen years of being weird together and counting. Happy birthday, legend.",
  },
  {
    id:      'manager',
    image:   'https://images.unsplash.com/photo-1573164713988-8665fc963095?auto=format&fit=crop&w=720&q=80',
    alt:     'A mentor and mentee in a thoughtful conversation',
    eyebrow: 'To my manager',
    note:    "Thank you for taking a chance on me last spring. It changed everything.",
  },
  {
    id:      'client',
    image:   'https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=720&q=80',
    alt:     'A handshake at a design conference',
    eyebrow: 'To Priya, from Lisbon',
    note:    "Loved our chat at the design summit. Don't be a stranger — coffee soon?",
  },
]
const SLIDE_INTERVAL_MS = 5000

export default function LoadingScreen({ onCta = () => {} }) {
  // Sequencing:
  //   writeStarted → kicks off "Dearly," hero
  //   writeDone    → card + CTA mount
  //   slideIdx     → which carousel slide is showing right now
  const [writeStarted, setWriteStarted] = useState(reducedMotion)
  const [writeDone,    setWriteDone]    = useState(reducedMotion)
  const [cardVisible,  setCardVisible]  = useState(false)
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

  // After writeDone → reveal the card
  useEffect(() => {
    if (!writeDone) return
    const delay = reducedMotion ? 80 : 480
    const id = setTimeout(() => setCardVisible(true), delay)
    return () => clearTimeout(id)
  }, [writeDone])

  // Carousel auto-rotation. Pauses entirely under reduced-motion (the user
  // explicitly opted out of decorative motion). Pauses while the tab is
  // backgrounded so we don't burn the queue silently. Manually clicking a
  // dot just sets slideIdx — the interval restarts from the new position.
  useEffect(() => {
    if (reducedMotion || !cardVisible) return
    const id = setInterval(() => {
      setSlideIdx(i => (i + 1) % SLIDES.length)
    }, SLIDE_INTERVAL_MS)
    return () => clearInterval(id)
  }, [cardVisible, slideIdx])

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

      {/* ── Card + CTA — only mount when ready so hero is truly centered ── */}
      {cardVisible && (
        <>
          <motion.article
            className={styles.card}
            initial={{ opacity: 0, y: reducedMotion ? 0 : 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className={styles.stains} aria-hidden />

            <CardSticker style={{ top: 8, right: 10, width: 62, transform: 'rotate(14deg)', opacity: 0.85 }}>
              <StarCluster />
            </CardSticker>

            {/* ── Carousel — image left, handwritten note right ─────────
               Each slide is a single beat: who the note is for + what to
               write. We render only the current slide (AnimatePresence
               handles the cross-fade) so old image elements unmount and
               release decoded bitmaps. */}
            <div className={styles.carousel}>
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={SLIDES[slideIdx].id}
                  className={styles.slide}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                >
                  <div className={styles.slideImageWrap}>
                    <img
                      src={SLIDES[slideIdx].image}
                      alt={SLIDES[slideIdx].alt}
                      className={styles.slideImage}
                      loading="eager"
                      decoding="async"
                    />
                  </div>
                  <div className={styles.slideNote}>
                    <div className={styles.slideEyebrow}>{SLIDES[slideIdx].eyebrow}</div>
                    <p className={styles.slideText}>{SLIDES[slideIdx].note}</p>
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Dot indicators — click to jump, also reflect auto-rotation */}
            <div className={styles.slideDots} role="tablist" aria-label="Choose a use case">
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
          </motion.article>

          {/* ── CTA — solid white pill, matches Share-note primary action ── */}
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

      {/* ── Designer credit — fixed pill at bottom-center ────────────────────
         Sits inside .root (not portaled) so it inherits the screen's stacking
         context — guaranteed below any modals/toasts the parent app mounts,
         but above the background layers. Fixed positioning keeps it pinned
         to the viewport bottom regardless of card length, so it stays put
         even on tall content / scrolled views. */}
      <motion.div
        className={styles.designerCredit}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut', delay: reducedMotion ? 0 : 0.8 }}
        aria-label="A product by The Thoughtful Designer"
      >
        <span className={styles.designerCreditLabel}>A product by</span>
        <span className={styles.designerCreditName}>The Thoughtful Designer</span>
      </motion.div>

    </div>
  )
}

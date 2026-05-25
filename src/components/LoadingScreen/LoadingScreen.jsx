import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import AnimatedGlyphText from '../WritingScreen/AnimatedGlyphText'
import VideoBackground from '../VideoBackground/VideoBackground'
import styles from './LoadingScreen.module.css'

// Pre-rendered letter PNGs exported from the editor at 3× DPI. Using static
// images here (instead of live PaperCanvas + ScaledPaper) sidesteps every
// layout-drift problem we hit with the dynamic approach: text doesn't reflow
// at carousel size, photos and stickers stay in their designed positions
// pixel-perfect, the glyph stroke animation doesn't re-fire on every slide
// change, and the carousel is naturally responsive via plain CSS (width:
// 100% + object-fit: contain). What you designed is what you see.
import priyaLetterPng  from '../../assets/loadingLetters/priya.png'
import marcusLetterPng from '../../assets/loadingLetters/marcus.png'
import maiLetterPng    from '../../assets/loadingLetters/mai.png'

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
// real per-glyph advance widths from the typography metadata.
const HERO_PX = { mobile: 56, tablet: 70, desktop: 82 }

// ─── Carousel slides ──────────────────────────────────────────────────────
// Each slide bundles a pre-rendered letter image + a recipient's-reply
// banner that sits beneath it. The image is the design FROZEN at editor
// resolution; the carousel just `<img>` tags scale it via CSS. The reply
// closes the conversational loop so each slide reads as one exchange.
// `aspect` matches the PNG's natural ratio so the layout reserves the
// right vertical space before the image loads (no jump on first paint).
const SLIDES = [
  {
    id:        'priya',
    eyebrow:   'A note to someone you just met',
    img:       priyaLetterPng,
    aspect:    '1520 / 1014',        // postcard 3:2
    alt:       'A handwritten postcard to Priya, met at a design conference',
    replyFrom: 'Priya',
    replyRole: 'contact you met at a conference',
    reply:     "Great catching up! Coffee next time you're in town. ✨",
  },
  {
    id:        'marcus',
    eyebrow:   'A thank-you to your manager',
    img:       marcusLetterPng,
    aspect:    '1520 / 1014',        // postcard 3:2
    alt:       'A handwritten postcard thanking Marcus for his mentorship',
    replyFrom: 'Marcus',
    replyRole: 'manager',
    reply:     "Made my day. You're one of the kindest folks I've worked with. 💛",
  },
  {
    id:        'mai',
    eyebrow:   'A voice memo for your best friend',
    img:       maiLetterPng,
    aspect:    '1520 / 380',         // strip 4:1
    alt:       'A paper strip with a voice note for Mai, an old friend',
    replyFrom: 'Mai',
    replyRole: 'best friend',
    reply:     "Crying. Calling you in five. 💌",
  },
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
  // missing glyph stalls the per-stroke draw) force writeDone so the
  // carousel still appears after a generous timeout.
  useEffect(() => {
    if (reducedMotion || writeDone) return
    const id = setTimeout(() => setWriteDone(true), 6000)
    return () => clearTimeout(id)
  }, [writeDone])

  // After writeDone → reveal the CTA + carousel
  useEffect(() => {
    if (!writeDone) return
    const delay = reducedMotion ? 80 : 480
    const id = setTimeout(() => setCtaVisible(true), delay)
    return () => clearTimeout(id)
  }, [writeDone])

  // Carousel auto-rotation. Pauses entirely under reduced-motion (the user
  // explicitly opted out of decorative motion). Resets the interval whenever
  // slideIdx changes from a manual dot-click so the user always gets the
  // full 5s on whatever they just selected.
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

      {/* ── Hero — starts centered, slides up when carousel appears ────── */}
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

      {/* ── Carousel: pre-rendered letter images ─────────────────────────
         Each slide is a static PNG exported from the editor at 3× DPI.
         No live PaperCanvas, no scaling math, no glyph re-animation —
         just an <img>. The aspect-ratio attribute reserves vertical space
         per slide so the layout doesn't jump when a postcard (3:2)
         transitions to a strip (4:1) and vice versa. */}
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
              <img
                src={SLIDES[slideIdx].img}
                alt={SLIDES[slideIdx].alt}
                className={styles.slideImage}
                style={{ aspectRatio: SLIDES[slideIdx].aspect }}
                /* eager: the first slide should be visible the moment the
                   carousel mounts; the other two are pre-loaded via the
                   browser's normal img preload as they come up */
                loading="eager"
                decoding="async"
                draggable={false}
              />

              {/* Reply banner — recipient's response with emoji, beneath
                  the letter. Closes the conversational loop. */}
              <div className={styles.slideMeta}>
                <div className={styles.replyBanner}>
                  <div className={styles.replyHeader}>
                    <span className={styles.replyName}>{SLIDES[slideIdx].replyFrom}</span>
                    <span className={styles.replyRole}>({SLIDES[slideIdx].replyRole})</span>
                  </div>
                  <span className={styles.replyText}>{SLIDES[slideIdx].reply}</span>
                </div>
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
            {/* Hand-drawn crooked SVG fill, mirroring the writing-screen
                Share-note button so the landing CTA visually belongs to
                the same brand chrome family. Caveat label on top. */}
            <svg
              className={styles.ctaBg}
              viewBox="0 0 340 62"
              preserveAspectRatio="none"
              fill="none"
              aria-hidden
            >
              <path
                d="M 14,8 C 95,4 245,5 326,8 C 330,22 331,40 326,54 C 245,58 95,57 14,54 C 10,40 10,22 14,8 Z"
                fill="white"
              />
            </svg>
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

    </div>
  )
}

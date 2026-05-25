import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
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

// ─── Animation pacing (ms per character) ───────────────────────────────────
// Hero "Dearly," is fewer chars but bigger → slower pacing reads as
// deliberate signature writing. Body text is longer; medium pacing keeps
// the total reveal under ~12s without feeling rushed. The actual SVG-stroke
// draw animation overlaps with the next character's reveal, so the smaller
// these numbers, the more "fluid pen" the handwriting feels.
const PACE_HERO     = 180   // "Dearly," ≈ 7 chars × 180ms ≈ 1.25s
const PACE_GREETING = 110   // "Hi there," ≈ 9 chars × 110ms ≈ 1s
const PACE_BODY     = 38    // long paragraphs need to feel briskly written

// Body copy lifted from the previous Caveat paragraphs, flattened to plain
// strings so the glyph animator can stream them char-by-char. Inline rich
// markup (bold/highlight) is intentionally dropped on the launch screen —
// the handwriting itself is the emphasis here.
const BODY_LINE_1 = "My name is Bhanu — I obsess over making experiences more personal and delightful."
const BODY_LINE_2 = "I built Dearly for moments that deserve more than a text. Send someone who matters a note they'll actually keep."
const BODY_LINE_3 = "With passion, Bhanu Kowshik"

export default function LoadingScreen({ onCta = () => {} }) {
  // Sequencing — each milestone gates the next so writes never overlap.
  //   writeStarted → kicks off "Dearly," hero
  //   writeDone    → card slides in
  //   cardVisible  → "Hi there," greeting writes
  //   greetingDone → body paragraphs write in sequence
  const [writeStarted,  setWriteStarted]  = useState(reducedMotion)
  const [writeDone,     setWriteDone]     = useState(reducedMotion)
  const [cardVisible,   setCardVisible]   = useState(false)
  const [greetingDone,  setGreetingDone]  = useState(reducedMotion)
  const [bodyStage,     setBodyStage]     = useState(reducedMotion ? 3 : 0) // 0..3 chained reveals

  // Kick off the Dearly, handwriting after a beat (skip if reduced motion)
  useEffect(() => {
    if (reducedMotion) return
    const id = setTimeout(() => setWriteStarted(true), 350)
    return () => clearTimeout(id)
  }, [])

  // After writeDone → reveal the card
  useEffect(() => {
    if (!writeDone) return
    const delay = reducedMotion ? 80 : 480
    const id = setTimeout(() => setCardVisible(true), delay)
    return () => clearTimeout(id)
  }, [writeDone])

  // In reduced-motion mode, mark greeting + body fully revealed once the
  // card appears so there's no animation to wait on.
  useEffect(() => {
    if (!reducedMotion || !cardVisible) return
    setGreetingDone(true)
    setBodyStage(3)
  }, [cardVisible])

  // Chain body paragraphs one after another, each waiting for the previous
  // to land. Without chaining, three long lines would all stream at once
  // and the effect collapses into typographic noise.
  useEffect(() => {
    if (!greetingDone || reducedMotion) return
    // Body line 1 starts immediately after greeting
    setBodyStage(1)
  }, [greetingDone])

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
              fontSize="clamp(52px, 7vw, 82px)"
              fontWeight={700}
              inkColor="#ffffff"
              msPerChar={PACE_HERO}
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

            <div className={styles.letterWrap}>
              <div className={styles.letter}>

                {/* Greeting — handwritten via SVG glyph animation */}
                <div className={styles.greeting}>
                  <AnimatedGlyphText
                    text="Hi there,"
                    fontSize="clamp(24px, 3.2vw, 34px)"
                    fontWeight={700}
                    inkColor="#1A2A3A"
                    msPerChar={PACE_GREETING}
                    typewriter={!reducedMotion}
                    onComplete={() => setGreetingDone(true)}
                  />
                </div>

                {/* Body — same glyph animation, chained line-by-line */}
                {bodyStage >= 1 && (
                  <p className={styles.para}>
                    <AnimatedGlyphText
                      text={BODY_LINE_1}
                      fontSize="clamp(15px, 1.55vw, 19px)"
                      fontWeight={700}
                      inkColor="#1A2A3A"
                      msPerChar={PACE_BODY}
                      typewriter={!reducedMotion}
                      onComplete={() => setBodyStage(s => Math.max(s, 2))}
                    />
                  </p>
                )}

                {bodyStage >= 2 && (
                  <p className={styles.para}>
                    <AnimatedGlyphText
                      text={BODY_LINE_2}
                      fontSize="clamp(15px, 1.55vw, 19px)"
                      fontWeight={700}
                      inkColor="#1A2A3A"
                      msPerChar={PACE_BODY}
                      typewriter={!reducedMotion}
                      onComplete={() => setBodyStage(s => Math.max(s, 3))}
                    />
                  </p>
                )}

                {bodyStage >= 3 && (
                  <p className={styles.closing}>
                    <AnimatedGlyphText
                      text={BODY_LINE_3}
                      fontSize="clamp(15px, 1.55vw, 19px)"
                      fontWeight={700}
                      inkColor="#1A2A3A"
                      msPerChar={PACE_BODY}
                      typewriter={!reducedMotion}
                    />
                  </p>
                )}

              </div>
            </div>
          </motion.article>

          {/* ── CTA ──────────────────────────────────────────────────────── */}
          <motion.button
            className={styles.cta}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, ease: 'easeOut', delay: 0.2 }}
            onClick={onCta}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
          >
            <svg className={styles.ctaBorder} viewBox="0 0 340 62" fill="none" aria-hidden>
              <path d="M 14,7  C 113,5  227,5  326,8"  stroke="rgba(255,255,255,0.88)" strokeWidth="2" strokeLinecap="round"/>
              <path d="M 326,8 C 328,24 328,40 326,56" stroke="rgba(255,255,255,0.88)" strokeWidth="2" strokeLinecap="round"/>
              <path d="M 326,56 C 227,58 113,58 14,56" stroke="rgba(255,255,255,0.88)" strokeWidth="2" strokeLinecap="round"/>
              <path d="M 14,56 C 12,40 12,24 14,7"     stroke="rgba(255,255,255,0.88)" strokeWidth="2" strokeLinecap="round"/>
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

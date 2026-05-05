import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { TegakiRenderer } from 'tegaki/react'
import { font } from '../../lib/tegakiFont'
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

export default function LoadingScreen({ onCta = () => {} }) {
  const [writeStarted, setWriteStarted] = useState(false)
  const [writeDone,    setWriteDone]    = useState(false)
  const [cardVisible,  setCardVisible]  = useState(false)
  const [greetingDone, setGreetingDone] = useState(false)

  // Kick off the Dearly, handwriting after a beat
  useEffect(() => {
    const id = setTimeout(() => setWriteStarted(true), 350)
    return () => clearTimeout(id)
  }, [])

  // After Dearly, is done → reveal the card at full height
  useEffect(() => {
    if (!writeDone) return
    const id = setTimeout(() => setCardVisible(true), 480)
    return () => clearTimeout(id)
  }, [writeDone])

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
        transition={{ layout: { duration: 0.72, ease: [0.22, 1, 0.36, 1] } }}
      >
        <div className={styles.heroTitle}>
          {writeStarted && (
            <TegakiRenderer
              font={font}
              onComplete={() => setWriteDone(true)}
              time={{ mode: 'uncontrolled', duration: 1.5 }}
              style={{
                fontSize:   'clamp(52px, 7vw, 82px)',
                color:      '#ffffff',
                fontWeight: 700,
                whiteSpace: 'nowrap',
                lineHeight: 1,
                willChange: 'transform',
              }}
            >
              Dearly,
            </TegakiRenderer>
          )}
        </div>

        <motion.p
          className={styles.heroSub}
          initial={{ opacity: 0, y: 14 }}
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
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className={styles.stains} aria-hidden />

            <CardSticker style={{ top: 8, right: 10, width: 62, transform: 'rotate(14deg)', opacity: 0.85 }}>
              <StarCluster />
            </CardSticker>

            <div className={styles.letterWrap}>
              <div className={styles.letter}>

                {/* Greeting — starts drawing immediately on mount */}
                <div className={styles.greeting}>
                  <TegakiRenderer
                    font={font}
                    onComplete={() => setGreetingDone(true)}
                    time={{ mode: 'uncontrolled', duration: 0.8 }}
                    style={{
                      fontSize:   'clamp(24px, 3.2vw, 34px)',
                      color:      '#1A2A3A',
                      fontWeight: 700,
                      whiteSpace: 'nowrap',
                      lineHeight: 1,
                    }}
                  >
                    Hi there,
                  </TegakiRenderer>
                </div>

                {/* Body text — always in DOM for full height, fades in after greeting */}
                <motion.p
                  className={styles.para}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: greetingDone ? 1 : 0, y: greetingDone ? 0 : 10 }}
                  transition={{ duration: 0.45, ease: 'easeOut', delay: greetingDone ? 0 : 0 }}
                >
                  <strong>My name is Bhanu</strong> — I obsess over making experiences{' '}
                  <mark className={styles.highlightBlue}>more personal</mark> and delightful. ✨
                </motion.p>

                <motion.p
                  className={styles.para}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: greetingDone ? 1 : 0, y: greetingDone ? 0 : 10 }}
                  transition={{ duration: 0.45, ease: 'easeOut', delay: greetingDone ? 0.11 : 0 }}
                >
                  I built Dearly for moments that deserve more than a text.{' '}
                  Send someone who matters a note they'll actually keep. 💌
                </motion.p>

                <motion.p
                  className={styles.closing}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: greetingDone ? 1 : 0, y: greetingDone ? 0 : 10 }}
                  transition={{ duration: 0.45, ease: 'easeOut', delay: greetingDone ? 0.22 : 0 }}
                >
                  With passion,<br />Bhanu Kowshik
                </motion.p>

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

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import styles from './LoadingScreen.module.css'

// Each video carries its own accent color so the CTA — and the active chip
// — can pick up the dominant tone of whatever sky/water is playing behind
// them. Picked once per mount via useRef so the accent stays stable while
// the active chip rotates underneath it.
//
// Served from /public/loops/ — pre-compressed H.264 at 720 p, CRF 28, no
// audio (background videos are muted anyway). Total ~13 MB across all 4
// (down from 80 MB at source) which is small enough to commit and ship
// from the same origin as the HTML. Result: video plays the moment the
// page renders, no remote-CDN handshake, no flash of empty background.
// The heavy blur(14px) filter applied in CSS hides any compression
// artifacts from the lower bitrate.
const NATURE_VIDEOS = [
  {
    url:    '/loops/Intro%20Updated.mp4',
    accent: '#4A8DC9',  // sky blue — matches the cloud/sky scene in this video
  },
  {
    url:    '/loops/Dreamy%20Evening.mp4',
    accent: '#6A78C4',  // dusk indigo
  },
  {
    url:    '/loops/Warm%20Clouds%202.mp4',
    accent: '#E89545',  // sunset orange
  },
  {
    url:    '/loops/Warm%20River%20Scenary%20Moving%201.mp4',
    accent: '#D49454',  // warm gold
  },
]

function IconArrow() {
  return (
    <svg width="28" height="14" viewBox="0 0 29 15" fill="none" aria-hidden>
      <path
        d="M23.639 4.87137L5.72378 5.28607L0.668197 5.40637C-0.221121 5.42536 -0.224343 6.78343 0.668197 6.76444L18.5867 6.34657L23.639 6.23577C24.5283 6.20728 24.5316 4.84921 23.639 4.87137ZM28.6592 4.80489C25.495 3.34236 22.3867 1.77113 19.3342 0.0912199C18.5609 -0.336145 17.8617 0.854144 18.6382 1.26568C21.4028 2.78942 24.2126 4.2203 27.0674 5.55832C24.1864 8.08249 21.5934 10.907 19.3342 13.9821C19.2433 14.1383 19.2183 14.3233 19.2647 14.4973C19.3111 14.6713 19.4251 14.8205 19.5823 14.9129C19.7413 14.9996 19.9283 15.0226 20.1042 14.9772C20.2801 14.9318 20.4313 14.8214 20.5264 14.6691C22.9212 11.4258 25.6987 8.47276 28.8009 5.87172C28.8748 5.79773 28.9306 5.70821 28.964 5.60993C28.9975 5.51166 29.0078 5.40719 28.9941 5.30443C28.9805 5.20167 28.9432 5.1033 28.8852 5.01676C28.8272 4.93022 28.7499 4.85777 28.6592 4.80489Z"
        fill="currentColor"
      />
    </svg>
  )
}

const reducedMotion =
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

// Pre-rendered letter assets. PNGs are the baseline; if an animated .gif
// with the same stem exists in the folder (dropped in via the dev
// Export-PNG button's auto-GIF path when the source note has a GIF) we
// prefer it so the carousel actually animates on the landing page,
// matching what the writer designed.
const letterPngs = import.meta.glob('../../assets/loadingLetters/*.png', { eager: true, import: 'default' })
const letterGifs = import.meta.glob('../../assets/loadingLetters/*.gif', { eager: true, import: 'default' })

function pickLetter(name) {
  return (
    letterGifs[`../../assets/loadingLetters/${name}.gif`] ||
    letterPngs[`../../assets/loadingLetters/${name}.png`]
  )
}

const priyaLetter  = pickLetter('priya')
const marcusLetter = pickLetter('marcus')
const maiLetter    = pickLetter('mai')

const SLIDES = [
  { id: 'manager',    audience: 'To your manager',    img: marcusLetter, aspect: '1520 / 1014' },
  { id: 'parents',    audience: 'To your parents',    img: priyaLetter,  aspect: '1520 / 1014' },
  { id: 'partner',    audience: 'To your partner',    img: maiLetter,    aspect: '1520 / 380'  },
  { id: 'client',     audience: 'To a client',        img: priyaLetter,  aspect: '1520 / 1014' },
  { id: 'connection', audience: 'To a connection',    img: marcusLetter, aspect: '1520 / 1014' },
  { id: 'friend',     audience: 'To your friend',     img: maiLetter,    aspect: '1520 / 380'  },
]

const SLIDE_INTERVAL_MS = 10000

export default function LoadingScreen({ onCta = () => {} }) {
  const [slideIdx, setSlideIdx] = useState(0)

  // Pick one video on first render. useRef so the random pick is stable —
  // a re-render from chip rotation must NOT pick a new video (the bg would
  // jump every 10s, which would be jarring).
  const videoRef = useRef(NATURE_VIDEOS[Math.floor(Math.random() * NATURE_VIDEOS.length)])
  const accent = videoRef.current.accent

  useEffect(() => {
    if (reducedMotion || SLIDES.length <= 1) return
    const id = setInterval(() => {
      setSlideIdx(i => (i + 1) % SLIDES.length)
    }, SLIDE_INTERVAL_MS)
    return () => clearInterval(id)
  }, [slideIdx])

  const current = SLIDES[slideIdx]

  return (
    <div className={styles.root}>

      <div className={styles.grid}>

        {/* ═══ LEFT PANEL ════════════════════════════════════════════════
            The --accent CSS variable here is read by the panel-bottom
            progress bar's fill, so the bar carries the same themed color
            as the CTA on the right (sunset → orange, dusk → indigo, etc).
            Single source of truth: NATURE_VIDEOS[i].accent.

            Slides in from -80 px on mount via a CSS keyframe (see
            `.leftPanel` animation in the stylesheet) — paired with the
            right panel sliding in from +80 px. Both animate together so
            the page "assembles" as a single composition, not in
            sequence. CSS rather than framer-motion because the latter
            stalled at 50 % under React.StrictMode's double-mount. */}
        <div
          className={styles.leftPanel}
          style={{ '--accent': accent }}
        >

          {/* preload="auto" — tell the browser to start downloading the
              full video as early as possible (default is "metadata" in
              many browsers, which waits until after first paint). The
              .leftPanel CSS background provides the instant fallback
              while bytes are in flight, and the video fades in via its
              own opacity transition once enough has buffered to play. */}
          <video
            className={styles.natureBg}
            autoPlay
            loop
            muted
            playsInline
            preload="auto"
            aria-hidden
            ref={el => { if (el) el.playbackRate = 0.75 }}
          >
            <source src={videoRef.current.url} type="video/mp4" />
          </video>
          <div className={styles.natureOverlay} aria-hidden />

          <div className={styles.letterSlot}>
            <AnimatePresence mode="wait" initial={false}>
              <motion.img
                key={current.id}
                src={current.img}
                alt={`A handwritten letter for ${current.audience}`}
                className={styles.letterImage}
                style={{ aspectRatio: current.aspect }}
                draggable={false}
                loading="eager"
                decoding="async"
                initial={{ opacity: 0, y: reducedMotion ? 0 : 18, rotate: -2.4 }}
                animate={{ opacity: 1, y: 0, rotate: -1.8 }}
                exit={{    opacity: 0, y: reducedMotion ? 0 : -10, rotate: -1.2 }}
                transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
              />
            </AnimatePresence>
          </div>

          {/* Bottom stack — intro sentence (carries the brand wordmark
              inside it) + audience chips. Grouped into one absolute-
              positioned column so the spacing between the sentence and
              the chips stays tight regardless of viewport height. */}
          <div className={styles.bottomStack}>
            <p className={styles.introSentence}>
              With <span className={styles.brandInline}>Dearly</span> you can write :
            </p>

            <div className={styles.chipRow}>
              {SLIDES.map((slide, i) => {
                const isActive = i === slideIdx
                return (
                  <button
                    key={slide.id}
                    type="button"
                    className={styles.chip}
                    data-active={isActive}
                    onClick={() => setSlideIdx(i)}
                  >
                    {slide.audience}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Single progress bar pinned to the panel's bottom edge — 3px
              tall, full width. Keyed by slideIdx so React remounts the
              fill on every chip change, resetting the keyframe cleanly. */}
          <div className={styles.panelProgress} aria-hidden>
            <div
              key={slideIdx}
              className={styles.panelProgressFill}
              style={{ animationDuration: `${SLIDE_INTERVAL_MS}ms` }}
            />
          </div>

        </div>

        {/* ═══ RIGHT PANEL ═══════════════════════════════════════════════
            Headline + CTA group are wrapped in a single .contentBlock so
            they share one column width (left + right edges aligned).
            Without this wrapper the headline wrapped to its natural 16ch
            text width while the CTA was a fixed 320px — visually
            unaligned across most viewports. Slides in from +80 px (CSS
            keyframe) to mirror the left panel's -80 px entry. */}
        <aside className={styles.rightPanel}>
          <div className={styles.contentBlock}>
          <p className={styles.serifCaption}>
            <em>Some words</em> deserve more than just&nbsp;a&nbsp;text.
          </p>

          {/* CTA + meta wrapped together so the meta line stays visually
              tethered to the button (10px below) instead of sitting at
              the rightPanel's 28px row gap. align-items: center on the
              wrapper places the meta under the CTA's center. */}
          <div className={styles.ctaGroup}>
            <button
              type="button"
              className={styles.cta}
              onClick={onCta}
              style={{ '--accent': accent }}
            >
              <svg
                className={styles.ctaBg}
                viewBox="0 0 340 62"
                preserveAspectRatio="none"
                fill="none"
                aria-hidden
              >
                <path
                  d="M 14,8 C 95,4 245,5 326,8 C 330,22 331,40 326,54 C 245,58 95,57 14,54 C 10,40 10,22 14,8 Z"
                  fill={accent}
                />
              </svg>
              <span className={styles.ctaLabel}>
                Write a Dearly Letter <IconArrow />
              </span>
            </button>

            <p className={styles.meta}>Free to use · No signups</p>
          </div>
          </div>
        </aside>

      </div>
    </div>
  )
}

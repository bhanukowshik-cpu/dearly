import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { TegakiRenderer } from 'tegaki/react'
import { font } from '../../lib/tegakiFont'
import VideoBackground from '../VideoBackground/VideoBackground'
import styles from './LaunchFilm.module.css'

const EASE = [0.22, 1, 0.36, 1]
const EASE_SOFT = [0.25, 0.46, 0.45, 0.94]

const caveatStyle = (size, color, weight = 700) => ({
  fontFamily: "'Caveat', cursive",
  fontSize: size,
  color,
  fontWeight: weight,
  lineHeight: 1,
  display: 'inline-block',
})

// ── Scene 01: Intro ───────────────────────────────────────────────────────────
function SceneIntro({ phase }) {
  const lines = [
    'Modern communication became\nincredibly efficient.',
    'But it stopped\nfeeling personal.',
  ]
  return (
    <motion.div
      className={styles.scene}
      exit={{ opacity: 0 }}
      transition={{ duration: 1.2, ease: 'easeInOut' }}
    >
      <div className={styles.introCenter}>
        <AnimatePresence mode="wait">
          <motion.p
            key={phase}
            className={`${styles.introText} ${phase === 2 ? styles.introTextEmphasis : ''}`}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 1.1, ease: EASE }}
          >
            {lines[phase - 1].split('\n').map((line, i) => (
              <span key={i}>{line}{i < lines[phase - 1].split('\n').length - 1 && <br />}</span>
            ))}
          </motion.p>
        </AnimatePresence>
      </div>
    </motion.div>
  )
}

// ── Scene 02: Writing Experience ──────────────────────────────────────────────
function SceneWriting() {
  const [greetingDone, setGreetingDone] = useState(false)
  const [greetingFailed, setGreetingFailed] = useState(false)
  const [noteVisible, setNoteVisible] = useState(false)
  const [inputText, setInputText] = useState('')
  const greetingFinished = useRef(false)
  const MSG_TYPED = "I've been thinking about you lately..."

  // Typing effect in input panel
  useEffect(() => {
    let i = 0
    const id = setInterval(() => {
      if (i < MSG_TYPED.length) setInputText(MSG_TYPED.slice(0, ++i))
      else clearInterval(id)
    }, 48)
    return () => clearInterval(id)
  }, [])

  // Safety: Caveat fallback if TegakiRenderer doesn't complete
  useEffect(() => {
    const id = setTimeout(() => {
      if (!greetingFinished.current) setGreetingFailed(true)
      setGreetingDone(true)
    }, 2200)
    return () => clearTimeout(id)
  }, [])

  useEffect(() => {
    if (!greetingDone) return
    const id = setTimeout(() => setNoteVisible(true), 350)
    return () => clearTimeout(id)
  }, [greetingDone])

  return (
    <motion.div
      className={styles.scene}
      exit={{ opacity: 0 }}
      transition={{ duration: 1.2, ease: 'easeInOut' }}
    >
      <div className={styles.writingLayout}>
        {/* Left: digital input side */}
        <motion.div
          className={styles.inputPanel}
          initial={{ opacity: 0, x: -24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 1.1, ease: EASE, delay: 0.25 }}
        >
          <div className={styles.inputLabel}>Write something meaningful</div>
          <div className={styles.inputArea}>
            <span className={styles.inputTyped}>{inputText}</span>
            <span className={styles.blinker} />
          </div>
        </motion.div>

        {/* Right: paper preview */}
        <motion.div
          className={styles.paperWrap}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 1.1, ease: EASE, delay: 0.45 }}
        >
          <div className={styles.paperCard}>
            <div className={styles.paperStains} aria-hidden />
            <div className={styles.paperGreeting}>
              {greetingFailed ? (
                <span style={caveatStyle('clamp(22px, 2.4vw, 30px)', '#1A2A3A')}>
                  Dear Alex,
                </span>
              ) : (
                <TegakiRenderer
                  font={font}
                  onComplete={() => { greetingFinished.current = true; setGreetingDone(true) }}
                  time={{ mode: 'uncontrolled', duration: 1.2 }}
                  style={{
                    fontSize: 'clamp(22px, 2.4vw, 30px)',
                    color: '#1A2A3A',
                    fontWeight: 700,
                    whiteSpace: 'nowrap',
                    lineHeight: 1,
                  }}
                >
                  Dear Alex,
                </TegakiRenderer>
              )}
            </div>
            <motion.p
              className={styles.paperNote}
              initial={{ opacity: 0 }}
              animate={{ opacity: noteVisible ? 1 : 0 }}
              transition={{ duration: 1.1, ease: 'easeOut' }}
            >
              {"I've been thinking about you lately —\nwanted you to know I care. 💌"}
            </motion.p>
          </div>
        </motion.div>
      </div>
    </motion.div>
  )
}

// ── Scene 03: Hero Envelope ───────────────────────────────────────────────────
function SceneHero({ phase }) {
  const isOpening = phase === 'opening'
  const isLetter  = phase === 'letter'
  const ease      = EASE_SOFT
  const panelBg   = '#F3E9D4'

  function panelAnimate(axis, deg) {
    if (isLetter)  return { [axis]: deg, opacity: 0 }
    if (isOpening) return { [axis]: deg, opacity: [1, 1, 0.35, 0] }
    return { [axis]: 0, opacity: 1 }
  }
  function panelTransition(delay) {
    if (isLetter)  return { duration: 0 }
    if (isOpening) return { duration: 0.52, ease, delay }
    return { duration: 0.04 }
  }

  return (
    <motion.div
      className={styles.scene}
      exit={{ opacity: 0 }}
      transition={{ duration: 1.2, ease: 'easeInOut' }}
    >
      <div className={styles.heroCenter}>
        <motion.div
          className={styles.filmEnvelopeOuter}
          animate={{ rotate: phase === 'envelope' ? -1.5 : 0 }}
          transition={{ duration: 0.44, ease }}
        >
          <motion.div
            animate={phase === 'envelope' ? {
              y: [0, -4, 4, -3, 3, 0],
              rotate: [0, -0.5, 0.5, -0.3, 0.3, 0],
            } : { y: 0, rotate: 0 }}
            transition={phase === 'envelope' ? {
              duration: 2.2, delay: 0.6,
              repeat: Infinity, repeatDelay: 3.5, ease: 'easeInOut',
            } : { duration: 0.3 }}
          >
            <div className={styles.filmEnvelope}>

              {/* Letter content — visible once open */}
              <div className={styles.filmLetterContent}>
                <div className={styles.filmLetterGreeting}>
                  <span style={caveatStyle('clamp(20px, 2.2vw, 28px)', '#1A2A3A')}>
                    Dear Friend,
                  </span>
                </div>
                <motion.p
                  className={styles.filmLetterHero}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: isLetter ? 1 : 0 }}
                  transition={{ duration: 1.6, ease: EASE, delay: isLetter ? 0.5 : 0 }}
                >
                  "Some words deserve to be felt,<br />not just read."
                </motion.p>
              </div>

              {/* Fold panels */}
              <motion.div
                className={`${styles.foldPanel} ${styles.foldPanelRight}`}
                style={{ background: `linear-gradient(160deg, color-mix(in srgb, ${panelBg} 80%, #fff) 0%, ${panelBg} 100%)` }}
                animate={panelAnimate('rotateY', -180)}
                transition={panelTransition(0.20)}
              />
              <motion.div
                className={`${styles.foldPanel} ${styles.foldPanelLeft}`}
                style={{ background: `linear-gradient(200deg, color-mix(in srgb, ${panelBg} 80%, #fff) 0%, ${panelBg} 100%)` }}
                animate={panelAnimate('rotateY', 180)}
                transition={panelTransition(0.52)}
              />
              <motion.div
                className={`${styles.foldPanel} ${styles.foldPanelTop}`}
                style={{ background: `linear-gradient(175deg, color-mix(in srgb, ${panelBg} 75%, #fff) 0%, ${panelBg} 100%)` }}
                animate={panelAnimate('rotateX', -180)}
                transition={panelTransition(1.02)}
              />
              <motion.div
                className={`${styles.foldPanel} ${styles.foldPanelBottom}`}
                style={{ background: `linear-gradient(5deg, color-mix(in srgb, ${panelBg} 75%, #fff) 0%, ${panelBg} 100%)` }}
                animate={panelAnimate('rotateX', 180)}
                transition={panelTransition(1.28)}
              />

              {/* Creases */}
              <motion.div
                className={styles.foldCreaseV}
                animate={{ opacity: (isOpening || isLetter) ? 0 : 1 }}
                transition={{ delay: isOpening ? 0.20 : 0, duration: 0.28 }}
              />
              <motion.div
                className={styles.foldCreaseH}
                animate={{ opacity: (isOpening || isLetter) ? 0 : 1 }}
                transition={{ delay: isOpening ? 1.02 : 0, duration: 0.28 }}
              />

              {/* Thread */}
              <motion.div
                className={styles.threadV}
                animate={{ opacity: phase === 'envelope' ? 1 : 0 }}
                transition={{ duration: 0.18 }}
              />

              {/* Knot */}
              <motion.div
                className={styles.knotContainer}
                animate={{ opacity: phase === 'envelope' ? 1 : 0 }}
                transition={{ duration: 0.22 }}
              >
                <svg className={styles.knotSvg} viewBox="0 0 600 80" preserveAspectRatio="xMidYMid meet" fill="none">
                  <defs>
                    <linearGradient id="lf-tL" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%"   stopColor="#8c6d3f" stopOpacity="0"/>
                      <stop offset="16%"  stopColor="#8c6d3f" stopOpacity="0.50"/>
                      <stop offset="100%" stopColor="#8c6d3f" stopOpacity="0.50"/>
                    </linearGradient>
                    <linearGradient id="lf-tR" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%"   stopColor="#8c6d3f" stopOpacity="0.50"/>
                      <stop offset="84%"  stopColor="#8c6d3f" stopOpacity="0.50"/>
                      <stop offset="100%" stopColor="#8c6d3f" stopOpacity="0"/>
                    </linearGradient>
                  </defs>
                  <line x1="0"   y1="40" x2="256" y2="40" stroke="url(#lf-tL)" strokeWidth="1.7" strokeLinecap="round"/>
                  <line x1="344" y1="40" x2="600" y2="40" stroke="url(#lf-tR)" strokeWidth="1.7" strokeLinecap="round"/>
                  <path d="M 294 42 C 276 22, 212 4, 190 19 C 176 30, 216 60, 294 42" fill="rgba(155,123,78,0.10)" stroke="#9b7b4e" strokeWidth="2" strokeLinecap="round" opacity="0.90"/>
                  <path d="M 306 42 C 324 22, 388 4, 410 19 C 424 30, 384 60, 306 42" fill="rgba(155,123,78,0.10)" stroke="#9b7b4e" strokeWidth="2" strokeLinecap="round" opacity="0.90"/>
                  <ellipse cx="300" cy="43.5" rx="14"  ry="9.5" fill="#3a2008" opacity="0.22"/>
                  <ellipse cx="300" cy="42"   rx="12"  ry="8.5" fill="#5c3d18" opacity="0.70"/>
                  <ellipse cx="300" cy="40.5" rx="9"   ry="6.5" fill="#9b7b4e" opacity="0.94"/>
                  <ellipse cx="300" cy="39.5" rx="5.5" ry="4"   fill="#c49558" opacity="0.86"/>
                  <ellipse cx="298.5" cy="38" rx="2.4" ry="1.8" fill="#e0c080" opacity="0.65"/>
                  <path d="M 290 51 C 281 65, 265 72, 260 80" stroke="#9b7b4e" strokeWidth="1.9" strokeLinecap="round" opacity="0.80"/>
                  <path d="M 310 51 C 319 65, 335 72, 340 80" stroke="#9b7b4e" strokeWidth="1.9" strokeLinecap="round" opacity="0.80"/>
                </svg>
              </motion.div>

            </div>
          </motion.div>
        </motion.div>
      </div>
    </motion.div>
  )
}

// ── Scene 04: Philosophy ──────────────────────────────────────────────────────
function ScenePhilosophy({ phase }) {
  const lines = [
    { text: 'No feeds.',           accent: false },
    { text: 'No notifications.',   accent: false },
    { text: 'Just words that matter.', accent: true },
  ]
  return (
    <motion.div
      className={styles.scene}
      exit={{ opacity: 0 }}
      transition={{ duration: 1.4, ease: 'easeInOut' }}
    >
      <div className={styles.philoCenter}>
        {lines.map(({ text, accent }, i) => (
          <motion.p
            key={text}
            className={`${styles.philoLine} ${accent ? styles.philoLineAccent : ''}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: phase > i ? 1 : 0, y: phase > i ? 0 : 10 }}
            transition={{ duration: 1.3, ease: EASE }}
          >
            {text}
          </motion.p>
        ))}
      </div>
    </motion.div>
  )
}

// ── Scene 05: End Card ────────────────────────────────────────────────────────
function SceneEndCard() {
  const [logoDone,   setLogoDone]   = useState(false)
  const [logoFailed, setLogoFailed] = useState(false)
  const [sub1On,     setSub1On]     = useState(false)
  const [sub2On,     setSub2On]     = useState(false)
  const logoFinished = useRef(false)

  // Safety timeout for TegakiRenderer
  useEffect(() => {
    const id = setTimeout(() => {
      if (!logoFinished.current) setLogoFailed(true)
      setLogoDone(true)
    }, 2600)
    return () => clearTimeout(id)
  }, [])

  useEffect(() => {
    if (!logoDone) return
    const t1 = setTimeout(() => setSub1On(true),  350)
    const t2 = setTimeout(() => setSub2On(true), 1050)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [logoDone])

  return (
    <motion.div
      className={styles.scene}
      exit={{ opacity: 0 }}
      transition={{ duration: 1.8, ease: 'easeInOut' }}
    >
      <div className={styles.endCenter}>
        <div className={styles.endLogo}>
          {logoFailed ? (
            <span style={caveatStyle('clamp(56px, 8vw, 96px)', '#ffffff')}>
              Dearly,
            </span>
          ) : (
            <TegakiRenderer
              font={font}
              onComplete={() => { logoFinished.current = true; setLogoDone(true) }}
              time={{ mode: 'uncontrolled', duration: 2.0 }}
              style={{
                fontSize:   'clamp(56px, 8vw, 96px)',
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
          className={styles.endSub}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: sub1On ? 1 : 0, y: sub1On ? 0 : 10 }}
          transition={{ duration: 1.0, ease: EASE }}
        >
          Handwritten digital notes.
        </motion.p>

        <motion.p
          className={styles.endUrl}
          initial={{ opacity: 0 }}
          animate={{ opacity: sub2On ? 1 : 0 }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
        >
          dearly-rho.vercel.app
        </motion.p>
      </div>
    </motion.div>
  )
}

// ── Root ──────────────────────────────────────────────────────────────────────
export default function LaunchFilm() {
  const [scene,      setScene]      = useState('intro')
  const [introPhase, setIntroPhase] = useState(1)
  const [heroPhase,  setHeroPhase]  = useState('envelope')
  const [philoPhase, setPhiloPhase] = useState(0)

  useEffect(() => {
    const timers = [
      // Intro phase 2 at 2.5s
      setTimeout(() => setIntroPhase(2), 2500),
      // Writing scene at 5s
      setTimeout(() => setScene('writing'), 5000),
      // Hero scene at 13s
      setTimeout(() => setScene('hero'), 13000),
      // Envelope opening at 15.5s
      setTimeout(() => setHeroPhase('opening'), 15500),
      // Letter reveal at 17.8s
      setTimeout(() => setHeroPhase('letter'), 17800),
      // Philosophy at 22s
      setTimeout(() => setScene('philosophy'), 22000),
      // Reveal lines
      setTimeout(() => setPhiloPhase(1), 23200),
      setTimeout(() => setPhiloPhase(2), 24800),
      setTimeout(() => setPhiloPhase(3), 26400),
      // End card at 28.5s
      setTimeout(() => setScene('endcard'), 28500),
    ]
    return () => timers.forEach(clearTimeout)
  }, [])

  return (
    <div className={styles.root}>
      {/* Persistent background layers — identical to LoadingScreen */}
      <VideoBackground />
      <div className={styles.bgBlur}  aria-hidden />
      <div className={styles.bgTint}  aria-hidden />
      <div className={styles.bgNoise} aria-hidden />

      {/* Cinematic darkening overlay — deepens for hero / philosophy / end card */}
      <motion.div
        className={styles.sceneOverlay}
        initial={{ opacity: 0 }}
        animate={{
          opacity:
            scene === 'endcard'    ? 0.72 :
            scene === 'philosophy' ? 0.62 :
            scene === 'hero'       ? 0.38 : 0,
        }}
        transition={{ duration: 2.2, ease: 'easeInOut' }}
      />

      <AnimatePresence>
        {scene === 'intro'      && <SceneIntro      key="intro"      phase={introPhase} />}
        {scene === 'writing'    && <SceneWriting    key="writing" />}
        {scene === 'hero'       && <SceneHero       key="hero"       phase={heroPhase} />}
        {scene === 'philosophy' && <ScenePhilosophy key="philosophy" phase={philoPhase} />}
        {scene === 'endcard'    && <SceneEndCard    key="endcard" />}
      </AnimatePresence>
    </div>
  )
}

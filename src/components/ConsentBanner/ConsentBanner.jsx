import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

/**
 * Cookie-consent toast (bottom-right).
 *
 * Analytics (Google Analytics / Microsoft Clarity) are NOT loaded on page
 * load — see the gating script in index.html. This toast is the only thing
 * that can turn them on:
 *
 *   • Accept  → store 'granted' + call window.__dearlyLoadAnalytics()
 *   • Decline → store 'denied'  (nothing loads)
 *
 * It only appears when:
 *   1. analytics is actually configured (a GA/Clarity id exists), and
 *   2. the visitor hasn't already made a choice.
 *
 * Clearing site storage brings it back, which is the documented way for a
 * user to change their mind (see Privacy Policy).
 *
 * Visual language mirrors the landing CTA: a hand-drawn "crooked" wobbly
 * pill (the same SVG path as LoadingScreen) for the primary Accept action,
 * and a Caveat text link for Decline.
 */
const STORAGE_KEY = 'dearly_cookie_consent'

// Same wobbly path the landing-page CTA uses, so the Accept button shares
// the brand's hand-drawn voice. preserveAspectRatio="none" lets it stretch
// to whatever width the label needs.
const WOBBLE_PATH =
  'M 14,8 C 95,4 245,5 326,8 C 330,22 331,40 326,54 C 245,58 95,57 14,54 C 10,40 10,22 14,8 Z'

export default function ConsentBanner() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // Nothing to consent to if analytics isn't configured for this deploy.
    const configured =
      typeof window.__dearlyAnalyticsConfigured === 'function'
        ? window.__dearlyAnalyticsConfigured()
        : false
    if (!configured) return

    let choice = null
    try { choice = window.localStorage.getItem(STORAGE_KEY) } catch { /* blocked */ }
    if (choice !== 'granted' && choice !== 'denied') setVisible(true)
  }, [])

  function decide(granted) {
    try { window.localStorage.setItem(STORAGE_KEY, granted ? 'granted' : 'denied') } catch { /* blocked */ }
    if (granted && typeof window.__dearlyLoadAnalytics === 'function') {
      window.__dearlyLoadAnalytics()
    }
    setVisible(false)
  }

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="consent-banner"
          initial={{ opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.98 }}
          transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          role="dialog"
          aria-label="Cookie consent"
          style={{
            position: 'fixed',
            right: 'calc(15px + env(safe-area-inset-right, 0px))',
            bottom: 'calc(15px + env(safe-area-inset-bottom, 0px))',
            zIndex: 1000,
            width: 'min(380px, calc(100vw - 30px))',
          }}
        >
          <div
            style={{
              display: 'flex',
              gap: 14,
              alignItems: 'center',
              padding: '16px 18px',
              background: '#FBF7EE',
              border: '1px solid rgba(37,37,37,0.10)',
              borderRadius: 18,
            }}
          >
            {/* Cookie icon — left, like the reference */}
            <img
              src="/cookie.svg"
              alt=""
              aria-hidden
              width={44}
              height={44}
              style={{ flex: '0 0 auto' }}
            />

            {/* Content column — heading, one-liner, actions */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
              <h2
                style={{
                  margin: 0,
                  fontFamily: "'Instrument Serif', Georgia, serif",
                  fontWeight: 400,
                  fontSize: 19,
                  lineHeight: 1.1,
                  color: '#252525',
                }}
              >
                Dearly uses cookies
              </h2>
              <p
                style={{
                  margin: 0,
                  fontFamily: 'Inter, sans-serif',
                  fontWeight: 400,
                  fontSize: 12,
                  lineHeight: 1.45,
                  color: '#5a5346',
                }}
              >
                To better understand usage and improve your experience.{' '}
                <a
                  href="/privacy"
                  style={{ color: '#252525', textDecoration: 'underline', textUnderlineOffset: 2 }}
                >
                  Learn more
                </a>
              </p>

              {/* Actions — Decline (left) · Accept (right) */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 6 }}>
                {/* Decline — Caveat text link */}
                <button
                  onClick={() => decide(false)}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: '2px',
                    cursor: 'pointer',
                    fontFamily: "'Caveat', cursive",
                    fontWeight: 600,
                    fontSize: 'clamp(15px, 1rem, 17px)',
                    lineHeight: 1,
                    color: 'rgba(37,37,37,0.55)',
                    whiteSpace: 'nowrap',
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  No thanks
                </button>

                {/* Accept — crooked wobbly pill, #252525 fill, white Caveat label */}
                <button
                  onClick={() => decide(true)}
                  style={{
                    position: 'relative',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: 38,
                    padding: '0 20px',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    outline: 'none',
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  <svg
                    viewBox="0 0 340 62"
                    preserveAspectRatio="none"
                    fill="none"
                    aria-hidden
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
                  >
                    <path d={WOBBLE_PATH} fill="#252525" />
                  </svg>
                  <span
                    style={{
                      position: 'relative',
                      zIndex: 1,
                      fontFamily: "'Caveat', cursive",
                      fontWeight: 700,
                      fontSize: 'clamp(16px, 1.1rem, 18px)',
                      lineHeight: 1,
                      color: '#FFFFFF',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Accept cookie settings
                  </span>
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// Thin analytics layer over Google Analytics (gtag) + Microsoft Clarity.
// Both are consent-gated and lazy-loaded in index.html; if the user hasn't
// accepted cookies, window.gtag / window.clarity simply never exist and
// every call here is a silent no-op. Nothing in here ever throws.

const GA_ID = import.meta.env.VITE_GA_ID

/* ── Device classification ────────────────────────────────────────────────
   One label per visitor, computed once. Powers "device sent" / "device
   opened" — every event auto-carries it, so the GA reports just need to
   break any event down by the `device` dimension. */
let _device = null
export function getDeviceType() {
  if (_device) return _device
  if (typeof window === 'undefined') return 'unknown'
  const ua = navigator.userAgent || ''
  const coarse = window.matchMedia?.('(any-pointer: coarse)').matches
  const isTabletUA = /iPad/.test(ua) ||
    (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) || // iPadOS desktop UA
    (/Android/.test(ua) && !/Mobile/.test(ua))
  const isPhoneUA = /iPhone|iPod/.test(ua) || (/Android/.test(ua) && /Mobile/.test(ua))
  const w = window.innerWidth || 0
  if (isPhoneUA || (coarse && w < 600)) _device = 'mobile'
  else if (isTabletUA || (coarse && w <= 1366)) _device = 'tablet'
  else _device = 'desktop'
  return _device
}

/* ── Low-level senders ────────────────────────────────────────────────── */
function gtag(...args) {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return
  window.gtag(...args)
}

function clarity(...args) {
  if (typeof window === 'undefined' || typeof window.clarity !== 'function') return
  try { window.clarity(...args) } catch { /* clarity not ready */ }
}

// Filterable custom dimension on a Clarity session recording.
export function clarityTag(key, value) {
  clarity('set', key, String(value))
}

// Named, searchable moment on a Clarity recording (e.g. "letter_sent").
export function clarityEvent(name) {
  clarity('event', name)
}

/* ── Public API ───────────────────────────────────────────────────────── */

// Call once on app boot — stamps the session with device + visitor recency
// on both GA (user properties) and Clarity (filter tags).
export function initAnalyticsSession() {
  if (typeof window === 'undefined') return
  const device = getDeviceType()
  let returning = false
  try {
    returning = localStorage.getItem('dearly_seen') === '1'
    localStorage.setItem('dearly_seen', '1')
  } catch { /* storage blocked */ }
  gtag('set', 'user_properties', {
    device_type:   device,
    visitor_type:  returning ? 'returning' : 'new',
  })
  clarityTag('device', device)
  clarityTag('visitor', returning ? 'returning' : 'new')
}

export function trackScreen(screenName) {
  if (!GA_ID) return
  gtag('event', 'page_view', {
    page_title:    screenName,
    page_location: window.location.href,
    device:        getDeviceType(),
  })
  clarityTag('screen', screenName)
}

// Generic event. `device` is merged in automatically so device-segmented
// reports work for every event without callers having to remember.
export function trackEvent(eventName, params = {}) {
  if (!GA_ID) return
  gtag('event', eventName, { device: getDeviceType(), ...params })
}

// A button/CTA press. Routes every CTA through one event with a `cta`
// parameter so GA can rank "most used CTAs" from a single report.
export function trackCTA(cta, params = {}) {
  trackEvent('cta_click', { cta, ...params })
  clarityEvent('cta_' + cta)
}

// One-shot timing measurement (seconds). GA's `value` is whole seconds so
// it aggregates cleanly; `ms` is preserved for precision if needed.
export function trackTiming(name, ms, params = {}) {
  trackEvent(name, {
    value:        Math.round(ms / 1000),
    duration_ms:  Math.round(ms),
    ...params,
  })
}

/* ── Funnel timing: time-to-first-share / time-to-first-send ──────────────
   The clock starts when the writing screen first mounts. We fire each
   timing exactly once per session. */
let _writingStartedAt = null
let _firstShareTracked = false
let _firstSendTracked = false

export function markWritingStart() {
  if (_writingStartedAt == null && typeof performance !== 'undefined') {
    _writingStartedAt = performance.now()
  }
}

// User opened the Share panel for the first time.
export function trackFirstShareClick() {
  if (_firstShareTracked || _writingStartedAt == null) return
  _firstShareTracked = true
  trackTiming('time_to_share_click', performance.now() - _writingStartedAt)
}

// User actually sent — created a link or emailed it — for the first time.
export function trackFirstSend(method) {
  if (_firstSendTracked || _writingStartedAt == null) return
  _firstSendTracked = true
  trackTiming('time_to_first_send', performance.now() - _writingStartedAt, { method })
}

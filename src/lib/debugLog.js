/* ─────────────────────────────────────────────────────────────────────────
   debugLog — tiny on-screen logger for diagnosing issues on devices where
   the JS console isn't reachable (iPad/iPhone Safari especially).

   Enable by visiting any page with `?debug=1` (the flag is persisted to
   localStorage so it survives navigations and reloads), or by calling
   enableDebug() from anywhere. Disable with `?debug=0` or disableDebug().

   When enabled, DebugOverlay renders a fixed, scrollable panel showing
   every dlog() line. Call dlog('tag', value, ...) like console.log — it
   mirrors to the real console too.
   ───────────────────────────────────────────────────────────────────────── */

const KEY = 'dearly:debug'
const MAX_LINES = 400

let lines = []
const listeners = new Set()

function readFlagFromUrl() {
  try {
    const v = new URLSearchParams(window.location.search).get('debug')
    if (v === '1' || v === 'true')  { localStorage.setItem(KEY, '1') }
    if (v === '0' || v === 'false') { localStorage.removeItem(KEY) }
  } catch { /* ignore */ }
}

readFlagFromUrl()

export function isDebugEnabled() {
  try { return localStorage.getItem(KEY) === '1' } catch { return false }
}

export function enableDebug()  { try { localStorage.setItem(KEY, '1') } catch { /* ignore */ }; emit() }
export function disableDebug() { try { localStorage.removeItem(KEY) } catch { /* ignore */ }; emit() }

function emit() { for (const fn of listeners) { try { fn(lines) } catch { /* ignore */ } } }

export function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function getLines() { return lines }

export function clearLog() { lines = []; emit() }

function fmt(v) {
  if (v instanceof Error) return `${v.name}: ${v.message}`
  if (typeof v === 'object' && v !== null) {
    try { return JSON.stringify(v) } catch { return String(v) }
  }
  return String(v)
}

export function dlog(...args) {
  // Always mirror to the real console — harmless when no devtools attached.
  try { console.log('[dlog]', ...args) } catch { /* ignore */ }
  const time = new Date().toLocaleTimeString('en-US', { hour12: false }) +
               '.' + String(Date.now() % 1000).padStart(3, '0')
  lines = [...lines, { time, text: args.map(fmt).join(' ') }]
  if (lines.length > MAX_LINES) lines = lines.slice(-MAX_LINES)
  emit()
}

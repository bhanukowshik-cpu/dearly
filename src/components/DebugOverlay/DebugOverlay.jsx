import { useEffect, useState } from 'react'
import { subscribe, getLines, clearLog, isDebugEnabled, disableDebug } from '../../lib/debugLog'

/* On-screen debug console. Renders only when debug mode is enabled
   (visit any URL with ?debug=1). Pinned bottom-left, scrollable, with
   Copy / Clear / Hide controls so the log can be read and screenshotted
   directly on an iPad where the JS console isn't reachable. */
export default function DebugOverlay() {
  const [lines, setLines] = useState(getLines())
  const [open, setOpen]   = useState(true)
  const [enabled, setEnabled] = useState(isDebugEnabled())

  useEffect(() => subscribe(setLines), [])
  // Re-check enablement when the log emits (enable/disable also emit).
  useEffect(() => subscribe(() => setEnabled(isDebugEnabled())), [])

  if (!enabled) return null

  const copyAll = () => {
    const text = lines.map(l => `${l.time}  ${l.text}`).join('\n')
    try { navigator.clipboard?.writeText(text) } catch { /* ignore */ }
  }

  return (
    <div style={S.root}>
      <div style={S.bar}>
        <span style={S.title}>debug ({lines.length})</span>
        <div style={S.btns}>
          <button style={S.btn} onClick={copyAll}>copy</button>
          <button style={S.btn} onClick={() => clearLog()}>clear</button>
          <button style={S.btn} onClick={() => setOpen(o => !o)}>{open ? 'min' : 'max'}</button>
          <button style={S.btn} onClick={() => { disableDebug() }}>off</button>
        </div>
      </div>
      {open && (
        <div style={S.body}>
          {lines.length === 0
            ? <div style={S.empty}>no logs yet</div>
            : lines.map((l, i) => (
                <div key={i} style={S.line}>
                  <span style={S.time}>{l.time}</span> {l.text}
                </div>
              ))}
        </div>
      )}
    </div>
  )
}

const S = {
  root: {
    position: 'fixed', left: 8, bottom: 8, zIndex: 2147483647,
    width: 'min(92vw, 460px)', maxHeight: '46vh',
    display: 'flex', flexDirection: 'column',
    background: 'rgba(10,12,16,0.92)', color: '#d6f5d6',
    border: '1px solid rgba(120,200,120,0.4)', borderRadius: 8,
    font: '11px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace',
    boxShadow: '0 6px 24px rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
    pointerEvents: 'auto',
  },
  bar: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '5px 8px', borderBottom: '1px solid rgba(255,255,255,0.12)',
    flexShrink: 0,
  },
  title: { color: '#9fe89f', fontWeight: 700 },
  btns: { display: 'flex', gap: 4 },
  btn: {
    appearance: 'none', background: 'rgba(255,255,255,0.08)', color: '#cfe',
    border: '1px solid rgba(255,255,255,0.18)', borderRadius: 5,
    padding: '3px 8px', fontSize: 11, cursor: 'pointer',
  },
  body: { overflowY: 'auto', padding: '6px 8px', WebkitOverflowScrolling: 'touch' },
  empty: { opacity: 0.5 },
  line: { whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginBottom: 2 },
  time: { color: '#7fb37f' },
}

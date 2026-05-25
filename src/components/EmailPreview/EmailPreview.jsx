/**
 * EmailPreview — local design playground for the share-via-email HTML.
 *
 * Renders the actual email HTML (built by src/lib/emailTemplate.js — the
 * SAME function the /api/email serverless route uses) inside an iframe,
 * with a controls panel on the left for tweaking the inputs and a
 * viewport-size toggle so we can see Gmail-web vs iPhone Mail framing.
 *
 * Mounted at `/email-preview` via main.jsx — no app shell, no router.
 * Just a focused design surface.
 */

import { useMemo, useState } from 'react'
import { buildEmailHtml } from '../../lib/emailTemplate'
import styles from './EmailPreview.module.css'

const VIEWPORTS = [
  { id: 'mobile',  label: 'iPhone Mail',   width: 390  },
  { id: 'tablet',  label: 'iPad / Gmail',  width: 600  },
  { id: 'desktop', label: 'Gmail web',     width: 800  },
]

export default function EmailPreview() {
  const [fromName,      setFromName]      = useState('Bhanu')
  const [recipientName, setRecipientName] = useState('Marcus')
  const [shareUrl,      setShareUrl]      = useState('https://bhanu-dearly.vercel.app/api/share?id=demo-1234')
  const [personalNote,  setPersonalNote]  = useState("Hey Marcus — I've been meaning to write this for a while. Thank you for backing me last quarter. It mattered.")
  const [blurb,         setBlurb]         = useState('the conversation we had at the AI conference last week')
  const [assetOrigin,   setAssetOrigin]   = useState(window.location.origin)
  const [viewportId,    setViewportId]    = useState('mobile')

  const html = useMemo(() => buildEmailHtml({
    fromName, recipientName, shareUrl, personalNote, blurb, assetOrigin,
  }), [fromName, recipientName, shareUrl, personalNote, blurb, assetOrigin])

  const viewport = VIEWPORTS.find(v => v.id === viewportId) ?? VIEWPORTS[0]

  return (
    <div className={styles.root}>
      {/* ── Controls ─────────────────────────────────────────────── */}
      <aside className={styles.controls}>
        <header className={styles.header}>
          <h1 className={styles.title}>Email preview</h1>
          <p className={styles.sub}>
            Live render of <code>src/lib/emailTemplate.js</code> — same code the
            <code>/api/email</code> route uses to send the real email.
          </p>
        </header>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>Sender's name</span>
          <input className={styles.input} value={fromName} onChange={e => setFromName(e.target.value)} />
        </label>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>Recipient's name</span>
          <input className={styles.input} value={recipientName} onChange={e => setRecipientName(e.target.value)} placeholder="(leave blank to test no-name fallback)" />
        </label>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>Share URL</span>
          <input className={styles.input} value={shareUrl} onChange={e => setShareUrl(e.target.value)} />
        </label>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>Context blurb (AI-generated)</span>
          <textarea
            className={`${styles.input} ${styles.textarea}`}
            value={blurb}
            onChange={e => setBlurb(e.target.value)}
            placeholder="e.g. the conversation we had at the AI conference last week"
          />
          <span className={styles.hint}>
            Appended as <em>"…for you, about {'{blurb}'}."</em> — leave blank
            to drop the "about…" clause entirely.
          </span>
        </label>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>Personal note (unused in current design)</span>
          <textarea
            className={`${styles.input} ${styles.textarea}`}
            value={personalNote}
            onChange={e => setPersonalNote(e.target.value)}
            placeholder="Kept for backward-compat; not rendered."
          />
        </label>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>Asset origin (bg image source)</span>
          <input className={styles.input} value={assetOrigin} onChange={e => setAssetOrigin(e.target.value)} />
          <span className={styles.hint}>Points the bg.jpg request at this origin. Default = current page.</span>
        </label>

        <div className={styles.field}>
          <span className={styles.fieldLabel}>Viewport</span>
          <div className={styles.viewportRow}>
            {VIEWPORTS.map(v => (
              <button
                key={v.id}
                type="button"
                className={`${styles.viewportBtn} ${viewportId === v.id ? styles.viewportBtnActive : ''}`}
                onClick={() => setViewportId(v.id)}
              >
                {v.label}
                <small>{v.width}px</small>
              </button>
            ))}
          </div>
        </div>

        <footer className={styles.footer}>
          <span className={styles.hint}>
            Edit <code>src/lib/emailTemplate.js</code> and the iframe hot-reloads.
            Once it looks right, just push — the next email send uses the same template.
          </span>
        </footer>
      </aside>

      {/* ── Iframe rendering the email HTML ──────────────────────── */}
      <main className={styles.stage}>
        <div className={styles.frameShell} style={{ width: viewport.width }}>
          <div className={styles.frameChrome}>
            <span className={styles.frameDot} style={{ background: '#ff5f57' }} />
            <span className={styles.frameDot} style={{ background: '#febc2e' }} />
            <span className={styles.frameDot} style={{ background: '#28c840' }} />
            <span className={styles.frameLabel}>{viewport.label} · {viewport.width}px</span>
          </div>
          <iframe
            title="Email preview"
            srcDoc={html}
            className={styles.frame}
            sandbox="allow-same-origin"
          />
        </div>
      </main>
    </div>
  )
}

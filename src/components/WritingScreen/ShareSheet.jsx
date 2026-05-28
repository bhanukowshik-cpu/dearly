import { useState, useCallback, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import styles from './ShareSheet.module.css'
import { generateShareUrl } from '../../lib/shareUtils'
import { saveNote } from '../../lib/supabase'
import { captureCanvas } from '../../lib/captureUtils'
import { trackEvent } from '../../lib/analytics'
// IconPlane is the same paper-airplane glyph used by the editor's To/From
// tool — reused on the Send button so the "send a letter" verb visually
// matches the "to/from a person" tool the user already knows.
import { IconPlane } from './editorIcons'

// ── Hand-drawn icons ────────────────────────────────────────────────────────
function IconLink() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden>
      <path d="M9.5 12.5C10.2 13.4 11.4 14 12.7 14C13.6 14 14.4 13.7 15 13.2L17.2 11C18.4 9.8 18.4 7.9 17.2 6.7C16 5.5 14.1 5.5 12.9 6.7L11.8 7.8"
        stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M12.5 9.5C11.8 8.6 10.6 8 9.3 8C8.4 8 7.6 8.3 7 8.8L4.8 11C3.6 12.2 3.6 14.1 4.8 15.3C6 16.5 7.9 16.5 9.1 15.3L10.2 14.2"
        stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}

function IconCopy() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="5.5" y="5.5" width="8" height="9" rx="1.5"
        stroke="currentColor" strokeWidth="1.4"/>
      <path d="M3.5 10.5H3C2.17 10.5 1.5 9.83 1.5 9V3C1.5 2.17 2.17 1.5 3 1.5H9C9.83 1.5 10.5 2.17 10.5 3V3.5"
        stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  )
}

function IconCheck() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M3 8L6.5 11.5L13 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}


function IconPNG() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden>
      <rect x="2" y="4" width="18" height="14" rx="2"
        stroke="currentColor" strokeWidth="1.5"/>
      <path d="M2 14L6.5 9.5L10 13L13.5 10L20 15"
        stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="7" cy="8.5" r="1.5" stroke="currentColor" strokeWidth="1.3"/>
    </svg>
  )
}

function IconClose() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path d="M2 2L10 10M10 2L2 10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
    </svg>
  )
}

// Envelope — for the "Send via email" option.
function IconEmail() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden>
      <rect x="2.5" y="4.5" width="17" height="13" rx="2"
        stroke="currentColor" strokeWidth="1.5"/>
      <path d="M3 5.5L11 12L19 5.5"
        stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

// Tiny chevron — used as the collapsed/expanded affordance on the
// section headers. Rotates 180° via CSS when its parent is .open.
function IconChevron() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M3.5 5L7 8.5L10.5 5"
        stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

// ── ShareSheet ──────────────────────────────────────────────────────────────
const isIOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent)
const isMobileDevice = typeof navigator !== 'undefined' && /iPad|iPhone|iPod|Android/i.test(navigator.userAgent)

function legacyCopy(text) {
  const el = document.createElement('textarea')
  el.value = text
  el.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0'
  document.body.appendChild(el)
  el.focus()
  el.select()
  try { document.execCommand('copy') } catch {}
  document.body.removeChild(el)
}

export default function ShareSheet({ noteData, paperRef, onClose, onToast, isMobileSheet = false }) {
  const [linkUrl,        setLinkUrl]        = useState('')
  const [copied,         setCopied]         = useState(false)
  const [creatingLink,   setCreatingLink]   = useState(false)
  const [linkErr,        setLinkErr]        = useState('')
  const [loadingPng,     setLoadingPng]     = useState(false)
  const [downloadDone,   setDownloadDone]   = useState(false) // 'done' | 'ios' | false
  const [exportErr,      setExportErr]      = useState('')
  const [imageOverlayUrl, setImageOverlayUrl] = useState(null)
  // Section open/closed state — both email and link start COLLAPSED. The
  // user has to tap a header to expand. This keeps the sheet compact and
  // doesn't push the friendlier "Download your image" CTA off-screen.
  const [emailOpen,      setEmailOpen]      = useState(false)
  const [linkOpen,       setLinkOpen]       = useState(false)
  const [emailTo,        setEmailTo]        = useState('')
  const [emailNote,      setEmailNote]      = useState('')
  const [emailSubject,   setEmailSubject]   = useState('')
  // Whether the user has manually edited the subject — guards against an
  // arriving LLM suggestion clobbering what they typed.
  const [subjectTouched, setSubjectTouched] = useState(false)
  const [subjectLoading, setSubjectLoading] = useState(false)
  const [emailSending,   setEmailSending]   = useState(false)
  const [emailSentTo,    setEmailSentTo]    = useState('')   // shows the success copy
  const [emailErr,       setEmailErr]       = useState('')
  const copiedTimerRef   = useRef(null)
  const downloadTimerRef = useRef(null)
  const emailSentTimerRef = useRef(null)

  useEffect(() => () => {
    if (copiedTimerRef.current)    clearTimeout(copiedTimerRef.current)
    if (downloadTimerRef.current)  clearTimeout(downloadTimerRef.current)
    if (emailSentTimerRef.current) clearTimeout(emailSentTimerRef.current)
  }, [])

  /* When the email form opens, ask /api/suggest-subject to generate a
     contextual subject from the note. Pre-fills the input so the user
     starts from a good default but can still edit before sending.
     Only runs once per open (guarded by subjectLoading + emailSubject).
     We deliberately don't re-trigger on message change — that would
     overwrite the user's edits and feel noisy. */
  useEffect(() => {
    if (!emailOpen) return
    if (subjectTouched || emailSubject || subjectLoading) return
    if (!noteData?.message?.trim()) return
    let cancelled = false
    setSubjectLoading(true)
    fetch('/api/suggest-subject', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fromName:      noteData.senderName || 'Someone',
        recipientName: noteData.recipientName || noteData.recipient || '',
        message:       noteData.message || '',
      }),
    })
      .then(r => r.json().catch(() => ({})))
      .then(data => {
        if (cancelled) return
        // Only fill if the user hasn't started typing in the meantime —
        // protects against the race where they open the form, type fast,
        // and the suggestion arrives mid-keystroke.
        if (!subjectTouched && data?.ok && data?.subject) {
          setEmailSubject(data.subject)
        }
      })
      .catch(() => { /* template fallback returns 200; on hard failure just leave blank */ })
      .finally(() => { if (!cancelled) setSubjectLoading(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emailOpen])

  const handleCreateLink = useCallback(async () => {
    if (creatingLink) return
    setCreatingLink(true)
    setLinkErr('')
    try {
      const id = await saveNote(noteData)
      if (!id) {
        setLinkErr('Could not save note — please try again.')
        return
      }
      const url = generateShareUrl(id, noteData)
      trackEvent('note_link_created', { method: isMobileSheet ? 'mobile' : 'desktop' })

      // On mobile: use native share sheet (iOS/Android) — no keyboard, no clipboard issues
      if (isMobileSheet && typeof navigator.share === 'function') {
        try {
          await navigator.share({ url, title: `A note for ${noteData.recipient || 'you'}` })
          return
        } catch {
          // user cancelled or share failed — fall through to copy
        }
      }

      setLinkUrl(url)
      setCopied(false)
    } finally {
      setCreatingLink(false)
    }
  }, [noteData, creatingLink, isMobileSheet])

  const handleCopy = useCallback(() => {
    if (!linkUrl) return
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(linkUrl).then(() => {
        setCopied(true)
        if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current)
        copiedTimerRef.current = setTimeout(() => setCopied(false), 2200)
      }).catch(() => legacyCopy(linkUrl))
    } else {
      legacyCopy(linkUrl)
    }
  }, [linkUrl])

  const handlePng = useCallback(async () => {
    if (loadingPng) return
    setLoadingPng(true)
    setDownloadDone(false)
    setExportErr('')
    onToast?.('Preparing your image…')

    try {
      // User-facing "Download as image" — swap voice pill for the QR
      // export card so the downloaded PNG carries a scannable link to
      // the full letter (recipients can't play audio inside a static PNG).
      const canvas = await captureCanvas(paperRef, { noteData, swapVoiceForBarcode: true })
      if (isMobileDevice) {
        // Show in an overlay on the same page — no popup, works regardless
        // of iOS "Block Pop-ups" setting.
        setImageOverlayUrl(canvas.toDataURL('image/png'))
        setDownloadDone('ios')
        trackEvent('png_downloaded', { source: 'share_sheet', platform: 'mobile' })
        onToast?.('Long press the image to save it.')
      } else {
        await new Promise((resolve, reject) => {
          canvas.toBlob(blob => {
            if (!blob) { reject(new Error('toBlob failed')); return }
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href     = url
            a.download = 'dearly-note.png'
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            setTimeout(() => URL.revokeObjectURL(url), 1000)
            setDownloadDone('done')
            trackEvent('png_downloaded', { source: 'share_sheet', platform: 'desktop' })
            onToast?.('Image downloaded — check your Downloads folder.')
            resolve()
          }, 'image/png')
        })
      }
      downloadTimerRef.current = setTimeout(() => setDownloadDone(false), 4000)
    } catch (e) {
      console.error('PNG export failed', e)
      setExportErr('Export failed — please try again.')
      onToast?.('Could not export image, please try again.')
    } finally {
      setLoadingPng(false)
    }
  }, [paperRef, loadingPng])

  // Ensures we have a share URL ready before sending the email. If the user
  // hasn't already clicked "Create link", we silently save the note and
  // mint the URL here. Returns null on failure.
  const ensureShareUrl = useCallback(async () => {
    if (linkUrl) return linkUrl
    try {
      const id = await saveNote(noteData)
      if (!id) return null
      const url = generateShareUrl(id, noteData)
      setLinkUrl(url)
      return url
    } catch {
      return null
    }
  }, [linkUrl, noteData])

  const EMAIL_RE       = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  const MAX_RECIPIENTS = 5

  const handleSendEmail = useCallback(async (e) => {
    e?.preventDefault?.()
    if (emailSending) return

    // Split on comma / newline / whitespace so the user can paste a list
    // however they want. Dedupe + validate each. Cap at MAX_RECIPIENTS so
    // a stray paste of a giant contact list can't blast the API.
    const recipients = Array.from(new Set(
      emailTo
        .split(/[\s,;]+/)
        .map(s => s.trim().toLowerCase())
        .filter(Boolean)
    ))
    if (recipients.length === 0) {
      setEmailErr('Please enter at least one email address.')
      return
    }
    if (recipients.length > MAX_RECIPIENTS) {
      setEmailErr(`That's ${recipients.length} addresses — please keep it to ${MAX_RECIPIENTS} or fewer.`)
      return
    }
    const invalid = recipients.find(r => !EMAIL_RE.test(r))
    if (invalid) {
      setEmailErr(`"${invalid}" doesn't look like a valid email.`)
      return
    }

    setEmailErr('')
    setEmailSending(true)

    const url = await ensureShareUrl()
    if (!url) {
      setEmailErr('Could not save the note — please try again.')
      setEmailSending(false)
      return
    }

    try {
      const resp = await fetch('/api/email', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Backend now accepts an array — sends one private email per
          // recipient so they don't see each other's addresses.
          to:            recipients,
          fromName:      noteData.senderName || 'Someone',
          recipientName: noteData.recipientName || noteData.recipient || '',
          shareUrl:      url,
          personalNote:  emailNote.trim(),
          subject:       emailSubject.trim(),  // empty → server uses its template
        }),
      })
      const data = await resp.json().catch(() => ({}))
      if (!resp.ok || data.ok === false) {
        const msg = data?.error || `Email send failed (${resp.status})`
        setEmailErr(msg.length > 120 ? msg.slice(0, 117) + '…' : msg)
        trackEvent('email_send_failed', { reason: msg.slice(0, 60), count: recipients.length })
        return
      }
      // Success — clear the form, show confirmation chip for ~5s.
      const sentLabel = recipients.length === 1
        ? recipients[0]
        : `${recipients.length} people`
      setEmailSentTo(sentLabel)
      setEmailTo('')
      setEmailNote('')
      setEmailSubject('')
      setSubjectTouched(false)
      onToast?.(`Sent to ${sentLabel}.`)
      trackEvent('email_sent', { source: 'share_sheet', count: recipients.length })
      if (emailSentTimerRef.current) clearTimeout(emailSentTimerRef.current)
      emailSentTimerRef.current = setTimeout(() => setEmailSentTo(''), 5000)
    } catch (err) {
      setEmailErr(err?.message || 'Network error — please try again.')
    } finally {
      setEmailSending(false)
    }
  }, [emailTo, emailNote, emailSubject, emailSending, ensureShareUrl, noteData, onToast])

  const motionProps = isMobileSheet
    ? { initial: { opacity: 0, y: 40 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: 40 }, transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] } }
    : { initial: { opacity: 0, y: -6, scale: 0.97 }, animate: { opacity: 1, y: 0, scale: 1 }, exit: { opacity: 0, y: -6, scale: 0.97 }, transition: { duration: 0.2, ease: [0.22, 1, 0.36, 1] } }

  return (
    <>
    <motion.div
      className={styles.dropdown}
      {...motionProps}
    >
      {/* Options — new hierarchy:
           Section 1 → Send via email (COLLAPSED by default — header in
                       Caveat, expands to reveal the form on tap)
           Section 2 → Share link    (COLLAPSED by default — header in
                       Caveat, expands to the existing create/copy flow)
           Section 3 → Download your image (always EXPANDED — direct
                       full-width action button, Caveat label, no nesting)
           Headers all use the same .collapseHeader style so the three
           sections read as siblings; the third one is just a "live" header
           that does the action instead of toggling visibility. */}
      <div className={styles.options}>

        {/* ── Section 1: Send via email (collapsible) ── */}
        <div className={`${styles.section} ${emailOpen ? styles.sectionOpen : ''}`}>
          <button
            type="button"
            className={styles.collapseHeader}
            onClick={() => setEmailOpen(o => !o)}
            aria-expanded={emailOpen}
          >
            <span className={styles.collapseHeaderIcon}><IconEmail /></span>
            <span className={styles.collapseHeaderLabel}>
              {emailSentTo ? `Sent to ${emailSentTo} ✓` : 'Send via email'}
            </span>
            <span className={styles.collapseChevron}><IconChevron /></span>
          </button>

          <AnimatePresence initial={false}>
            {emailOpen && (
              <motion.form
                key="email-body"
                className={styles.collapseBody}
                onSubmit={handleSendEmail}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                style={{ overflow: 'hidden' }}
              >
                <input
                  className={styles.primaryInput}
                  type="text"
                  inputMode="email"
                  autoComplete="off"
                  placeholder="Up to 5 emails, separated by commas"
                  value={emailTo}
                  onChange={e => setEmailTo(e.target.value)}
                  disabled={emailSending}
                  required
                />

                <input
                  className={styles.primaryInput}
                  type="text"
                  placeholder={subjectLoading ? 'Writing a subject for you…' : 'Subject line'}
                  value={emailSubject}
                  onChange={e => { setEmailSubject(e.target.value); setSubjectTouched(true) }}
                  maxLength={160}
                  disabled={emailSending}
                />

                <textarea
                  className={`${styles.primaryInput} ${styles.primaryTextarea}`}
                  placeholder="Add a short note (optional)"
                  value={emailNote}
                  onChange={e => setEmailNote(e.target.value)}
                  maxLength={500}
                  disabled={emailSending}
                />

                <button type="submit" className={styles.primaryCTA} disabled={emailSending}>
                  <span className={styles.primaryCTAIcon}><IconPlane size={20} /></span>
                  <span>{emailSending ? 'Sending…' : 'Send'}</span>
                </button>

                <AnimatePresence>
                  {emailErr && (
                    <motion.p
                      className={styles.errorText}
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      {emailErr}
                    </motion.p>
                  )}
                </AnimatePresence>
              </motion.form>
            )}
          </AnimatePresence>
        </div>

        {/* ── Section 2: Share link (collapsible) ── */}
        <div className={`${styles.section} ${linkOpen ? styles.sectionOpen : ''}`}>
          <button
            type="button"
            className={styles.collapseHeader}
            onClick={() => setLinkOpen(o => !o)}
            aria-expanded={linkOpen}
          >
            <span className={styles.collapseHeaderIcon}><IconLink /></span>
            <span className={styles.collapseHeaderLabel}>Share link</span>
            <span className={styles.collapseChevron}><IconChevron /></span>
          </button>

          <AnimatePresence initial={false}>
            {linkOpen && (
              <motion.div
                key="link-body"
                className={styles.collapseBody}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                style={{ overflow: 'hidden' }}
              >
                {!linkUrl ? (
                  <button
                    type="button"
                    className={styles.linkCreateBtn}
                    onClick={handleCreateLink}
                    disabled={creatingLink}
                  >
                    {creatingLink ? 'Creating link…' : 'Create a shareable link'}
                  </button>
                ) : (
                  <div className={styles.linkRow}>
                    <input
                      className={styles.linkInput}
                      value={linkUrl}
                      readOnly
                      inputMode="none"
                      onFocus={e => e.target.blur()}
                    />
                    <button
                      type="button"
                      className={`${styles.copyBtn} ${copied ? styles.copyBtnDone : ''}`}
                      onClick={handleCopy}
                      aria-label="Copy link"
                    >
                      {copied ? <IconCheck /> : <IconCopy />}
                      <span>{copied ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                )}

                <AnimatePresence>
                  {linkErr && (
                    <motion.p
                      className={styles.errorText}
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      {linkErr}
                    </motion.p>
                  )}
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ── Section 3: Download your image (always expanded, direct
             action — no nesting). Same .collapseHeader shell so the row
             height/typography matches the other two. */}
        <button
          type="button"
          className={`${styles.collapseHeader} ${styles.downloadHeader}`}
          onClick={handlePng}
          disabled={loadingPng}
          aria-label="Download your image"
        >
          <span className={styles.collapseHeaderIcon}><IconPNG /></span>
          <span className={styles.collapseHeaderLabel}>
            {loadingPng                ? 'Preparing your image…' :
             downloadDone === 'done'   ? 'Saved ✓' :
             downloadDone === 'ios'    ? 'Long press to save' :
                                          'Download your image'}
          </span>
        </button>

      </div>

      <AnimatePresence>
        {exportErr && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{
              margin: '0 16px 12px',
              fontSize: 12,
              color: 'rgba(255, 120, 100, 0.90)',
              fontFamily: 'Inter, sans-serif',
              textAlign: 'center',
            }}
          >
            {exportErr}
          </motion.p>
        )}
      </AnimatePresence>
    </motion.div>

    {/* Image save overlay — shown on mobile instead of opening a new tab */}
    {imageOverlayUrl && (
      <div
        style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.93)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          gap: 16, padding: 20, boxSizing: 'border-box',
        }}
        onClick={() => setImageOverlayUrl(null)}
      >
        <button
          onClick={e => { e.stopPropagation(); setImageOverlayUrl(null) }}
          style={{
            position: 'absolute', top: 16, right: 16,
            width: 36, height: 36, borderRadius: '50%',
            background: 'rgba(255,255,255,0.15)', border: 'none',
            color: '#fff', fontSize: 18, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          aria-label="Close"
        >✕</button>
        <img
          src={imageOverlayUrl}
          onClick={e => e.stopPropagation()}
          style={{ maxWidth: '100%', maxHeight: '78vh', objectFit: 'contain', borderRadius: 10 }}
          alt="Your Dearly note"
        />
        <p style={{
          color: 'rgba(255,255,255,0.72)', fontFamily: 'sans-serif',
          fontSize: 14, margin: 0, textAlign: 'center', lineHeight: 1.5,
        }}>
          Long press the image to save it to your photos
        </p>
      </div>
    )}
    </>
  )
}

import { useState, useCallback, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import styles from './ShareSheet.module.css'
import { generateShareUrl } from '../../lib/shareUtils'
import { saveNote } from '../../lib/supabase'
import { captureCanvas } from '../../lib/captureUtils'
import { trackEvent } from '../../lib/analytics'

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
  const copiedTimerRef   = useRef(null)
  const downloadTimerRef = useRef(null)

  useEffect(() => () => {
    if (copiedTimerRef.current)   clearTimeout(copiedTimerRef.current)
    if (downloadTimerRef.current) clearTimeout(downloadTimerRef.current)
  }, [])

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
      const canvas = await captureCanvas(paperRef)
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

  const motionProps = isMobileSheet
    ? { initial: { opacity: 0, y: 40 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: 40 }, transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] } }
    : { initial: { opacity: 0, y: -6, scale: 0.97 }, animate: { opacity: 1, y: 0, scale: 1 }, exit: { opacity: 0, y: -6, scale: 0.97 }, transition: { duration: 0.2, ease: [0.22, 1, 0.36, 1] } }

  return (
    <>
    <motion.div
      className={styles.dropdown}
      {...motionProps}
    >
      {/* Options */}
      <div className={styles.options}>

        {/* ── Create link ── */}
        <div className={styles.optionGroup}>
          <button className={styles.option} onClick={handleCreateLink} disabled={creatingLink}>
            <svg className={styles.optionBorder} viewBox="0 0 290 54" preserveAspectRatio="none" fill="none" aria-hidden>
              <path d="M 9,4  C 97,2  193,2  281,4"   stroke="rgba(255,255,255,0.38)" strokeWidth="1.3" strokeLinecap="round"/>
              <path d="M 281,4 C 284,20 284,34 281,50" stroke="rgba(255,255,255,0.38)" strokeWidth="1.3" strokeLinecap="round"/>
              <path d="M 281,50 C 193,53 97,53 9,50"  stroke="rgba(255,255,255,0.38)" strokeWidth="1.3" strokeLinecap="round"/>
              <path d="M 9,50  C 6,34  6,20  9,4"    stroke="rgba(255,255,255,0.38)" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
            <span className={styles.optionIcon}><IconLink /></span>
            <span className={styles.optionText}>
              <span className={styles.optionLabel}>
                {creatingLink ? 'Creating link…' : 'Create a shareable link'}
              </span>
            </span>
          </button>

          <AnimatePresence>
            {linkUrl && (
              <motion.div
                className={styles.linkRow}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              >
                <input
                  className={styles.linkInput}
                  value={linkUrl}
                  readOnly
                  inputMode="none"
                  onFocus={e => e.target.blur()}
                />
                <button
                  className={`${styles.copyBtn} ${copied ? styles.copyBtnDone : ''}`}
                  onClick={handleCopy}
                  aria-label="Copy link"
                >
                  {copied ? <IconCheck /> : <IconCopy />}
                  <span>{copied ? 'Copied!' : 'Copy'}</span>
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {linkErr && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                style={{
                  margin: '4px 16px 0',
                  fontSize: 12,
                  color: 'rgba(255, 120, 100, 0.90)',
                  fontFamily: 'Inter, sans-serif',
                }}
              >
                {linkErr}
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        {/* ── Download PNG ── */}
        <button className={styles.option} onClick={handlePng} disabled={loadingPng}>
          <svg className={styles.optionBorder} viewBox="0 0 290 54" preserveAspectRatio="none" fill="none" aria-hidden>
            <path d="M 9,4  C 97,2  193,2  281,4"   stroke="rgba(255,255,255,0.38)" strokeWidth="1.3" strokeLinecap="round"/>
            <path d="M 281,4 C 284,20 284,34 281,50" stroke="rgba(255,255,255,0.38)" strokeWidth="1.3" strokeLinecap="round"/>
            <path d="M 281,50 C 193,53 97,53 9,50"  stroke="rgba(255,255,255,0.38)" strokeWidth="1.3" strokeLinecap="round"/>
            <path d="M 9,50  C 6,34  6,20  9,4"    stroke="rgba(255,255,255,0.38)" strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
          <span className={styles.optionIcon}><IconPNG /></span>
          <span className={styles.optionText}>
            <span className={styles.optionLabel}>
              {loadingPng
                ? 'Generating…'
                : downloadDone === 'ios'
                  ? 'Long press the image to save 📸'
                  : downloadDone === 'done'
                    ? 'Check your downloads ✓'
                    : 'Download as PNG'}
            </span>
            {downloadDone === 'ios' && (
              <span className={styles.optionSub}>Long press the image to save</span>
            )}
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

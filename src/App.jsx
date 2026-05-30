import { useState, useEffect, Component } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import LoadingScreen    from './components/LoadingScreen/LoadingScreen'
import WritingScreen    from './components/WritingScreen/WritingScreen'
import RecipientScreen  from './components/RecipientScreen/RecipientScreen'
import ConsentBanner    from './components/ConsentBanner/ConsentBanner'
import LegalFooter      from './components/LegalFooter/LegalFooter'
import { decodeNote }   from './lib/shareUtils'
import { getNoteById }  from './lib/supabase'
import { STICKER_REGISTRY } from './components/WritingScreen/handDrawnStickers'
import { trackScreen, trackCTA, trackEvent, clarityTag, clarityEvent, initAnalyticsSession }  from './lib/analytics'
import './App.css'

function rehydrateStickers(noteData) {
  if (!noteData?.stickers?.length) return noteData
  return {
    ...noteData,
    stickers: noteData.stickers.map(s => ({
      ...s,
      Component: s.Component ?? STICKER_REGISTRY[s.id],
    })),
  }
}

class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error) {
    return { error }
  }
  componentDidCatch(error, info) {
    // Surface the actual error to the console so prod crashes ("Something
    // went wrong") can be diagnosed via Safari Web Inspector / Chrome
    // remote devtools instead of being a black box. Also dump in a more
    // copy-friendly format because Safari's console sometimes truncates
    // structured logs.
    console.error('[dearly] ErrorBoundary caught:', error)
    console.error('[dearly] error.message:', error?.message)
    console.error('[dearly] error.stack:', error?.stack)
    if (info?.componentStack) console.error('[dearly] component stack:', info.componentStack)
    // Also stash on window for inspect-via-bookmarklet on phones where
    // dev tools aren't easily reachable.
    if (typeof window !== 'undefined') {
      window.__dearlyLastError = {
        message: error?.message,
        stack:   error?.stack,
        componentStack: info?.componentStack,
      }
    }
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{
          minHeight: '100vh', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 16,
          background: '#050C18', color: 'rgba(255,255,255,0.7)',
          fontFamily: 'Inter, sans-serif', padding: 32, textAlign: 'center',
        }}>
          <p style={{ fontSize: 18, margin: 0 }}>Something went wrong.</p>
          {/* Visible error details so phone users without dev tools can
              read what crashed and report it. Plain pre-wrap for easy
              copy/paste. Removed on the next deploy once we've isolated
              the cause. */}
          {this.state.error?.message && (
            <pre style={{
              maxWidth: '90vw',
              maxHeight: '40vh',
              overflow: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              fontSize: 11,
              lineHeight: 1.4,
              padding: 12,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.10)',
              borderRadius: 8,
              color: 'rgba(255,255,255,0.55)',
              textAlign: 'left',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            }}>
              {String(this.state.error.message)}
              {this.state.error.stack ? '\n\n' + this.state.error.stack : ''}
            </pre>
          )}
          <button
            onClick={() => { this.setState({ error: null }); window.location.href = '/' }}
            style={{
              background: 'none', border: '1px solid rgba(255,255,255,0.25)',
              borderRadius: 20, color: 'rgba(255,255,255,0.7)',
              padding: '8px 20px', cursor: 'pointer', fontSize: 13,
            }}
          >
            Start over
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

const FADE = {
  initial:    { opacity: 0 },
  animate:    { opacity: 1 },
  exit:       { opacity: 0 },
  transition: { duration: 0.35, ease: 'easeInOut' },
}

export default function App() {
  const [screen,        setScreen]        = useState('landing')
  const [recipientData, setRecipientData] = useState(null)
  const [previewData,   setPreviewData]   = useState(null)

  useEffect(() => { initAnalyticsSession() }, [])
  useEffect(() => { trackScreen(screen) }, [screen])

  // Handle shared links — ?id=<uuid> (new) or ?share=<base64> (legacy)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const id     = params.get('id')
    const share  = params.get('share')

    if (id) {
      getNoteById(id).then(noteData => {
        if (noteData) {
          setRecipientData(rehydrateStickers(noteData))
          setScreen('recipient')
          window.history.replaceState({}, '', window.location.pathname)
        }
      })
    } else if (share) {
      const noteData = rehydrateStickers(decodeNote(share))
      if (noteData) {
        setRecipientData(noteData)
        setScreen('recipient')
        window.history.replaceState({}, '', window.location.pathname)
      }
    }
  }, [])

  function handleShare(noteData) {
    setRecipientData(noteData)
    setScreen('recipient')
  }

  function handlePreview(noteData) {
    setPreviewData(noteData)
  }

  return (
    <ErrorBoundary>
      <AnimatePresence mode="wait">
        {screen === 'landing' && (
          <motion.div key="landing" {...FADE} style={{ width: '100%', height: '100%' }}>
            <LoadingScreen onCta={() => { trackCTA('start_writing'); setScreen('writing') }} />
          </motion.div>
        )}

        {screen === 'writing' && (
          <motion.div key="writing" {...FADE} style={{ width: '100%', height: '100%' }}>
            <WritingScreen
              onBack={() => setScreen('landing')}
              onShare={handleShare}
              onPreview={handlePreview}
            />
          </motion.div>
        )}

        {screen === 'recipient' && recipientData && (
          <motion.div key="recipient" {...FADE} style={{ width: '100%', height: '100%' }}>
            <RecipientScreen
              senderName={recipientData.senderName}
              recipientName={recipientData.recipientName}
              recipient={recipientData.recipient}
              message={recipientData.message}
              paperConfig={recipientData.paperConfig}
              stickers={recipientData.stickers}
              textElements={recipientData.textElements}
              voiceNotes={recipientData.voiceNotes}
              mediaFrames={recipientData.mediaFrames}
              showRecipient={recipientData.showRecipient}
              textSize={recipientData.textSize}
              onWriteOwn={() => {
                trackEvent('send_back_started')
                trackCTA('write_own', { context: 'recipient' })
                clarityTag('send_back', 'yes')
                clarityEvent('send_back_started')
                setScreen('writing')
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Preview overlay — full RecipientScreen experience, closeable */}
      <AnimatePresence>
        {previewData && (
          <motion.div
            key="preview-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            style={{ position: 'fixed', inset: 0, zIndex: 500 }}
          >
            <RecipientScreen
              senderName={previewData.senderName}
              recipientName={previewData.recipientName}
              recipient={previewData.recipient}
              message={previewData.message}
              paperConfig={previewData.paperConfig}
              stickers={previewData.stickers}
              textElements={previewData.textElements}
              showRecipient={previewData.showRecipient}
              textSize={previewData.textSize}
              onWriteOwn={() => {
                trackCTA('write_own', { context: 'preview' })
                setPreviewData(null)
              }}
            />
            {/* Back to editing pill */}
            <motion.button
              onClick={() => setPreviewData(null)}
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.25 }}
              style={{
                position: 'fixed', top: 14, left: 16, zIndex: 510,
                background: 'rgba(255,255,255,0.10)',
                border: '1px solid rgba(255,255,255,0.18)',
                borderRadius: 20, color: 'rgba(255,255,255,0.80)',
                fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 500,
                padding: '6px 14px', cursor: 'pointer', backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)', letterSpacing: '0.01em',
              }}
            >
              ← Back to editing
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Legal footer — only on the non-cinematic screens, and never over
          the recipient view or the preview overlay. */}
      {(screen === 'landing' || screen === 'writing') && !previewData && <LegalFooter screen={screen} />}

      {/* Cookie-consent banner — gates Google Analytics / Clarity. */}
      <ConsentBanner />
    </ErrorBoundary>
  )
}

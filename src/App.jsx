import { useState, useEffect, Component } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import LoadingScreen    from './components/LoadingScreen/LoadingScreen'
import WritingScreen    from './components/WritingScreen/WritingScreen'
import RecipientScreen  from './components/RecipientScreen/RecipientScreen'
import { decodeNote }   from './lib/shareUtils'
import './App.css'

class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error) {
    return { error }
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

  // Handle ?share=<encoded> links — open directly as recipient
  useEffect(() => {
    const param = new URLSearchParams(window.location.search).get('share')
    if (!param) return
    const noteData = decodeNote(param)
    if (noteData) {
      setRecipientData(noteData)
      setScreen('recipient')
      // Clean URL without reloading
      window.history.replaceState({}, '', window.location.pathname)
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
            <LoadingScreen onCta={() => setScreen('writing')} />
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
              showRecipient={recipientData.showRecipient}
              textSize={recipientData.textSize}
              onWriteOwn={() => setScreen('writing')}
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
              showRecipient={previewData.showRecipient}
              textSize={previewData.textSize}
              onWriteOwn={() => setPreviewData(null)}
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
    </ErrorBoundary>
  )
}

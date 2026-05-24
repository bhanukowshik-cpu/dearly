import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import styles from './EditorToolbar.module.css'
import { IconText, IconImage as IconUpload, IconMic, IconPlane, IconSticker, IconPen } from './editorIcons'

/* ── Icons ──────────────────────────────────────────────────────────────────
   Tool-rail icons all sourced from editorIcons.jsx (which mirrors the
   hand-drawn SVGs in Dearly V2/Icons). The local "Draw" icon was the only
   geometric one left — now reusing IconPen for that too. */

/* ── Individual tool button (icon + label below) ─────────────────────────── */

function ToolBtn({ tool, icon, label, activeTool, onActivate }) {
  const isActive = activeTool === tool
  return (
    <button
      className={`${styles.toolBtn} ${isActive ? styles.toolBtnActive : ''}`}
      onClick={() => onActivate(isActive ? null : tool)}
      title={label}
      aria-label={label}
      aria-pressed={isActive}
    >
      <span className={styles.toolBtnIcon}>{icon}</span>
      <span className={styles.toolBtnLabel}>{label}</span>
    </button>
  )
}

/* ── Panel hero — Caveat heading + soft gradient rule, shared by all tools */

// Truncate gracefully when the name is long so the hero doesn't wrap awkwardly.
function shortName(name) {
  if (!name) return ''
  const trimmed = String(name).trim()
  if (trimmed.length <= 16) return trimmed
  return trimmed.slice(0, 16) + '…'
}

function getPanelHero(tool, recipientName) {
  switch (tool) {
    case 'people':   return 'Who is this letter to'
    case 'text': {
      const who = shortName(recipientName)
      return who ? `Write your heart out to ${who}` : 'Write your heart out…'
    }
    case 'upload':   return 'Add a memory'
    case 'record':   return 'Leave a voice note'
    case 'draw':     return 'Sketch on the paper'
    case 'stickers': return 'Pick a few stickers'
    default:         return ''
  }
}

function PanelHero({ title }) {
  if (!title) return null
  return (
    <div className={styles.panelHero}>
      <p className={styles.panelHeroTitle}>{title}</p>
      <div className={styles.panelHeroRule} aria-hidden />
    </div>
  )
}

/* ── Placeholder content for tools not yet built ─────────────────────────── */

function ComingSoonPanel({ emoji, title, subtitle }) {
  return (
    <div className={styles.comingSoon}>
      <span className={styles.comingSoonEmoji}>{emoji}</span>
      <span className={styles.comingSoonTitle}>{title}</span>
      <span className={styles.comingSoonSub}>{subtitle}</span>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────
   EditorToolbar — vertical icon column + side panel
   Layout: [icon column] [active panel content, attached to top]
   Props:
     activeTool   — 'people' | 'text' | 'upload' | 'record' | 'draw' | 'styles' | null
     onToolChange — (tool | null) => void
     textPanel    — JSX for the Text tool
     peoplePanel  — JSX for People (sender/receiver inputs)
     stylesPanel  — JSX for Styles (paper + stickers)
   ───────────────────────────────────────────────────────────────────────── */
export default function EditorToolbar({ activeTool, onToolChange, textPanel, peoplePanel = null, stickersPanel = null, mediaPanel = null, voicePanel = null, drawPanel = null, recipientName = '' }) {
  // Track the icon column's natural height so the side panel can match it
  // (clipped, with internal scroll). ResizeObserver keeps it in sync as the
  // viewport changes or fonts settle in.
  const iconBarRef = useRef(null)
  const [barHeight, setBarHeight] = useState(0)
  useEffect(() => {
    const el = iconBarRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        const h = Math.round(e.contentRect.height)
        if (h > 0) setBarHeight(h + 2) // +2px so the panel's border matches the bar's exactly
      }
    })
    ro.observe(el)
    setBarHeight(el.offsetHeight + 2)
    return () => ro.disconnect()
  }, [])
  const panels = {
    people:   peoplePanel,
    text:     textPanel,
    upload:   mediaPanel ?? <ComingSoonPanel emoji="🖼️" title="Images & GIFs" subtitle="Upload photos and GIFs, add frames and rounded corners — coming soon." />,
    record:   voicePanel ?? <ComingSoonPanel emoji="🎙️" title="Voice note"    subtitle="Record up to 5 minutes of your voice and embed it in the letter — coming soon." />,
    draw:     drawPanel ?? <ComingSoonPanel emoji="✏️"  title="Draw"          subtitle="Freehand sketching, pen tool, and Apple Pencil on iPad — coming soon." />,
    stickers: stickersPanel,
  }

  return (
    <div className={styles.root} style={barHeight ? { '--bar-h': `${barHeight}px` } : undefined}>

      {/* ── Icon column (fixed) ──────────────────────────────────────────── */}
      <nav ref={iconBarRef} className={styles.iconBar} aria-label="Editor tools">
        <ToolBtn tool="people" icon={<IconPlane size={18} />}  label="To/From" activeTool={activeTool} onActivate={onToolChange} />
        <ToolBtn tool="text"   icon={<IconText size={18} />}   label="Message"  activeTool={activeTool} onActivate={onToolChange} />
        <ToolBtn tool="upload" icon={<IconUpload size={18} />} label="Pictures" activeTool={activeTool} onActivate={onToolChange} />
        <ToolBtn tool="record" icon={<IconMic size={18} />}    label="Voice"   activeTool={activeTool} onActivate={onToolChange} />
        <ToolBtn tool="draw"   icon={<IconPen size={18} />}    label="Draw"    activeTool={activeTool} onActivate={onToolChange} />
        <ToolBtn tool="stickers" icon={<IconSticker size={18} />} label="Stickers" activeTool={activeTool} onActivate={onToolChange} />
      </nav>

      {/* ── Side panel — slides open when a tool is active ──────────────── */}
      <AnimatePresence initial={false}>
        {activeTool && panels[activeTool] && (
          <motion.div
            className={styles.panelWrap}
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 280, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* Cross-fade the contents as activeTool changes */}
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={activeTool}
                className={styles.panelInner}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.14 }}
              >
                <PanelHero title={getPanelHero(activeTool, recipientName)} />
                {panels[activeTool]}
              </motion.div>
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  )
}

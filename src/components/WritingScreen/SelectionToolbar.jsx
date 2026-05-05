import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import styles from './SelectionToolbar.module.css'

/* ── icons ──────────────────────────────────────────────────────────────── */

function IconBold()   { return <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden><text x="2" y="12" fontFamily="Georgia,serif" fontWeight="bold" fontSize="13" fill="currentColor">B</text></svg> }
function IconItalic() { return <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden><text x="4" y="12" fontFamily="Georgia,serif" fontStyle="italic" fontSize="13" fill="currentColor">I</text></svg> }
function IconUnder()  { return <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden><text x="3" y="10" fontFamily="Georgia,serif" fontSize="12" textDecoration="underline" fill="currentColor">U</text><line x1="2" y1="13" x2="12" y2="13" stroke="currentColor" strokeWidth="1.2"/></svg> }
function IconStrike() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <text x="2" y="12" fontFamily="Georgia,serif" fontSize="13" fill="currentColor">S</text>
      <line x1="1" y1="7" x2="13" y2="7" stroke="currentColor" strokeWidth="1.3"/>
    </svg>
  )
}
function IconHighlight() {
  return (
    <svg width="16" height="14" viewBox="0 0 16 14" fill="none" aria-hidden>
      <rect x="1" y="3" width="14" height="9" rx="1.5" fill="rgba(255,198,0,0.80)"/>
      <text x="3" y="11" fontFamily="Georgia,serif" fontSize="9" fill="#1a1a1a">ab</text>
    </svg>
  )
}

/* ── component ───────────────────────────────────────────────────────────── */

export default function SelectionToolbar({ editorRef }) {
  const [pos,     setPos]     = useState(null)   // { x, y } in viewport px
  const [visible, setVisible] = useState(false)
  const toolbarRef = useRef(null)

  // Reposition on every selection change
  useEffect(() => {
    function onSelect() {
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        setVisible(false)
        return
      }
      // Only show when selection is inside the editor
      const editor = editorRef.current
      if (!editor) return
      const anchor = sel.anchorNode
      if (!editor.contains(anchor)) { setVisible(false); return }

      const range = sel.getRangeAt(0)
      const rect  = range.getBoundingClientRect()
      if (!rect.width) { setVisible(false); return }

      setPos({ x: rect.left + rect.width / 2, y: rect.top })
      setVisible(true)
    }

    document.addEventListener('selectionchange', onSelect)
    return () => document.removeEventListener('selectionchange', onSelect)
  }, [editorRef])

  // Click outside → hide
  useEffect(() => {
    function onPointerDown(e) {
      if (toolbarRef.current && toolbarRef.current.contains(e.target)) return
      if (editorRef.current  && editorRef.current.contains(e.target))  return
      setVisible(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [editorRef])

  function exec(cmd, value = null) {
    // Keep focus in editor, preserve selection
    editorRef.current?.focus()
    document.execCommand(cmd, false, value)
  }

  function highlight() {
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed) return
    // Toggle: if already highlighted wrap in <mark>, else unwrap
    exec('hiliteColor', 'rgba(255,198,0,0.58)')
  }

  const buttons = [
    { label: 'Bold',        icon: <IconBold />,      cmd: () => exec('bold') },
    { label: 'Italic',      icon: <IconItalic />,    cmd: () => exec('italic') },
    { label: 'Underline',   icon: <IconUnder />,     cmd: () => exec('underline') },
    { label: 'Strikethrough', icon: <IconStrike />,  cmd: () => exec('strikeThrough') },
    { label: 'Highlight',   icon: <IconHighlight />, cmd: highlight, separator: true },
  ]

  return (
    <AnimatePresence>
      {visible && pos && (
        <motion.div
          ref={toolbarRef}
          className={styles.toolbar}
          style={{ left: pos.x, top: pos.y - 8 }}
          initial={{ opacity: 0, y: 6, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 4, scale: 0.95 }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
          // Prevent toolbar clicks from collapsing selection
          onMouseDown={e => e.preventDefault()}
        >
          {buttons.map((btn, i) => (
            <button
              key={btn.label}
              className={`${styles.btn} ${btn.separator ? styles.sep : ''}`}
              title={btn.label}
              onClick={btn.cmd}
            >
              {btn.icon}
            </button>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

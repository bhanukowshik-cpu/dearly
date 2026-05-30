import { useRef, useState, useEffect, forwardRef } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence, useAnimate } from 'framer-motion'
import EmojiPicker from './EmojiPicker'
import { extractName } from './nameUtils'
import { useTypingSound } from '../../lib/useTypingSound'
import styles from './InputPanel.module.css'

const MAX_NAME_CH      = 80

function countWords(text) {
  return text.trim() === '' ? 0 : text.trim().split(/\s+/).length
}

/* Strip markup delimiters → plain text (for firstName extraction) */
function markupToPlainText(markup) {
  if (!markup) return ''
  return markup
    .replace(/==(?:pink::|sage::)?([^=]+)==/g, '$1')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/~~([^~\n]+)~~/g, '$1')
    .replace(/@@(?:sm|lg)::([^@\n]+)@@/g, '$1')
    .trim()
}

/* ─────────────────────────────────────────────────────────────────────────
   markup ↔ HTML helpers
   ───────────────────────────────────────────────────────────────────────── */

function normalizeMarkup(markup) {
  if (!markup) return ''
  // Collapse double-wrapped formatting caused by the old always-wrap bug.
  // Safe to apply: valid single-wrapped markup is unchanged by these replacements.
  return markup
    .replace(/~{2,}([^~\n]+)~{2,}/g,   '~~$1~~')   // ~~~~text~~~~ → ~~text~~
    .replace(/\*{2,}([^*\n]+)\*{2,}/g, '**$1**')   // ****text**** → **text**
    .replace(/={4,}([^=]+)={4,}/g,   '==$1==')   // ====text==== → ==text==
}

function markupToHtml(markup) {
  if (!markup) return ''
  let s = normalizeMarkup(markup)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  // Font size spans — before generic patterns
  s = s.replace(/@@sm::([^@\n]+)@@/g, '<span data-size="sm">$1</span>')
  s = s.replace(/@@lg::([^@\n]+)@@/g, '<span data-size="lg">$1</span>')
  // Highlights
  s = s.replace(/==pink::([^=]+)==/g, '<mark data-hl="pink">$1</mark>')
  s = s.replace(/==sage::([^=]+)==/g, '<mark data-hl="sage">$1</mark>')
  s = s.replace(/==([^=]+)==/g,       '<mark data-hl="yellow">$1</mark>')
  // Bold / strike
  s = s.replace(/\*\*([^*\n]+)\*\*/g,   '<strong>$1</strong>')
  s = s.replace(/~~([^~\n]+)~~/g,       '<del>$1</del>')
  s = s.replace(/\n/g, '<br>')
  return s
}

function serializeToMarkup(el) {
  function walk(node) {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent
    if (node.nodeName === 'BR') return '\n'
    if ((node.nodeName === 'DIV' || node.nodeName === 'P') && node !== el) {
      return '\n' + walkChildren(node)
    }
    if (node.nodeName === 'SPAN' && node.dataset?.size) {
      const sz    = node.dataset.size
      const inner = walkChildren(node)
      if (sz === 'sm') return `@@sm::${inner}@@`
      if (sz === 'lg') return `@@lg::${inner}@@`
      return inner
    }
    if (node.nodeName === 'MARK') {
      const hl    = node.dataset?.hl ?? 'yellow'
      const inner = walkChildren(node)
      if (hl === 'pink') return `==pink::${inner}==`
      if (hl === 'sage') return `==sage::${inner}==`
      return `==${inner}==`
    }
    if (node.nodeName === 'STRONG' || node.nodeName === 'B') return `**${walkChildren(node)}**`
    if (node.nodeName === 'DEL'    || node.nodeName === 'S') return `~~${walkChildren(node)}~~`
    return walkChildren(node)
  }
  function walkChildren(n) { return Array.from(n.childNodes).map(walk).join('') }
  return walkChildren(el)
}

function placeCursorAtEnd(el) {
  const range = document.createRange()
  const sel   = window.getSelection()
  range.selectNodeContents(el)
  range.collapse(false)
  sel?.removeAllRanges()
  sel?.addRange(range)
}

/* ─────────────────────────────────────────────────────────────────────────
   Shared: read selection rect from a contenteditable element
   ───────────────────────────────────────────────────────────────────────── */

function readSelRect(editorEl) {
  const sel = window.getSelection()
  if (!sel || sel.isCollapsed || sel.rangeCount === 0 || !editorEl) return null
  const range = sel.getRangeAt(0)
  if (!editorEl.contains(range.commonAncestorContainer)) return null
  const r = range.getBoundingClientRect()
  if (!r || (r.width === 0 && r.height === 0)) return null
  return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width }
}

/* ─────────────────────────────────────────────────────────────────────────
   Shared: apply a format to the current DOM selection
   ───────────────────────────────────────────────────────────────────────── */

function applyFormatDOM(type, param) {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return

  const range = sel.getRangeAt(0)

  // Walk up from node to the contenteditable root; return first node matching predicate.
  function findAncestor(startNode, predicate) {
    let node = startNode.nodeType === Node.TEXT_NODE ? startNode.parentNode : startNode
    while (node && node.contentEditable !== 'true') {
      if (predicate(node)) return node
      node = node.parentNode
    }
    return null
  }

  // Replace el with its own children in-place (toggle off).
  function unwrap(el) {
    const parent = el.parentNode
    if (!parent) return
    while (el.firstChild) parent.insertBefore(el.firstChild, el)
    parent.removeChild(el)
  }

  // Wrap the current range in wrapper and collapse cursor after it.
  function wrapRange(wrapper) {
    try {
      const frag = range.extractContents()
      wrapper.appendChild(frag)
      range.insertNode(wrapper)
      sel.removeAllRanges()
      const nr = document.createRange()
      nr.setStartAfter(wrapper)
      nr.collapse(true)
      sel.addRange(nr)
    } catch { /* skip */ }
  }

  const anchor = range.commonAncestorContainer

  if (type === 'strike') {
    const existing = findAncestor(anchor, n => n.nodeName === 'DEL' || n.nodeName === 'S')
    if (existing) { unwrap(existing); return }
    wrapRange(document.createElement('del'))
    return
  }

  if (type === 'bold') {
    const existing = findAncestor(anchor, n => n.nodeName === 'STRONG' || n.nodeName === 'B')
    if (existing) { unwrap(existing); return }
    wrapRange(document.createElement('strong'))
    return
  }

  if (type === 'highlight') {
    const existing = findAncestor(anchor, n => n.nodeName === 'MARK')
    if (param === 'none') {
      if (existing) unwrap(existing)
      return
    }
    if (existing) {
      if (existing.dataset.hl === (param ?? 'yellow')) {
        // Same colour → toggle off
        unwrap(existing)
      } else {
        // Different colour → swap colour in-place (no re-wrap)
        existing.dataset.hl = param ?? 'yellow'
      }
      return
    }
    const mark = document.createElement('mark')
    mark.dataset.hl = param ?? 'yellow'
    wrapRange(mark)
    return
  }

  if (type === 'size') {
    try {
      const frag = range.extractContents()
      const tmp  = document.createElement('div')
      tmp.appendChild(frag)
      tmp.querySelectorAll('span[data-size]').forEach(span => {
        while (span.firstChild) span.parentNode.insertBefore(span.firstChild, span)
        span.remove()
      })
      if (param === 'md') {
        const kids = Array.from(tmp.childNodes)
        for (let i = kids.length - 1; i >= 0; i--) range.insertNode(kids[i])
      } else {
        const span = document.createElement('span')
        span.dataset.size = param
        while (tmp.firstChild) span.appendChild(tmp.firstChild)
        range.insertNode(span)
        sel.removeAllRanges()
        const nr = document.createRange()
        nr.setStartAfter(span)
        nr.collapse(true)
        sel.addRange(nr)
      }
    } catch { /* skip */ }
  }
}

/* Detect the data-size of the selection's start container. Returns null if no inline span. */
function getSelectionSize(editorEl) {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return null
  let node = sel.getRangeAt(0).startContainer
  if (node.nodeType === Node.TEXT_NODE) node = node.parentNode
  while (node && node !== editorEl) {
    if (node.dataset?.size) return node.dataset.size
    node = node.parentNode
  }
  return null
}

/* ─────────────────────────────────────────────────────────────────────────
   Icons
   ───────────────────────────────────────────────────────────────────────── */

const EmojiTrigger = forwardRef(function EmojiTrigger({ onClick, active }, ref) {
  return (
    <motion.button
      ref={ref}
      type="button"
      className={`${styles.emojiTrigger} ${active ? styles.emojiTriggerActive : ''}`}
      onClick={onClick}
      /* preventDefault keeps focus + selection in the contenteditable so
         insertEmoji's getSelection() returns the user's actual caret
         position. Without this the browser shifts focus to the button on
         pointerdown, the contenteditable selection collapses to position
         0, and emojis land at the start of the line instead of the caret. */
      onPointerDown={e => { e.preventDefault(); e.stopPropagation() }}
      aria-label="Add emoji"
      tabIndex={-1}
      whileHover={{ scale: 1.06 }}
      whileTap={{ scale: 0.94 }}
      transition={{ duration: 0.12, ease: 'easeOut' }}
    >
      <span className={styles.emojiTriggerFace}>🙂</span>
    </motion.button>
  )
})

function IconHighlight() {
  return (
    <svg width="15" height="14" viewBox="0 0 15 14" fill="none" aria-hidden>
      <path d="M9.5 1L13.5 5L7 11.5L2.5 12L3 7.5L9.5 1Z"
            stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" fill="none"/>
      <path d="M2.5 12L3 7.5L7 11.5L2.5 12Z"
            fill="currentColor" opacity="0.55"/>
      <rect x="0.5" y="13.2" width="14" height="1.4" rx="0.7" fill="rgba(255,208,40,0.92)"/>
    </svg>
  )
}

/* ─────────────────────────────────────────────────────────────────────────
   SelectionToolbar
   ───────────────────────────────────────────────────────────────────────── */

const HIGHLIGHT_OPTIONS = [
  { id: 'yellow', label: 'Yellow', dot: 'rgba(255,208,40,0.95)'  },
  { id: 'pink',   label: 'Pink',   dot: 'rgba(255,130,160,0.95)' },
  { id: 'sage',   label: 'Sage',   dot: 'rgba(75,185,140,0.95)'  },
]

function SelectionToolbar({ selRect, selSize = 'md', onApply }) {
  const [hlOpen, setHlOpen] = useState(false)

  if (!selRect) return null

  const TOOLBAR_H = 40
  const MARGIN    = 10
  const centerX   = selRect.left + selRect.width / 2
  let   top       = selRect.top  - TOOLBAR_H - MARGIN
  if (top < 60) top = selRect.bottom + MARGIN

  return createPortal(
    <motion.div
      className={styles.selToolbar}
      style={{ left: Math.round(centerX), top: Math.round(top) }}
      initial={{ opacity: 0, y: 6, scale: 0.94, x: '-50%' }}
      animate={{ opacity: 1, y: 0, scale: 1,    x: '-50%' }}
      exit={{ opacity: 0,    y: 6, scale: 0.94, x: '-50%' }}
      transition={{ duration: 0.13, ease: 'easeOut' }}
    >
      {/* Highlight icon + colour dots */}
      <div className={styles.hlSection}>
        <AnimatePresence>
          {hlOpen && (
            <motion.div
              className={styles.hlColors}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -6 }}
              transition={{ duration: 0.11 }}
            >
              {HIGHLIGHT_OPTIONS.map(opt => (
                <button
                  key={opt.id}
                  className={styles.selColorBtn}
                  style={{ '--dot': opt.dot }}
                  title={opt.label}
                  aria-label={`${opt.label} highlight`}
                  onMouseDown={e => { e.preventDefault(); onApply('highlight', opt.id) }}
                />
              ))}
              <button
                className={styles.selRemoveHlBtn}
                title="Remove highlight"
                aria-label="Remove highlight"
                onMouseDown={e => { e.preventDefault(); onApply('highlight', 'none') }}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                  <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.25"/>
                  <line x1="4" y1="7" x2="10" y2="7" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round"/>
                </svg>
              </button>
            </motion.div>
          )}
        </AnimatePresence>
        <button
          className={`${styles.hlBtn} ${hlOpen ? styles.hlBtnActive : ''}`}
          title="Highlight"
          aria-label="Highlight"
          onMouseDown={e => { e.preventDefault(); setHlOpen(v => !v) }}
        >
          <IconHighlight />
        </button>
      </div>

      <div className={styles.selSep} aria-hidden />

      {/* Strikethrough */}
      <button
        className={styles.selStrikeBtn}
        title="Strikethrough"
        aria-label="Strikethrough"
        onMouseDown={e => { e.preventDefault(); onApply('strike') }}
      >
        S
      </button>

    </motion.div>,
    document.body
  )
}

/* ─────────────────────────────────────────────────────────────────────────
   RecipientBox — contenteditable, supports full formatting toolbar
   ───────────────────────────────────────────────────────────────────────── */
function RecipientBox({ value, onChange, onHide, shakeKey }) {
  const editorRef    = useRef(null)
  const triggerRef   = useRef(null)
  const isEditingRef = useRef(false)
  const lastValidRef = useRef(value)
  const [boxScope, animateBox] = useAnimate()
  const prevShakeKey = useRef(0)

  // No pencil-scratch sound on the recipient field — typing a name is
  // setup, not the act of writing the letter. The sound stays on the
  // body editor (MessageBox below) where it belongs.

  const [emojiOpen, setEmojiOpen] = useState(false)
  const [selActive, setSelActive] = useState(false)
  const [selRect,   setSelRect]   = useState(null)
  const [selSize,   setSelSize]   = useState('md')

  const undoStackRef = useRef([])
  const redoStackRef = useRef([])

  const isEmpty = !value || value.trim() === ''

  /* Sync value → DOM when not focused */
  useEffect(() => {
    const el = editorRef.current
    if (!el || isEditingRef.current) return
    const html = markupToHtml(value)
    if (el.innerHTML !== html) el.innerHTML = html
    lastValidRef.current = value
  }, [value])

  useEffect(() => {
    const el = editorRef.current
    if (!el) return
    el.innerHTML = markupToHtml(value)
    lastValidRef.current = value
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (shakeKey === prevShakeKey.current) return
    prevShakeKey.current = shakeKey
    if (!shakeKey || !boxScope.current) return
    animateBox(boxScope.current, { x: [0, -8, 8, -6, 6, -3, 3, 0] }, { duration: 0.45, ease: 'easeOut' })
  }, [shakeKey, animateBox, boxScope])

  function handleInput() {
    const el = editorRef.current
    if (!el) return
    const plain = el.textContent || ''
    if (plain.length > MAX_NAME_CH) {
      el.innerHTML = markupToHtml(lastValidRef.current)
      placeCursorAtEnd(el)
      return
    }
    undoStackRef.current.push(lastValidRef.current)
    if (undoStackRef.current.length > 100) undoStackRef.current.shift()
    redoStackRef.current = []
    const markup = serializeToMarkup(el)
    lastValidRef.current = markup
    onChange(markup)
    setSelActive(false)
    setSelRect(null)
  }

  function handleFocus() { isEditingRef.current = true }
  function handleBlur()  {
    isEditingRef.current = false
    setSelActive(false)
    setSelRect(null)
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') { e.preventDefault(); return }
    const el = editorRef.current
    if (!el) return
    if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault()
      const prev = undoStackRef.current.pop()
      if (prev !== undefined) {
        redoStackRef.current.push(lastValidRef.current)
        lastValidRef.current = prev
        el.innerHTML = markupToHtml(prev)
        onChange(prev)
        placeCursorAtEnd(el)
      }
      return
    }
    if ((e.metaKey || e.ctrlKey) && ((e.key === 'z' && e.shiftKey) || e.key === 'y')) {
      e.preventDefault()
      const next = redoStackRef.current.pop()
      if (next !== undefined) {
        undoStackRef.current.push(lastValidRef.current)
        lastValidRef.current = next
        el.innerHTML = markupToHtml(next)
        onChange(next)
        placeCursorAtEnd(el)
      }
    }
  }

  function checkSel() {
    const rect = readSelRect(editorRef.current)
    if (!rect) { setSelActive(false); setSelRect(null); return }
    setSelRect(rect)
    setSelActive(true)
    setSelSize(getSelectionSize(editorRef.current) ?? 'md')
  }

  function applyFormat(type, param) {
    const editor = editorRef.current
    if (!editor) return
    undoStackRef.current.push(lastValidRef.current)
    if (undoStackRef.current.length > 100) undoStackRef.current.shift()
    redoStackRef.current = []
    applyFormatDOM(type, param)
    const markup = normalizeMarkup(serializeToMarkup(editor))
    lastValidRef.current = markup
    onChange(markup)
    setSelActive(false)
    setSelRect(null)
  }

  function insertEmoji(emoji) {
    const editor = editorRef.current
    if (!editor) return
    editor.focus()
    const sel = window.getSelection()
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0)
      range.deleteContents()
      const tn = document.createTextNode(emoji)
      range.insertNode(tn)
      range.setStartAfter(tn)
      range.collapse(true)
      sel.removeAllRanges()
      sel.addRange(range)
    } else {
      editor.appendChild(document.createTextNode(emoji))
    }
    handleInput()
    setEmojiOpen(false)
  }

  return (
    <motion.div
      ref={boxScope}
      className={styles.box}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8, scale: 0.97 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className={styles.boxHeader}>
        <span className={styles.boxLabel}>Who's this letter for?</span>
        <button type="button" className={styles.hideBtn} onClick={onHide} aria-label="Skip recipient">
          skip
        </button>
      </div>

      <div className={styles.editorWrapSingle}>
        <div
          ref={editorRef}
          className={styles.recipientEditor}
          contentEditable
          suppressContentEditableWarning
          onInput={handleInput}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          onMouseUp={checkSel}
          onKeyUp={checkSel}
          spellCheck
          aria-label="Recipient name"
        />
        {isEmpty && (
          <div className={styles.editorPlaceholder} aria-hidden>
            Enter their name
          </div>
        )}
      </div>

      <div className={styles.boxFooter}>
        <div className={styles.emojiWrap}>
          <EmojiTrigger ref={triggerRef} onClick={() => setEmojiOpen(v => !v)} active={emojiOpen} />
          <AnimatePresence>
            {emojiOpen && (
              <EmojiPicker
                triggerRef={triggerRef}
                onSelect={insertEmoji}
                onClose={() => setEmojiOpen(false)}
                placement="down"
              />
            )}
          </AnimatePresence>
        </div>
      </div>

      <AnimatePresence>
        {selActive && selRect && (
          <SelectionToolbar
            key="rec-toolbar"
            selRect={selRect}
            selSize={selSize}
            onApply={applyFormat}
          />
        )}
      </AnimatePresence>
    </motion.div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────
   MessageBox — contenteditable message editor
   ───────────────────────────────────────────────────────────────────────── */
function MessageBox({ recipient, value, onChange, shakeKey, textSize = 'lg', onSizeChange, resyncKey = 0 }) {
  const editorRef           = useRef(null)
  const triggerRef          = useRef(null)
  const isEditingRef        = useRef(false)
  const lastValidRef        = useRef(value)
  const tooltipDismissedRef = useRef(false)
  const firstWordSeenRef    = useRef(false)

  // Pencil-scratch sound on each typed character (message body)
  useTypingSound(editorRef)

  const [boxScope, animateBox] = useAnimate()
  const prevShakeKey = useRef(0)

  const [emojiOpen,    setEmojiOpen]    = useState(false)
  const [selActive,    setSelActive]    = useState(false)
  const [selRect,      setSelRect]      = useState(null)
  const [selSize,      setSelSize]      = useState('md')
  const [showTooltip,  setShowTooltip]  = useState(false)
  const [tooltipPos,   setTooltipPos]   = useState(null)

  const undoStackRef = useRef([])
  const redoStackRef = useRef([])

  const firstName   = extractName(markupToPlainText(recipient))
  const headerLabel = firstName ? `Message to ${firstName}` : 'Your message'
  const isEmpty     = !value || value.trim() === ''

  /* Sync value → DOM when not focused */
  useEffect(() => {
    const el = editorRef.current
    if (!el || isEditingRef.current) return
    const html = markupToHtml(value)
    if (el.innerHTML !== html) el.innerHTML = html
    lastValidRef.current = value
  }, [value])

  useEffect(() => {
    const el = editorRef.current
    if (!el) return
    el.innerHTML = markupToHtml(value)
    lastValidRef.current = value
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Hard sync from external (e.g. WritingScreen reverted `value` after detecting
  // paper overflow). Force-flush the contenteditable even when focused, because
  // during typing the editor is the source of truth and won't otherwise pick up
  // the rollback.
  useEffect(() => {
    if (!resyncKey) return
    const el = editorRef.current
    if (!el) return
    const html = markupToHtml(value)
    if (el.innerHTML !== html) el.innerHTML = html
    lastValidRef.current = value
    placeCursorAtEnd(el)
  }, [resyncKey]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (shakeKey === prevShakeKey.current) return
    prevShakeKey.current = shakeKey
    if (!shakeKey || !boxScope.current) return
    animateBox(boxScope.current, { x: [0, -8, 8, -6, 6, -3, 3, 0] }, { duration: 0.45, ease: 'easeOut' })
  }, [shakeKey, animateBox, boxScope])

  useEffect(() => {
    if (showTooltip && boxScope.current) {
      const rect = boxScope.current.getBoundingClientRect()
      setTooltipPos({ top: rect.bottom + 8, left: rect.left, width: rect.width })
    }
  }, [showTooltip, boxScope])

  /* Reset first-word tracker when the field is cleared so a new note shows the hint */
  useEffect(() => {
    if (!value || value.trim() === '') {
      firstWordSeenRef.current = false
    }
  }, [value])

  function handlePaste(e) {
    e.preventDefault()
    const el = editorRef.current
    if (!el) return
    const html  = e.clipboardData?.getData('text/html')  ?? ''
    const plain = e.clipboardData?.getData('text/plain') ?? ''

    // Preserve highlights / strikes / bold / size on paste. When the clipboard
    // carries HTML (copied from this editor, or any rich source) we parse it in
    // an inert DOMParser document and run it through the editor's OWN serializer
    // — so only the formatting we support survives and everything else collapses
    // to its text. The result is re-inserted as HTML so the marks come back.
    // Plain-text-only clipboards fall back to the original insertText path.
    let pastedMarkup
    if (html) {
      const body = new DOMParser().parseFromString(html, 'text/html').body
      pastedMarkup = serializeToMarkup(body).replace(/^\n+|\n+$/g, '')
    } else {
      pastedMarkup = plain
    }
    // Normalise line endings and collapse runs of 3+ newlines to 2 so pasted
    // paragraphs don't create double blank lines after serializeToMarkup runs.
    pastedMarkup = pastedMarkup.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n{3,}/g, '\n\n')

    // markupToHtml escapes <, >, & before re-applying our whitelisted tags, so
    // no arbitrary clipboard HTML reaches the live DOM. Paper overflow (not a
    // word count) is the only limit — the WritingScreen guard reverts + toasts
    // if the paste spills past the paper.
    if (html) document.execCommand('insertHTML', false, markupToHtml(pastedMarkup))
    else      document.execCommand('insertText', false, pastedMarkup)
    handleInput()
  }

  function handleInput() {
    const el = editorRef.current
    if (!el) return
    const plain = el.textContent || ''
    const words = countWords(plain)
    undoStackRef.current.push(lastValidRef.current)
    if (undoStackRef.current.length > 100) undoStackRef.current.shift()
    redoStackRef.current = []
    // Clamp to max 2 consecutive newlines — browser DOM can produce extras
    // when pasted content gets split into block-level <div> elements.
    const markup = serializeToMarkup(el).replace(/\n{3,}/g, '\n\n')
    lastValidRef.current = markup
    onChange(markup)
    setSelActive(false)
    setSelRect(null)
    if (!firstWordSeenRef.current && words >= 1) {
      firstWordSeenRef.current = true
      if (!tooltipDismissedRef.current) setShowTooltip(true)
    }
  }

  function dismissTooltip() {
    tooltipDismissedRef.current = true
    setShowTooltip(false)
  }

  function handleFocus() { isEditingRef.current = true }
  function handleBlur()  {
    isEditingRef.current = false
    setSelActive(false)
    setSelRect(null)
  }

  function handleKeyDown(e) {
    const el = editorRef.current
    if (e.key === 'Enter') {
      e.preventDefault()
      document.execCommand('insertLineBreak')
      handleInput()
      return
    }
    if (!el) return
    if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault()
      const prev = undoStackRef.current.pop()
      if (prev !== undefined) {
        redoStackRef.current.push(lastValidRef.current)
        lastValidRef.current = prev
        el.innerHTML = markupToHtml(prev)
        onChange(prev)
        placeCursorAtEnd(el)
      }
      return
    }
    if ((e.metaKey || e.ctrlKey) && ((e.key === 'z' && e.shiftKey) || e.key === 'y')) {
      e.preventDefault()
      const next = redoStackRef.current.pop()
      if (next !== undefined) {
        undoStackRef.current.push(lastValidRef.current)
        lastValidRef.current = next
        el.innerHTML = markupToHtml(next)
        onChange(next)
        placeCursorAtEnd(el)
      }
    }
  }

  function checkSel() {
    const rect = readSelRect(editorRef.current)
    if (!rect) { setSelActive(false); setSelRect(null); return }
    setSelRect(rect)
    setSelActive(true)
    setSelSize(getSelectionSize(editorRef.current) ?? textSize)
  }

  function applyFormat(type, param) {
    const editor = editorRef.current
    if (!editor) return
    undoStackRef.current.push(lastValidRef.current)
    if (undoStackRef.current.length > 100) undoStackRef.current.shift()
    redoStackRef.current = []
    applyFormatDOM(type, param)
    const markup = normalizeMarkup(serializeToMarkup(editor))
    lastValidRef.current = markup
    onChange(markup)
    setSelActive(false)
    setSelRect(null)
  }

  function insertEmoji(emoji) {
    const editor = editorRef.current
    if (!editor) return
    editor.focus()
    const sel = window.getSelection()
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0)
      range.deleteContents()
      const tn = document.createTextNode(emoji)
      range.insertNode(tn)
      range.setStartAfter(tn)
      range.collapse(true)
      sel.removeAllRanges()
      sel.addRange(range)
    } else {
      editor.appendChild(document.createTextNode(emoji))
    }
    handleInput()
    setEmojiOpen(false)
  }

  return (
    <div className={styles.msgWrapper}>
    <motion.div
      ref={boxScope}
      className={styles.box}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: 0.07 }}
    >
      <div className={styles.boxHeader}>
        <AnimatePresence mode="wait">
          <motion.span
            key={headerLabel}
            className={styles.boxLabel}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
          >
            {headerLabel}
          </motion.span>
        </AnimatePresence>
        <div className={styles.sizeSelector}>
          {[['sm','S'],['md','M'],['lg','L']].map(([id, label]) => (
            <button
              key={id}
              className={`${styles.sizePick} ${textSize === id ? styles.sizePickActive : ''}`}
              onClick={() => onSizeChange?.(id)}
              title={id === 'sm' ? 'Small — up to 440 words' : id === 'md' ? 'Medium — up to 220 words' : 'Large — up to 100 words'}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div
        className={styles.editorWrap}
        onWheel={e => {
          // Manual scroll forwarding — Chrome/Safari sometimes ignore wheel
          // events inside contenteditable, leaving the wrapper "stuck" even
          // when overflow-y is set. Forward the delta to scrollTop ourselves.
          // Only preventDefault when the wrapper can actually consume the
          // scroll so we don't trap the page when at the top/bottom edge.
          const el = e.currentTarget
          const atTop    = el.scrollTop === 0
          const atBottom = Math.ceil(el.scrollTop + el.clientHeight) >= el.scrollHeight
          if ((e.deltaY < 0 && atTop) || (e.deltaY > 0 && atBottom)) return
          el.scrollTop += e.deltaY
          e.preventDefault()
        }}
      >
        <div
          ref={editorRef}
          className={styles.messageEditor}
          contentEditable
          suppressContentEditableWarning
          onInput={handleInput}
          onPaste={handlePaste}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          onMouseUp={checkSel}
          onKeyUp={checkSel}
          spellCheck
          aria-label="Message"
          aria-multiline="true"
        />
        {isEmpty && (
          <div className={styles.editorPlaceholder} aria-hidden>
            Write your heart out…
          </div>
        )}
      </div>

      <div className={styles.boxFooter}>
        <div className={styles.emojiWrap}>
          <EmojiTrigger ref={triggerRef} onClick={() => setEmojiOpen(v => !v)} active={emojiOpen} />
          <AnimatePresence>
            {emojiOpen && (
              <EmojiPicker
                triggerRef={triggerRef}
                onSelect={insertEmoji}
                onClose={() => setEmojiOpen(false)}
                placement="up"
              />
            )}
          </AnimatePresence>
        </div>
        {/* Word count removed — the active limit is now paper space, not a
            fixed word ceiling, so the "2 / 220" counter was misleading. */}
      </div>

      <AnimatePresence>
        {selActive && selRect && (
          <SelectionToolbar
            key="msg-toolbar"
            selRect={selRect}
            selSize={selSize}
            onApply={applyFormat}
          />
        )}
      </AnimatePresence>
    </motion.div>

    <AnimatePresence>
      {showTooltip && tooltipPos && createPortal(
        <motion.div
          className={styles.fmtTooltip}
          style={{ top: tooltipPos.top, left: tooltipPos.left, width: tooltipPos.width }}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className={styles.fmtTooltipLeft}>
            <span className={styles.fmtTooltipEyebrow}>did you know?</span>
            <span className={styles.fmtTooltipBody}>Select a part of text and change its attributes.</span>
            <div className={styles.fmtDemoRow}>
              <span className={styles.fmtDemoText}>
                Hello <mark className={styles.fmtMiniHL}>world</mark>
              </span>
              <div className={styles.fmtMiniBar}>
                <span className={styles.fmtMiniBarBtn}>B</span>
                <span className={styles.fmtMiniBarBtnS}>S</span>
                <span className={styles.fmtMiniBarHL}><IconHighlight /></span>
                <span className={styles.fmtMiniBarSep} />
                <span className={styles.fmtMiniSz}>S</span>
                <span className={styles.fmtMiniSz}>M</span>
                <span className={styles.fmtMiniSz}>L</span>
              </div>
            </div>
          </div>
          <button className={styles.fmtTooltipDismiss} onClick={dismissTooltip}>
            Got it →
          </button>
        </motion.div>,
        document.body
      )}
    </AnimatePresence>
  </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────
   InputPanel — exported
   ───────────────────────────────────────────────────────────────────────── */
export default function InputPanel({
  recipient,
  message,
  onMessageChange,
  shakeKey,
  textSize,
  onTextSizeChange,
  editorResyncKey = 0,
}) {
  return (
    <div className={styles.panel}>
      <MessageBox
        recipient={recipient}
        value={message}
        onChange={onMessageChange}
        shakeKey={shakeKey}
        textSize={textSize}
        onSizeChange={onTextSizeChange}
        resyncKey={editorResyncKey}
      />
    </div>
  )
}

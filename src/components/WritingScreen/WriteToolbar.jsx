/**
 * WriteToolbar — iPad-only floating bottom-right FAB for the Write tab.
 *
 * Architecture (palm-rest safe):
 *
 *   ┌──────────────────────────────┐
 *   │                              │   ← canvas
 *   │   when collapsed (default):  │
 *   │                              │
 *   │                       ╭─╮    │   ← only this tiny FAB exists
 *   │                       │●│    │     anchored bottom-right
 *   │                       ╰─╯    │     (shows active tool icon
 *   └──────────────────────────────┘      + a coloured dot)
 *
 *   ┌──────────────────────────────┐
 *   │           when expanded:     │
 *   │                              │
 *   │   [Pen][HL][Eraser]│●●●│●●●  │   ← popover floats just LEFT
 *   │                       ╭─╮    │     of the FAB. Tap outside or
 *   │                       │●│    │     re-tap the FAB to close.
 *   │                       ╰─╯    │
 *   └──────────────────────────────┘
 *
 * Why collapse to a FAB: with the previous always-open wide pill, the
 * user's palm rested on the toolbar while writing on the lower half of
 * the paper. iOS sometimes interpreted palm contact as button taps,
 * causing tool switches mid-stroke + race conditions with Pencil input.
 * A 56px FAB in one corner has no palm-rest collision.
 */

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { PEN_COLORS, HIGHLIGHTER_COLORS } from '../../lib/drawingPresets'
import { PenSvg, HighlighterSvg, EraserSvg } from './drawingIcons'
import styles from './WriteToolbar.module.css'

function ToolBtn({ tool, label, active, onClick, children }) {
  return (
    <button
      type="button"
      className={`${styles.toolBtn} ${active ? styles.toolBtnActive : ''}`}
      onClick={() => onClick(tool)}
      aria-pressed={active}
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  )
}

function Swatch({ color, active, onClick, ariaLabel }) {
  return (
    <button
      type="button"
      className={`${styles.swatch} ${active ? styles.swatchActive : ''}`}
      style={{ '--swatch': color }}
      onClick={onClick}
      role="radio"
      aria-checked={active}
      aria-label={ariaLabel ?? `Color ${color}`}
      title={color}
    >
      <span className={styles.swatchDot} />
    </button>
  )
}

function ThicknessBtn({ id, label, active, dotSize, dotColor, onClick }) {
  return (
    <button
      type="button"
      className={`${styles.thickBtn} ${active ? styles.thickBtnActive : ''}`}
      onClick={() => onClick(id)}
      aria-pressed={active}
      aria-label={label}
      title={label}
    >
      <span
        className={styles.thickDot}
        style={{ width: dotSize, height: dotSize, background: dotColor }}
      />
    </button>
  )
}

export default function WriteToolbar({
  drawingTool,                  // 'pen' | 'highlighter' | 'eraser' | null
  onChangeDrawingTool,
  penColor,
  onChangePenColor,
  highlighterColor,
  onChangeHighlighterColor,
  strokeThickness = 'md',
  onChangeStrokeThickness,
}) {
  // Treat null as pen — same as before.
  const effectiveTool = drawingTool ?? 'pen'
  const isPen         = effectiveTool === 'pen'
  const isHighlighter = effectiveTool === 'highlighter'
  const isEraser      = effectiveTool === 'eraser'

  const colors      = isHighlighter ? HIGHLIGHTER_COLORS : PEN_COLORS
  const activeColor = isHighlighter ? highlighterColor : penColor
  const onPickColor = isHighlighter ? onChangeHighlighterColor : onChangePenColor

  // Popover state — closed by default. Stays open across tool changes so
  // the user can pick tool → color → thickness without re-opening.
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

  // Auto-close on outside tap. We listen for pointerdown anywhere in the
  // document; if the target is outside our wrapper, collapse. capture
  // phase so we beat React's normal bubbling (and so a tap that selects
  // a sticker doesn't also count as an "outside" close-and-reopen).
  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', handler, true)
    return () => document.removeEventListener('pointerdown', handler, true)
  }, [open])

  // Current tool's icon for the FAB face.
  const FabIcon = isHighlighter ? HighlighterSvg : isEraser ? EraserSvg : PenSvg

  return (
    <motion.div
      ref={wrapRef}
      className={styles.wrap}
      initial={{ opacity: 0, scale: 0.85, y: 12 }}
      animate={{ opacity: 1, scale: 1,    y: 0 }}
      exit={{    opacity: 0, scale: 0.85, y: 12 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      aria-label="Writing tools"
    >
      {/* Popover — full toolbar, only visible while open. Sits to the
          LEFT of the FAB so it never extends offscreen on iPad. */}
      <AnimatePresence>
        {open && (
          <motion.div
            className={styles.popover}
            initial={{ opacity: 0, x: 12, scale: 0.96 }}
            animate={{ opacity: 1, x: 0,  scale: 1 }}
            exit={{    opacity: 0, x: 12, scale: 0.96 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* Drawing tool radio */}
            <div className={styles.section} role="radiogroup" aria-label="Drawing tool">
              <ToolBtn tool="pen"         label="Pen"         active={isPen}         onClick={onChangeDrawingTool}>
                <PenSvg className={styles.toolIcon} inkColor={penColor} />
              </ToolBtn>
              <ToolBtn tool="highlighter" label="Highlighter" active={isHighlighter} onClick={onChangeDrawingTool}>
                <HighlighterSvg className={styles.toolIcon} inkColor={highlighterColor} />
              </ToolBtn>
              <ToolBtn tool="eraser"      label="Eraser"      active={isEraser}      onClick={onChangeDrawingTool}>
                <EraserSvg className={styles.toolIcon} />
              </ToolBtn>
            </div>

            <span className={styles.divider} aria-hidden />

            {/* Color row (hidden for eraser) */}
            <AnimatePresence mode="wait" initial={false}>
              {!isEraser && (
                <motion.div
                  key={isHighlighter ? 'hl' : 'pen'}
                  className={styles.section}
                  role="radiogroup"
                  aria-label={`${isHighlighter ? 'Highlighter' : 'Pen'} color`}
                  initial={{ opacity: 0, x: 6 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{    opacity: 0, x: -6 }}
                  transition={{ duration: 0.14 }}
                >
                  {colors.map(c => (
                    <Swatch
                      key={c}
                      color={c}
                      active={c.toLowerCase() === (activeColor ?? '').toLowerCase()}
                      onClick={() => onPickColor?.(c)}
                    />
                  ))}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Thickness picker (hidden for eraser) */}
            {!isEraser && (
              <>
                <span className={styles.divider} aria-hidden />
                <div className={styles.section} role="radiogroup" aria-label="Stroke thickness">
                  <ThicknessBtn id="sm" label="Thin"   active={strokeThickness === 'sm'} dotSize={6}  dotColor={activeColor} onClick={onChangeStrokeThickness} />
                  <ThicknessBtn id="md" label="Medium" active={strokeThickness === 'md'} dotSize={10} dotColor={activeColor} onClick={onChangeStrokeThickness} />
                  <ThicknessBtn id="lg" label="Thick"  active={strokeThickness === 'lg'} dotSize={16} dotColor={activeColor} onClick={onChangeStrokeThickness} />
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* FAB — always visible. Shows the active tool's illustration with
          a small coloured dot in the corner indicating the active ink
          colour. Tap to toggle the popover.

          When a drawing tool is armed (which on iPad in Write mode is
          always true), the FAB switches to the "active" white-fill
          variant — same visual recipe as the selected tile inside the
          popover, so "you're in drawing mode" reads at a glance. */}
      <button
        type="button"
        className={`${styles.fab} ${open ? styles.fabOpen : ''} ${drawingTool ? styles.fabActive : ''}`}
        onClick={() => setOpen(o => !o)}
        aria-label={open ? 'Close writing tools' : `Writing tools (${effectiveTool})`}
        aria-expanded={open}
      >
        <FabIcon
          className={styles.fabIcon}
          inkColor={isHighlighter ? highlighterColor : penColor}
        />
        {!isEraser && (
          <span
            className={styles.fabDot}
            style={{ background: activeColor }}
            aria-hidden
          />
        )}
      </button>
    </motion.div>
  )
}

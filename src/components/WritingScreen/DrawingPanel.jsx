/**
 * DrawingPanel — the Draw tool side panel.
 *
 * Minimal by design: pen / highlighter icon toggle, one color row for the
 * active tool only, Undo, and Clear. No shapes, no layers, no lasso — this
 * is meant to feel like picking up a pen, not opening a graphics app.
 *
 * The pen and highlighter palettes are intentionally kept tiny (three warm
 * hues each). Only the active tool's palette is shown — switching tools
 * cross-fades the swatches so the panel never feels crowded.
 */

import { AnimatePresence, motion } from 'framer-motion'
import {
  PEN_COLORS,
  HIGHLIGHTER_COLORS,
} from '../../lib/drawingPresets'
import { PenSvg, HighlighterSvg, EraserSvg } from './drawingIcons'
import styles from './DrawingPanel.module.css'

/**
 * ToolButton — the pen / highlighter / eraser "tray" affordance.
 *
 * The illustration is taller than its container and clipped to the bottom,
 * so a portion of the tool sits below the holder at rest. When the tool
 * becomes active it lifts up. Buttons behave as radios — one tool is always
 * selected while the Draw tab is open, so clicking an already-active tool
 * is a no-op rather than deselecting it.
 */
function ToolButton({ tool, illustration, activeTool, onSelect, label }) {
  const isActive = activeTool === tool
  return (
    <button
      className={`${styles.toolBtn} ${isActive ? styles.toolBtnActive : ''}`}
      onClick={() => { if (!isActive) onSelect(tool) }}
      aria-pressed={isActive}
      aria-label={label}
      title={label}
      type="button"
    >
      <span className={styles.toolBtnSlot}>{illustration}</span>
    </button>
  )
}

function ColorRow({ colors, activeColor, onPick, tool }) {
  return (
    <div className={styles.colorRow} role="radiogroup" aria-label={`${tool} colors`}>
      {colors.map(c => {
        const isActive = c.toLowerCase() === activeColor.toLowerCase()
        return (
          <button
            key={c}
            className={`${styles.swatch} ${isActive ? styles.swatchActive : ''}`}
            style={{ '--swatch': c }}
            onClick={() => onPick(c)}
            role="radio"
            aria-checked={isActive}
            aria-label={`Color ${c}`}
            title={c}
          >
            <span className={styles.swatchDot} />
          </button>
        )
      })}
    </div>
  )
}

// Detect whether we're on macOS for tooltip hints (⌘ vs Ctrl). Falls back to
// Ctrl on SSR / non-browser contexts so the helper text always reads cleanly.
const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '')
const MOD = IS_MAC ? '⌘' : 'Ctrl+'

export default function DrawingPanel({
  activeTool,                  // 'pen' | 'highlighter' | null
  onChangeTool,
  penColor,
  onChangePenColor,
  highlighterColor,
  onChangeHighlighterColor,
  strokeCount = 0,
  onUndo,
  onRedo = () => false,
  canUndo = false,
  canRedo = false,
  onClear,
}) {
  return (
    <div className={styles.root}>
      <div className={styles.tools}>
        <ToolButton
          tool="pen"
          label="Pen"
          illustration={
            <PenSvg className={styles.toolIllustration} inkColor={penColor} />
          }
          activeTool={activeTool}
          onSelect={onChangeTool}
        />
        <ToolButton
          tool="highlighter"
          label="Highlighter"
          illustration={
            <HighlighterSvg className={styles.toolIllustration} inkColor={highlighterColor} />
          }
          activeTool={activeTool}
          onSelect={onChangeTool}
        />
        <ToolButton
          tool="eraser"
          label="Eraser"
          illustration={
            <EraserSvg className={styles.toolIllustration} />
          }
          activeTool={activeTool}
          onSelect={onChangeTool}
        />
      </div>

      {/* Only the active tool's palette is mounted. AnimatePresence cross-fades
          between them as the user switches tools so the panel breathes
          gently rather than snapping. */}
      <div className={styles.colorArea}>
        <AnimatePresence mode="wait" initial={false}>
          {activeTool === 'pen' && (
            <motion.div
              key="pen"
              className={styles.section}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            >
              <p className={styles.sectionLabel}>Pen color</p>
              <ColorRow
                colors={PEN_COLORS}
                activeColor={penColor}
                onPick={onChangePenColor}
                tool="pen"
              />
            </motion.div>
          )}
          {activeTool === 'highlighter' && (
            <motion.div
              key="highlighter"
              className={styles.section}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            >
              <p className={styles.sectionLabel}>Highlighter color</p>
              <ColorRow
                colors={HIGHLIGHTER_COLORS}
                activeColor={highlighterColor}
                onPick={onChangeHighlighterColor}
                tool="highlighter"
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className={styles.actions}>
        <button
          className={styles.actionBtn}
          onClick={onUndo}
          disabled={!canUndo}
          title={`Undo (${MOD}Z), works for drawing AND erasing`}
          type="button"
        >
          Undo
        </button>
        <button
          className={styles.actionBtn}
          onClick={onRedo}
          disabled={!canRedo}
          title={`Redo (${MOD}${IS_MAC ? '⇧' : 'Shift+'}Z)`}
          type="button"
        >
          Redo
        </button>
        <button
          className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
          onClick={onClear}
          disabled={strokeCount === 0}
          title="Clear all strokes"
          type="button"
        >
          Clear
        </button>
      </div>
    </div>
  )
}

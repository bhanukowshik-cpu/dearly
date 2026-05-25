/**
 * WriteToolbar — iPad-only floating bottom toolbar for the Write tab.
 *
 * Sits above the bottom tab nav with inset padding (hugged content). Merges
 * the Draw and Write experiences so the user never has to swap tabs to pick
 * up a different writing tool. Three sections, divider-separated:
 *
 *   ┌────────────────────────────────────────────────────────────┐
 *   │ [Pen][HL][Eraser] │ ●●● │ [Zigzag] │ ▾Paper color         │
 *   └────────────────────────────────────────────────────────────┘
 *
 * Wires into existing state — same drawingTool / penColor / paperConfig
 * the desktop sidebar mutates. No new domain logic; this is a UI shell.
 */

import { motion, AnimatePresence } from 'framer-motion'
import { PEN_COLORS, HIGHLIGHTER_COLORS } from '../../lib/drawingPresets'
import { PenSvg, HighlighterSvg, EraserSvg } from './drawingIcons'
import { PAPER_TYPES, COLOR_SWATCHES } from './stylePresets'
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

/* Zigzag icon kept inline (small + only used here). Mirrors the look from
   CanvasSidebar so the affordance reads the same across surfaces. */
function IconZigzag({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 17l3-4 3 4 3-4 3 4 3-4 3 4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export default function WriteToolbar({
  drawingTool,                  // 'pen' | 'highlighter' | 'eraser' | null
  onChangeDrawingTool,
  penColor,
  onChangePenColor,
  highlighterColor,
  onChangeHighlighterColor,
  paperConfig,
  onChangePaper,
}) {
  // The pen is the implicit default on iPad — but we still surface the radio
  // so the user can switch. Treat null as "pen" for active-state UI.
  const effectiveTool = drawingTool ?? 'pen'
  const isPen         = effectiveTool === 'pen'
  const isHighlighter = effectiveTool === 'highlighter'
  const isEraser      = effectiveTool === 'eraser'

  const colors = isHighlighter ? HIGHLIGHTER_COLORS : PEN_COLORS
  const activeColor = isHighlighter ? highlighterColor : penColor
  const onPickColor = isHighlighter ? onChangeHighlighterColor : onChangePenColor

  const { type = 'minimal', color, showZigzag = false } = paperConfig ?? {}

  function setPaper(patch) {
    onChangePaper?.({ ...paperConfig, ...patch })
  }

  function pickPaperColor(value) {
    // Switching to a color tint implicitly switches paper type to 'color'.
    setPaper({ type: 'color', color: value })
  }

  return (
    <motion.div
      className={styles.root}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      aria-label="Writing tools"
    >
      {/* ── Drawing tool radio ─────────────────────────────────────────── */}
      <div className={styles.section} role="radiogroup" aria-label="Drawing tool">
        <ToolBtn tool="pen" label="Pen" active={isPen} onClick={onChangeDrawingTool}>
          <PenSvg className={styles.toolIcon} inkColor={penColor} />
        </ToolBtn>
        <ToolBtn tool="highlighter" label="Highlighter" active={isHighlighter} onClick={onChangeDrawingTool}>
          <HighlighterSvg className={styles.toolIcon} inkColor={highlighterColor} />
        </ToolBtn>
        <ToolBtn tool="eraser" label="Eraser" active={isEraser} onClick={onChangeDrawingTool}>
          <EraserSvg className={styles.toolIcon} />
        </ToolBtn>
      </div>

      <span className={styles.divider} aria-hidden />

      {/* ── Color row for the active tool (hidden for eraser) ───────────── */}
      <AnimatePresence mode="wait" initial={false}>
        {!isEraser && (
          <motion.div
            key={isHighlighter ? 'hl' : 'pen'}
            className={styles.section}
            role="radiogroup"
            aria-label={`${isHighlighter ? 'Highlighter' : 'Pen'} color`}
            initial={{ opacity: 0, x: 6 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -6 }}
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

      <span className={styles.divider} aria-hidden />

      {/* ── Paper toggles: zigzag + color tint ──────────────────────────── */}
      <div className={styles.section}>
        <button
          type="button"
          className={`${styles.toggleBtn} ${showZigzag ? styles.toggleBtnActive : ''}`}
          onClick={() => setPaper({ showZigzag: !showZigzag })}
          aria-pressed={showZigzag}
          aria-label="Toggle deckle edge"
          title="Deckle edge"
        >
          <IconZigzag />
        </button>
        {COLOR_SWATCHES.map(swatch => (
          <Swatch
            key={swatch.id}
            color={swatch.value}
            active={type === 'color' && color === swatch.value}
            onClick={() => pickPaperColor(swatch.value)}
            ariaLabel={`Paper ${swatch.label}`}
          />
        ))}
      </div>
    </motion.div>
  )
}

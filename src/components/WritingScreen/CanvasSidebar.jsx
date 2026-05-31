import { motion, AnimatePresence } from 'framer-motion'
import { PAPER_SIZES, PAPER_TYPES, COLOR_SWATCHES } from './stylePresets'
import paperStyles from './PaperControls.module.css'
import styles from './CanvasSidebar.module.css'

/* ── Local icons (kept identical to PaperControls) ───────────────────────── */
function IconRuler() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <rect x="1" y="4" width="12" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
      <line x1="4"  y1="4" x2="4"  y2="7" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
      <line x1="7"  y1="4" x2="7"  y2="6" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
      <line x1="10" y1="4" x2="10" y2="7" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
    </svg>
  )
}
function IconZigzag() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M1 4 L3 2 L5 4 L7 2 L9 4 L11 2 L13 4"  stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M1 10 L3 12 L5 10 L7 12 L9 10 L11 12 L13 10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

/* ── PaperThumb (moved from PaperControls) ───────────────────────────────── */
function PaperThumb({ typeId, typeData, active, paperConfig, onClick }) {
  const isColor = typeId === 'color'
  const bgStyle = isColor
    ? { backgroundColor: paperConfig.color || '#FFF0F5' }
    : { backgroundColor: typeData.bg }
  return (
    <button
      className={`${paperStyles.thumb} ${active ? paperStyles.thumbActive : ''}`}
      onClick={onClick}
      title={typeData.label}
    >
      <div className={paperStyles.thumbPaper} style={bgStyle}>
        {typeData.hasStains && <div className={paperStyles.thumbStains} />}
      </div>
      <span className={paperStyles.thumbLabel}>{typeData.label}</span>
    </button>
  )
}

/* ── Toggle pill ─────────────────────────────────────────────────────────── */
function Toggle({ icon, label, active, onClick }) {
  return (
    <motion.button
      className={`${paperStyles.toggle} ${active ? paperStyles.toggleActive : ''}`}
      onClick={onClick}
      title={`${active ? 'Disable' : 'Enable'} ${label}`}
      whileTap={{ scale: 0.94 }}
      transition={{ duration: 0.1 }}
    >
      <span className={paperStyles.toggleLeft}>
        <span className={paperStyles.toggleIcon}>{icon}</span>
        <span className={paperStyles.toggleLabel}>{label}</span>
      </span>
      <div className={`${paperStyles.togglePill} ${active ? paperStyles.togglePillOn : ''}`}>
        <motion.div
          className={paperStyles.toggleDot}
          animate={{ x: active ? 10 : 0 }}
          transition={{ type: 'spring', stiffness: 500, damping: 35 }}
        />
      </div>
    </motion.button>
  )
}

/* ─────────────────────────────────────────────────────────────────────────
   CanvasSidebar — all right-of-canvas controls (desktop only).
     • Paper size      (Strip / Postcard / A4)
     • Paper style     (Default / Color / Vintage  + color swatches)
     • Toggles         (Ruler, Zig-zag)
   On mobile + iPad, paper size is surfaced via the floating
   PaperSizePicker pill above the paper instead.
   ───────────────────────────────────────────────────────────────────────── */
export default function CanvasSidebar({ paperConfig, onChangePaper, disabledSizes = [], onBlocked, hideSize = false }) {
  const { size = 'postcard', type, color, showRuler, showZigzag } = paperConfig

  function set(patch) { onChangePaper({ ...paperConfig, ...patch }) }

  // Picking a paper size: if the message can't fit it, explain via toast
  // instead of switching into an overflow.
  function pickSize(id) {
    if (id === size) return
    if (disabledSizes.includes(id)) { onBlocked?.(id); return }
    set({ size: id })
  }

  return (
    <aside className={styles.wrap} aria-label="Canvas options">

      {/* ── Paper size ─────────────────────────────────────────────────
         Desktop control. On mobile/iPad this is surfaced via the
         PaperSizePicker tabs nested on the paper's top edge, so the
         section is hidden here (hideSize) to avoid the duplicate. */}
      {!hideSize && (
      <section className={styles.section}>
        <h2 className={styles.heading}>Paper size</h2>
        <div className={styles.sizeCol}>
          {Object.entries(PAPER_SIZES).map(([id, sizeData]) => {
            const disabled = disabledSizes.includes(id) && size !== id
            return (
              <button
                key={id}
                type="button"
                // Kept clickable when disabled so the tap can toast a reason.
                className={`${styles.sizePill} ${size === id ? styles.sizePillActive : ''} ${disabled ? styles.sizePillDisabled : ''}`}
                onClick={() => pickSize(id)}
                aria-pressed={size === id}
                aria-disabled={disabled || undefined}
                title={disabled ? `Too much message for the ${sizeData.label}` : undefined}
              >
                {sizeData.label}
              </button>
            )
          })}
        </div>
      </section>
      )}

      {/* ── Paper style (type + color swatches) ────────────────────────── */}
      <section className={styles.section}>
        <h2 className={styles.heading}>Paper style</h2>
        <div className={paperStyles.thumbRow}>
          {Object.entries(PAPER_TYPES).map(([id, typeData]) => (
            <PaperThumb
              key={id}
              typeId={id}
              typeData={typeData}
              active={type === id}
              paperConfig={paperConfig}
              onClick={() => set({ type: id })}
            />
          ))}
        </div>
        <AnimatePresence>
          {type === 'color' && (
            <motion.div
              className={paperStyles.swatchRow}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
            >
              {COLOR_SWATCHES.map(swatch => (
                <button
                  key={swatch.id}
                  className={`${paperStyles.swatch} ${color === swatch.value ? paperStyles.swatchActive : ''}`}
                  style={{ background: swatch.value }}
                  onClick={() => set({ color: swatch.value })}
                  title={swatch.label}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      {/* ── Ruler / Zig-zag toggles ────────────────────────────────────── */}
      <section className={styles.section}>
        <div className={paperStyles.toggleRow}>
          <Toggle
            icon={<IconRuler />}
            label="Ruler"
            active={showRuler}
            onClick={() => set({ showRuler: !showRuler })}
          />
          <Toggle
            icon={<IconZigzag />}
            label="Zig-zag"
            active={showZigzag}
            onClick={() => set({ showZigzag: !showZigzag })}
          />
        </div>
      </section>

    </aside>
  )
}

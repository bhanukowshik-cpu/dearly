import { motion, AnimatePresence } from 'framer-motion'
import { PAPER_TYPES, COLOR_SWATCHES } from './stylePresets'
import styles from './PaperControls.module.css'

/* ── Icons ────────────────────────────────────────────────────────────────── */
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
      <path
        d="M1 4 L3 2 L5 4 L7 2 L9 4 L11 2 L13 4"
        stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"
      />
      <path
        d="M1 10 L3 12 L5 10 L7 12 L9 10 L11 12 L13 10"
        stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  )
}

/* ── Mini paper thumbnail ─────────────────────────────────────────────────
   Thumbnails show only the plain paper colour (and vintage stains).
   They do NOT reflect the ruler or zig-zag toggle state — those only
   apply to the main postcard.
   ───────────────────────────────────────────────────────────────────────── */
function PaperThumb({ typeId, typeData, active, paperConfig, onClick }) {
  const isColor = typeId === 'color'
  const bgStyle = isColor
    ? { backgroundColor: paperConfig.color || '#FFF0F5' }
    : { backgroundColor: typeData.bg }

  return (
    <button
      className={`${styles.thumb} ${active ? styles.thumbActive : ''}`}
      onClick={onClick}
      title={typeData.label}
    >
      <div className={styles.thumbPaper} style={bgStyle}>
        {typeData.hasStains && <div className={styles.thumbStains} />}
      </div>
      <span className={styles.thumbLabel}>{typeData.label}</span>
    </button>
  )
}

/* ── Toggle button ────────────────────────────────────────────────────────── */
function Toggle({ icon, label, active, onClick }) {
  return (
    <motion.button
      className={`${styles.toggle} ${active ? styles.toggleActive : ''}`}
      onClick={onClick}
      title={`${active ? 'Disable' : 'Enable'} ${label}`}
      whileTap={{ scale: 0.94 }}
      transition={{ duration: 0.1 }}
    >
      <span className={styles.toggleLeft}>
        <span className={styles.toggleIcon}>{icon}</span>
        <span className={styles.toggleLabel}>{label}</span>
      </span>
      <div className={`${styles.togglePill} ${active ? styles.togglePillOn : ''}`}>
        <motion.div
          className={styles.toggleDot}
          animate={{ x: active ? 10 : 0 }}
          transition={{ type: 'spring', stiffness: 500, damping: 35 }}
        />
      </div>
    </motion.button>
  )
}

/* ─────────────────────────────────────────────────────────────────────────
   PaperControls — lives below the postcard in the right column
   ───────────────────────────────────────────────────────────────────────── */
export default function PaperControls({ paperConfig, onChange }) {
  const { type, color, showRuler, showZigzag } = paperConfig

  function set(patch) {
    onChange({ ...paperConfig, ...patch })
  }

  return (
    <div className={styles.wrap}>

      {/* ── Paper type thumbnails ──────────────────────────────────────── */}
      <div className={styles.thumbRow}>
        {Object.entries(PAPER_TYPES).map(([id, typeData]) => (
          <PaperThumb
            key={id}
            typeId={id}
            typeData={typeData}
            active={type === id}
            paperConfig={paperConfig}   /* still needed for the `color` swatch value */
            onClick={() => set({ type: id })}
          />
        ))}
      </div>

      {/* ── Color swatches — only when "color" is selected ────────────── */}
      <AnimatePresence>
        {type === 'color' && (
          <motion.div
            className={styles.swatchRow}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
          >
            {COLOR_SWATCHES.map(swatch => (
              <button
                key={swatch.id}
                className={`${styles.swatch} ${color === swatch.value ? styles.swatchActive : ''}`}
                style={{ background: swatch.value }}
                onClick={() => set({ color: swatch.value })}
                title={swatch.label}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Toggles ───────────────────────────────────────────────────── */}
      <div className={styles.toggleRow}>
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

    </div>
  )
}

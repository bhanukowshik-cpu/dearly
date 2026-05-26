/**
 * PaperSizePicker — small segmented pill that sits just above the paper
 * on desktop + non-iPad mobile. Direct-manipulation discoverability for
 * the paper size, which was previously buried in the Style sidebar.
 *
 *   ┌────────────────────────────────┐
 *   │  Strip │ Postcard │   A4       │   ← floating segmented pill
 *   └────────────────────────────────┘
 *   ┌────────────────────────────────┐
 *   │           the paper            │
 *   └────────────────────────────────┘
 *
 * NOT rendered on iPad — that surface already has its own write-mode
 * UX and locks the paper-size to the content per earlier feedback.
 */

import { motion } from 'framer-motion'
import { PAPER_SIZES } from './stylePresets'
import styles from './PaperSizePicker.module.css'

/**
 * variant = 'pill' (default) — floating dark-glass segmented pill that
 *           hovers above the paper. Used on desktop.
 * variant = 'tabs' — file-folder tabs that sit FLUSH on the paper's
 *           top edge (active tab is paper-colored and merges into the
 *           sheet below). Used on mobile + iPad.
 */
export default function PaperSizePicker({ paperConfig, onChangePaper, variant = 'pill' }) {
  const current = paperConfig?.size ?? 'postcard'

  function pick(size) {
    if (size === current) return
    onChangePaper?.({ ...paperConfig, size })
  }

  const isTabs    = variant === 'tabs'
  const rootClass = isTabs ? styles.tabsRoot : styles.pillRoot
  const segClass  = isTabs ? styles.tabSeg  : styles.pillSeg
  const activeClass = isTabs ? styles.tabSegActive : styles.pillSegActive
  // Single layoutId per variant — the indicator is conditionally rendered
  // inside the active button; framer-motion re-parents + animates it when
  // selection changes, giving the "pill slides between options" toggle feel.
  const indicatorLayoutId = `paperSizePill-${variant}`

  return (
    <div className={rootClass} role="radiogroup" aria-label="Paper size">
      {Object.entries(PAPER_SIZES).map(([id, data]) => {
        const active = current === id
        return (
          <button
            key={id}
            type="button"
            className={`${segClass} ${active ? activeClass : ''}`}
            onClick={() => pick(id)}
            role="radio"
            aria-checked={active}
            aria-label={`${data.label} paper`}
            title={data.label}
          >
            {active && isTabs && (
              <motion.span
                layoutId={indicatorLayoutId}
                className={styles.tabIndicator}
                aria-hidden
                transition={{ type: 'spring', stiffness: 460, damping: 38, mass: 0.7 }}
              />
            )}
            <span className={styles.segLabel}>{data.label}</span>
          </button>
        )
      })}
    </div>
  )
}

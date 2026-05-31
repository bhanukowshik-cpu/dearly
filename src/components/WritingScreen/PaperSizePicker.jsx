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
export default function PaperSizePicker({ paperConfig, onChangePaper, variant = 'pill', disabledSizes = [], onBlocked }) {
  const current = paperConfig?.size ?? 'postcard'

  function pick(size) {
    if (size === current) return
    // The message would spill off this (smaller) size — explain instead of switching.
    if (disabledSizes.includes(size)) { onBlocked?.(size); return }
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
        const active   = current === id
        const disabled = disabledSizes.includes(id) && !active
        return (
          <button
            key={id}
            type="button"
            // Not natively disabled — we keep the click alive so tapping a
            // greyed-out size still fires the "too much message" toast.
            className={`${segClass} ${active ? activeClass : ''} ${disabled ? styles.segDisabled : ''}`}
            onClick={() => pick(id)}
            role="radio"
            aria-checked={active}
            aria-disabled={disabled || undefined}
            aria-label={`${data.label} paper${disabled ? ' (too much message to fit)' : ''}`}
            title={disabled ? `Too much message for the ${data.label}` : data.label}
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

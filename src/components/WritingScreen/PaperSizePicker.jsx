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

import { PAPER_SIZES } from './stylePresets'
import styles from './PaperSizePicker.module.css'

export default function PaperSizePicker({ paperConfig, onChangePaper }) {
  const current = paperConfig?.size ?? 'postcard'

  function pick(size) {
    if (size === current) return
    onChangePaper?.({ ...paperConfig, size })
  }

  return (
    <div className={styles.root} role="radiogroup" aria-label="Paper size">
      {Object.entries(PAPER_SIZES).map(([id, data]) => {
        const active = current === id
        return (
          <button
            key={id}
            type="button"
            className={`${styles.seg} ${active ? styles.segActive : ''}`}
            onClick={() => pick(id)}
            role="radio"
            aria-checked={active}
            aria-label={`${data.label} paper`}
            title={data.label}
          >
            {data.label}
          </button>
        )
      })}
    </div>
  )
}

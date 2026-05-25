/**
 * TextStyleToolbar — iPad-only floating pill that appears while the user
 * is typing on the paper. Lets them switch text size between Small,
 * Medium, and Large without leaving the canvas. Mirrors the S/M/L
 * controls in the desktop/mobile InputPanel so the model is consistent.
 *
 *   ┌────────────────────────┐
 *   │ Aa  [ S ][ M ][ L ]    │
 *   └────────────────────────┘
 *
 * Positioned just below the top zoom controls (top-right) — close to
 * where the typing happens but out of the writing surface.
 */

import styles from './TextStyleToolbar.module.css'

const SIZES = [
  { id: 'sm', label: 'S', title: 'Small — up to 440 words' },
  { id: 'md', label: 'M', title: 'Medium — up to 220 words' },
  { id: 'lg', label: 'L', title: 'Large — up to 100 words' },
]

function IconAa({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M3 19l5-12 5 12M4.6 15h6.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14.5 19l4-9 4 9M15.6 16.5h5.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default function TextStyleToolbar({ textSize = 'md', onChangeTextSize }) {
  return (
    <div className={styles.root} role="group" aria-label="Text style">
      <span className={styles.label} aria-hidden>
        <IconAa />
      </span>
      <div className={styles.sizeSelector} role="radiogroup" aria-label="Text size">
        {SIZES.map(({ id, label, title }) => (
          <button
            key={id}
            type="button"
            className={`${styles.sizeBtn} ${textSize === id ? styles.sizeBtnActive : ''}`}
            onClick={() => onChangeTextSize?.(id)}
            role="radio"
            aria-checked={textSize === id}
            aria-label={title}
            title={title}
            /* Keep focus + selection in the editor when the user picks a
               size, otherwise tapping the button steals focus on iOS. */
            onPointerDown={(e) => { e.preventDefault(); e.stopPropagation() }}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}

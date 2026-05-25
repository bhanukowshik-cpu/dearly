/**
 * ZoomControls — iPad-only floating zoom pill.
 *
 * Sits in the top-right of the writing surface so the user can zoom in on
 * the paper for fine-pencil work. Pinch-to-zoom on the paper container
 * shares the same zoomLevel state — these buttons are the discoverable
 * affordance for users who don't think to pinch.
 *
 * Clamped to [0.5, 3.0]; each click steps by 0.25. The current percentage
 * sits between the buttons so the user has unambiguous feedback.
 */

import styles from './ZoomControls.module.css'

export const ZOOM_MIN  = 0.5
export const ZOOM_MAX  = 3.0
export const ZOOM_STEP = 0.25

export function clampZoom(z) {
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.round(z * 100) / 100))
}

export default function ZoomControls({ zoomLevel, onChangeZoom }) {
  const canZoomIn  = zoomLevel < ZOOM_MAX
  const canZoomOut = zoomLevel > ZOOM_MIN
  return (
    <div className={styles.root} role="group" aria-label="Zoom">
      <button
        type="button"
        className={styles.btn}
        onClick={() => onChangeZoom(clampZoom(zoomLevel - ZOOM_STEP))}
        disabled={!canZoomOut}
        aria-label="Zoom out"
        title="Zoom out"
      >
        −
      </button>
      <span className={styles.value} aria-live="polite">{Math.round(zoomLevel * 100)}%</span>
      <button
        type="button"
        className={styles.btn}
        onClick={() => onChangeZoom(clampZoom(zoomLevel + ZOOM_STEP))}
        disabled={!canZoomIn}
        aria-label="Zoom in"
        title="Zoom in"
      >
        +
      </button>
    </div>
  )
}

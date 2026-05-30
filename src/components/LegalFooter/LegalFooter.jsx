import styles from './LegalFooter.module.css'

/**
 * Discreet fixed footer with two clusters:
 *   • left  → a contact line for questions / support / appreciation, linking
 *             to the support inbox, and
 *   • right → links to the standalone Privacy and Terms pages.
 *
 * Rendered only on the landing screen — the writing screen owns its bottom
 * edge with its own toolbar, so the footer would collide with it there.
 * Responsive behavior (label collapse, safe-area insets) lives in the
 * accompanying CSS module.
 */
const SUPPORT_EMAIL = 'hello@dearlynotes.app'

export default function LegalFooter() {
  return (
    <footer className={styles.footer} aria-label="Footer">
      {/* Left — contact */}
      <div className={styles.left}>
        <span className={styles.labels}>Questions · Support · Appreciate</span>
        <a className={styles.email} href={`mailto:${SUPPORT_EMAIL}`}>
          {SUPPORT_EMAIL}
        </a>
      </div>

      {/* Right — legal */}
      <nav className={styles.right} aria-label="Legal">
        <a className={styles.link} href="/privacy">Privacy</a>
        <span className={styles.dot} aria-hidden="true">·</span>
        <a className={styles.link} href="/terms">Terms</a>
      </nav>
    </footer>
  )
}

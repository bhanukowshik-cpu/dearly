import styles from './LegalFooter.module.css'

/**
 * Discreet fixed footer with two clusters:
 *   • left  → a contact line for questions / support / appreciation, linking
 *             to the support inbox, and
 *   • right → links to the standalone Privacy and Terms pages.
 *
 * Shown on the landing screen (all sizes) and on the editor at desktop sizes.
 * On the editor at iPad/phone sizes the bottom edge belongs to the tool nav,
 * so the footer hides itself there (`.onEditor` + a matching media query) and
 * the editor's top-bar "⋯" menu carries the support/legal links instead.
 * Responsive behavior (label collapse, safe-area insets) lives in the
 * accompanying CSS module.
 */
const SUPPORT_EMAIL = 'hello@dearlynotes.app'

export default function LegalFooter({ screen = 'landing' }) {
  const footerClass =
    screen === 'writing' ? `${styles.footer} ${styles.onEditor}` : styles.footer

  return (
    <footer className={footerClass} aria-label="Footer">
      {/* Left — legal */}
      <nav className={styles.left} aria-label="Legal">
        <a className={styles.link} href="/privacy">Privacy</a>
        <span className={styles.dot} aria-hidden="true">·</span>
        <a className={styles.link} href="/terms">Terms</a>
      </nav>

      {/* Right — contact */}
      <div className={styles.right}>
        <a className={styles.email} href={`mailto:${SUPPORT_EMAIL}`}>
          {SUPPORT_EMAIL}
        </a>
      </div>
    </footer>
  )
}

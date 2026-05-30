/**
 * Tiny, unobtrusive footer with links to the legal pages.
 *
 * Rendered only on the non-cinematic screens (landing + writing) so it
 * doesn't intrude on the recipient/preview experience. Links open the
 * standalone static pages served at /privacy and /terms.
 */
export default function LegalFooter() {
  const linkStyle = {
    color: 'rgba(255,255,255,0.40)',
    textDecoration: 'none',
    fontFamily: 'Inter, sans-serif',
    fontSize: 11,
    fontWeight: 400,
    letterSpacing: '0.02em',
  }

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 'calc(8px + env(safe-area-inset-bottom, 0px))',
        left: 0,
        right: 0,
        zIndex: 400,
        display: 'flex',
        justifyContent: 'center',
        gap: 14,
        pointerEvents: 'none',
      }}
    >
      <a href="/privacy" style={{ ...linkStyle, pointerEvents: 'auto' }}>Privacy</a>
      <span style={{ color: 'rgba(255,255,255,0.22)', fontSize: 11 }}>·</span>
      <a href="/terms" style={{ ...linkStyle, pointerEvents: 'auto' }}>Terms</a>
    </div>
  )
}

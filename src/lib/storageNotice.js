/**
 * One-time "your media is stored & shareable" notice.
 *
 * The FIRST time a user adds a voice note or an image to a letter, we surface
 * a single, honest heads-up: anything they upload is stored and is viewable by
 * anyone who has the share link (voice notes + images live at public URLs —
 * see the Privacy Policy). After it's shown once, we remember that via
 * localStorage and never nag again.
 *
 * This is deliberately NOT tied to cookie consent — uploading is a core
 * feature and gating it behind analytics consent would be a "cookie wall"
 * (prohibited under GDPR). This notice just informs; it never blocks.
 *
 * Usage: call from the add-voice / add-image handlers, passing the editor's
 * existing showToast(msg, tone) so the notice uses the same toast UI.
 */
const STORAGE_KEY = 'dearly_storage_notice_seen'

const MESSAGE =
  'Heads up: voice notes and images you add are stored and can be opened by anyone you share the link with.'

export function maybeShowStorageNotice(showToast) {
  let seen = null
  try { seen = window.localStorage.getItem(STORAGE_KEY) } catch { /* storage blocked */ }
  if (seen === '1') return

  try { window.localStorage.setItem(STORAGE_KEY, '1') } catch { /* storage blocked */ }
  if (typeof showToast === 'function') showToast(MESSAGE, 'info')
}

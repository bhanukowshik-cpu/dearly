/**
 * emailTemplate — single source of truth for the share-via-email HTML.
 *
 * Imported by BOTH:
 *   - /api/email.js (Vercel serverless function, server-side)
 *   - /email-preview (in-app design playground, client-side iframe)
 *
 * Pure functions, plain JS, no JSX, no React, no Node-only APIs.
 *
 * ── Type system ──────────────────────────────────────────────────────
 *
 * Three fonts, each with a job:
 *
 *   • Fraunces (serif)  — the headline ("Hi Marcus,"). Warm, editorial,
 *                          has a soul. The thing the eye lands on first.
 *   • Inter (sans)      — body copy + footer. Quiet, legible, gets out
 *                          of the way. The supporting voice.
 *   • Caveat (script)   — reserved for the *handwritten moments*: the
 *                          CTA label (because the thing you're opening
 *                          is a handwritten note) and the Dearly brand
 *                          wordmark. Used sparingly so when it appears
 *                          it actually carries weight.
 *
 * Fallbacks are inline so Outlook / Mail.app without web fonts still
 * look intentional (Georgia, system-ui, cursive).
 *
 * ── Responsive ───────────────────────────────────────────────────────
 *
 * Mobile-first defaults; @media (min-width) bumps up sizes for iPad and
 * desktop Gmail. Image scales 280 → 380 → 460 px. Padding scales too so
 * the layout doesn't feel cramped on phones or too sparse on desktop.
 */

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function firstName(name) {
  if (!name) return ''
  return String(name).trim().split(/\s+/)[0] || ''
}

/**
 * Plain-text fallback — what shows when an email client refuses to
 * render HTML. Rare these days but still standard practice.
 */
export function buildEmailText({ fromName, recipientName, shareUrl, blurb }) {
  const sender = firstName(fromName) || 'Someone'
  const recip  = firstName(recipientName) || 'there'
  const trimmed = String(blurb || '').trim().replace(/[.!?]+$/, '')
  const line2 = trimmed
    ? `${sender} wrote a small note for you, about ${trimmed}.`
    : `${sender} wrote a small note for you.`
  const lines = [
    `Hi ${recip},`,
    '',
    line2,
    '',
    `Read it here: ${shareUrl}`,
    '',
    '— Dearly · Letters people actually keep',
  ]
  return lines.join('\n')
}

/**
 * HTML body — editorial-quiet.
 *
 *   1. Blurred bg.jpg + warm-dark tint (atmosphere, not content)
 *   2. Headline in Fraunces italic: "Hi Marcus,"
 *   3. Context line in Inter, soft cream: the "about…" sentence
 *   4. The illustrated envelope sticker (PNG)
 *   5. CTA — outlined pill, Caveat label (the handwritten moment)
 *   6. Hairline divider
 *   7. Footer — "Dearly" wordmark in Caveat, tagline + designer credit
 *      in tiny Inter small-caps
 */
export function buildEmailHtml({
  fromName,
  recipientName,
  shareUrl,
  // personalNote unused — kept for backward-compat with callers.
  // eslint-disable-next-line no-unused-vars
  personalNote,
  // One-line AI-generated context about the note.
  blurb = '',
  assetOrigin = 'https://bhanu-dearly.vercel.app',
}) {
  const senderFirst = firstName(fromName) || ''
  const recipFirst  = firstName(recipientName)
  const ctaLabel    = senderFirst
    ? `Read ${senderFirst}'s note`
    : 'Read the note'

  const line1 = recipFirst ? `Hi ${esc(recipFirst)},` : 'Hi there,'
  const subj  = senderFirst ? esc(senderFirst) : 'Someone'
  const trimmedBlurb = String(blurb || '').trim().replace(/[.!?]+$/, '')
  const line2 = trimmedBlurb
    ? `${subj} wrote a small note for you, about ${esc(trimmedBlurb)}.`
    : `${subj} wrote a small note for you.`
  const altGreeting = `${line1} ${line2}`

  const bgUrl       = `${assetOrigin}/bg.jpg`
  const envelopeUrl = `${assetOrigin}/envelope.png`

  // ── Font stacks (inline fallbacks for clients that strip web fonts) ──
  const FF_SERIF  = `'Fraunces', Georgia, 'Times New Roman', serif`
  const FF_SANS   = `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif`
  const FF_SCRIPT = `'Caveat', 'Brush Script MT', cursive`

  // ── Ink palette: two cream values + one near-white for the headline ──
  const INK_HI   = 'rgba(255, 251, 240, 0.97)'  // headline
  const INK      = 'rgba(255, 247, 230, 0.86)'  // body
  const INK_SOFT = 'rgba(255, 247, 230, 0.48)'  // footer
  const RULE     = 'rgba(255, 247, 230, 0.14)'  // hairline divider

  return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Caveat:wght@500;600;700&family=Fraunces:ital,opsz,wght@0,9..144,500..700;1,9..144,500..700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<title>${esc(senderFirst || 'Someone')} wrote you a note</title>
<style>
  /* Mobile-first base sizes; @media bumps them on larger viewports.
     Email clients that ignore @media (Outlook desktop) fall back to
     mobile sizes, which still look fine in a narrow pane. */
  .em-wrap     { padding-top: 72px; padding-bottom: 56px; }
  .em-headline { font-size: 32px; line-height: 1.18; letter-spacing: -0.005em; }
  .em-body     { font-size: 17px; line-height: 1.55; padding: 0 32px 28px; }
  .em-env      { max-width: 280px; padding: 8px 24px 36px; }
  .em-cta      { font-size: 22px; padding: 13px 32px 12px; }
  .em-cta-wrap { padding: 0 24px 80px; }
  .em-divider  { width: 56px; }
  .em-brand    { font-size: 30px; }
  .em-tagline  { font-size: 11px; letter-spacing: 0.18em; }
  .em-credit   { font-size: 11px; letter-spacing: 0.04em; }

  /* iPad / wide tablet / Gmail web reading-pane at moderate width */
  @media only screen and (min-width: 520px) {
    .em-wrap     { padding-top: 96px; padding-bottom: 72px; }
    .em-headline { font-size: 44px; }
    .em-body     { font-size: 19px; padding: 0 40px 36px; }
    .em-env      { max-width: 380px; padding: 12px 24px 44px; }
    .em-cta      { font-size: 24px; padding: 14px 36px 13px; }
    .em-cta-wrap { padding: 0 24px 96px; }
    .em-divider  { width: 72px; }
    .em-brand    { font-size: 36px; }
    .em-tagline  { font-size: 12px; }
    .em-credit   { font-size: 12px; }
  }

  /* Desktop Gmail, full-width preview */
  @media only screen and (min-width: 760px) {
    .em-wrap     { padding-top: 120px; padding-bottom: 88px; }
    .em-headline { font-size: 56px; }
    .em-body     { font-size: 21px; padding: 0 48px 44px; }
    .em-env      { max-width: 460px; padding: 16px 24px 56px; }
    .em-cta      { font-size: 26px; padding: 15px 40px 14px; }
    .em-cta-wrap { padding: 0 24px 112px; }
    .em-divider  { width: 88px; }
    .em-brand    { font-size: 42px; }
  }

  /* Subtle hover lift on the CTA (clients that support :hover) */
  a.em-cta-link:hover {
    background: rgba(255, 247, 230, 0.06) !important;
    border-color: rgba(255, 251, 240, 0.97) !important;
  }
</style>
</head>
<body style="margin:0;padding:0;background:#0e0a05;font-family:${FF_SANS};">

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
         style="background:#0e0a05;min-height:100vh;">
    <tr><td align="center" valign="top" style="padding:0;position:relative;">

      <!--[if !mso]><!-->
      <!-- Blurred bg image + warm dark tint. Atmosphere only — the
           envelope and headline carry meaning. Outlook desktop falls
           back to the solid #0e0a05 bg colour. -->
      <div style="position:absolute;inset:0;z-index:0;overflow:hidden;">
        <img src="${esc(bgUrl)}" alt="" width="100%" height="100%"
             style="display:block;width:110%;height:110%;object-fit:cover;opacity:0.78;filter:blur(48px) saturate(102%);transform:scale(1.10);"/>
        <div style="position:absolute;inset:0;background:radial-gradient(ellipse at 50% 38%,rgba(8,10,18,0.42) 0%,rgba(4,5,10,0.92) 100%);"></div>
      </div>
      <!--<![endif]-->

      <!-- Content column. max-width grows on bigger viewports via the
           inline max-width on the inner table; outer padding via class. -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
             class="em-wrap"
             style="max-width:640px;position:relative;z-index:1;">

        <!-- Headline — Fraunces italic. Warm, editorial, intimate. -->
        <tr><td align="center" style="padding:0 32px 14px;">
          <h1 class="em-headline"
              style="margin:0;font-family:${FF_SERIF};font-style:italic;font-weight:600;color:${INK_HI};letter-spacing:-0.005em;">
            ${line1}
          </h1>
        </td></tr>

        <!-- Context line — Inter. Quiet, legible, gets out of the way. -->
        <tr><td align="center">
          <p class="em-body"
             style="margin:0;font-family:${FF_SANS};font-weight:400;color:${INK};">
            ${line2}
          </p>
        </td></tr>

        <!-- Envelope sticker — the visual centerpiece -->
        <tr><td align="center" class="em-env" style="margin:0 auto;">
          <img src="${esc(envelopeUrl)}" alt="${esc(altGreeting)}"
               width="100%" height="auto"
               style="display:block;margin:0 auto;width:100%;height:auto;border:0;outline:none;-ms-interpolation-mode:bicubic;"/>
        </td></tr>

        <!-- CTA — Caveat label (the handwritten moment), thin outlined
             pill, transparent fill. The first script font on the page,
             which makes it feel earned. -->
        <tr><td align="center" class="em-cta-wrap">
          <a href="${esc(shareUrl)}" target="_blank" class="em-cta-link em-cta"
             style="display:inline-block;font-family:${FF_SCRIPT};font-weight:600;line-height:1;color:${INK_HI};text-decoration:none;background:transparent;border:1px solid ${INK};border-radius:999px;letter-spacing:0.02em;-webkit-tap-highlight-color:transparent;transition:background 0.2s ease,border-color 0.2s ease;">
            ${esc(ctaLabel)}
          </a>
        </td></tr>

        <!-- Hairline divider — sets off the brand block -->
        <tr><td align="center" style="padding:0 24px 28px;">
          <hr class="em-divider"
              style="margin:0 auto;border:0;border-top:1px solid ${RULE};"/>
        </td></tr>

        <!-- Brand wordmark — Caveat reserved for "Dearly" -->
        <tr><td align="center" style="padding:0 24px 6px;">
          <p class="em-brand"
             style="margin:0;font-family:${FF_SCRIPT};font-weight:700;line-height:1;color:${INK_HI};letter-spacing:0.01em;">
            Dearly
          </p>
        </td></tr>

        <!-- Tagline in small-caps Inter — adds editorial polish -->
        <tr><td align="center" style="padding:8px 24px 18px;">
          <p class="em-tagline"
             style="margin:0;font-family:${FF_SANS};font-weight:500;line-height:1;color:${INK_SOFT};text-transform:uppercase;">
            Letters people actually keep
          </p>
        </td></tr>

        <!-- Designer credit — small, quiet -->
        <tr><td align="center" style="padding:0 24px 24px;">
          <p class="em-credit"
             style="margin:0;font-family:${FF_SANS};font-weight:400;line-height:1.5;color:${INK_SOFT};">
            Designed by Bhanu Kowshik &middot; The Thoughtful Designer
          </p>
        </td></tr>

      </table>

    </td></tr>
  </table>

</body></html>`
}

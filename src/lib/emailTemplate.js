/**
 * emailTemplate — single source of truth for the share-via-email HTML.
 *
 * Imported by BOTH:
 *   - /api/email.js (Vercel serverless function, server-side)
 *   - /email-preview (in-app design playground, client-side iframe)
 *
 * That way iterating on the design in the local preview === iterating
 * on the production email body. No drift, no parallel templates.
 *
 * Pure functions, plain JS, no JSX, no React, no Node-only APIs —
 * safe to import from either context.
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
 * Plain-text fallback body — what shows when an email client refuses
 * to render HTML (rare these days, but still standard practice to ship).
 */
export function buildEmailText({ fromName, recipientName, shareUrl, personalNote }) {
  const lines = [
    `Hi ${firstName(recipientName) || 'there'},`,
    '',
    `${fromName} wrote you a personal note on Dearly.`,
  ]
  if (personalNote) {
    lines.push('', personalNote)
  }
  lines.push(
    '',
    `Open it here: ${shareUrl}`,
    '',
    '— Dearly',
  )
  return lines.join('\n')
}

/**
 * HTML body. Designed to match the writing-screen aesthetic:
 *   - bg.jpg behind everything (blurred via CSS filter; most modern
 *     clients honour `filter: blur`; the rest get a still-warm sharp
 *     image at low opacity, which still reads on-brand)
 *   - dark tint overlay on top so text stays legible
 *   - Caveat headline / sub / body throughout (Inter only used for the
 *     button label where script font would hurt the click target)
 *   - hand-drawn envelope SVG at the top, mirrors the in-app share icon
 *   - CTA button is the ONLY way to reach the note — no visible raw URL
 *     anywhere in the body. The plain-text fallback above carries the
 *     URL for accessibility / clients that strip the button styling.
 */
export function buildEmailHtml({
  fromName,
  recipientName,
  shareUrl,
  personalNote,
  assetOrigin = 'https://bhanu-dearly.vercel.app',
}) {
  const recipFirst  = firstName(recipientName)
  const greeting    = recipFirst ? `Hi ${esc(recipFirst)},` : 'Hi there,'
  const senderFirst = firstName(fromName) || fromName

  const personalBlock = personalNote
    ? `<p style="margin:0 0 24px;font-family:'Caveat','Brush Script MT',cursive;font-size:23px;line-height:1.45;color:#3a2f1f;white-space:pre-wrap;text-align:center;">${esc(personalNote)}</p>`
    : ''

  const bgUrl = `${assetOrigin}/bg.jpg`

  // Hand-drawn envelope — inlined so no extra request needed and
  // styling stays bulletproof across clients that strip <img>.
  const envelopeSvg = `
    <svg width="58" height="46" viewBox="0 0 58 46" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:block;margin:0 auto;">
      <path d="M3 8 C 18 6, 38 6, 55 8 L 55 38 C 38 40, 18 40, 3 38 Z"
            stroke="rgba(255,255,255,0.78)" stroke-width="1.6" stroke-linejoin="round" fill="rgba(255,255,255,0.04)"/>
      <path d="M4 9 L 29 26 L 54 9"
            stroke="rgba(255,255,255,0.78)" stroke-width="1.5" stroke-linecap="round" fill="none"/>
      <path d="M4 38 L 22 22"
            stroke="rgba(255,255,255,0.52)" stroke-width="1.3" stroke-linecap="round" fill="none"/>
      <path d="M54 38 L 36 22"
            stroke="rgba(255,255,255,0.52)" stroke-width="1.3" stroke-linecap="round" fill="none"/>
    </svg>
  `

  return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<!-- Caveat via Google Fonts. Clients that strip <link> fall back to
     the 'Brush Script MT' / cursive stack in the inline font-family. -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Caveat:wght@500;600;700&family=Inter:wght@500;600&display=swap" rel="stylesheet">
<title>${esc(senderFirst)} wrote you a note</title>
</head>
<body style="margin:0;padding:0;background:#1a1208;font-family:'Caveat','Brush Script MT',cursive;">

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
         style="background:#1a1208;min-height:100vh;">
    <tr><td align="center" valign="top" style="padding:0;position:relative;">

      <!--[if !mso]><!-->
      <!-- Background image, blurred via CSS filter. Most modern clients
           (Gmail web/iOS/Android, Apple Mail, Yahoo) honour the filter.
           Outlook ignores the absolute positioning entirely and shows
           the solid bg colour — designed-in fallback. -->
      <div style="position:absolute;inset:0;z-index:0;overflow:hidden;">
        <img src="${esc(bgUrl)}" alt="" width="100%" height="100%"
             style="display:block;width:110%;height:110%;object-fit:cover;opacity:0.92;filter:blur(28px) saturate(118%);transform:scale(1.10);"/>
        <!-- Tint + vignette over the blurred bg so text stays legible -->
        <div style="position:absolute;inset:0;background:radial-gradient(ellipse at 50% 40%,rgba(4,9,20,0.30) 0%,rgba(4,9,20,0.70) 100%);"></div>
      </div>
      <!--<![endif]-->

      <!-- Content -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
             style="max-width:560px;position:relative;z-index:1;">

        <!-- Envelope icon -->
        <tr><td align="center" style="padding:56px 24px 0;">
          ${envelopeSvg}
        </td></tr>

        <!-- Headline -->
        <tr><td align="center" style="padding:20px 24px 4px;">
          <h1 style="margin:0;font-family:'Caveat','Brush Script MT',cursive;font-size:54px;font-weight:700;line-height:1.05;color:#ffffff;letter-spacing:0.01em;">${greeting}</h1>
        </td></tr>

        <!-- Sub-line -->
        <tr><td align="center" style="padding:6px 24px 32px;">
          <p style="margin:0;font-family:'Caveat','Brush Script MT',cursive;font-size:24px;font-weight:500;line-height:1.4;color:rgba(255,255,255,0.78);">${esc(senderFirst)} wrote you a personal note.</p>
        </td></tr>

        <!-- Postcard card -->
        <tr><td align="center" style="padding:0 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                 style="max-width:480px;background:#F4ECD5;border-radius:14px;">
            <tr><td style="padding:40px 32px 36px;text-align:center;">

              ${personalBlock || `<p style="margin:0 0 28px;font-family:'Caveat','Brush Script MT',cursive;font-size:23px;line-height:1.45;color:#3a2f1f;">Tap the note below to open ${esc(senderFirst)}'s letter.</p>`}

              <!-- CTA button — bulletproof button pattern. This is the
                   ONLY way to reach the note from the email body. The
                   plain-text fallback carries the raw URL for any
                   client that strips this. -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;">
                <tr><td style="background:#1a1208;border-radius:999px;">
                  <a href="${esc(shareUrl)}" target="_blank"
                     style="display:inline-block;padding:16px 30px;font-family:'Caveat','Brush Script MT',cursive;font-size:24px;font-weight:700;color:#F4ECD5;text-decoration:none;letter-spacing:0.02em;">
                    Open the note
                  </a>
                </td></tr>
              </table>

            </td></tr>
          </table>
        </td></tr>

        <!-- Footer -->
        <tr><td align="center" style="padding:36px 24px 56px;">
          <p style="margin:0;font-family:'Caveat','Brush Script MT',cursive;font-size:18px;font-weight:500;line-height:1.4;color:rgba(255,255,255,0.50);letter-spacing:0.01em;">
            Dearly &middot; letters people actually keep.
          </p>
        </td></tr>

      </table>

    </td></tr>
  </table>

</body></html>`
}

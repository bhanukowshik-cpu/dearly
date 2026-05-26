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
 * One font: Caveat. Hierarchy is built entirely with SIZE, WEIGHT, and
 * OPACITY — never by swapping family. The H1 greeting is big, the H2
 * context line is roughly half its size, the footer is half again.
 *
 * The context line has a soft right-edge fade (CSS mask-image) so its
 * tail dissolves like ink on wet paper — a quiet teaser that there's
 * more inside the envelope.
 *
 * ── Responsive ───────────────────────────────────────────────────────
 *
 * Mobile-first defaults; @media (min-width) bumps sizes for iPad and
 * desktop Gmail. Image grows 280 → 380 → 460 px. Padding scales too.
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
 * HTML body — Caveat throughout, hierarchy via size only.
 *
 *   1. Blurred bg.jpg + warm-dark tint (atmosphere, not content)
 *   2. H1 — "Hi Marcus,"                            (large)
 *   3. H2 — context line with right-edge fade       (~½ H1, opacity 0.7)
 *   4. Envelope sticker
 *   5. CTA — outlined pill, Caveat label
 *   6. Hairline divider
 *   7. Footer — "Dearly" wordmark + tagline + credit (Caveat all the way down)
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

  // ── Font stack: Caveat only ───────────────────────────────────────────
  const FF = `'Caveat', 'Brush Script MT', cursive`

  // ── Ink palette ───────────────────────────────────────────────────────
  const INK_HI   = 'rgba(255, 251, 240, 0.97)'  // H1, CTA, brand
  const INK      = 'rgba(255, 247, 230, 0.78)'  // H2 body
  const INK_SOFT = 'rgba(255, 247, 230, 0.50)'  // footer
  const RULE     = 'rgba(255, 247, 230, 0.14)'  // hairline divider

  // The CSS mask that fades the trailing edge of the context line into
  // transparency — like ink dissolving. The fade is gentle until 60% so
  // the readable words stay sharp, then accelerates. Both `mask-image`
  // and the WebKit-prefixed variant for older clients (Apple Mail).
  const FADE_MASK = 'linear-gradient(to right, #000 0%, #000 60%, rgba(0,0,0,0.4) 88%, transparent 100%)'

  // CTA — exact white-wavy-pill from the landing screen
  // (src/components/LoadingScreen/LoadingScreen.jsx ~line 257). The SVG
  // is the chrome; the label + arrow are HTML-overlayed via flex so they
  // stay perfectly centred regardless of label length, while the pill
  // shape stretches via preserveAspectRatio="none".
  const ctaPillPath = 'M 14,8 C 95,4 245,5 326,8 C 330,22 331,40 326,54 C 245,58 95,57 14,54 C 10,40 10,22 14,8 Z'
  // Hand-drawn arrow path lifted from IconArrow (LoadingScreen.jsx ~line 18)
  const ctaArrowPath = 'M23.639 4.87137L5.72378 5.28607L0.668197 5.40637C-0.221121 5.42536 -0.224343 6.78343 0.668197 6.76444L18.5867 6.34657L23.639 6.23577C24.5283 6.20728 24.5316 4.84921 23.639 4.87137ZM28.6592 4.80489C25.495 3.34236 22.3867 1.77113 19.3342 0.0912199C18.5609 -0.336145 17.8617 0.854144 18.6382 1.26568C21.4028 2.78942 24.2126 4.2203 27.0674 5.55832C24.1864 8.08249 21.5934 10.907 19.3342 13.9821C19.2433 14.1383 19.2183 14.3233 19.2647 14.4973C19.3111 14.6713 19.4251 14.8205 19.5823 14.9129C19.7413 14.9996 19.9283 15.0226 20.1042 14.9772C20.2801 14.9318 20.4313 14.8214 20.5264 14.6691C22.9212 11.4258 25.6987 8.47276 28.8009 5.87172C28.8748 5.79773 28.9306 5.70821 28.964 5.60993C28.9975 5.51166 29.0078 5.40719 28.9941 5.30443C28.9805 5.20167 28.9432 5.1033 28.8852 5.01676C28.8272 4.93022 28.7499 4.85777 28.6592 4.80489Z'
  const CTA_INK = '#1A2A3A' // dark navy ink — matches landing CTA label

  return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Caveat:wght@400;500;600;700&display=swap" rel="stylesheet">
<title>${esc(senderFirst || 'Someone')} wrote you a note</title>
<style>
  /* Mobile-first base sizes; @media bumps them on larger viewports.
     Email clients that ignore @media (Outlook desktop) fall back to
     mobile sizes, which still look fine in a narrow pane. */
  .em-wrap     { padding-top: 72px; padding-bottom: 56px; }
  .em-h1       { font-size: 56px; line-height: 1.1; }
  .em-h2       { font-size: 32px; line-height: 1.35; padding: 0 24px 36px; max-width: 460px; }
  .em-env      { max-width: 280px; padding: 8px 24px 36px; }
  .em-cta-svg  { width: 240px; }
  .em-cta-lbl  { font-size: 18px; gap: 10px; }
  .em-cta-arr  { width: 18px; height: 9px; }
  .em-cta-wrap { padding: 0 24px 72px; }
  .em-divider  { width: 44px; }
  /* Footer — two-piece "Made with Dearly" / "A product by Bhanu Kowshik".
     Stacks vertically on phones, sits as 2 columns on iPad+. */
  .em-foot-row { padding: 0 24px 24px; }
  .em-foot     { font-size: 14px; line-height: 1.4; }
  .em-foot-l, .em-foot-r {
    display: block; text-align: center; padding: 4px 0;
  }

  /* iPad / wide tablet / Gmail web reading-pane at moderate width */
  @media only screen and (min-width: 520px) {
    .em-wrap     { padding-top: 96px; padding-bottom: 72px; }
    .em-h1       { font-size: 76px; }
    .em-h2       { font-size: 38px; padding: 0 32px 44px; max-width: 600px; }
    .em-env      { max-width: 380px; padding: 12px 24px 44px; }
    .em-cta-svg  { width: 300px; }
    .em-cta-lbl  { font-size: 22px; gap: 12px; }
    .em-cta-arr  { width: 22px; height: 11px; }
    .em-cta-wrap { padding: 0 24px 88px; }
    .em-divider  { width: 56px; }
    .em-foot-row { padding: 0 36px 32px; }
    .em-foot     { font-size: 15px; }
    .em-foot-l, .em-foot-r {
      display: table-cell; width: 50%; padding: 0;
    }
    .em-foot-l { text-align: left; }
    .em-foot-r { text-align: right; }
  }

  /* Desktop Gmail, full-width preview */
  @media only screen and (min-width: 760px) {
    .em-wrap     { padding-top: 120px; padding-bottom: 88px; }
    .em-h1       { font-size: 96px; line-height: 1.05; }
    .em-h2       { font-size: 44px; line-height: 1.3; padding: 0 32px 52px; max-width: 720px; }
    .em-env      { max-width: 460px; padding: 16px 24px 56px; }
    .em-cta-svg  { width: 360px; }
    .em-cta-lbl  { font-size: 26px; gap: 14px; }
    .em-cta-arr  { width: 26px; height: 13px; }
    .em-cta-wrap { padding: 0 24px 104px; }
    .em-divider  { width: 64px; }
    .em-foot-row { padding: 0 48px 40px; }
    .em-foot     { font-size: 16px; }
  }

  /* Ink-dissolve fade on the trailing edge of the context line.
     Falls back to fully visible text in clients that strip mask-image. */
  .em-fade {
    -webkit-mask-image: ${FADE_MASK};
            mask-image: ${FADE_MASK};
  }

  /* Subtle floor-shadow lift on the CTA (matches the landing button) */
  a.em-cta-link { transition: transform 0.18s ease, filter 0.18s ease; }
  a.em-cta-link:hover { transform: translateY(-1px); }
  a.em-cta-link:hover .em-cta-arr { transform: translateX(4px); }
  .em-cta-arr { transition: transform 0.2s ease; }
</style>
</head>
<body style="margin:0;padding:0;background:#0e0a05;font-family:${FF};">

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
         style="background:#0e0a05;min-height:100vh;">
    <tr><td align="center" valign="top" style="padding:0;position:relative;">

      <!--[if !mso]><!-->
      <!-- Blurred bg image + warm dark tint. Atmosphere only. Outlook
           desktop falls back to the solid bg colour. -->
      <div style="position:absolute;inset:0;z-index:0;overflow:hidden;">
        <img src="${esc(bgUrl)}" alt="" width="100%" height="100%"
             style="display:block;width:110%;height:110%;object-fit:cover;opacity:0.78;filter:blur(34px) saturate(102%);transform:scale(1.10);"/>
        <div style="position:absolute;inset:0;background:radial-gradient(ellipse at 50% 38%,rgba(8,10,18,0.42) 0%,rgba(4,5,10,0.92) 100%);"></div>
      </div>
      <!--<![endif]-->

      <!-- Content column -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
             class="em-wrap"
             style="max-width:780px;position:relative;z-index:1;">

        <!-- H1 — "Hi Marcus," — Caveat, big, intimate -->
        <tr><td align="center" style="padding:0 32px 10px;">
          <h1 class="em-h1"
              style="margin:0;font-family:${FF};font-weight:700;color:${INK_HI};letter-spacing:0.005em;">
            ${line1}
          </h1>
        </td></tr>

        <!-- H2 — context line, ~½ H1 size, trailing edge fades to transparent
             so it reads as a teaser. Wrapped in a centred inline-block so the
             mask follows the actual text width, not the full column. -->
        <tr><td align="center">
          <p class="em-h2 em-fade"
             style="margin:0 auto;display:inline-block;font-family:${FF};font-weight:400;color:${INK};text-align:center;">
            ${line2}
          </p>
        </td></tr>

        <!-- Envelope sticker — the visual centerpiece -->
        <tr><td align="center" class="em-env" style="margin:0 auto;">
          <img src="${esc(envelopeUrl)}" alt="${esc(altGreeting)}"
               width="100%" height="auto"
               style="display:block;margin:0 auto;width:100%;height:auto;border:0;outline:none;-ms-interpolation-mode:bicubic;"/>
        </td></tr>

        <!-- CTA — exact white wavy pill from the landing screen.
             SVG pill stretches via preserveAspectRatio="none"; the label
             + arrow sit on top, flex-centred, so they stay aligned at
             every viewport regardless of label length. -->
        <tr><td align="center" class="em-cta-wrap">
          <a href="${esc(shareUrl)}" target="_blank" class="em-cta-link"
             style="position:relative;display:inline-block;text-decoration:none;-webkit-tap-highlight-color:transparent;">
            <svg class="em-cta-svg"
                 viewBox="0 0 340 62" preserveAspectRatio="none"
                 width="340" height="62"
                 xmlns="http://www.w3.org/2000/svg"
                 style="display:block;width:100%;max-width:360px;height:auto;filter:drop-shadow(0 8px 22px rgba(0,0,0,0.24)) drop-shadow(0 2px 4px rgba(0,0,0,0.14));">
              <path d="${ctaPillPath}" fill="#ffffff"/>
            </svg>
            <span class="em-cta-lbl"
                  style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-family:${FF};font-weight:700;color:${CTA_INK};letter-spacing:0.01em;line-height:1;user-select:none;">
              ${esc(ctaLabel)}
              <svg class="em-cta-arr"
                   viewBox="0 0 29 15" fill="none"
                   xmlns="http://www.w3.org/2000/svg"
                   aria-hidden="true" style="display:inline-block;flex-shrink:0;">
                <path d="${ctaArrowPath}" fill="${CTA_INK}"/>
              </svg>
            </span>
          </a>
        </td></tr>

        <!-- Hairline divider — separates content from the footer -->
        <tr><td align="center" style="padding:0 24px 18px;">
          <hr class="em-divider"
              style="margin:0 auto;border:0;border-top:1px solid ${RULE};"/>
        </td></tr>

        <!-- Footer — "Made with Dearly" left, "A product by Bhanu Kowshik"
             right at iPad+. On mobile the two pieces stack and centre.
             Implemented as a nested table so the responsive switch from
             stacked → side-by-side just toggles td display via @media.
             Brand words use font-weight 700 against weight 500 prefix so
             the eye finds them without needing a size change. -->
        <tr><td class="em-foot-row">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td class="em-foot-l em-foot"
                  style="font-family:${FF};color:${INK_SOFT};">
                <span style="font-weight:500;">Made with </span><span style="font-weight:700;color:${INK};">Dearly</span>
              </td>
              <td class="em-foot-r em-foot"
                  style="font-family:${FF};color:${INK_SOFT};">
                <span style="font-weight:500;">A product by </span><span style="font-weight:700;color:${INK};">Bhanu Kowshik</span>
              </td>
            </tr>
          </table>
        </td></tr>

      </table>

    </td></tr>
  </table>

</body></html>`
}

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
  // First ~140 chars of the actual letter body — rendered as a real
  // tilted paper teaser so the email shows what's inside instead of a
  // generic envelope graphic. Trimmed + fades out at the bottom so it
  // reads as "there's more, come read it."
  excerpt = '',
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

  // Corner annotations overlaid on the envelope — "from Bhanu" top-left,
  // "to Marcus" bottom-right. Hand-written-looking captions that match
  // how someone would actually address an envelope by hand.
  const envFrom = `from ${esc(senderFirst || 'someone')}`
  const envTo   = `to ${esc(recipFirst   || 'you')}`

  // ── Font stack: Caveat only ───────────────────────────────────────────
  const FF = `'Caveat', 'Brush Script MT', cursive`

  // ── Ink palette ───────────────────────────────────────────────────────
  // Dialed back from the previous high-contrast Caveat — the H1 and H2
  // were reading as "loud" and bold-y. Lower opacity + lower weight
  // gives a quieter, more elegant feel.
  const INK_HI   = 'rgba(255, 251, 240, 0.92)'  // H1 (was 0.97)
  const INK      = 'rgba(255, 247, 230, 0.70)'  // H2 (was 0.78)
  const INK_SOFT = 'rgba(255, 247, 230, 0.55)'  // footer

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
  /* Mobile-first base sizes — tuned so the whole email fits inside a
     single iPhone viewport (~720px usable). H1 + H2 are smaller and
     lighter than before; the teaser card is the visual anchor, not
     the headline. @media bumps things up on iPad / desktop. */
  .em-wrap     { padding-top: 28px; padding-bottom: 24px; }
  .em-h1       { font-size: 38px; line-height: 1.1; font-weight: 400; padding: 0 24px 4px; }
  .em-h2       { font-size: 18px; line-height: 1.35; font-weight: 400; padding: 0 28px 18px; max-width: 460px; }
  .em-env      { max-width: 320px; padding: 4px 24px 22px; }
  .em-cta-svg  { width: 220px; }
  .em-cta-lbl  { font-size: 18px; gap: 10px; }
  .em-cta-arr  { width: 18px; height: 9px; }
  .em-cta-wrap { padding: 0 24px 22px; }
  /* Footer — single-line "made with dearly". Quiet attribution. */
  .em-foot-row { padding: 0 24px 14px; }
  .em-foot     { font-size: 16px; letter-spacing: 0.01em; }

  /* iPad / wide tablet / Gmail web reading-pane at moderate width */
  @media only screen and (min-width: 520px) {
    .em-wrap     { padding-top: 44px; padding-bottom: 36px; }
    .em-h1       { font-size: 50px; padding: 0 32px 6px; font-weight: 400; }
    .em-h2       { font-size: 22px; padding: 0 32px 26px; max-width: 600px; }
    .em-env      { max-width: 400px; padding: 6px 24px 32px; }
    .em-cta-svg  { width: 280px; }
    .em-cta-lbl  { font-size: 22px; gap: 12px; }
    .em-cta-arr  { width: 22px; height: 11px; }
    .em-cta-wrap { padding: 0 24px 32px; }
    .em-foot-row { padding: 0 32px 20px; }
    .em-foot     { font-size: 18px; }
  }

  /* Desktop Gmail, full-width preview */
  @media only screen and (min-width: 760px) {
    .em-wrap     { padding-top: 56px; padding-bottom: 44px; }
    .em-h1       { font-size: 60px; line-height: 1.05; padding: 0 32px 8px; font-weight: 400; }
    .em-h2       { font-size: 24px; line-height: 1.3; padding: 0 32px 32px; max-width: 720px; }
    .em-env      { max-width: 460px; padding: 8px 24px 36px; }
    .em-cta-svg  { width: 320px; }
    .em-cta-lbl  { font-size: 24px; gap: 14px; }
    .em-cta-arr  { width: 26px; height: 13px; }
    .em-cta-wrap { padding: 0 24px 40px; }
    .em-foot-row { padding: 0 48px 28px; }
    .em-foot     { font-size: 20px; }
  }

  /* ── Envelope hero ──────────────────────────────────────────────────
     Envelope.png is the visual centerpiece — keeps the reveal intact
     (recipient has to click through to read the actual letter). Two
     hand-written corner labels overlay it: "from {sender}" top-left,
     "to {recipient}" bottom-right, anchored to where the envelope's
     ribbon crosses each quadrant. */
  .em-env-wrap {
    position: relative;
    display: inline-block;
    width: 100%;
    max-width: 280px;
    margin: 0 auto;
    line-height: 0;
  }
  .em-env-img {
    display: block;
    width: 100%;
    height: auto;
    border: 0;
    outline: none;
    -ms-interpolation-mode: bicubic;
  }
  /* Caption shared base — Caveat, slight rotation per side so they
     read as actually hand-written. Very soft graphite mark (#252525
     @ 10% opacity) — reads like a faint pencil note on the envelope
     rather than competing ink. No drop shadow at this opacity (would
     muddy the mark). */
  .em-env-cap {
    position: absolute;
    z-index: 2;
    font-family: ${FF};
    font-weight: 500;
    font-size: 16px;
    line-height: 1;
    color: rgba(37, 37, 37, 0.30);
    white-space: nowrap;
    pointer-events: none;
  }
  .em-env-from {
    top: 13%;
    left: 11%;
    transform: rotate(-3deg);
    transform-origin: left top;
  }
  .em-env-to {
    bottom: 13%;
    right: 11%;
    transform: rotate(2deg);
    transform-origin: right bottom;
  }
  @media only screen and (min-width: 520px) {
    .em-env-wrap { max-width: 360px; }
    .em-env-cap  { font-size: 19px; }
  }
  @media only screen and (min-width: 760px) {
    .em-env-wrap { max-width: 420px; }
    .em-env-cap  { font-size: 22px; }
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

        <!-- H2 — context line. No fade gradient — the user wanted plain
             text, no ink-dissolve effect on the trailing edge. -->
        <tr><td align="center">
          <p class="em-h2"
             style="margin:0 auto;font-family:${FF};font-weight:400;color:${INK};text-align:center;">
            ${line2}
          </p>
        </td></tr>

        <!-- Envelope hero — keeps the reveal intact. Two hand-written
             corner labels overlay the envelope image: "from Bhanu" sits
             in the upper-left quadrant (above where the ribbon crosses),
             "to Marcus" sits in the lower-right quadrant. -->
        <tr><td align="center" class="em-env">
          <div class="em-env-wrap">
            <img src="${esc(envelopeUrl)}" alt="${esc(altGreeting)}"
                 class="em-env-img"
                 width="100%" height="auto"/>
            <span class="em-env-cap em-env-from">${envFrom}</span>
            <span class="em-env-cap em-env-to">${envTo}</span>
          </div>
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

        <!-- Footer — minimal single-line "made with dearly". Tagline +
             "A product by" prefixes removed per request; just the
             attribution, quiet and centered. -->
        <tr><td class="em-foot-row" align="center">
          <div class="em-foot"
               style="font-family:${FF};color:${INK_SOFT};line-height:1;">
            made with <span style="color:${INK_HI};font-weight:600;">dearly</span>
          </div>
        </td></tr>

      </table>

    </td></tr>
  </table>

</body></html>`
}

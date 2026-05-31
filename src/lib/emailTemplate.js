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
export function buildEmailText({ fromName, recipientName, shareUrl, blurb, summary }) {
  const sender = firstName(fromName) || 'Someone'
  const recip  = firstName(recipientName) || 'there'
  // Same precedence as the HTML path: AI summary wins, then blurb, then generic.
  const trimmedSummary = String(summary || '').trim().replace(/^["']+|["']+$/g, '')
  const trimmedBlurb   = String(blurb   || '').trim().replace(/[.!?]+$/, '')
  const line2 = trimmedSummary
    ? trimmedSummary
    : trimmedBlurb
      ? `${sender} wrote a small note for you, about ${trimmedBlurb}.`
      : `${sender} wrote a small note for you.`
  const lines = [
    `Hi ${recip},`,
    '',
    line2,
    '',
    `Open the letter: ${shareUrl}`,
    '',
    'Dearly · Letters people actually keep',
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
  // One-line AI-generated context about the note. Legacy field — used
  // ONLY when `summary` is empty (kept so the EmailPreview design tool
  // still works for sketching the "about {blurb}" copy variant).
  blurb = '',
  // AI-generated Emotional Hook (Option 2 of the 3 archetypes from
  // /api/suggest-subject). Renders as the body H2 directly under the
  // greeting — replaces the generic "X wrote a small note for you."
  // when present. This is the line that confirms to the recipient,
  // immediately after opening, that clicking through was worth it.
  summary = '',
  // AI-generated Short & Intriguing line (Option 3 of the 3 archetypes).
  // Replaces the generic preheader. Surfaces as the inbox preview
  // snippet beside the sender name — high-curiosity tease before open.
  previewHook = '',
  assetOrigin = 'https://dearlynotes.app',
}) {
  const senderFirst = firstName(fromName) || ''
  const recipFirst  = firstName(recipientName)
  // "Open ... letter" leans into the envelope metaphor — letters get
  // opened, not just read. Tactile, gift-like, matches the hero image.
  const ctaLabel    = senderFirst
    ? `Open ${senderFirst}'s letter`
    : 'Open the letter'

  const line1 = recipFirst ? `Hi ${esc(recipFirst)},` : 'Hi there,'
  const subj  = senderFirst ? esc(senderFirst) : 'Someone'
  // Body H2 — precedence:
  //   1. AI summary (Emotional Hook) when present — most personal
  //   2. Legacy `blurb` field — "X wrote a small note for you, about Y."
  //   3. Generic fallback — "X wrote a small note for you."
  const trimmedSummary = String(summary || '').trim().replace(/^["']+|["']+$/g, '')
  const trimmedBlurb   = String(blurb   || '').trim().replace(/[.!?]+$/, '')
  const line2 = trimmedSummary
    ? esc(trimmedSummary)
    : trimmedBlurb
      ? `${subj} wrote a small note for you, about ${esc(trimmedBlurb)}.`
      : `${subj} wrote a small note for you.`
  const altGreeting = `${line1} ${line2}`

  // Preheader: hidden text Gmail/Apple Mail surface as the inbox preview
  // snippet (the ~90 chars beside the sender name in the inbox list).
  // Controlled here so we never leak random first-content into preview.
  // Precedence:
  //   1. AI previewHook (Short & Intriguing) when present
  //   2. Letter-themed gentle template fallback
  const trimmedPreviewHook = String(previewHook || '').trim().replace(/^["']+|["']+$/g, '')
  // Fallback teaser deliberately does NOT restate "X wrote a note" — the
  // subject line already says who it's from, and the body H2 says it again.
  // Three echoes of the same sentence is what made the Gmail inbox row read
  // as repetitive. Instead the preheader teases the *act of opening*, so the
  // inbox ladder reads: who it's from (subject) → come unfold it (preheader)
  // → the greeting (body). It's also long enough (~70 chars) to fill the
  // snippet slot on its own so the body text doesn't leak in beside it.
  const preheader = trimmedPreviewHook
    ? trimmedPreviewHook
    : recipFirst
      ? `Sealed and waiting for you, ${esc(recipFirst)}. Unfold it whenever you have a quiet moment.`
      : `Sealed and waiting inside. Unfold it whenever you have a quiet moment.`

  const bgUrl       = `${assetOrigin}/bg.jpg`
  const envelopeUrl = `${assetOrigin}/envelope.png`

  // Corner annotations overlaid on the envelope — "from Bhanu" top-left,
  // "to Marcus" bottom-right. Hand-written-looking captions that match
  // how someone would actually address an envelope by hand.
  const envFrom = `from ${esc(senderFirst || 'someone')}`
  const envTo   = `to ${esc(recipFirst   || 'you')}`

  // ── Font stack ────────────────────────────────────────────────────────
  // Caveat is the target, loaded via @font-face below (works in Apple Mail
  // and any client that respects embedded web fonts). Gmail/Outlook/Yahoo
  // strip web fonts entirely and fall back — so the chain after Caveat is
  // every *handwritten* font that actually ships preinstalled on each OS:
  //   - 'Segoe Script'    → Windows (Outlook desktop)
  //   - 'Bradley Hand'    → macOS / iOS (belt-and-suspenders w/ Apple Mail)
  //   - 'Snell Roundhand' → macOS formal script fallback
  //   - 'Brush Script MT' → legacy Windows/Office
  //   - cursive           → generic last resort
  // The point: even when Caveat can't load, the email still reads as
  // handwriting on every platform instead of dropping to a system serif.
  const FF = `'Caveat', 'Segoe Script', 'Bradley Hand', 'Snell Roundhand', 'Brush Script MT', cursive`

  // ── Ink palette ───────────────────────────────────────────────────────
  // FULLY OPAQUE (no rgba alpha). On the solid dark card these read crisp
  // and white, and — critically — opaque hex colors survive dark-mode
  // recoloring far better than semi-transparent ones, which clients treat
  // as "low-contrast light text" and aggressively darken. Paired with the
  // solid .em-card background + data-ogsc overrides, the text stays white.
  const INK_HI   = '#fffaf0'  // H1 + wordmark — warm white
  const INK      = '#ece2d0'  // H2 body — soft warm white
  const INK_SOFT = '#bcae98'  // footer + caption — muted, still legible
  const CARD_BG  = '#120c06'  // solid dark "stage" the text sits on

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
<!-- Tell clients we ship a dark design on purpose. Apple Mail, iOS Mail and
     iOS Gmail honor this and STOP auto-inverting our colors. Outlook/Gmail
     Android ignore it (handled via the data-ogsc overrides + solid card). -->
<meta name="color-scheme" content="dark light">
<meta name="supported-color-schemes" content="dark light">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Caveat:wght@400;500;600;700&display=swap" rel="stylesheet">
<title>${esc(senderFirst || 'Someone')} wrote you a note</title>
<style>
  /* Embed Caveat directly (not just via <link>) so clients that honor
     web fonts render it even when they ignore <link rel=stylesheet>.
     Points at Google's hosted woff2 — same files the <link> would pull.
     Gmail/Outlook strip @font-face too, but this widens Apple Mail and
     other webkit-mail coverage. The four weights match the <link>. */
  @font-face {
    font-family: 'Caveat';
    font-style: normal;
    font-weight: 400 700;
    font-display: swap;
    src: url('https://fonts.gstatic.com/s/caveat/v18/WnznHAc5bAfYB2QRah7pcpNvOx-pjfJ9SIKjYBxPigs.woff2') format('woff2');
  }

  /* ── Stage + card ───────────────────────────────────────────────────
     The photo lives on the outer cell (.em-stage); .em-stage's padding
     turns the photo into a thin FRAME around a solid dark card. All the
     text sits on .em-card (solid #120c06), never directly on the photo —
     which is the whole reason the white ink now survives dark mode. */
  .em-stage    { padding: 16px; }
  .em-card     { background-color: ${CARD_BG}; border-radius: 22px; }

  /* Outlook.com + Outlook iOS/Android partial dark mode injects
     data-ogsc (text) / data-ogsb (background) attributes onto recolored
     elements. We re-assert our palette so white stays white there. */
  [data-ogsc] .em-h1, [data-ogsc] .em-wordmark, [data-ogsc] .em-cta-btn { color: ${INK_HI} !important; }
  [data-ogsc] .em-h2        { color: ${INK} !important; }
  [data-ogsc] .em-foot,
  [data-ogsc] .em-env-cap   { color: ${INK_SOFT} !important; }
  [data-ogsb] .em-card      { background-color: ${CARD_BG} !important; }

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
    .em-stage    { padding: 30px; }
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
    .em-stage    { padding: 44px; }
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
     (recipient has to click through to read the actual letter). The
     "from / to" caption is a normal centered line below it (see body). */
  .em-env-wrap {
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
  /* "from {sender} · to {recipient}" caption — Caveat, soft warm white so
     it reads on the dark card without competing with the greeting. */
  .em-env-cap-row { padding: 0 24px 18px; }
  .em-env-cap {
    font-family: ${FF};
    font-weight: 500;
    font-size: 17px;
    line-height: 1.2;
    white-space: nowrap;
  }
  @media only screen and (min-width: 520px) {
    .em-env-wrap { max-width: 360px; }
    .em-env-cap  { font-size: 20px; }
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

  <!-- Preheader — hidden inbox preview text. Controls what Gmail/Apple
       Mail show beside the sender name in the inbox list, BEFORE the
       recipient opens the message. The combination of display:none,
       visibility/opacity 0, and the zero font-size/max-height ensures
       it never renders inside the body itself but still gets harvested
       as preview by every major client. The trailing zero-width-joiner
       run pushes generic auto-fallback text (like the H1 leaking through)
       off the end of the preview slot.

       IMPORTANT: the filler characters MUST NOT be separated by spaces.
       An earlier version wrote "&#847; &#847; ..." with literal spaces
       between them; the &#847; (combining grapheme joiner) is invisible
       but the spaces were not — Gmail rendered them as a large blank gap
       in the inbox snippet. The run below is unbroken (no spaces, no
       newlines inside it) so it stays genuinely invisible. -->
  <div style="display:none;visibility:hidden;opacity:0;color:transparent;height:0;max-height:0;width:0;max-width:0;overflow:hidden;font-size:1px;line-height:1px;mso-hide:all;">
    ${esc(preheader)}&#847;&#847;&#847;&#847;&#847;&#847;&#847;&#847;&#847;&#847;&#847;&#847;&#847;&#847;&#847;&#847;&#847;&#847;&#847;&#847;&#847;&#847;&#847;&#847;&#847;&#847;&#847;&#847;&#847;&#847;&#847;&#847;&#847;&#847;&#847;&#847;&#847;&#847;&#847;&#847;
  </div>

  <!-- Outer wrapper carries the atmospheric backdrop.

       Strategy: a multi-layer inline background-image with the dark wash
       gradient stacked ABOVE the photo URL. Modern email clients
       (Gmail web, Gmail iOS/Android, Apple Mail, Yahoo) respect this and
       render the bg.jpg behind a 80%-opacity warm-dark tint, so the text
       stays legible while the photo provides texture/warmth. Outlook
       desktop strips background-image entirely and falls back to the
       solid 0e0a05 -- which still looks intentional (just no photo).

       Why this works where the previous attempt did not: no
       position:absolute, no separate div or img layer. It is a CSS
       background property on a real table cell, which is the one form
       Gmail consistently keeps. The HTML "background" attribute is also
       set as a safety net for older Outlook builds. -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
         style="background-color:#0e0a05;min-height:100vh;">
    <tr><td align="center" valign="top" class="em-stage" background="${esc(bgUrl)}"
            style="position:relative;background-color:#0e0a05;background-image:linear-gradient(rgba(14,10,5,0.86),rgba(14,10,5,0.86)),url('${esc(bgUrl)}');background-size:cover;background-position:center center;background-repeat:no-repeat;">

      <!-- (No standalone image layer — the bg lives on the <td> above.
           Previous version used position:absolute which Gmail strips,
           causing the photo to collapse into a sharp top strip.) -->
      ${''}

      <!-- Content column — SOLID dark card. The text sits on this card,
           never on the photo, so white ink keeps its contrast and dark-mode
           clients can't darken it into the background. The photo shows only
           as the frame created by .em-stage's padding. -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
             class="em-wrap em-card"
             style="max-width:600px;position:relative;z-index:1;background-color:${CARD_BG};border-radius:22px;">

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

        <!-- Envelope hero — keeps the reveal intact. The "from / to"
             caption sits as a real centered line BELOW the envelope.
             (The previous version overlaid the two labels on the image with
             position:absolute, which Outlook/Gmail strip — they collapsed
             into one faint, mis-placed line. A normal flowed caption renders
             identically in every client.) -->
        <tr><td align="center" class="em-env">
          <div class="em-env-wrap">
            <img src="${esc(envelopeUrl)}" alt="${esc(altGreeting)}"
                 class="em-env-img"
                 width="100%" height="auto"/>
          </div>
        </td></tr>
        <tr><td align="center" class="em-env-cap-row">
          <div class="em-env-cap" style="font-family:${FF};color:${INK_SOFT};">
            ${envFrom} &nbsp;&middot;&nbsp; ${envTo}
          </div>
        </td></tr>
        <!-- (No excerpt teaser. The sealed envelope is the entire hook —
             we want the recipient to click through to discover the letter,
             not preview it inline. Earlier iterations rendered the first
             ~140 chars as a whisper, but it overshadowed the envelope and
             CTA visually. Removed by design. -->

        <!-- CTA — bulletproof rounded button. The previous version used
             an inline SVG pill with an absolute-positioned label overlay,
             which Gmail stripped down to a plain blue link. This version
             uses a styled <a> with background-color + border-radius +
             padding — every major mail client respects those. -->
        <tr><td align="center" class="em-cta-wrap">
          <a href="${esc(shareUrl)}" target="_blank"
             class="em-cta-btn"
             style="display:inline-block;background:#ffffff;color:${CTA_INK};font-family:${FF};font-weight:700;font-size:22px;line-height:1;letter-spacing:0.01em;text-decoration:none;padding:16px 36px;border-radius:999px;box-shadow:0 8px 22px rgba(0,0,0,0.24),0 2px 4px rgba(0,0,0,0.14);-webkit-tap-highlight-color:transparent;mso-padding-alt:0;">
            ${esc(ctaLabel)} &nbsp;→
          </a>
        </td></tr>

        <!-- Footer — minimal single-line "made with dearly". Tagline +
             "A product by" prefixes removed per request; just the
             attribution, quiet and centered. -->
        <tr><td class="em-foot-row" align="center">
          <div class="em-foot"
               style="font-family:${FF};color:${INK_SOFT};line-height:1;">
            made with <span class="em-wordmark" style="color:${INK_HI};font-weight:600;">dearly</span>
          </div>
        </td></tr>

      </table>

    </td></tr>
  </table>

</body></html>`
}

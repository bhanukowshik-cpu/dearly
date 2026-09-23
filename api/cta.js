/**
 * /api/cta — renders the email's call-to-action button ("Open {sender}'s
 * letter  →") as a PNG, so the Caveat handwriting AND the hand-drawn arrow
 * are pixel-perfect in EVERY email client — including the ones (Gmail,
 * Outlook, Yahoo) that strip @font-face and inline SVG.
 *
 * Why an image: the live-text button falls back to a system sans in those
 * clients, and inline-SVG arrows are stripped entirely. A baked PNG bypasses
 * both. The email wraps this image in the share <a>, with the label as alt
 * text, so an images-off client still shows a working text link.
 *
 * Why the background is TRANSPARENT: email clients never recolor images, but
 * clients like Gmail DO force-invert the live HTML around them in dark mode —
 * flipping the dark .em-card to a light cream. A previously baked-solid card
 * colour (#120c06) then stayed dark while the card around it went light,
 * showing up as an ugly black box behind the pill. A transparent canvas lets
 * the white pill sit flush on whatever colour the card actually renders as
 * (dark normally, cream when inverted), so there's never a seam or box. The
 * white pill itself is an image, so it stays white under any theme.
 *
 * Query params:
 *   s — sender first name (defaults to "" → generic "Open the letter")
 *
 * Mirrors api/greeting.js + api/og.js (same Caveat fetch + ImageResponse
 * pattern). Runs on Vercel's edge in prod; bridged into Vite via a dev
 * middleware (see vite.config.js) so /email-preview renders it locally too.
 */
import { ImageResponse } from '@vercel/og'

export const config = { runtime: 'edge' }

const h = (type, props, ...children) => ({
  type,
  props: {
    ...props,
    children:
      children.length === 1 ? children[0]
      : children.length > 1 ? children
      : undefined,
  },
})

// Trim, cap length, fall back if empty.
function name(raw, fallback) {
  const v = (raw || '').trim().slice(0, 40)
  return v || fallback
}

// Paper-cut button, mirroring the landing hero CTA (LoadingScreen.jsx): a
// hand-cut wobbly shape filled with an accent colour, white Caveat label, white
// arrow — no pill, no box.
const ACCENT    = '#E89545' // sunset orange, from the LoadingScreen accent palette
const LABEL_INK = '#ffffff'

// The wobbly "cut paper" outline, lifted verbatim from the landing CTA's
// <svg viewBox="0 0 340 62"> background path. Stretched to the button box
// (backgroundSize 100% 100%) so the edges wobble exactly like the home page.
const CTA_SHAPE_PATH = 'M 14,8 C 95,4 245,5 326,8 C 330,22 331,40 326,54 C 245,58 95,57 14,54 C 10,40 10,22 14,8 Z'

// Hand-drawn arrow lifted verbatim from IconArrow (LoadingScreen.jsx ~line 18),
// the same stroke used on the in-app "Send" button. Filled path, ~29×15 box.
const CTA_ARROW_PATH = 'M23.639 4.87137L5.72378 5.28607L0.668197 5.40637C-0.221121 5.42536 -0.224343 6.78343 0.668197 6.76444L18.5867 6.34657L23.639 6.23577C24.5283 6.20728 24.5316 4.84921 23.639 4.87137ZM28.6592 4.80489C25.495 3.34236 22.3867 1.77113 19.3342 0.0912199C18.5609 -0.336145 17.8617 0.854144 18.6382 1.26568C21.4028 2.78942 24.2126 4.2203 27.0674 5.55832C24.1864 8.08249 21.5934 10.907 19.3342 13.9821C19.2433 14.1383 19.2183 14.3233 19.2647 14.4973C19.3111 14.6713 19.4251 14.8205 19.5823 14.9129C19.7413 14.9996 19.9283 15.0226 20.1042 14.9772C20.2801 14.9318 20.4313 14.8214 20.5264 14.6691C22.9212 11.4258 25.6987 8.47276 28.8009 5.87172C28.8748 5.79773 28.9306 5.70821 28.964 5.60993C28.9975 5.51166 29.0078 5.40719 28.9941 5.30443C28.9805 5.20167 28.9432 5.1033 28.8852 5.01676C28.8272 4.93022 28.7499 4.85777 28.6592 4.80489Z'

export default async function handler(req) {
  const url     = new URL(req.url)
  const sender  = name(url.searchParams.get('s'), '')
  const baseUrl = `${url.protocol}//${url.host}`
  const label   = sender ? `Open ${sender}'s letter` : 'Open the letter'

  // Caveat font — same file api/og.js + api/greeting.js use. 2× display size
  // so the button stays crisp on retina screens.
  const fontResult = await fetch(`${baseUrl}/fonts/caveat-subset.ttf`)
    .then(r => (r.ok ? r.arrayBuffer() : null))
    .catch(() => null)

  const fonts  = fontResult ? [{ name: 'Caveat', data: fontResult, style: 'normal', weight: 700 }] : []
  const family = fontResult ? 'Caveat' : 'Georgia, serif'

  // Scale the label down for long sender names so the pill never overruns
  // the canvas.
  const fontSize = label.length > 24 ? 38 : label.length > 16 ? 44 : 50
  const arrowH   = Math.round(fontSize * 0.42)
  const arrowW   = Math.round(arrowH * (29 / 15))

  // Hand-drawn arrow as an inline-SVG data URI — Satori rasterises it into
  // the PNG, so it survives the clients that strip live <svg>. White, to sit
  // on the accent shape like the landing CTA.
  const arrowSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${arrowW}" height="${arrowH}" viewBox="0 0 29 15"><path d="${CTA_ARROW_PATH}" fill="${LABEL_INK}"/></svg>`
  const arrowSrc = `data:image/svg+xml;base64,${btoa(arrowSvg)}`

  // The wobbly cut-paper shape as a stretchable SVG background. preserveAspectRatio
  // "none" lets it flex to the label width just like the live button does.
  const shapeSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="340" height="62" viewBox="0 0 340 62" preserveAspectRatio="none"><path d="${CTA_SHAPE_PATH}" fill="${ACCENT}"/></svg>`
  const shapeSrc = `data:image/svg+xml;base64,${btoa(shapeSvg)}`

  return new ImageResponse(
    h('div', {
      style: {
        width:          '100%',
        height:         '100%',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        // Transparent so the pill sits flush on the card's ACTUAL colour —
        // dark normally, cream when Gmail force-inverts in dark mode — instead
        // of showing a baked-in dark box behind the pill after inversion.
        background:      'transparent',
      },
    },
      // Paper-cut button: the wobbly accent shape stretched behind the label.
      h('div', {
        style: {
          display:          'flex',
          alignItems:       'center',
          gap:              `${Math.round(fontSize * 0.34)}px`,
          // Padding must clear the shape's internal margins (the fill is inset
          // ~4% horizontally / ~13% vertically inside its viewBox) so the label
          // never sits on the wobbly edge.
          padding:          `${Math.round(fontSize * 0.62)}px ${Math.round(fontSize * 1.3)}px`,
          backgroundImage:  `url(${shapeSrc})`,
          backgroundSize:   '100% 100%',
          backgroundRepeat: 'no-repeat',
        },
      },
        h('div', {
          style: {
            fontFamily:  family,
            fontSize,
            fontWeight:  700,
            color:       LABEL_INK,
            lineHeight:  1,
            display:     'flex',
            // Caveat tops out at weight 700, so thicken the strokes with a
            // multi-directional same-ink text-shadow — a faux-bold Satori
            // rasterises into the PNG for a heavier, more confident hand.
            textShadow: `0.9px 0 0 ${LABEL_INK}, -0.9px 0 0 ${LABEL_INK}, 0 0.9px 0 ${LABEL_INK}, 0 -0.9px 0 ${LABEL_INK}`,
          },
        }, label),
        h('img', {
          src:    arrowSrc,
          width:  arrowW,
          height: arrowH,
          style:  { display: 'flex' },
        }),
      ),
    ),
    {
      // 720×170 canvas. The paper-cut button is content-sized + centred on a
      // TRANSPARENT margin, so it sits flush on the card whatever colour it
      // renders as. Displayed ~360px wide.
      width:  720,
      height: 170,
      fonts,
    },
  )
}

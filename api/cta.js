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
 * Why the background is baked SOLID (#120c06, the card colour): email clients
 * never recolor images but DO force-invert live HTML in dark mode. Baking the
 * card colour behind the white pill means it sits flush on .em-card with no
 * seam, and the white pill stays white even under a forced dark theme.
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

const CARD_BG = '#120c06' // matches .em-card in src/lib/emailTemplate.js
const PILL    = '#ffffff'
const CTA_INK = '#1A2A3A' // dark navy ink — matches the landing-screen CTA

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
  // the PNG, so it survives the clients that strip live <svg>.
  const arrowSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${arrowW}" height="${arrowH}" viewBox="0 0 29 15"><path d="${CTA_ARROW_PATH}" fill="${CTA_INK}"/></svg>`
  const arrowSrc = `data:image/svg+xml;base64,${btoa(arrowSvg)}`

  return new ImageResponse(
    h('div', {
      style: {
        width:          '100%',
        height:         '100%',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        background:      CARD_BG,
      },
    },
      // White pill
      h('div', {
        style: {
          display:       'flex',
          alignItems:    'center',
          gap:           `${Math.round(fontSize * 0.34)}px`,
          background:     PILL,
          borderRadius:   999,
          padding:        `${Math.round(fontSize * 0.5)}px ${Math.round(fontSize * 1.05)}px`,
          boxShadow:      '0 6px 16px rgba(0,0,0,0.28)',
        },
      },
        h('div', {
          style: {
            fontFamily:  family,
            fontSize,
            fontWeight:  700,
            color:       CTA_INK,
            lineHeight:  1,
            display:     'flex',
            // Caveat tops out at weight 700, so thicken the strokes with a
            // multi-directional same-ink text-shadow — a faux-bold Satori
            // rasterises into the PNG for a heavier, more confident hand.
            textShadow: `0.9px 0 0 ${CTA_INK}, -0.9px 0 0 ${CTA_INK}, 0 0.9px 0 ${CTA_INK}, 0 -0.9px 0 ${CTA_INK}`,
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
      // 720×170 canvas. Pill is content-sized + centred; the dark margin is
      // card-coloured so it's invisible on .em-card. Displayed ~360px wide.
      width:  720,
      height: 170,
      fonts,
    },
  )
}

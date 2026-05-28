/**
 * voiceBarcode.js — generate a stylized QR code as a PNG data URL for the
 * export-mode voice-note card.
 *
 * Why PNG and not SVG: html-to-image rasterises the captured DOM by
 * wrapping it in an SVG <foreignObject>, serialising the whole subtree,
 * then drawing the result to a canvas via an <img> tag. When a QR svg
 * sits inside that foreignObject, the modules antialias unpredictably
 * during the outer-SVG-to-canvas rasterisation step — small modules blur
 * into a grey wash even though the source vector is crisp. Pre-rendering
 * the QR to a PNG bitmap dodges the double-vector problem entirely: the
 * export pipeline just treats it as an image.
 *
 * Design choices (all in service of scan reliability at small sizes):
 *   - dots: 'square' — sharp edges survive rasterisation better than
 *     rounded dots, which blur to grey at low pixel counts per module
 *   - corners: 'extra-rounded' / 'dot' — the three finder patterns stay
 *     soft and warm because they're physically large enough to render
 *     their roundedness clearly. The visual warmth lives here.
 *   - color: near-black warm ink (#1a1208) — pure #000 reads cold, but
 *     anything lighter than ~#202020 loses contrast under antialiasing
 *   - error correction: 'M' — 15% redundancy, balances module count
 *     vs. tolerance to fuzz
 *   - quiet zone: 4 modules — QR spec minimum for reliable scanning;
 *     the export card's white right-column adds a bit more around it
 */

import QRCodeStyling from 'qr-code-styling'

const QR_INK = '#1a1208'

/**
 * Render a QR code as a PNG data URL.
 *
 * @param {string} payload  URL to encode (typically `/?id=<noteId>` share URL
 *                          for the full letter, or `/v/<id>` voice-only fallback)
 * @returns {Promise<string>} `data:image/png;base64,...` ready to drop into
 *                            <img src="..."> in the export overlay
 */
export async function renderVoiceBarcodeSVG(payload) {
  const qr = new QRCodeStyling({
    type: 'canvas',
    width: 800,
    height: 800,
    // 4-module quiet zone. At 33×33 modules in an 800px output each
    // module is ~24px, so 4 modules = ~96px white border on each side.
    margin: 96,
    data: payload,
    qrOptions: {
      errorCorrectionLevel: 'M',
    },
    dotsOptions: {
      color: QR_INK,
      type: 'square',
    },
    cornersSquareOptions: {
      color: QR_INK,
      type: 'extra-rounded',
    },
    cornersDotOptions: {
      color: QR_INK,
      type: 'dot',
    },
    backgroundOptions: {
      // Solid white background — guarantees the quiet zone scanners
      // need, regardless of the export card's color underneath.
      color: '#FFFFFF',
    },
  })

  const blob = await qr.getRawData('png')
  return await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload  = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

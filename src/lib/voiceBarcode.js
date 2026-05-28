/**
 * voiceBarcode.js — generate a stylized QR code SVG for the export-mode
 * voice-note card. The voice note's right column is small (~25–32% of the
 * pill width × the pill's height), so SCAN RELIABILITY at small physical
 * sizes is the dominant constraint. Every choice below trades a little
 * "designer warmth" for guaranteed scannability:
 *
 *   - dots: type 'square' — at 2–3 px per module, rounded dots blur into
 *     a grey wash. Hard square edges keep contrast crisp.
 *   - corners: type 'extra-rounded' / 'dot' for the three finder patterns
 *     only. The eye reads the corners as the "shape" of the QR, so warmth
 *     comes from those big rounded squares while data modules stay sharp.
 *   - color: near-black warm ink (#1a1208) — pure #000 looks cold against
 *     cream paper, but anything lighter than ~#202020 starts losing
 *     contrast when html-to-image antialiases at small sizes.
 *   - error correction: 'L' — minimises module count (~33×33 for our
 *     ~75-char URLs) so each module gets more pixels in the final PNG.
 *   - quiet zone: margin = 2 modules — phones need a clear border around
 *     the QR to lock onto the finder patterns.
 */

import QRCodeStyling from 'qr-code-styling'

const QR_INK = '#1a1208'

/**
 * Render a QR code to an SVG string.
 *
 * @param {string} payload  URL to encode (typically `/?id=<noteId>` share URL
 *                          for the full letter, or `/v/<id>` voice-only fallback)
 * @returns {Promise<string>} SVG markup with viewBox sized to the QR. The
 *   width/height attrs are stripped so the parent's CSS box controls the
 *   rendered size.
 */
export async function renderVoiceBarcodeSVG(payload) {
  const qr = new QRCodeStyling({
    type: 'svg',
    width: 600,
    height: 600,
    // ~2 modules of quiet zone. Required by spec for scanners to lock
    // onto the finder patterns. The container around the QR also
    // provides visual padding, but a real quiet zone in the QR itself
    // is what scanners actually need.
    margin: 8,
    data: payload,
    qrOptions: {
      // 'M' = ~15% error correction. With the now-shorter `/?id=<uuid>`
      // URL the module count stays low (33×33), so M doesn't push us
      // into a denser grid — and the extra redundancy means scanners
      // still decode reliably even if rasterisation softens a few
      // modules at the rendered size.
      errorCorrectionLevel: 'M',
    },
    dotsOptions: {
      color: QR_INK,
      // SQUARE dots: at the physical sizes we ship (small voice-note
      // pills), rounded dots become indistinguishable grey blobs once
      // the SVG is rasterised. Square keeps every module readable.
      type: 'square',
    },
    cornersSquareOptions: {
      color: QR_INK,
      // The three finder squares are large enough to stay readable
      // even with the soft 'extra-rounded' treatment — this is where
      // the visual warmth comes from.
      type: 'extra-rounded',
    },
    cornersDotOptions: {
      color: QR_INK,
      type: 'dot',
    },
    backgroundOptions: {
      color: 'transparent',
    },
  })

  const blob = await qr.getRawData('svg')
  let svg = await blob.text()

  // Strip width/height so parent CSS controls rendered size; viewBox
  // alone governs the 1:1 aspect.
  svg = svg.replace(/\swidth="[^"]+"/, '').replace(/\sheight="[^"]+"/, '')
  return svg
}

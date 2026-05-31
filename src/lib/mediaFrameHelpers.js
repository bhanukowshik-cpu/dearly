import { ACCEPTED_MIME, MAX_BYTES, FILTERS, FRAME_STYLES, FRAME_PADDING } from './mediaFrameConfig'

/* Returns { ok: true } | { ok: false, reason: string } */
export function validateMediaFile(file) {
  if (!file) return { ok: false, reason: 'No file selected.' }
  if (!ACCEPTED_MIME.includes(file.type)) {
    return { ok: false, reason: 'Use a PNG, JPG, GIF, or HEIC.' }
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, reason: 'That file is too large (max 25 MB).' }
  }
  return { ok: true }
}

/* GIFs render through <img> with the original blob URL so the animation
   survives. PNGs do the same — there's no canvas re-encoding step. */
export function getMediaType(file) {
  return file?.type === 'image/gif' ? 'gif' : 'image'
}

export function getFilterStyle(filter) {
  return FILTERS[filter]?.css ?? 'none'
}

export function getFrameClass(frameStyle, styles) {
  const key = FRAME_STYLES[frameStyle] ? frameStyle : 'none'
  return styles[`frame_${key}`] ?? styles.frame_none ?? ''
}

/* Given a frame's outer WIDTH (px), the image's natural aspect ratio
   (width / height), and the chosen frame style, return the frame's outer
   HEIGHT (px) such that the inner photo box — i.e. the area after the
   style's padding — exactly matches the image's aspect ratio. This is
   what eliminates the cream bars in a polaroid while still preserving
   the full photo (no crop).

   CSS percentage padding is relative to the parent's WIDTH, so:
     inner_w = frame_w * (1 - left - right)
     inner_h = frame_h - frame_w * (top + bottom)
   Solving inner_w / inner_h = imgAspect for frame_h gives the formula
   below. Falls back to a plain aspect match if the style is unknown. */
export function computeFrameHeight(frameWidth, imageAspect, frameStyle) {
  if (!frameWidth || !imageAspect || !Number.isFinite(imageAspect)) return frameWidth
  const pad = FRAME_PADDING[frameStyle] ?? FRAME_PADDING.none
  const horizontal = pad.left + pad.right         // fraction of frame_w
  const vertical   = pad.top  + pad.bottom        // fraction of frame_w
  return frameWidth * ((1 - horizontal) / imageAspect + vertical)
}

/* ─────────────────────────────────────────────────────────────────────────
   loadImageMeta — turn the user's file into something the renderer can
   safely paint, and report its natural pixel dimensions.

   Two paths:
     • PNG and GIF → return the original blob URL untouched. Critical for
       GIFs: piping through a canvas would freeze them on the first frame.
     • Everything else (JPG, WEBP, HEIC, HEIF) → decode with <img>, paint
       onto a canvas, export as PNG. This normalizes weird/proprietary
       formats and lets Chrome/Firefox render the result (HEIC only decodes
       in Safari — other browsers will hit the error path below).

   The returned URL is owned by the caller — revoke it when replacing or
   unmounting. On failure no URLs leak.
   ───────────────────────────────────────────────────────────────────────── */
export async function loadImageMeta(file) {
  const needsConversion = file.type !== 'image/png' && file.type !== 'image/gif'
  const srcUrl = URL.createObjectURL(file)

  let img
  try {
    img = await new Promise((resolve, reject) => {
      const i = new Image()
      i.onload  = () => resolve(i)
      i.onerror = () => reject(new Error(
        "This browser can't read that image. Try a PNG, JPG, or GIF (HEIC opens in Safari)."
      ))
      i.src = srcUrl
    })
  } catch (err) {
    URL.revokeObjectURL(srcUrl)
    throw err
  }

  const width  = img.naturalWidth
  const height = img.naturalHeight

  if (!needsConversion) {
    // Caller will use srcUrl directly — don't revoke.
    return { url: srcUrl, width, height }
  }

  try {
    const canvas = document.createElement('canvas')
    canvas.width  = width
    canvas.height = height
    canvas.getContext('2d').drawImage(img, 0, 0)
    const blob = await new Promise(res => canvas.toBlob(res, 'image/png'))
    if (!blob) throw new Error('Could not convert that image to PNG.')
    const url = URL.createObjectURL(blob)
    URL.revokeObjectURL(srcUrl)   // we no longer need the source
    return { url, width, height }
  } catch (err) {
    URL.revokeObjectURL(srcUrl)
    throw err
  }
}

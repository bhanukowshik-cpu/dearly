/* ─────────────────────────────────────────────────────────────────────────
   mediaFrameConfig — frame style + filter definitions for media-frame
   canvas objects. Pure data: no React imports, no DOM access.
   ───────────────────────────────────────────────────────────────────────── */

/* Accepted file types for the file picker. PNG and GIF render through <img>
   directly (so GIFs keep animating); the others are decoded then re-encoded
   to PNG via canvas before being placed on the paper. HEIC/HEIF only decode
   in Safari — Chrome/Firefox will surface a friendly error. */
export const ACCEPTED_MIME = [
  'image/png',
  'image/gif',
  'image/jpeg',
  'image/webp',
  'image/heic',
  'image/heif',
]
export const ACCEPT_ATTR   = ACCEPTED_MIME.join(',')
export const MAX_BYTES     = 25 * 1024 * 1024  // 25 MB — modern phone photos can be 8-15 MB

/* Frame styles — keyed by id. `label` is shown in pickers. */
export const FRAME_STYLES = {
  none:     { id: 'none',     label: 'None' },
  polaroid: { id: 'polaroid', label: 'Polaroid' },
}

export const FRAME_ORDER = ['none', 'polaroid']

/* CSS filter strings — kept here so MediaFrameRenderer and any export
   path render the same look. */
export const FILTERS = {
  none:  { id: 'none',  label: 'Original', css: 'none' },
  bw:    { id: 'bw',    label: 'B&W',      css: 'grayscale(1)' },
  retro: { id: 'retro', label: 'Retro',    css: 'sepia(0.55) contrast(1.08) saturate(0.85)' },
}

export const FILTER_ORDER = ['none', 'bw', 'retro']

/* Default position/size for a newly-added frame (percent of paper).
   Width/height are placeholders — at upload time we replace them with values
   derived from the image's natural aspect ratio so the photo isn't cropped. */
export const DEFAULT_FRAME = {
  x:           50,
  y:           50,
  width:       35,
  height:      35,
  rotation:    0,
  frameStyle:  'none',
  filter:      'none',
  mediaUrl:    null,
  mediaType:   null,
  caption:     '',          // only shown when frameStyle === 'polaroid'
  // Natural pixel dimensions of the source image. Stored so we can
  // recompute the frame's height when the frame style changes — each style
  // has different inner padding, so the outer frame has to grow or shrink
  // for the inner photo area to keep the image's aspect ratio.
  imageWidth:  0,
  imageHeight: 0,
}

/* CSS padding (as a fraction of frame WIDTH) for each frame style. Used by
   computeFrameHeight to figure out the inner photo box. Keep in sync with
   the .frame_* selectors in MediaFrameRenderer.module.css. */
export const FRAME_PADDING = {
  none:     { top: 0,    right: 0,    bottom: 0,    left: 0 },
  polaroid: { top: 0.05, right: 0.05, bottom: 0.20, left: 0.05 },
}

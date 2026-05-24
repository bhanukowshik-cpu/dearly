/**
 * svgStickerPack.jsx — bulk-imports every SVG under src/assets/stickers/
 * and turns each into a sticker definition compatible with the existing
 * hand-drawn stickers (id, label, category, Component).
 *
 * Vite's `import.meta.glob` resolves at build time so all 96 SVGs are
 * known statically. Each SVG is imported as a URL (no JSX transform needed),
 * then wrapped in a lightweight Component that renders an <img>.
 *
 * The id is `pack:<category>:<file-slug>` — stable enough to persist into
 * shared note data and rehydrate on the receiver side via STICKER_REGISTRY.
 */

import styles from './StickerPicker.module.css'

// Eager + URL → each value is a string like "/src/assets/stickers/love/heart.svg"
const URL_MAP = import.meta.glob('../../assets/stickers/**/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
})

const CATEGORY_LABELS = {
  business:        'Business',
  celestial:       'Celestial',
  'fun-playful':   'Fun & Playful',
  love:            'Love',
  nature:          'Nature',
  'travel-postcard': 'Travel & Postcard',
}

// Order matters — this is the order categories appear in the picker.
const CATEGORY_ORDER = ['love', 'nature', 'fun-playful', 'celestial', 'travel-postcard', 'business']

// "rose bloom.svg" → "Rose bloom",   "bar-chart 01.svg" → "Bar chart 01"
function humanize(filename) {
  return filename
    .replace(/\.svg$/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, c => c.toUpperCase())
}

// "Rose bloom" → "rose-bloom"
function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

// Factory: a component that renders the SVG at the given URL.
// Sized to fill its 40×40 host so it matches the hand-drawn SVGs visually.
function makeImgComponent(url, label) {
  // Use object-fit:contain so SVGs with their own viewBox render proportionally.
  return function PackSticker() {
    return (
      <img
        src={url}
        alt={label}
        className={styles.packStickerImg}
        draggable={false}
      />
    )
  }
}

const stickersByCategory = {}

for (const [path, url] of Object.entries(URL_MAP)) {
  // path: "../../assets/stickers/love/heart.svg"
  const m = path.match(/stickers\/([^/]+)\/([^/]+)$/)
  if (!m) continue
  const categoryKey  = m[1]
  const filename     = m[2]
  const label        = humanize(filename)
  const id           = `pack:${categoryKey}:${slugify(label)}`
  const entry = { id, label, category: categoryKey, url, Component: makeImgComponent(url, label) }
  if (!stickersByCategory[categoryKey]) stickersByCategory[categoryKey] = []
  stickersByCategory[categoryKey].push(entry)
}

// Sort each category's stickers alphabetically by label
for (const k of Object.keys(stickersByCategory)) {
  stickersByCategory[k].sort((a, b) => a.label.localeCompare(b.label))
}

// Flat list — used by the picker for search.
export const SVG_STICKERS = CATEGORY_ORDER.flatMap(k => stickersByCategory[k] ?? [])

// Grouped — shown as section headers in the picker when not searching.
export const SVG_STICKER_GROUPS = CATEGORY_ORDER
  .filter(k => stickersByCategory[k]?.length)
  .map(k => ({
    id:       k,
    label:    CATEGORY_LABELS[k] ?? k,
    stickers: stickersByCategory[k],
  }))

// id → Component lookup for rehydration in PaperCanvas.
export const SVG_STICKER_REGISTRY = Object.fromEntries(
  SVG_STICKERS.map(s => [s.id, s.Component])
)

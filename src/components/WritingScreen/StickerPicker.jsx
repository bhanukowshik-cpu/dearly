import { useState, useMemo, useDeferredValue, useCallback } from 'react'
import { motion } from 'framer-motion'
import { STICKER_GROUPS } from './handDrawnStickers'
import { SVG_STICKER_GROUPS } from './svgStickerPack'
import { IconSearch, IconClose } from './editorIcons'
import styles from './StickerPicker.module.css'

/* ── Sticker pool ─────────────────────────────────────────────────────────
   Flatten hand-drawn sketches + SVG pack into one list. `category` is
   "sketches" or the SVG pack folder ("business", "love", …).
   _categoryLabel is human-readable so search can match category words too.
   ───────────────────────────────────────────────────────────────────────── */
const ALL_STICKERS = [
  ...STICKER_GROUPS.flatMap(g => g.stickers.map(s => ({ ...s, category: 'sketches', _categoryLabel: 'Sketches' }))),
  ...SVG_STICKER_GROUPS.flatMap(g => g.stickers.map(s => ({ ...s, _categoryLabel: g.label }))),
]
const STICKERS_BY_ID = Object.fromEntries(ALL_STICKERS.map(s => [s.id, s]))

/* ── Most-used tracking ──────────────────────────────────────────────────
   Per-sticker click count in localStorage. The picker reads this once on
   mount; on every add we bump the count + persist.
   ───────────────────────────────────────────────────────────────────────── */
const USAGE_STORAGE_KEY = 'dearly:stickerUsage:v1'

function readUsage() {
  if (typeof window === 'undefined') return {}
  try { return JSON.parse(localStorage.getItem(USAGE_STORAGE_KEY) || '{}') }
  catch { return {} }
}
function writeUsage(usage) {
  try { localStorage.setItem(USAGE_STORAGE_KEY, JSON.stringify(usage)) }
  catch { /* quota / private mode — silent */ }
}

// Default "most used" seed (pre-usage data) — a friendly cross-category mix
// with a couple of business picks since the user wants those visible.
const DEFAULT_MOST_USED_IDS = [
  'heart',
  'sun',
  'pack:travel-postcard:paper-plane',
  'pack:business:notebook',
  'pack:business:idea',
  'pack:love:heart',
  'pack:nature:sunflower',
  'rosebud',
]

function pickMostUsed(usage, count = 8) {
  // Sort known ids by usage desc, then fall back to the seed list.
  const ranked = Object.entries(usage).sort((a, b) => b[1] - a[1]).map(([id]) => id)
  const queue = [...ranked, ...DEFAULT_MOST_USED_IDS]
  const seen = new Set()
  const out = []
  for (const id of queue) {
    if (seen.has(id)) continue
    seen.add(id)
    const s = STICKERS_BY_ID[id]
    if (s) out.push(s)
    if (out.length >= count) break
  }
  return out
}

/* ── Mix recipe — business first, then round-robin everyone else ─────── */
function interleave(lists) {
  const out = []
  const max = Math.max(...lists.map(l => l.length))
  for (let i = 0; i < max; i++) {
    for (const l of lists) if (i < l.length) out.push(l[i])
  }
  return out
}

const BUSINESS_LEAD_COUNT = 12  // how many business stickers ride at the top of the mix

function buildMixedRest(excludeIds) {
  const skip = new Set(excludeIds)
  const byCat = (cat) => ALL_STICKERS.filter(s => s.category === cat && !skip.has(s.id))
  const business = byCat('business')
  const lead     = business.slice(0, BUSINESS_LEAD_COUNT)
  const rest     = business.slice(BUSINESS_LEAD_COUNT)
  const others   = [
    rest,
    byCat('love'),
    byCat('nature'),
    byCat('fun-playful'),
    byCat('celestial'),
    byCat('travel-postcard'),
    byCat('sketches'),
  ]
  return [...lead, ...interleave(others)]
}

/* ── UI ───────────────────────────────────────────────────────────────── */

function StickerBtn({ sticker, isFull, onAdd }) {
  return (
    <motion.button
      type="button"
      className={`${styles.stickerBtn} ${isFull ? styles.stickerBtnDisabled : ''}`}
      onClick={() => !isFull && onAdd(sticker)}
      disabled={isFull}
      whileHover={isFull ? {} : { scale: 1.10, y: -2 }}
      whileTap={isFull ? {} : { scale: 0.90 }}
      title={sticker.label}
    >
      <sticker.Component />
    </motion.button>
  )
}

/* Search + clear icons come from editorIcons.jsx (hand-drawn). */

export default function StickerPicker({ onAdd, stickerCount, maxStickers = 6 }) {
  const isFull = stickerCount >= maxStickers
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const [usage, setUsage] = useState(readUsage)

  const mostUsed = useMemo(() => pickMostUsed(usage, 8), [usage])
  const mostUsedIds = useMemo(() => mostUsed.map(s => s.id), [mostUsed])
  const mixedRest = useMemo(() => buildMixedRest(mostUsedIds), [mostUsedIds])

  // Search runs against the full flat list (ignores sectioning).
  const filtered = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase()
    if (!q) return null
    return ALL_STICKERS.filter(s =>
      s.label.toLowerCase().includes(q) ||
      s._categoryLabel.toLowerCase().includes(q)
    )
  }, [deferredQuery])

  const searching = !!filtered

  const handleAdd = useCallback((sticker) => {
    onAdd(sticker)
    setUsage(prev => {
      const next = { ...prev, [sticker.id]: (prev[sticker.id] || 0) + 1 }
      writeUsage(next)
      return next
    })
  }, [onAdd])

  return (
    <div className={styles.wrap}>
      {/* ── Search ──────────────────────────────────────────────────────── */}
      <div className={styles.searchWrap}>
        <span className={styles.searchIcon}><IconSearch size={14} /></span>
        <input
          type="search"
          className={styles.searchInput}
          placeholder="Search stickers…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          spellCheck={false}
          aria-label="Search stickers"
        />
        {query && (
          <button
            type="button"
            className={styles.searchClear}
            onClick={() => setQuery('')}
            aria-label="Clear search"
            title="Clear"
          >
            <IconClose size={10} />
          </button>
        )}
      </div>

      {isFull && (
        <p className={styles.limitNote}>Remove one to add more</p>
      )}

      {searching ? (
        filtered.length === 0 ? (
          <p className={styles.emptyNote}>No stickers match “{query.trim()}”.</p>
        ) : (
          <div className={styles.grid}>
            {filtered.map(s => (
              <StickerBtn key={s.id} sticker={s} isFull={isFull} onAdd={handleAdd} />
            ))}
          </div>
        )
      ) : (
        <>
          {/* ── Most used ─────────────────────────────────────────────── */}
          {mostUsed.length > 0 && (
            <section className={styles.section}>
              <span className={styles.sectionTag}>Most used</span>
              <div className={styles.grid}>
                {mostUsed.map(s => (
                  <StickerBtn key={`mu-${s.id}`} sticker={s} isFull={isFull} onAdd={handleAdd} />
                ))}
              </div>
            </section>
          )}

          {/* ── Everything else (mixed, business first) ───────────────── */}
          <div className={styles.grid}>
            {mixedRest.map(s => (
              <StickerBtn key={s.id} sticker={s} isFull={isFull} onAdd={handleAdd} />
            ))}
          </div>
        </>
      )}

      {stickerCount > 0 && (
        <p className={styles.hint}>Tap a sticker on the card to remove it</p>
      )}
    </div>
  )
}

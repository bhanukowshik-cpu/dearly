import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { STICKER_GROUPS } from './handDrawnStickers'
import styles from './StickerPicker.module.css'

const ALL_STICKERS = STICKER_GROUPS.flatMap(g => g.stickers)

// Row 1: rosebud, heart, rocket, sun
// Row 2: lightbulb, butterfly, bow, [··· or next sticker]
const FEATURED_IDS = ['rosebud', 'heart', 'rocket', 'sun', 'lightbulb', 'butterfly', 'bow']
const FEATURED = FEATURED_IDS.map(id => ALL_STICKERS.find(s => s.id === id)).filter(Boolean)
const REST = ALL_STICKERS.filter(s => !FEATURED_IDS.includes(s.id))
const EIGHTH = REST[0]          // replaces ··· when expanded
const GRID_REST = REST.slice(1) // shown in the expanded grid below

function StickerBtn({ sticker, isFull, onAdd }) {
  return (
    <motion.button
      className={`${styles.stickerBtn} ${isFull ? styles.stickerBtnDisabled : ''}`}
      onClick={() => !isFull && onAdd(sticker)}
      disabled={isFull}
      whileHover={isFull ? {} : { scale: 1.12, y: -2 }}
      whileTap={isFull ? {} : { scale: 0.88 }}
      title={sticker.label}
    >
      <sticker.Component />
    </motion.button>
  )
}

export default function StickerPicker({ onAdd, stickerCount, maxStickers = 6 }) {
  const [open, setOpen] = useState(false)
  const isFull = stickerCount >= maxStickers

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <span className={styles.title}>Stickers</span>
        {open
          ? <button className={styles.showLess} onClick={() => setOpen(false)}>Show less</button>
          : isFull
            ? <span className={styles.limitNote}>Remove one to add more</span>
            : null
        }
      </div>

      {/* 4-column grid: row 1 = 4 stickers, row 2 = 3 stickers + (··· or 8th sticker) */}
      <div className={styles.row}>
        {FEATURED.map(sticker => (
          <StickerBtn key={sticker.id} sticker={sticker} isFull={isFull} onAdd={onAdd} />
        ))}
        <AnimatePresence mode="wait" initial={false}>
          {open ? (
            <motion.div
              key="eighth"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.15 }}
            >
              <StickerBtn sticker={EIGHTH} isFull={isFull} onAdd={onAdd} />
            </motion.div>
          ) : (
            <motion.button
              key="dots"
              className={`${styles.stickerBtn} ${styles.moreBtn}`}
              onClick={() => setOpen(true)}
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.92 }}
              title="More stickers"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.15 }}
            >
              <span className={styles.moreDots}>···</span>
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* Expanded grid */}
      <AnimatePresence>
        {open && (
          <motion.div
            className={styles.grid}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18, ease: 'easeInOut' }}
          >
            {GRID_REST.map(sticker => (
              <StickerBtn key={sticker.id} sticker={sticker} isFull={isFull} onAdd={onAdd} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {stickerCount > 0 && (
        <p className={styles.hint}>Tap a sticker on the card to remove it</p>
      )}
    </div>
  )
}

/**
 * drawingIcons — inline React components for the pen and highlighter
 * illustrations used in the Draw panel.
 *
 * The source SVGs live at `Dearly V2/Icons/{pen icon.svg, Highlighter Icon.svg}`.
 * They've been inlined here so we can:
 *   1. Re-color the "ink" parts (tip, cap, barrel) from React state
 *      without round-tripping through a CSS filter.
 *   2. Keep the rest of the illustration (white body, ferrule) static so
 *      colour swaps feel like a real pen / highlighter and not a tinted
 *      silhouette.
 *
 * Both icons are drawn TIP-UP in their viewBox so the Draw panel can clip
 * them to the bottom and have the tip be the first thing to rise into view
 * when the tool is selected.
 */

import { useId } from 'react'

/* Mix a hex colour toward black by `amount` (0..1) — used to give the
   "shadow" highlight paths a hair of depth without needing a second prop. */
function shade(hex, amount = 0.22) {
  const h = hex.replace('#', '')
  const n = h.length === 3
    ? h.split('').map(c => parseInt(c + c, 16))
    : [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
  const mix = (c) => Math.round(c * (1 - amount))
  return `#${mix(n[0]).toString(16).padStart(2, '0')}${mix(n[1]).toString(16).padStart(2, '0')}${mix(n[2]).toString(16).padStart(2, '0')}`
}

/**
 * PenSvg
 * Body stays paper-cream; ink colour drives the tip cone + bottom cap so
 * the selected swatch reads as "this is the pen's ink".
 */
export function PenSvg({ inkColor = '#252525', className }) {
  const dark = shade(inkColor, 0.28)
  return (
    <svg
      className={className}
      viewBox="0 0 577 634"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      {/* Tip — cone + its inner shadow */}
      <path d="M309.504 91.4686L309.504 55.5664C309.504 39.5764 305.355 23.8126 297.436 9.85903C293.815 3.52335 285.443 2.69368 280.616 7.52086C279.937 8.19968 279.334 8.95394 278.881 9.85904C270.962 23.8126 266.813 39.5764 266.813 55.5664L266.813 91.4686L309.504 91.4686Z" fill={inkColor} />
      <path d="M281.899 25.399C281.899 18.5656 282.811 11.815 284.297 5.18521C282.962 5.70564 281.695 6.4448 280.616 7.52337C279.937 8.20219 279.334 8.95645 278.882 9.86155C270.962 23.8151 266.814 39.5789 266.814 55.5689L266.814 91.4711H281.899L281.899 25.399Z" fill={dark} />

      {/* Bottom cap — also inkColor so the pen reads as a single ink unit */}
      <path d="M250.733 540.008L250.809 587.299C250.809 599.216 260.312 608.72 272.154 608.644L304.134 608.644C315.976 608.72 325.479 599.216 325.479 587.299L325.479 540.083L250.733 540.008Z" fill={inkColor} />
      <path d="M272.156 608.645L278.545 608.637C275.399 604.919 273.438 600.152 273.438 594.842L273.401 540.031L250.743 540.016L250.819 587.307C250.819 599.224 260.315 608.72 272.156 608.645Z" fill={dark} />

      {/* Cream barrel */}
      <path d="M256.143 570.986L320.141 570.978C331.922 570.978 341.471 561.429 341.471 549.648L341.486 147.649C341.486 135.626 337.76 123.905 330.821 114.085C323.882 104.265 320.156 92.5438 320.156 80.5211L320.156 71.9529C320.156 66.0547 315.381 61.2803 309.491 61.2878L266.83 61.2879C260.94 61.2954 256.165 66.0698 256.165 71.9529L256.165 80.5211C256.165 92.5438 252.439 104.265 245.5 114.085C238.561 123.905 234.835 135.626 234.835 147.649L234.82 549.648C234.82 561.429 244.361 570.986 256.143 570.986Z" fill="#EFF3F9" />
      <path d="M256.142 570.985L266.324 570.985C265.51 568.722 264.974 566.331 264.974 563.782L264.989 144.586C264.989 134.343 266.038 124.123 268.112 114.1C270.194 104.068 271.234 93.8555 271.234 83.6128L271.234 67.5474C271.234 65.36 271.664 63.2859 272.275 61.3022L266.815 61.3022C260.916 61.3022 256.142 66.0766 256.15 71.9673L256.15 80.5355C256.15 92.5582 252.424 104.279 245.484 114.1C238.545 123.92 234.819 135.641 234.819 147.664L234.804 549.662C234.804 561.444 244.361 570.985 256.142 570.985Z" fill="#CFE0F3" />
      <path d="M338.408 129.182C336.62 123.85 334.109 118.744 330.82 114.097C323.881 104.277 320.155 92.5561 320.155 80.5334L320.155 71.9651C320.155 66.0669 315.381 61.2925 309.49 61.3001L266.83 61.3001C260.932 61.3001 256.157 66.0745 256.165 71.9651L256.165 80.5334C256.165 92.5561 252.439 104.277 245.5 114.097C242.211 118.744 239.707 123.842 237.912 129.182L338.408 129.182Z" fill="#CFE0F3" />
      <path d="M268.113 114.099C270.194 104.068 271.235 93.8552 271.235 83.6125L271.235 67.547C271.235 65.3597 271.665 63.2855 272.276 61.3019L266.815 61.3019C260.917 61.3019 256.143 66.0763 256.15 71.9669L256.15 80.5351C256.15 92.5579 252.424 104.279 245.485 114.099C242.197 118.745 239.693 123.844 237.897 129.184L265.782 129.177C266.302 124.116 267.087 119.092 268.113 114.099Z" fill="#AECEE8" />
    </svg>
  )
}

/**
 * HighlighterSvg
 * The barrel + chisel tip both pick up the ink colour so the marker reads
 * as fully colour-saturated — matching how real highlighters are usually
 * coloured to match their ink. The ferrule + bands stay neutral.
 */
export function HighlighterSvg({ inkColor = '#252525', className }) {
  const dark = shade(inkColor, 0.32)
  // Suffix gradient ids so multiple instances on the page don't collide.
  const gid = useId().replace(/:/g, '')
  return (
    <svg
      className={className}
      viewBox="0 0 578 666"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      {/* Vertical gradient on the barrel — keeps the marker reading as a
          dimensional object instead of a flat rectangle of colour. */}
      <defs>
        <linearGradient id={`hi-${gid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={inkColor} />
          <stop offset="1" stopColor={dark} />
        </linearGradient>
      </defs>

      {/* Main barrel */}
      <path d="M336.565 610.507L240.568 610.507C231.732 610.507 224.57 603.345 224.57 594.509L224.565 152.002H352.568L352.562 594.509C352.562 603.345 345.401 610.507 336.565 610.507Z" fill={`url(#hi-${gid})`} />

      {/* Cap top + connector */}
      <path d="M312.56 95.9957L264.567 95.9957L264.562 31.9997L312.56 15.9965L312.56 95.9992Z" fill={inkColor} />
      <path d="M312.561 82.216L312.561 47.992L264.562 63.9953L264.562 82.2103C259.799 84.9822 256.564 90.0847 256.564 95.9904L256.564 135.996L320.565 135.996V95.9904C320.565 90.0847 317.324 84.9879 312.561 82.216Z" fill="#3F3E45" />

      {/* Chisel felt tip — the bit that actually leaves the colour */}
      <path d="M240.552 111.945H336.538V151.939H240.552V111.945Z" fill={dark} />

      {/* Neutral bands — keep the cream/white character of the original art */}
      <path d="M224.547 151.945H352.528V199.938H224.547V151.945Z" fill="#E9E9EA" />
      <path d="M224.508 514.023H352.488V562.016H224.508V514.023Z" fill="#E9E9EA" />
    </svg>
  )
}

/**
 * EraserSvg
 * Classic pink-block eraser standing upright. Static colour palette — the
 * eraser has no "ink" so it doesn't react to the swatch row. Drawn at a
 * similar height to the pen/highlighter so it sits in the holder the same
 * way and the trio reads as one set.
 */
export function EraserSvg({ className }) {
  return (
    <svg
      className={className}
      viewBox="0 0 280 600"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      {/* Worn-down top edge — slightly darker pink to suggest abrasion. */}
      <path d="M40 60 L240 60 L240 110 L40 110 Z" fill="#C4756A" />
      {/* Main rubber body */}
      <rect x="40" y="100" width="200" height="450" rx="10" fill="#E8927F" />
      {/* Subtle inner highlight on the left to give some dimension */}
      <rect x="40" y="100" width="22" height="450" rx="10" fill="#F0AC9C" />
      {/* Paper label band — classic eraser sleeve */}
      <rect x="36" y="240" width="208" height="64" fill="#F6E8DC" />
      <rect x="36" y="240" width="208" height="6"  fill="#D9C9BC" />
      <rect x="36" y="298" width="208" height="6"  fill="#D9C9BC" />
    </svg>
  )
}

/**
 * stylePresets.js — paper configuration system
 *
 * Three paper types:
 *   minimal  — clean white
 *   color    — user-selected tint (from COLOR_SWATCHES)
 *   vintage  — cream with aged stains
 *
 * Orthogonal toggles: showRuler, showZigzag
 */

export const PAPER_TYPES = {
  minimal: {
    label:       'Default',
    bg:          '#FAFAF8',
    inkColor:    '#252525',
    hasStains:   false,
    rulerColor:  'rgba(37,37,37,0.09)',
  },
  color: {
    label:       'Color',
    bg:          '#FAFAF8',     // overridden by paperColor state
    inkColor:    '#252525',
    hasStains:   false,
    rulerColor:  'rgba(0,0,0,0.07)',  // overridden dynamically in PaperCanvas
  },
  vintage: {
    label:       'Vintage',
    bg:          '#EDE5C8',
    inkColor:    '#2C1A0E',
    hasStains:   true,
    rulerColor:  'rgba(100,70,30,0.18)',
  },
}

/* Color swatches for the "color" paper type */
export const COLOR_SWATCHES = [
  { id: 'pink',   label: 'Pink',   value: '#FFF0F5' },
  { id: 'violet', label: 'Violet', value: '#F5F0FF' },
  { id: 'yellow', label: 'Yellow', value: '#FEFCE8' },
  { id: 'dark',   label: 'Dark',   value: '#252525' },
]

/* Paper sizes — aspect ratio is width / height */
export const PAPER_SIZES = {
  strip: {
    label:        'Strip',
    aspectRatio:  '4 / 1',
    mobileAspect: '4 / 1',
  },
  postcard: {
    label:        'Postcard',
    aspectRatio:  '3 / 2',
    mobileAspect: '4 / 3',
  },
  a4: {
    label:        'A4',
    aspectRatio:  '1 / 1.414',
    mobileAspect: '1 / 1.414',
  },
}

export const DEFAULT_PAPER = {
  type:        'minimal',
  color:       '#FFF0F5',
  size:        'postcard',
  showRuler:   true,
  showZigzag:  true,
}

/* Legacy export so old imports don't break */
export const STYLE_PRESETS = PAPER_TYPES
export const DEFAULT_PRESET = 'minimal'

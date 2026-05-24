/* ─────────────────────────────────────────────────────────────────────────
   voiceNoteAccent — palette helpers for the voice-note pill.

   `VOICE_ACCENT` / `VOICE_ACCENT_FADE` are the default fallback (warm
   sunrise orange) used when no paper context is available.

   `deriveVoiceAccent(paperHex)` produces a deeper, saturated tone in the
   same hue family as the paper — so on vintage cream you get a sepia,
   on pink you get a dusty rose, on blue you get a teal-blue, etc.

   `fadeVoiceAccent(hex, alpha)` turns the accent into an rgba string with
   the given alpha — used for un-played waveform strokes.
   ───────────────────────────────────────────────────────────────────────── */

export const VOICE_ACCENT      = '#F58A47'
export const VOICE_ACCENT_FADE = 'rgba(245, 138, 71, 0.30)'

function hexToRgb(hex) {
  let h = (hex || '').replace('#', '')
  if (h.length === 3) h = h.split('').map(c => c + c).join('')
  const n = parseInt(h, 16)
  if (Number.isNaN(n)) return { r: 245, g: 138, b: 71 }   // fallback to default accent
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  let h = 0, s = 0
  const l = (max + min) / 2
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break
      case g: h = (b - r) / d + 2; break
      case b: h = (r - g) / d + 4; break
    }
    h *= 60
  }
  return { h, s: s * 100, l: l * 100 }
}

function hslToHex(h, s, l) {
  s /= 100; l /= 100
  const k = n => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = n => {
    const v = l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
    return Math.round(v * 255).toString(16).padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

/* Derive a harmonious accent in the paper's hue family — deeper +
   more saturated for light papers, lifted + slightly desaturated for
   dark ones. Returns the default sunrise-orange accent for near-white
   or near-grey papers where the derived hue would be arbitrary noise. */
export function deriveVoiceAccent(paperHex) {
  const { r, g, b } = hexToRgb(paperHex)
  const { h, s, l } = rgbToHsl(r, g, b)
  // Papers with no real hue (white, light grey, black, dark grey) get
  // the default warm accent — deriving from noise gives weird colours
  // like olive on cream or muddy pink on black.
  if (s < 25) return VOICE_ACCENT
  let outS, outL
  if (l > 50) {
    // Light paper → drop lightness, boost saturation.
    outS = Math.min(72, s + 28)
    outL = Math.max(28, Math.min(48, l - 36))
  } else {
    // Dark paper → lift lightness for contrast, moderate saturation.
    outS = Math.min(82, s + 12)
    outL = Math.min(78, l + 40)
  }
  outS = Math.max(outS, 35)
  return hslToHex(h, outS, outL)
}

/* Wrap an accent hex in an rgba() string at the given alpha. */
export function fadeVoiceAccent(accentHex, alpha = 0.28) {
  const { r, g, b } = hexToRgb(accentHex)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

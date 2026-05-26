/**
 * inkSoundManager — Tone.js-based audio for the handwritten drawing layer.
 *
 * Two independent chains share one decoded buffer:
 *
 *   pen          → bandpass filter (bright, scratchy, mid-forward) → gain
 *   highlighter  → lowpass filter  (muffled, broad, felt-tip body) → gain
 *
 * Both loop the same source. Only one chain is audible at any moment —
 * the other sits at 0 gain. On startStroke we ramp the chosen chain in,
 * on stopStroke we ramp it out. updateStroke modulates gain/filter/rate
 * smoothly from pressure + velocity. No abrupt sets ever — all changes go
 * through Tone.Signal ramps so there are no zipper noises or clicks.
 *
 * Module-level singleton. Safe to import in many places.
 */

import * as Tone from 'tone'

// Reuse the existing pen-drawing sample. The highlighter chain shapes the
// SAME source into a softer felt-tip character via filter + slower rate.
const SAMPLE_URL = '/sounds/pen/drawing-line.wav'

/* Bumped from -4 dB → 0 dB. Previous value was tuned for headphones;
   on the iPad built-in speaker (competing with ambient sound) the
   scratches were inaudible. 0 dB is unity — Tone is still the only
   thing playing into masterGain so there's no clipping risk. */
const MASTER_DB = 0

const TOOLS = {
  pen: {
    fadeInSec:      0.04,
    fadeOutSec:     0.08,
    /* Loudness range bumped ~6 dB hotter than before:
         minDb -30 → -22 (still soft but not buried)
         maxDb  -8 →  -2 (loud peak, clearly audible on iPad speaker) */
    minDb:          -22,
    maxDb:          -2,
    minRate:        0.95,
    maxRate:        1.18,
    minFilterHz:    1400,
    maxFilterHz:    6500,
    filterType:     'bandpass',
    filterQ:        0.9,
    pressureWeight: 0.7,
    contactDb:      -4,    // initial-contact bump — louder for tactile cue
  },
  highlighter: {
    fadeInSec:      0.06,
    fadeOutSec:     0.12,
    /* Same +6 dB lift on the highlighter, keeping the relative gap
       to pen so the broad-felt-tip character still reads softer. */
    minDb:          -26,
    maxDb:          -8,
    minRate:        0.78,
    maxRate:        0.95,
    minFilterHz:    480,
    maxFilterHz:    1800,
    filterType:     'lowpass',
    filterQ:        0.65,
    pressureWeight: 0.55,
    contactDb:      -12,
  },
}

const state = {
  initStarted: false,
  ready:       false,
  failed:      false,
  muted:       false,
  buffer:      null,
  loudStart:   0,
  loudEnd:     0,
  masterGain:  null,
  chains:      {},   // { pen: {player, filter, gain, active}, highlighter: same }
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)) }
function lerp(a, b, t)    { return a + (b - a) * clamp(t, 0, 1) }

/* Find the loud middle of the WAV so the loop never crosses a silent
   attack or decay tail. 20ms windows, longest contiguous run above
   22 % of peak RMS. Same heuristic as penSoundManager. */
function analyzeLoudRegion(toneBuffer) {
  const dur      = toneBuffer.duration
  const fallback = { startSec: dur * 0.2, endSec: dur * 0.8 }
  try {
    const raw = toneBuffer.get()
    if (!raw) return fallback
    const data    = raw.getChannelData(0)
    const sr      = raw.sampleRate
    const winSize = Math.max(1, Math.floor(sr * 0.02))
    const rms     = []
    for (let i = 0; i + winSize <= data.length; i += winSize) {
      let sum = 0
      for (let j = 0; j < winSize; j++) { const s = data[i + j]; sum += s * s }
      rms.push(Math.sqrt(sum / winSize))
    }
    if (rms.length < 3) return fallback
    const peak = Math.max(...rms)
    if (peak < 1e-5) return fallback
    const threshold = peak * 0.22
    let bestStart = 0, bestLen = 0, curStart = -1, curLen = 0
    for (let i = 0; i < rms.length; i++) {
      if (rms[i] >= threshold) {
        if (curStart < 0) curStart = i
        curLen++
        if (curLen > bestLen) { bestLen = curLen; bestStart = curStart }
      } else { curStart = -1; curLen = 0 }
    }
    if (bestLen < 3) return fallback
    return {
      startSec: ((bestStart + 1) * winSize) / sr,
      endSec:   ((bestStart + bestLen - 1) * winSize) / sr,
    }
  } catch { return fallback }
}

async function unlockContext() {
  if (Tone.getContext().state !== 'running') {
    try { await Tone.start() } catch { /* gesture needed; user click will unlock */ }
  }
}

function installGestureUnlock() {
  if (typeof window === 'undefined') return
  const events = ['pointerdown', 'keydown', 'touchstart', 'mousedown']
  const onGesture = () => {
    try { Tone.start() } catch { /* ignore */ }
    for (const ev of events) document.removeEventListener(ev, onGesture, true)
  }
  for (const ev of events) document.addEventListener(ev, onGesture, true)
}
installGestureUnlock()

async function init() {
  if (state.initStarted) return state.ready
  state.initStarted = true
  try {
    const buffer = new Tone.ToneAudioBuffer()
    await buffer.load(SAMPLE_URL)
    const { startSec, endSec } = analyzeLoudRegion(buffer)
    state.buffer    = buffer
    state.loudStart = startSec
    state.loudEnd   = endSec

    state.masterGain = new Tone.Gain(Tone.dbToGain(MASTER_DB)).toDestination()

    for (const [tool, cfg] of Object.entries(TOOLS)) {
      const player = new Tone.Player({
        url:        buffer,
        loop:       true,
        loopStart:  startSec,
        loopEnd:    endSec,
        autostart:  false,
        fadeIn:     0.02,
        fadeOut:    0.02,
      })
      const filter = new Tone.Filter({
        type:      cfg.filterType,
        frequency: cfg.minFilterHz,
        Q:         cfg.filterQ,
        rolloff:   -12,
      })
      const gain = new Tone.Gain(0)
      player.connect(filter).connect(gain).connect(state.masterGain)
      // `epoch` increments on every startStroke. The post-fade stop timer
      // captures the epoch it was scheduled under and bails if the chain has
      // since been re-armed — this is what prevents a stale stop from killing
      // a fresh stroke when the user double-taps quickly.
      state.chains[tool] = {
        player, filter, gain,
        active: false,
        epoch:  0,
        stopTimer: null,
      }
    }

    state.ready = true
    return true
  } catch (err) {
    state.failed = true
    state.ready  = false
    // eslint-disable-next-line no-console
    console.warn('[inkSoundManager] init failed — drawing audio disabled:', err)
    return false
  }
}

function startStroke(tool) {
  if (!state.ready || state.muted || state.failed) return
  const chain = state.chains[tool]
  const cfg   = TOOLS[tool]
  if (!chain || !cfg) return
  unlockContext()

  // A fresh start invalidates any pending post-fade stop from the previous
  // stroke — otherwise rapid up/down can clip the new stroke into silence.
  chain.epoch++
  if (chain.stopTimer) { clearTimeout(chain.stopTimer); chain.stopTimer = null }

  const now = Tone.now()
  // Pick a random offset inside the loud region so back-to-back strokes
  // don't sound identical at the head.
  if (chain.player.state !== 'started') {
    const len = Math.max(0.01, state.loudEnd - state.loudStart)
    try { chain.player.start(now, state.loudStart + Math.random() * len) }
    catch { /* already-started race — fine */ }
  }

  // Fade gain up to peak. Movement-gating (setStrokeIdle) will ramp it
  // back to 0 when the user pauses, and back up when they resume drawing.
  const peakGain = Tone.dbToGain(cfg.maxDb)
  chain.gain.gain.cancelScheduledValues(now)
  chain.gain.gain.setValueAtTime(chain.gain.gain.value, now)
  chain.gain.gain.linearRampToValueAtTime(peakGain, now + cfg.fadeInSec)

  chain.active = true
}

/**
 * setStrokeIdle(tool, idle) — gate the loop's audibility without
 * stopping the underlying player. Smooth ramps mean rapid toggling (i.e.
 * micro-pauses while writing) doesn't click. Used by the drawing layer's
 * silence timer to fade audio while the pointer isn't moving and bring it
 * back the instant motion resumes.
 */
function setStrokeIdle(tool, idle) {
  if (!state.ready || state.muted || state.failed) return
  const chain = state.chains[tool]
  const cfg   = TOOLS[tool]
  if (!chain || !cfg || !chain.active) return
  const now = Tone.now()
  const target = idle ? 0 : Tone.dbToGain(cfg.maxDb)
  // Slightly slower fade-down than fade-up so brief pauses don't sound
  // choppy; resuming motion should feel immediate, going quiet should
  // feel like a release rather than a cut.
  const ramp = idle ? 0.09 : 0.04
  chain.gain.gain.cancelScheduledValues(now)
  chain.gain.gain.setValueAtTime(chain.gain.gain.value, now)
  chain.gain.gain.linearRampToValueAtTime(target, now + ramp)
}

function updateStroke({ tool, pressure = 0.5, velocity = 0.3 } = {}) {
  if (!state.ready || state.muted || state.failed) return
  const chain = state.chains[tool]
  const cfg   = TOOLS[tool]
  if (!chain || !cfg || !chain.active) return

  const p = clamp(pressure, 0, 1)
  const v = clamp(velocity, 0, 1)

  // *** Movement gates the sound. ***
  // A real pen only scratches when it's actually being dragged — holding it
  // still on the paper makes no sound. We mirror that: velocity is the
  // primary driver, pressure only modulates intensity *while you're moving*.
  // When velocity → 0, energy → 0, gain → 0 (true silence), regardless of
  // how hard the user is pressing.
  const intensity = lerp(0.55, 1.0, p)             // pressure trims 0.55..1.0
  const energy    = clamp(v * intensity, 0, 1)     // 0 when still

  // Linear gain mapping — energy 0 = silent, energy 1 = peak. The previous
  // minDb→maxDb dB lerp had energy=0 land at -30 dB, which is faint but
  // audible and read as "the pen is humming while I hold it."
  const peakGain   = Tone.dbToGain(cfg.maxDb)
  const targetGain = energy * peakGain

  // Filter + playbackRate still respond to motion so the timbre changes
  // with speed even at modest volume.
  const targetRate = lerp(cfg.minRate, cfg.maxRate, v * 0.7 + p * 0.3)
  const targetHz   = lerp(cfg.minFilterHz, cfg.maxFilterHz, energy)

  // Slightly snappier ramp so silence arrives quickly once movement stops.
  const ramp = 0.04
  chain.gain.gain.rampTo(targetGain, ramp)
  chain.filter.frequency.rampTo(targetHz, ramp)
  chain.player.playbackRate = targetRate
}

function stopStroke(tool) {
  if (!state.ready || state.failed) return
  const chain = state.chains[tool]
  const cfg   = TOOLS[tool]
  if (!chain || !cfg) return

  // Always ramp & stop — even if `chain.active` is false. Belt-and-braces:
  // if the layer somehow lost track but the player is still running, this
  // still drives it to silence. The old guard was creating ghost loops when
  // pointer events were interrupted.
  const now = Tone.now()
  chain.active = false

  // Smooth linear fade to true zero (no "lift bump" — that read as the
  // sound continuing for a moment after release).
  chain.gain.gain.cancelScheduledValues(now)
  chain.gain.gain.setValueAtTime(chain.gain.gain.value, now)
  chain.gain.gain.linearRampToValueAtTime(0, now + cfg.fadeOutSec)

  // ACTUALLY stop the player after the fade completes. Previously the loop
  // ran indefinitely at 0 gain — a single misordered event could re-expose
  // it as a phantom loop. Stopping it guarantees silence regardless. The
  // epoch check makes this safe across rapid restart, fade-out is short so
  // the timer is short too.
  const epoch = chain.epoch
  if (chain.stopTimer) clearTimeout(chain.stopTimer)
  chain.stopTimer = setTimeout(() => {
    chain.stopTimer = null
    if (chain.epoch !== epoch) return        // newer stroke started — let it play
    try { chain.player.stop() } catch { /* already stopped */ }
    // Hard zero in case the scheduled ramp landed slightly above 0.
    try {
      const t = Tone.now()
      chain.gain.gain.cancelScheduledValues(t)
      chain.gain.gain.setValueAtTime(0, t)
    } catch { /* gone */ }
  }, Math.ceil((cfg.fadeOutSec + 0.02) * 1000))
}

/**
 * playScratch(tool, intensity) — one short slice of the ink-on-paper sample.
 *
 * Designed to be fired repeatedly as the user drags — call once every ~30
 * CSS pixels of cursor movement. Multiple slices overlap naturally to form
 * a continuous scratch while moving, and silence the moment movement stops
 * (because no further triggers fire). No looping player anywhere.
 *
 *   tool      — 'pen' | 'highlighter'
 *   intensity — 0..1, scales gain (so we can taper the very first contact)
 */
function playScratch(tool, intensity = 1) {
  if (!state.ready || state.muted || state.failed || !state.buffer) return
  const cfg = TOOLS[tool]
  if (!cfg) return
  unlockContext()

  // Pick a random offset inside the loud region so consecutive scratches
  // don't sound identical. Slice is short (~180ms) — long enough to have
  // body, short enough that 5–10 overlapping slices stay clean.
  const SLICE_SEC = 0.18
  const region = Math.max(0.01, state.loudEnd - state.loudStart - SLICE_SEC)
  const offset = state.loudStart + Math.random() * region

  // Each scratch is its own short-lived Tone graph: Player → Filter → Gain.
  // We dispose after playback completes so nothing lingers.
  const player = new Tone.Player({
    url:        state.buffer,
    loop:       false,
    autostart:  false,
    fadeIn:     0.008,
    fadeOut:    0.04,
  })
  const filter = new Tone.Filter({
    type:      cfg.filterType,
    frequency: (cfg.minFilterHz + cfg.maxFilterHz) / 2,
    Q:         cfg.filterQ,
    rolloff:   -12,
  })
  const peak = Tone.dbToGain(cfg.maxDb) * Math.max(0, Math.min(1, intensity))
  const gain = new Tone.Gain(peak)
  player.connect(filter).connect(gain).connect(state.masterGain)

  const now = Tone.now()
  try { player.start(now, offset, SLICE_SEC) } catch { /* race; bail */ }

  setTimeout(() => {
    try { player.stop() }   catch {}
    try { player.dispose() } catch {}
    try { filter.dispose() } catch {}
    try { gain.dispose() }   catch {}
  }, Math.ceil((SLICE_SEC + 0.2) * 1000))
}

/**
 * playStrokeStart(tool) — fire-and-forget one-shot.
 *
 * Plays the full sample once through the tool's filter chain (so pen vs
 * highlighter still sound distinct) at a comfortable level. Called from
 * the drawing layer on `pointerdown`, so every fresh stroke gets one
 * complete play of the ink-on-paper sample. No looping, no per-stroke
 * modulation, no fade — the audio just plays through and disposes itself.
 *
 * If a previous one-shot is still ringing out when a new stroke starts,
 * it's cut so the user always hears the newest stroke (not a stack of
 * overlapping samples while scribbling fast).
 */
function playStrokeStart(tool) {
  if (!state.ready || state.muted || state.failed) return
  unlockContext()
  const cfg = TOOLS[tool]
  if (!cfg) return

  // Cancel any in-flight stroke audio so the one-shot doesn't layer on top.
  panic()

  // Fresh Player → tool-specific Filter → fixed Gain → master.
  // Filter character is inherited from TOOLS[tool] so pen reads as bright
  // and highlighter reads as muffled, same as before.
  const player = new Tone.Player({
    url:        state.buffer,
    loop:       false,
    autostart:  false,
    fadeIn:     0.01,
    fadeOut:    0.04,
  })
  const filter = new Tone.Filter({
    type:      cfg.filterType,
    frequency: (cfg.minFilterHz + cfg.maxFilterHz) / 2,
    Q:         cfg.filterQ,
    rolloff:   -12,
  })
  // Use the tool's max-energy gain — a confident, audible one-shot.
  const gain = new Tone.Gain(Tone.dbToGain(cfg.maxDb))
  player.connect(filter).connect(gain).connect(state.masterGain)

  const now = Tone.now()
  try { player.start(now, state.loudStart) } catch { /* race; bail */ }

  // Dispose well after the buffer should have finished. Generous slack so a
  // slightly-late stop never clips the tail.
  const lifetimeMs = Math.ceil(((state.buffer?.duration ?? 1) + 0.5) * 1000)
  setTimeout(() => {
    try { player.stop() }   catch { /* gone */ }
    try { player.dispose() } catch {}
    try { filter.dispose() } catch {}
    try { gain.dispose() }   catch {}
  }, lifetimeMs)
}

/**
 * panic() — emergency immediate silence. Cancels ramps, hard-zeros every
 * chain, stops every player. Used by the layer when it loses confidence
 * that pointerup will fire (tab blur, visibility change, tool switch).
 */
function panic() {
  if (!state.ready) return
  const t = Tone.now ? Tone.now() : 0
  for (const chain of Object.values(state.chains)) {
    if (!chain) continue
    chain.active = false
    chain.epoch++
    if (chain.stopTimer) { clearTimeout(chain.stopTimer); chain.stopTimer = null }
    try {
      chain.gain.gain.cancelScheduledValues(t)
      chain.gain.gain.setValueAtTime(0, t)
    } catch { /* gone */ }
    try { chain.player.stop() } catch { /* already stopped */ }
  }
}

function setMuted(muted) {
  state.muted = !!muted
  if (!state.muted) return
  // Force-silence every active chain immediately.
  for (const [tool, chain] of Object.entries(state.chains)) {
    if (!chain.active) continue
    const cfg = TOOLS[tool]
    chain.active = false
    const t = Tone.now()
    chain.gain.gain.cancelScheduledValues(t)
    chain.gain.gain.setValueAtTime(chain.gain.gain.value, t)
    chain.gain.gain.linearRampToValueAtTime(0, t + cfg.fadeOutSec)
  }
}

function isReady() { return state.ready }
function isMuted() { return state.muted }

if (typeof window !== 'undefined') {
  setTimeout(() => { init() }, 0)
}

const inkAudio = {
  init,
  // Granular API: the drawing layer fires playScratch every ~30 px of
  // cursor movement. Multiple short slices overlap into a continuous
  // scratch while moving, and there's literally no sound source when
  // movement stops — so "holding still" is silent by construction.
  playScratch,
  // Legacy loop/one-shot APIs kept exported in case anything else still
  // wires to them, but the layer no longer calls them.
  startStroke,
  setStrokeIdle,
  stopStroke,
  updateStroke,
  playStrokeStart,
  panic,
  setMuted,
  isReady,
  isMuted,
}

export default inkAudio

// HMR cleanup — same rationale as penSoundManager. Without this, every
// hot reload leaves the previous module's pen/highlighter Players still
// connected to Tone's audio graph, so each subsequent stroke layers a new
// instance on top of the old ones.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    try {
      for (const [, chain] of Object.entries(state.chains || {})) {
        if (!chain) continue
        try { chain.player?.stop() }    catch {}
        try { chain.player?.dispose() } catch {}
        try { chain.filter?.dispose() } catch {}
        try { chain.gain?.dispose() }   catch {}
      }
      if (state.masterGain) { try { state.masterGain.dispose() } catch {} }
      if (state.buffer && typeof state.buffer.dispose === 'function') {
        try { state.buffer.dispose() } catch {}
      }
    } catch { /* best-effort cleanup */ }
  })
}

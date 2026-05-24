/**
 * penSoundManager — single source of truth for Dearly's pen audio.
 *
 * Loads ONE pen-on-paper WAV (/sounds/pen-drawing.wav) and reuses it for:
 *   • Desktop typing — short randomized slices on each keystroke
 *   • Stylus/canvas drawing — continuous loop modulated by pressure & velocity
 *
 * Built on Tone.js for:
 *   • Sample-accurate scheduling (no setTimeout drift)
 *   • Smooth Tone.Signal ramps (rampTo) → no clicks/pops on gain changes
 *   • One shared AudioContext via Tone.context — plays nice with autoplay rules
 *
 * Public API (all methods are no-ops until init() resolves successfully):
 *   await penAudio.init()                     — load buffer, build graph
 *   penAudio.playTypingTick()                 — fire a short slice (typing)
 *   penAudio.startDrawing()                   — begin continuous loop
 *   penAudio.updateDrawing({ pressure, velocity })
 *                                             — modulate gain/pitch/filter
 *   penAudio.stopDrawing()                    — fade out + stop loop
 *   penAudio.setMuted(bool)                   — global mute
 *   penAudio.isReady()                        — true once buffer decoded
 *
 * This is a module-level singleton. Importing the file in two places gives
 * you the same instance — that's intentional, you want one audio graph per
 * tab, not one per component.
 */

import * as Tone from 'tone'

// ─── Configuration ────────────────────────────────────────────────────────
// These are the dials to tune the feel. Most live values are also clamped
// inside the methods, but adjusting here changes the resting character.

// ─── Sample pool ──────────────────────────────────────────────────────────
// Each entry is a separately-loaded buffer. `role: 'tick'` enters the rotation
// for per-keystroke accents; `role: 'loop'` is reserved for the continuous
// "actively writing" texture. Rotation keeps the ear from pattern-matching
// any single sample as it would with a one-source pipeline.
//
// To swap pen flavors later, replace the WAV URLs here — no code changes.
// Single long sample, played as sequential 0.05s chunks. Each keystroke
// advances a virtual playhead by one chunk — so the first keystroke plays
// the first slice of the WAV, the second keystroke plays the second slice,
// and so on. Wraps to the start of the loud region when it reaches the end.
//
// This gives natural variety without rotation logic, and lets rapid typing
// stitch consecutive chunks into one continuous-sounding scratch (because
// the source itself is continuous).
const SAMPLES = [
  // Typing accent — short pencil-on-paper texture, sliced per-keystroke.
  // Swapped from pen-writing.wav → pencil-writing.wav: pencil reads as a
  // lighter, dryer scratch that sells "writing a letter" better than the
  // wetter ink sound, and avoids the heavier pen tone bleeding into the
  // drawing-loop channel (which uses drawing-line.wav).
  { name: 'pencil-writing', url: '/sounds/pen/pencil-writing.wav', role: 'tick' },
  { name: 'drawing-line',   url: '/sounds/pen/drawing-line.wav',   role: 'loop' },
]

const LEGACY_LOOP_KEY = 'drawing-line'

const CONFIG = {
  // Master output trim — keeps everything subtle relative to system volume.
  // The two channels each have their own ceiling beneath this.
  masterDb:           -3,

  typing: {
    // Per-keystroke slice playback. Every keystroke spawns a short transient
    // Player that reads a small slice of the source WAV, with an attack +
    // release envelope to keep the edges click-free. The virtual playhead
    // advances chunk-by-chunk so consecutive keystrokes read consecutive
    // pieces of the source — natural variety without any rotation logic.
    //
    // Why per-keystroke (not session/continuous): typing UX should fire one
    // discrete pen-tick per character regardless of typing speed. The
    // continuous-loop / session model is reserved for the DRAWING channel
    // (see inkSoundManager), where one stroke = one continuous sound.
    //
    //   chunkSec        — how far to advance the virtual playhead per tick
    //   sliceMinSec     — minimum slice length (with random jitter to max)
    //   sliceMaxSec     — maximum slice length
    //   attackSec       — fade-in at slice head, kills the start click
    //   releaseSec      — fade-out at slice tail, kills the end click
    //   peakDb          — slice gain ceiling (with ±volJitter per slice)
    //   rateJitter      — playbackRate variance, per slice
    //   volJitter       — peak trim variance in dB, per slice
    chunkSec:          0.05,
    sliceMinSec:       0.10,    // bumped from 0.06 → 0.10 to give the
    sliceMaxSec:       0.16,    // longer release tail room to breathe
    attackSec:         0.010,   // long enough to soften the sample edge
    releaseSec:        0.070,   // perceptible exponential fade — main click-killer.
                                // Bumped from 0.025 because a 25 ms linear ramp
                                // still reads as a chop: the last few dB of a
                                // linear fade pass through the audible range
                                // too fast for the ear to register as a fade.
    peakDb:            -2,      // ~+4 dB bump from -6 → roughly 50% louder
    rateJitter:        0.08,    // ±8% playbackRate variation
    volJitter:         2.5,     // ±dB random per-slice trim

    // (legacy session/loop fields — retained so older state references keep
    // compiling; not read by the per-keystroke path.)
    sessionFadeInSec:  0.04,
    sessionFadeOutSec: 0.09,
    idleTimeoutMs:     60,
    sessionAdvanceSec: 1.5,
    fadeInSec:         0.008,
    fadeOutSec:        0.025,
    chainPauseMs:      150,    // typing "chain" closes after this idle window
    // Per-slice band-pass modulation — randomized cutoff each tick keeps
    // repeated keystrokes from feeling like the same sample replayed.
    filterMinHz:       1100,
    filterMaxHz:       4800,
    filterQ:           0.9,

    // ─── Velocity-aware modulation ───
    // Map inter-keystroke interval (ms) → "velocity" 0..1 (fast/light → 1).
    // Below intervalFastMs reads as "fast typing"; above intervalSlowMs reads
    // as "deliberate writing". Between, we lerp.
    intervalFastMs:    80,
    intervalSlowMs:    320,
    // Per-velocity offsets applied ON TOP of per-slice random jitter.
    // Fast typing → quieter, brighter, slightly higher pitch.
    // Slow typing → louder, darker, slightly lower pitch.
    velVolDbFast:      -2,    // dB added when velocity = 1
    velVolDbSlow:      +1.5,  // dB added when velocity = 0
    velRateFast:       1.04,  // playbackRate factor when velocity = 1
    velRateSlow:       0.96,  // playbackRate factor when velocity = 0
    velFilterHzFast:   4800,  // bandpass center when velocity = 1
    velFilterHzSlow:   2400,  // bandpass center when velocity = 0
  },

  // ─── Continuous typing texture ───
  // Quiet sustained scratch that runs while the user is actively typing.
  // Fades in on the first keystroke after idle and fades out N ms after
  // the last keystroke. Sits beneath the accent ticks.
  typingLoop: {
    idleTimeoutMs:     400,    // silence window before the loop fades out
    fadeInSec:         0.08,
    fadeOutSec:        0.18,
    peakDb:            -22,    // very quiet — accents do the heavy lifting
    playbackRate:      0.95,   // sub-baseline pitch so it blends under ticks
    filterHz:          1800,   // muffled lowpass character — paper body
    filterQ:           0.6,
  },

  drawing: {
    fadeInSec:         0.06,   // ramp up on pointerdown
    fadeOutSec:        0.18,   // ramp down on pointerup
    minDb:            -28,     // light touch
    maxDb:            -10,     // hard press / fast stroke
    minPlaybackRate:   0.92,   // slow stroke
    maxPlaybackRate:   1.12,   // fast / heavy stroke
    minFilterHz:       1400,   // warm / soft
    maxFilterHz:       6500,   // bright / sharp
    paramRampSec:      0.05,   // smooth between updates — no zipper noise
    loopStartSec:      0.05,   // skip the very start of the WAV (any silence)
    // loopEndSec is set from the actual buffer duration at init time.
  },
}

// ─── Module-level singleton state ─────────────────────────────────────────
const state = {
  initStarted:     false,
  ready:           false,
  failed:          false,
  muted:           false,

  // Multiple loaded samples — each carries its own buffer + auto-detected
  // loud region. ticks rotate through samples with role:'tick'; the drawing
  // / typing loops use the sample tagged as role:'loop'.
  samples:         [],    // Array<{ name, role, buffer, dur, loudStartSec, loudEndSec }>
  tickPool:        [],    // subset of samples — accent rotation
  loopSample:      null,  // single sample used by the continuous loops

  // Session-based typing playback state.
  //   typingSessionActive  — true while a typing session is alive (after the
  //                          first keystroke, before the idle fade-out fires)
  //   typingSessionPlayer  — the Tone.Player for the current session
  //   typingSessionGain    — envelope gain for fade-in/fade-out
  //   typingIdleTimer      — setTimeout handle that triggers the fade-out
  //   typingSessionDisposeTimer — handle for the post-fadeout dispose
  //   typingNextStartSec   — where the NEXT session will start reading from
  //                          the source (advances each session for variety)
  typingSessionActive:        false,
  typingSessionPlayer:        null,
  typingSessionGain:          null,
  typingIdleTimer:            null,
  typingSessionDisposeTimer:  null,
  typingNextStartSec:         null,

  // Legacy alias kept for any external code that still references state.buffer;
  // points at the loop sample's buffer.
  buffer:          null,
  bufferDur:       0,
  loudStartSec:    0,
  loudEndSec:      0,

  masterGain:      null,   // Tone.Gain — final stage before destination

  // Typing chain
  typingGain:      null,   // Tone.Gain — channel trim for typing slices
  typingLastFireMs: 0,

  // Continuous "you are actively writing" texture — fades in on first
  // keystroke after idle, fades out 400ms after the last keystroke.
  // Lives BENEATH the accent ticks so writing reads as a sustained scratch
  // rather than a sequence of isolated taps.
  typingLoopPlayer:  null,
  typingLoopFilter:  null,
  typingLoopGain:    null,
  typingLoopActive:  false,
  typingLoopIdleTimer: null,

  // Drawing chain
  drawingPlayer:   null,   // Tone.Player — looping pen texture
  drawingGain:     null,   // per-channel trim
  drawingFilter:   null,   // Tone.Filter — brightness control
  drawingActive:   false,
}

// ─── Internal helpers ─────────────────────────────────────────────────────

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v))
}

function lerp(a, b, t) {
  return a + (b - a) * clamp(t, 0, 1)
}

/**
 * Analyze a Tone.ToneAudioBuffer to find its loudest contiguous region.
 *
 * Walks the channel data with non-overlapping ~20ms windows, computes RMS
 * per window, then finds the longest contiguous run of windows whose RMS
 * is above (max RMS × threshold). That's the section that sounds like
 * "active pen scratch" — quiet attack and decay tails get trimmed out
 * automatically, no matter what WAV is loaded.
 *
 * Returns { startSec, endSec } in the buffer's time domain. Falls back to
 * a centered 60% slice if analysis can't find a usable region (e.g. very
 * short buffer or completely flat audio).
 */
function analyzeLoudRegion(toneBuffer) {
  const fallback = (() => {
    const dur = toneBuffer.duration
    return { startSec: dur * 0.2, endSec: dur * 0.8 }
  })()
  try {
    const raw  = toneBuffer.get()              // underlying AudioBuffer
    if (!raw) return fallback
    const data = raw.getChannelData(0)         // analyze L channel; close enough
    const sr   = raw.sampleRate
    const winSize = Math.max(1, Math.floor(sr * 0.02))   // 20ms windows
    const rms     = []
    for (let i = 0; i + winSize <= data.length; i += winSize) {
      let sum = 0
      for (let j = 0; j < winSize; j++) {
        const s = data[i + j]
        sum += s * s
      }
      rms.push(Math.sqrt(sum / winSize))
    }
    if (rms.length < 3) return fallback

    const maxRms = Math.max(...rms)
    if (maxRms < 1e-5) return fallback           // effectively silent buffer
    // 22% of peak RMS is the "audible texture" threshold — strict enough to
    // skip the silent head/tail of the WAV, loose enough to keep the soft
    // sustain around the peak (which is what we want as pen-scratch body).
    // Tuned by ear; raise toward 0.35 for more peak-focused, lower toward
    // 0.15 for a more inclusive region.
    const threshold = maxRms * 0.22

    // Longest contiguous above-threshold run.
    let bestStart = 0, bestLen = 0
    let curStart = -1, curLen = 0
    for (let i = 0; i < rms.length; i++) {
      if (rms[i] >= threshold) {
        if (curStart < 0) curStart = i
        curLen++
        if (curLen > bestLen) { bestLen = curLen; bestStart = curStart }
      } else {
        curStart = -1
        curLen = 0
      }
    }
    if (bestLen < 3) return fallback   // <60ms of loud audio → not enough

    // Pull the edges inward by one window so we don't slice right against
    // a quiet→loud boundary (mid-attack), which can sound abrupt.
    const safe = 1
    const startWin = bestStart + safe
    const endWin   = bestStart + bestLen - safe
    if (endWin <= startWin) return fallback

    return {
      startSec: (startWin * winSize) / sr,
      endSec:   (endWin   * winSize) / sr,
    }
  } catch {
    return fallback
  }
}

// Map 0..1 input → dB output, clamped to channel range.
function mapToDb(input, minDb, maxDb) {
  return lerp(minDb, maxDb, clamp(input, 0, 1))
}

// Tone needs the user-gesture before audio starts. We don't *require* the
// caller to await this — methods quietly resume() on every call so the very
// first interaction that happens to be a real click also unlocks audio.
async function unlockContext() {
  if (Tone.getContext().state !== 'running') {
    try { await Tone.start() } catch { /* user-gesture rules; ignore */ }
  }
}

// Global one-time gesture unlock.
//
// AudioContexts must be resumed inside a synchronous user-gesture handler;
// awaiting a fetch first invalidates the gesture and the context stays
// suspended ("I can't hear anything"). To make this bullet-proof, we attach
// short-lived listeners to the document for the FIRST pointerdown / keydown
// / touchstart anywhere in the app and resume Tone there — synchronously,
// no awaits in between. Once running, the listeners detach themselves so
// they never run again.
function installGestureUnlock() {
  if (typeof window === 'undefined') return
  const events = ['pointerdown', 'keydown', 'touchstart', 'mousedown']
  const onGesture = () => {
    // Fire-and-forget; Tone.start() returns a promise but the resume happens
    // synchronously inside the gesture, which is what the browser cares about.
    try { Tone.start() } catch { /* ignore */ }
    for (const ev of events) document.removeEventListener(ev, onGesture, true)
  }
  for (const ev of events) document.addEventListener(ev, onGesture, true)
}
installGestureUnlock()

// Eagerly kick off the WAV fetch + graph build at import time. The audio
// graph is constructable on a suspended context (Tone nodes don't make
// sound until the context resumes), so this safely pre-warms everything.
// By the time the user actually clicks or types, the buffer is decoded and
// the unlock gesture is the only thing left to do.
if (typeof window !== 'undefined') {
  // setTimeout 0 so we yield to the bundler/module-evaluation phase first.
  setTimeout(() => { init() }, 0)
}

// ─── Init: load the WAV and build the audio graph ─────────────────────────

async function init() {
  if (state.initStarted) return state.ready
  state.initStarted = true

  try {
    // 1. Load every sample in the pool in parallel. Each gets its own loud
    //    region computed so accent ticks slice into texture-rich audio
    //    regardless of which sample the rotation picks.
    const loaded = await Promise.all(SAMPLES.map(async (s) => {
      try {
        const buffer = new Tone.ToneAudioBuffer()
        await buffer.load(s.url)
        const loud = analyzeLoudRegion(buffer)
        return { ...s, buffer, dur: buffer.duration, loudStartSec: loud.startSec, loudEndSec: loud.endSec }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn(`[penSoundManager] failed to load ${s.url}:`, e)
        return null
      }
    }))

    state.samples    = loaded.filter(Boolean)
    state.tickPool   = state.samples.filter(s => s.role === 'tick')
    state.loopSample = state.samples.find(s => s.name === LEGACY_LOOP_KEY)
      ?? state.samples.find(s => s.role === 'loop')
      ?? state.samples[0]

    if (!state.loopSample) {
      throw new Error('No audio samples loaded — pen sound disabled')
    }

    // If the tick pool is empty (only a loop sample loaded), fall back to
    // using the loop sample for ticks too so the user still hears something.
    if (state.tickPool.length === 0) state.tickPool = [state.loopSample]

    // Legacy aliases — point at the loop sample so any old caller still works.
    state.buffer       = state.loopSample.buffer
    state.bufferDur    = state.loopSample.dur
    state.loudStartSec = state.loopSample.loudStartSec
    state.loudEndSec   = state.loopSample.loudEndSec

    // Each typing session starts reading from this point in the source WAV
    // and advances by `sessionAdvanceSec` between sessions for variety.
    state.typingNextStartSec = state.tickPool[0].loudStartSec

    // 2. Master gain → destination.
    state.masterGain = new Tone.Gain(Tone.dbToGain(CONFIG.masterDb)).toDestination()

    // 3. Typing channel — a Gain we route per-slice Tone.Players through.
    //    Each slice is a transient Player created on demand (cheap), so we
    //    don't keep one Player tied up; we just keep the channel mixer.
    state.typingGain = new Tone.Gain(1).connect(state.masterGain)

    // 4. Drawing channel — one persistent looping Player → Filter → Gain.
    //    Loop boundaries follow the auto-detected loud region so the loop
    //    is built entirely from the texture-rich middle of the WAV, never
    //    crossing the quiet attack or decay tail.
    const loopStart = state.loudStartSec
    const loopEnd   = state.loudEndSec
    state.drawingPlayer = new Tone.Player({
      url:        state.loopSample.buffer,
      loop:       true,
      loopStart,
      loopEnd,
      autostart:  false,
      fadeIn:     0.02,  // intra-loop crossfade smooths seamline
      fadeOut:    0.02,
    })
    state.drawingFilter = new Tone.Filter({
      type:      'lowpass',
      frequency: CONFIG.drawing.minFilterHz,
      Q:         0.7,
      rolloff:   -12,
    })
    state.drawingGain = new Tone.Gain(0)  // muted until startDrawing()

    state.drawingPlayer
      .connect(state.drawingFilter)
      .connect(state.drawingGain)
      .connect(state.masterGain)

    // 5. Continuous typing-loop channel — independent Player + Filter + Gain.
    //    Plays the same WAV's loud region on loop, but lowpass-filtered and
    //    very quiet. Sits underneath the accent ticks while the user types
    //    so writing reads as one continuous scratch rather than discrete taps.
    state.typingLoopPlayer = new Tone.Player({
      url:         state.loopSample.buffer,
      loop:        true,
      loopStart,
      loopEnd,
      autostart:   false,
      fadeIn:      0.02,
      fadeOut:     0.02,
      playbackRate: CONFIG.typingLoop.playbackRate,
    })
    state.typingLoopFilter = new Tone.Filter({
      type:      'lowpass',
      frequency: CONFIG.typingLoop.filterHz,
      Q:         CONFIG.typingLoop.filterQ,
      rolloff:   -12,
    })
    state.typingLoopGain = new Tone.Gain(0)  // silent until first tick
    state.typingLoopPlayer
      .connect(state.typingLoopFilter)
      .connect(state.typingLoopGain)
      .connect(state.masterGain)

    state.ready = true
    // eslint-disable-next-line no-console
    console.info(
      `[penSoundManager] ready — ${state.samples.length} samples loaded ` +
      `(${state.tickPool.length} for ticks, loop = ${state.loopSample.name} ` +
      `${state.loopSample.loudStartSec.toFixed(2)}–${state.loopSample.loudEndSec.toFixed(2)}s)`
    )
    return true
  } catch (err) {
    // Missing file, decode failure, or autoplay block — fail closed, silent.
    // The app keeps working; calls to play/start/update become no-ops.
    state.failed = true
    state.ready  = false
    // eslint-disable-next-line no-console
    console.warn('[penSoundManager] init failed — audio disabled:', err)
    return false
  }
}

// ─── Typing — short random slice per keystroke ────────────────────────────

// Continuous-loop management. Started on the first tick after idle, idle-fades
// out after CONFIG.typingLoop.idleTimeoutMs of silence. Runs underneath the
// per-keystroke accent ticks so writing reads as one sustained scratch.
function bumpTypingLoop() {
  if (!state.ready || state.muted || state.failed || !state.typingLoopPlayer) return
  const cfg = CONFIG.typingLoop
  const now = Tone.now()
  const peakGain = Tone.dbToGain(cfg.peakDb)

  if (!state.typingLoopActive) {
    state.typingLoopActive = true
    try {
      if (state.typingLoopPlayer.state !== 'started') {
        state.typingLoopPlayer.start(now)
      }
    } catch { /* loop may already be running mid-fadeout — fine */ }
    state.typingLoopGain.gain.cancelScheduledValues(now)
    state.typingLoopGain.gain.setValueAtTime(state.typingLoopGain.gain.value, now)
    state.typingLoopGain.gain.linearRampToValueAtTime(peakGain, now + cfg.fadeInSec)
  }

  // Reset / arm the idle fade-out.
  if (state.typingLoopIdleTimer) clearTimeout(state.typingLoopIdleTimer)
  state.typingLoopIdleTimer = setTimeout(() => {
    if (!state.typingLoopActive) return
    state.typingLoopActive = false
    const t = Tone.now()
    state.typingLoopGain.gain.cancelScheduledValues(t)
    state.typingLoopGain.gain.setValueAtTime(state.typingLoopGain.gain.value, t)
    state.typingLoopGain.gain.linearRampToValueAtTime(0, t + cfg.fadeOutSec)
    setTimeout(() => {
      try { if (!state.typingLoopActive) state.typingLoopPlayer.stop() }
      catch { /* already stopped */ }
    }, (cfg.fadeOutSec + 0.05) * 1000)
  }, cfg.idleTimeoutMs)
}

// ── Personality table for typing slices ──────────────────────────────────
// Each keystroke randomly picks a "personality" that overrides the basic
// slice shape: direction, envelope, volume, source-position strategy.
// Together they make typing feel organic instead of metronomic — the user
// hears the same pencil sample but never quite the same way twice.
//
//   weight        — relative pick probability (normalized across the table)
//   reverse       — play the slice back-to-front (Tone.Player.reverse = true)
//   volDb         — extra dB added on top of the per-slice random vol jitter
//   attackMult    — multiplier on baseline attack time (1 = normal)
//   releaseMult   — multiplier on baseline release time (1 = normal;
//                   >1 = lingering tail, "slow at the end")
//   jumpStart     — true = pick a fresh random offset in the loud region
//                   instead of using the sequential virtual playhead, so the
//                   ear can't pattern-match the sample marching forward
//   sliceMult     — multiplier on baseline slice duration
//
// Tuned so "normal" still dominates (~45%) — the variants are seasoning,
// not the main course. Reverse + slow-tail are the two most distinctive.
const TYPING_PERSONALITIES = [
  // The default — sequential playhead, baseline envelope, baseline volume.
  { name: 'normal',  weight: 45, reverse: false, volDb:  0,    attackMult: 1.0, releaseMult: 1.0, jumpStart: false, sliceMult: 1.0 },

  // Reverse — same WAV played back-to-front. Pencil grain reads "different
  // direction" instantly without breaking the texture continuity.
  { name: 'reverse', weight: 15, reverse: true,  volDb: -0.5,  attackMult: 1.0, releaseMult: 1.1, jumpStart: true,  sliceMult: 1.0 },

  // Swell — quiet start that builds. Long attack, slightly extended release
  // so the contour reads as one smooth shape, not "attack then drop".
  { name: 'swell',   weight: 8,  reverse: false, volDb:  0.5,  attackMult: 3.0, releaseMult: 1.2, jumpStart: false, sliceMult: 1.2 },

  // Slow tail — punchy attack, very long release. The "high in middle, slow
  // at the end" character the user called out. sliceMult is generous so the
  // exponential tail has room to actually decay instead of getting clipped.
  { name: 'tail',    weight: 12, reverse: false, volDb: +1.5,  attackMult: 0.5, releaseMult: 2.2, jumpStart: false, sliceMult: 1.6 },

  // Whisper — distinctly quieter than baseline. Adds dynamic range so the
  // accented ticks pop more by comparison. Soft envelope on both ends.
  { name: 'whisper', weight: 10, reverse: false, volDb: -7.0,  attackMult: 1.5, releaseMult: 1.4, jumpStart: true,  sliceMult: 1.0 },

  // Accent — distinctly louder + snappier. Jumps to a random fresh offset
  // so it lands as a surprise tick. Still gets a meaningful release so even
  // the snappy variant fades cleanly (no hard chop).
  { name: 'accent',  weight: 10, reverse: false, volDb: +3.5,  attackMult: 0.4, releaseMult: 0.9, jumpStart: true,  sliceMult: 0.95 },
]

// Cumulative-weight table built once for fast O(N) weighted-random picks.
const TYPING_TOTAL_WEIGHT = TYPING_PERSONALITIES.reduce((s, p) => s + p.weight, 0)

function pickPersonality() {
  let r = Math.random() * TYPING_TOTAL_WEIGHT
  for (const p of TYPING_PERSONALITIES) {
    r -= p.weight
    if (r <= 0) return p
  }
  return TYPING_PERSONALITIES[0]   // unreachable; defensive
}

function playTypingTick() {
  if (!state.ready || state.muted || state.failed) return
  unlockContext()

  // Throttle still applies so any caller can't machine-gun the channel and
  // overlap dozens of identical slices on the same audio frame. The hook
  // (useTypingSound) already throttles at ~22ms; this is the safety floor.
  const nowMs = performance.now()
  if (nowMs - state.typingLastFireMs < 18) return
  state.typingLastFireMs = nowMs

  const cfg    = CONFIG.typing
  const sample = state.tickPool[0]
  if (!sample) return

  // ── Per-keystroke slice model ──────────────────────────────────────────
  // Every call fires one self-contained pencil-tick:
  //   1. Pick a personality (normal / reverse / swell / tail / whisper / accent).
  //   2. Pick a slice (length + source position; sequential or random jump).
  //   3. Spawn a transient Player → envelope Gain → typingGain.
  //   4. Attack ramp 0 → peak, hold, release ramp peak → 0 (clip-clean edges,
  //      shape biased by the personality).
  //   5. Schedule dispose after the slice finishes.
  //
  // Sequential playhead (the default "normal" path) advances by `chunkSec`
  // per call so rapid typing stitches into a moving scratch. Personalities
  // with jumpStart break that pattern with a fresh random offset so the
  // ear doesn't pick up on the sample marching forward.

  const pers = pickPersonality()

  // Slice length — baseline jitter × personality multiplier.
  const baseSlice = cfg.sliceMinSec + Math.random() * (cfg.sliceMaxSec - cfg.sliceMinSec)
  const sliceSec  = Math.max(0.03, baseSlice * pers.sliceMult)

  // Source position — sequential playhead, or random jump for variants
  // that want to escape the marching-forward feel.
  if (state.typingNextStartSec == null) state.typingNextStartSec = sample.loudStartSec
  let startSec
  if (pers.jumpStart) {
    const loudLen = Math.max(0.05, sample.loudEndSec - sample.loudStartSec - sliceSec)
    startSec = sample.loudStartSec + Math.random() * loudLen
  } else {
    startSec = state.typingNextStartSec
    state.typingNextStartSec += cfg.chunkSec
    if (state.typingNextStartSec > sample.loudEndSec - sliceSec) {
      state.typingNextStartSec = sample.loudStartSec
    }
  }

  // Per-slice jitter — random rate + random vol — composed with the
  // personality's deterministic volume offset.
  const rateJ    = 1 + (Math.random() * 2 - 1) * cfg.rateJitter
  const volJ     = (Math.random() * 2 - 1) * cfg.volJitter
  const peakGain = Tone.dbToGain(cfg.peakDb + volJ + pers.volDb)

  // Build a transient slice graph.
  const now = Tone.now()
  const env = new Tone.Gain(0).connect(state.typingGain)
  const player = new Tone.Player({
    url:          sample.buffer,
    autostart:    false,
    fadeIn:       0,   // we apply our own envelope on `env`
    fadeOut:      0,
    playbackRate: rateJ,
    reverse:      pers.reverse,
  }).connect(env)

  try {
    // start(when, offset, duration) — Tone clips playback at `duration`.
    // For reversed playback Tone handles the offset-from-end math itself;
    // we keep passing the forward-time offset.
    player.start(now, startSec, sliceSec)
  } catch {
    try { player.dispose() } catch { /* gone */ }
    try { env.dispose()    } catch { /* gone */ }
    return
  }

  // Audible duration is shorter when playbackRate > 1 (faster ⇒ shorter).
  // Envelope timings reference audible time so attack + release always fit.
  // Personality multipliers shape the curve: tail boosts release, swell
  // boosts attack, accent shortens both for a snappy hit.
  const audibleSec = sliceSec / Math.max(0.5, rateJ)
  const baseAttack  = cfg.attackSec  * pers.attackMult
  const baseRelease = cfg.releaseSec * pers.releaseMult

  // Clamp so attack + release fit inside the audible window with at least
  // a 4ms hold — otherwise the envelope crushes itself into a click.
  // Attack capped at 35% of the window so the release always has room.
  const maxAttack  = Math.max(0.001, audibleSec * 0.35)
  const attack     = Math.min(baseAttack, maxAttack)
  const release    = Math.min(baseRelease, Math.max(0.008, audibleSec - attack - 0.004))

  // ── Envelope with exponential release ───────────────────────────────────
  // Linear ramps to 0 sound abrupt because the last ~20 dB of a linear fade
  // passes through the audible range in just a few ms — the ear hears it as
  // a chop. Exponential ramps decay in proportion to current value, which
  // matches how loudness perception works → reads as a smooth fade-out.
  //
  // Tone (Web Audio) can't exponentialRampToValueAtTime exactly 0, so the
  // standard pattern is: ramp toward a small floor (~0.0003 ≈ -70 dB,
  // perceptually silent), then setValueAtTime(0) to clamp.
  //
  // Release also ends 2 ms BEFORE the audio actually stops so the gain
  // reaches the floor before the buffer is cut — no race between "ramp hits
  // zero" and "buffer ends" that could expose a sample-edge click.
  const releaseFloor = 0.0003                            // ≈ -70 dB
  const releaseEnd   = audibleSec - 0.002                // 2 ms before audio cut
  const releaseStart = Math.max(attack + 0.002, releaseEnd - release)

  env.gain.setValueAtTime(0, now)
  env.gain.linearRampToValueAtTime(peakGain, now + attack)
  env.gain.setValueAtTime(peakGain, now + releaseStart)
  env.gain.exponentialRampToValueAtTime(releaseFloor, now + releaseEnd)
  env.gain.setValueAtTime(0, now + audibleSec)

  // Dispose after the slice finishes (small grace so the release tail
  // completes audibly before the nodes go away).
  setTimeout(() => {
    try { player.stop() }   catch { /* gone */ }
    try { player.dispose() } catch { /* gone */ }
    try { env.dispose() }    catch { /* gone */ }
  }, (audibleSec + 0.05) * 1000)
}

// ─── Drawing — continuous loop with live modulation ───────────────────────

function startDrawing() {
  if (!state.ready || state.muted || state.failed || state.drawingActive) return
  unlockContext()

  const cfg = CONFIG.drawing
  const now = Tone.now()

  // Fresh starting point inside the loud region so two strokes in a row
  // don't sound identical at the head. The Player keeps looping regardless.
  if (state.drawingPlayer.state !== 'started') {
    const loopLen = Math.max(0.01, state.loudEndSec - state.loudStartSec)
    const offset  = state.loudStartSec + Math.random() * loopLen
    state.drawingPlayer.start(now, offset)
  }

  // Ramp gain up smoothly from -∞ → resting low level.
  // updateDrawing() will push it further based on pressure/velocity.
  state.drawingGain.gain.cancelScheduledValues(now)
  state.drawingGain.gain.setValueAtTime(state.drawingGain.gain.value, now)
  state.drawingGain.gain.linearRampToValueAtTime(
    Tone.dbToGain(cfg.minDb),
    now + cfg.fadeInSec,
  )

  state.drawingActive = true
}

/**
 * Modulate the live drawing loop.
 *
 * @param {object} p
 * @param {number} [p.pressure] - 0..1 from PointerEvent.pressure (or proxy)
 * @param {number} [p.velocity] - 0..1 from caller-computed stroke speed
 *
 * Gain and brightness are blended from both inputs; pitch follows velocity.
 * Tone.Signal.rampTo gives a sample-accurate exponential ramp → no zipper
 * noise even if the caller fires this on every pointermove.
 */
function updateDrawing({ pressure = 0.5, velocity = 0.3 } = {}) {
  if (!state.ready || !state.drawingActive || state.muted || state.failed) return

  const cfg = CONFIG.drawing
  const p   = clamp(pressure, 0, 1)
  const v   = clamp(velocity, 0, 1)

  // Blended energy: pressure dominates, velocity nudges. Both lighter when
  // the user isn't really pressing/moving.
  const energy = clamp(p * 0.7 + v * 0.5, 0, 1)

  const targetDb   = mapToDb(energy, cfg.minDb, cfg.maxDb)
  const targetRate = lerp(cfg.minPlaybackRate, cfg.maxPlaybackRate, v * 0.7 + p * 0.3)
  const targetHz   = lerp(cfg.minFilterHz, cfg.maxFilterHz, energy)

  const ramp = cfg.paramRampSec

  state.drawingGain.gain.rampTo(Tone.dbToGain(targetDb), ramp)
  state.drawingFilter.frequency.rampTo(targetHz, ramp)
  // playbackRate is a Tone.Signal on Player — same API, smooth ramp.
  state.drawingPlayer.playbackRate = targetRate
}

function stopDrawing() {
  if (!state.ready || !state.drawingActive) return
  const cfg = CONFIG.drawing
  const now = Tone.now()

  state.drawingGain.gain.cancelScheduledValues(now)
  state.drawingGain.gain.setValueAtTime(state.drawingGain.gain.value, now)
  state.drawingGain.gain.linearRampToValueAtTime(0, now + cfg.fadeOutSec)

  // Don't stop the Player — leaving it looping costs basically nothing and
  // means the next startDrawing() doesn't pay a re-buffer cost. The Gain at
  // 0 keeps everything inaudible until next stroke.
  state.drawingActive = false
}

// ─── Misc ─────────────────────────────────────────────────────────────────

function setMuted(muted) {
  state.muted = !!muted
  if (state.muted && state.drawingActive) stopDrawing()
  // Also kill any continuous loops + the current typing session so the user
  // gets immediate silence.
  if (state.muted && state.typingLoopActive && state.typingLoopPlayer) {
    if (state.typingLoopIdleTimer) clearTimeout(state.typingLoopIdleTimer)
    state.typingLoopActive = false
    const t = Tone.now()
    state.typingLoopGain.gain.cancelScheduledValues(t)
    state.typingLoopGain.gain.setValueAtTime(0, t)
    try { state.typingLoopPlayer.stop() } catch { /* already stopped */ }
  }
  if (state.muted && state.typingSessionActive) {
    if (state.typingIdleTimer)            clearTimeout(state.typingIdleTimer)
    if (state.typingSessionDisposeTimer)  clearTimeout(state.typingSessionDisposeTimer)
    state.typingSessionActive = false
    const t = Tone.now()
    const env = state.typingSessionGain
    const player = state.typingSessionPlayer
    if (env)    { try { env.gain.cancelScheduledValues(t); env.gain.setValueAtTime(0, t) } catch { /* gone */ } }
    if (player) { try { player.stop(); player.dispose() } catch { /* gone */ } }
    if (env)    { try { env.dispose() } catch { /* gone */ } }
    state.typingSessionPlayer = null
    state.typingSessionGain   = null
  }
}

function isReady()    { return state.ready }
function isMuted()    { return state.muted }
function chainPauseMs() { return CONFIG.typing.chainPauseMs }

// ─── Public export ────────────────────────────────────────────────────────

const penAudio = {
  init,
  playTypingTick,
  startDrawing,
  updateDrawing,
  stopDrawing,
  setMuted,
  isReady,
  isMuted,
  // Exposed for the typing hook so its pause timeout matches the config.
  chainPauseMs,
}

export default penAudio

// ─── HMR cleanup ──────────────────────────────────────────────────────────
// Vite hot-reloads re-execute this module without unmounting the page, which
// would leave the previous module instance's audio graph alive — multiple
// players overlapping on every typing session ("two sounds simultaneously").
// This dispose hook tears everything down before the new module replaces us.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    try {
      // Kill in-flight typing session
      if (state.typingIdleTimer)            clearTimeout(state.typingIdleTimer)
      if (state.typingSessionDisposeTimer)  clearTimeout(state.typingSessionDisposeTimer)
      if (state.typingSessionPlayer)        { try { state.typingSessionPlayer.stop() } catch {}; try { state.typingSessionPlayer.dispose() } catch {} }
      if (state.typingSessionGain)          { try { state.typingSessionGain.dispose() }  catch {} }

      // Kill continuous loops
      if (state.typingLoopIdleTimer)  clearTimeout(state.typingLoopIdleTimer)
      if (state.typingLoopPlayer)     { try { state.typingLoopPlayer.stop() }  catch {}; try { state.typingLoopPlayer.dispose() }  catch {} }
      if (state.typingLoopFilter)     { try { state.typingLoopFilter.dispose() } catch {} }
      if (state.typingLoopGain)       { try { state.typingLoopGain.dispose() }   catch {} }

      // Kill drawing loop
      if (state.drawingPlayer) { try { state.drawingPlayer.stop() }  catch {}; try { state.drawingPlayer.dispose() }  catch {} }
      if (state.drawingFilter) { try { state.drawingFilter.dispose() } catch {} }
      if (state.drawingGain)   { try { state.drawingGain.dispose() }   catch {} }

      // Tear down typing channel + master gain
      if (state.typingGain) { try { state.typingGain.dispose() } catch {} }
      if (state.masterGain) { try { state.masterGain.dispose() } catch {} }

      // Free WAV buffers held by Tone
      for (const s of state.samples) {
        if (s.buffer && typeof s.buffer.dispose === 'function') {
          try { s.buffer.dispose() } catch {}
        }
      }
    } catch { /* best-effort cleanup */ }
  })
}

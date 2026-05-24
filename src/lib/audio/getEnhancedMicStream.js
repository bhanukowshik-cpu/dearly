/* ─────────────────────────────────────────────────────────────────────────
   getEnhancedMicStream — feature-detected mic capture
   ───────────────────────────────────────────────────
   One small wrapper around `getUserMedia` that:

   1. Asks the browser which audio constraints it actually supports
      (via `MediaDevices.getSupportedConstraints()`).
   2. Builds an audio constraint object containing only the supported
      ones (echoCancellation / noiseSuppression / autoGainControl, plus
      channelCount + sampleRate where available).
   3. Calls `getUserMedia` with that constraint.
   4. Falls back twice on `OverconstrainedError`:
        a) drop sampleRate + channelCount (some browsers reject these
           for specific mics)
        b) bare `{ audio: true }` as the last resort
   5. Returns both the stream and the constraints we actually applied,
      so callers can log/inspect what the browser accepted.

   Used in place of `navigator.mediaDevices.getUserMedia({...})` inside
   `useVoiceRecorder.start()`. No other behaviour changes.
   ───────────────────────────────────────────────────────────────────────── */

const DESIRED = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl:  true,
  channelCount:     1,
  sampleRate:       44100,
}

function buildConstraints({ deviceId = null, includeFormat = true } = {}) {
  const supported = navigator.mediaDevices?.getSupportedConstraints?.() ?? {}
  const audio = {}
  if (supported.echoCancellation) audio.echoCancellation = DESIRED.echoCancellation
  if (supported.noiseSuppression) audio.noiseSuppression = DESIRED.noiseSuppression
  if (supported.autoGainControl)  audio.autoGainControl  = DESIRED.autoGainControl
  if (includeFormat) {
    if (supported.channelCount) audio.channelCount = DESIRED.channelCount
    if (supported.sampleRate)   audio.sampleRate   = DESIRED.sampleRate
  }
  if (deviceId) audio.deviceId = { exact: deviceId }
  return audio
}

export async function getEnhancedMicStream({ deviceId = null } = {}) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('mediaDevices.getUserMedia is unavailable in this browser.')
  }

  // Tier 1 — full set including channelCount + sampleRate.
  let audio = buildConstraints({ deviceId, includeFormat: true })
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio })
    return { stream, constraints: audio, tier: 'full' }
  } catch (e) {
    if (e?.name !== 'OverconstrainedError' && e?.name !== 'TypeError') throw e
  }

  // Tier 2 — drop the format constraints; keep the processing toggles.
  audio = buildConstraints({ deviceId, includeFormat: false })
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio })
    return { stream, constraints: audio, tier: 'reduced' }
  } catch (e) {
    if (e?.name !== 'OverconstrainedError' && e?.name !== 'TypeError') throw e
  }

  // Tier 3 — bare `{ audio: true }`. If even this fails the caller's
  // permission/availability error handler takes over.
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  return { stream, constraints: { audio: true }, tier: 'minimal' }
}

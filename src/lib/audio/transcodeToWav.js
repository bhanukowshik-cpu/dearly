/**
 * transcodeToWav — convert any browser-recordable audio Blob (webm/opus,
 * mp4/aac, ogg, etc.) to a WAV Blob that EVERY browser can play.
 *
 * Background: MediaRecorder on Chrome desktop records to webm/opus by
 * default. iOS Safari's HTMLAudioElement can't decode webm/opus, so a
 * letter recorded on Chrome and shared via the QR landing page on an
 * iPhone has a silent voice pill — the play button does nothing because
 * the audio source never loaded.
 *
 * Strategy:
 *   1. AudioContext.decodeAudioData on the sender (Chrome, which CAN
 *      decode webm) → AudioBuffer of raw PCM samples
 *   2. Resample + downmix to mono 24 kHz via OfflineAudioContext, which
 *      uses the browser's built-in *anti-aliased* resampler. An earlier
 *      version used a hand-rolled linear-interpolation downsample to
 *      16 kHz with no low-pass filter — that produced audible aliasing
 *      artifacts (the recipient heard "noise" over the voice). The
 *      OfflineAudioContext path is the standards-blessed way to resample
 *      cleanly.
 *   3. Encode as 16-bit PCM WAV — universal format every browser plays
 *
 * Why 24 kHz instead of 16 kHz: 16 kHz is telephony-grade but cuts off
 * everything above 8 kHz, which makes sibilants ("s", "sh") sound dull.
 * 24 kHz preserves up to 12 kHz, captures the full speech band including
 * the fricatives that make voices sound natural. The file size hit is
 * ~50 % (1.4 MB / 30s instead of 960 KB) — worth it for clarity.
 */

// 24 kHz mono — preserves the full speech band (up to ~12 kHz) for
// crisp consonants without the bandwidth of music-grade audio.
const TARGET_RATE = 24000

/**
 * @param {Blob} blob — any audio blob the browser can decode
 * @returns {Promise<Blob>} an `audio/wav` blob playable on every browser
 *                          including iOS Safari
 */
export async function transcodeToWav(blob) {
  const arrayBuffer = await blob.arrayBuffer()

  // First decode — full source rate / channel count.
  const Ctx = window.AudioContext || window.webkitAudioContext
  const decodeCtx = new Ctx()
  let sourceBuffer
  try {
    sourceBuffer = await decodeCtx.decodeAudioData(arrayBuffer)
  } finally {
    try { await decodeCtx.close() } catch { /* ignore */ }
  }

  // Resample to mono TARGET_RATE via OfflineAudioContext. The browser's
  // implementation runs a proper low-pass filter so high-frequency
  // content gets cleanly removed instead of folding back as aliasing
  // noise (which is what the old linear-interp implementation did).
  const durationSec = sourceBuffer.duration
  const targetLen   = Math.max(1, Math.ceil(durationSec * TARGET_RATE))
  const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext
  const offline = new Offline(1 /* mono */, targetLen, TARGET_RATE)

  const node = offline.createBufferSource()
  node.buffer = sourceBuffer
  // Mono mixdown happens automatically because the destination has 1
  // channel and Web Audio applies the standard down-mix coefficients.
  node.connect(offline.destination)
  node.start(0)

  const rendered = await offline.startRendering()
  const mono = rendered.getChannelData(0)

  return encodeWav16(mono, TARGET_RATE)
}

/**
 * Encode Float32 PCM samples as a 16-bit PCM WAV blob.
 * Spec: http://soundfile.sapp.org/doc/WaveFormat/
 */
function encodeWav16(samples, sampleRate) {
  const numChannels = 1
  const bitsPerSample = 16
  const bytesPerSample = bitsPerSample / 8
  const byteRate    = sampleRate * numChannels * bytesPerSample
  const blockAlign  = numChannels * bytesPerSample
  const dataSize    = samples.length * bytesPerSample

  // 44-byte WAV header + PCM data
  const buffer = new ArrayBuffer(44 + dataSize)
  const view   = new DataView(buffer)

  let pos = 0
  function writeString(s) { for (let i = 0; i < s.length; i++) view.setUint8(pos++, s.charCodeAt(i)) }
  function writeUint32(n) { view.setUint32(pos, n, true); pos += 4 }
  function writeUint16(n) { view.setUint16(pos, n, true); pos += 2 }

  // RIFF header
  writeString('RIFF')
  writeUint32(36 + dataSize)
  writeString('WAVE')

  // fmt sub-chunk
  writeString('fmt ')
  writeUint32(16)             // sub-chunk size (16 for PCM)
  writeUint16(1)              // PCM format
  writeUint16(numChannels)
  writeUint32(sampleRate)
  writeUint32(byteRate)
  writeUint16(blockAlign)
  writeUint16(bitsPerSample)

  // data sub-chunk
  writeString('data')
  writeUint32(dataSize)

  // Float samples → 16-bit signed PCM with clipping
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(pos, s < 0 ? s * 0x8000 : s * 0x7FFF, true)
    pos += 2
  }

  return new Blob([buffer], { type: 'audio/wav' })
}

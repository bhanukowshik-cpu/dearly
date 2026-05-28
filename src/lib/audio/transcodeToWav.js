/**
 * transcodeToWav — convert any browser-recordable audio Blob (webm/opus,
 * mp4/aac, ogg, etc.) to a WAV Blob that EVERY browser can play.
 *
 * Background: MediaRecorder on Chrome desktop records to webm/opus by
 * default. iOS Safari's HTMLAudioElement and decodeAudioData can't decode
 * webm/opus at all (as of iOS 17). So a letter recorded on Chrome and
 * shared via the QR landing page on an iPhone results in a silent voice
 * pill — the play button does nothing because the audio source never
 * loaded.
 *
 * Strategy:
 *   1. AudioContext.decodeAudioData on the SENDER (running Chrome,
 *      which CAN decode webm) → AudioBuffer of raw PCM samples
 *   2. Downmix multi-channel to mono (voice notes don't need stereo,
 *      saves ~half the file size)
 *   3. Resample to 16 kHz (telephony-grade, still natural for voice,
 *      shrinks WAV ~3x vs 44.1 kHz)
 *   4. Encode as 16-bit PCM WAV — universal format every browser plays
 *
 * Size budget: 30s mono 16 kHz 16-bit WAV ≈ 960 KB. Bigger than the
 * source webm (~200 KB) but plays everywhere and doesn't require any
 * server-side transcoding pipeline.
 */

const TARGET_RATE = 16000  // 16 kHz mono — speech-quality, small file

/**
 * @param {Blob} blob — any audio blob the browser can decode
 * @returns {Promise<Blob>} a `audio/wav` blob playable on every browser
 *                          including iOS Safari
 */
export async function transcodeToWav(blob) {
  const arrayBuffer = await blob.arrayBuffer()

  // AudioContext for decoding. Safari needs the prefixed name on old
  // versions; we don't run this on Safari (the sender is Chrome) but
  // keep the fallback for safety.
  const Ctx = window.AudioContext || window.webkitAudioContext
  const ctx = new Ctx()
  let buffer
  try {
    buffer = await ctx.decodeAudioData(arrayBuffer)
  } finally {
    // Close the context so we don't leak it. decodeAudioData doesn't
    // start playback so closing immediately is safe.
    try { await ctx.close() } catch { /* ignore */ }
  }

  // Downmix to mono by averaging channels.
  const sourceRate = buffer.sampleRate
  const sourceLen  = buffer.length
  const channels   = buffer.numberOfChannels
  const monoSource = new Float32Array(sourceLen)
  for (let ch = 0; ch < channels; ch++) {
    const data = buffer.getChannelData(ch)
    for (let i = 0; i < sourceLen; i++) monoSource[i] += data[i] / channels
  }

  // Resample to TARGET_RATE using linear interpolation. Browsers have an
  // OfflineAudioContext that does this more cleanly but linear is fine
  // for speech and avoids the extra async complexity.
  const ratio   = TARGET_RATE / sourceRate
  const newLen  = Math.round(sourceLen * ratio)
  const resampled = new Float32Array(newLen)
  for (let i = 0; i < newLen; i++) {
    const srcIndex = i / ratio
    const i0 = Math.floor(srcIndex)
    const i1 = Math.min(sourceLen - 1, i0 + 1)
    const frac = srcIndex - i0
    resampled[i] = monoSource[i0] * (1 - frac) + monoSource[i1] * frac
  }

  return encodeWav16(resampled, TARGET_RATE)
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

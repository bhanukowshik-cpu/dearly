/**
 * transcodeToMp3 — convert any browser-recordable audio Blob (webm/opus,
 * mp4/aac, ogg, etc.) to an MP3 Blob that plays on every browser AND is
 * dramatically smaller than the equivalent WAV.
 *
 * Why MP3 instead of WAV:
 *   WAV is uncompressed PCM — clean and universally playable, but ~1.4 MB
 *   per 30 s of mono 24 kHz speech. With Supabase's free-tier 5 GB/month
 *   egress budget that adds up fast (~3500 letter opens before we hit the
 *   cap). MP3 at 64 kbps mono is ~240 KB / 30 s — same playback support
 *   on iOS Safari / Chrome / Firefox / etc., ~6× less bandwidth per open.
 *
 * Pipeline:
 *   1. AudioContext.decodeAudioData on the source bytes → PCM AudioBuffer
 *   2. OfflineAudioContext resamples to mono 24 kHz with the browser's
 *      built-in anti-aliased resampler (the linear-interp hack we tried
 *      first produced audible aliasing noise — gone now)
 *   3. Float32 PCM → Int16 PCM with soft clipping
 *   4. lamejs encodes Int16 → MP3 frames
 *
 * Sample rate / bitrate choices:
 *   - 24 kHz preserves the full speech band up to 12 kHz, so sibilants
 *     and consonants stay crisp. 16 kHz cuts off at 8 kHz and dulls
 *     them noticeably.
 *   - 64 kbps mono is podcaster-minimum "good voice" quality. Bumping
 *     to 96 kbps adds ~50 % file size for marginal speech-only gain.
 */

import lamejs from '@breezystack/lamejs'

const TARGET_RATE = 24000  // 24 kHz mono — clean speech band
const TARGET_KBPS = 64     // ~240 KB / 30 s

/**
 * @param {Blob} blob — any audio blob the browser can decode
 * @returns {Promise<Blob>} an `audio/mpeg` blob playable everywhere
 */
export async function transcodeToMp3(blob) {
  const arrayBuffer = await blob.arrayBuffer()

  // Decode the source bytes to PCM. decodeAudioData accepts any format
  // the running browser knows about (webm/opus on Chrome, mp4/aac on
  // Safari) — the sender's browser is doing this work, not the
  // recipient's.
  const Ctx = window.AudioContext || window.webkitAudioContext
  const decodeCtx = new Ctx()
  let sourceBuffer
  try {
    sourceBuffer = await decodeCtx.decodeAudioData(arrayBuffer)
  } finally {
    try { await decodeCtx.close() } catch { /* ignore */ }
  }

  // Resample to mono TARGET_RATE via OfflineAudioContext. The browser's
  // implementation runs a proper anti-aliasing low-pass before decimation,
  // so high-frequency content gets cleanly removed instead of folding
  // back as audible noise.
  const targetLen = Math.max(1, Math.ceil(sourceBuffer.duration * TARGET_RATE))
  const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext
  const offline = new Offline(1 /* mono */, targetLen, TARGET_RATE)
  const node = offline.createBufferSource()
  node.buffer = sourceBuffer
  node.connect(offline.destination)
  node.start(0)
  const rendered = await offline.startRendering()
  const float32  = rendered.getChannelData(0)

  // Float32 [-1..+1] → Int16 PCM with soft clipping. lamejs expects
  // 16-bit signed integers.
  const samples = new Int16Array(float32.length)
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]))
    samples[i] = s < 0 ? s * 0x8000 : s * 0x7FFF
  }

  // MP3 encode. Frame size is the lamejs standard 1152 samples — one
  // MPEG-1 Layer 3 frame. The encoder returns partial buffers until
  // enough samples accumulate to emit a frame, then flush() emits the
  // tail.
  const encoder = new lamejs.Mp3Encoder(1, TARGET_RATE, TARGET_KBPS)
  const blockSize = 1152
  const chunks = []
  for (let i = 0; i < samples.length; i += blockSize) {
    const block = samples.subarray(i, i + blockSize)
    const mp3buf = encoder.encodeBuffer(block)
    if (mp3buf.length > 0) chunks.push(new Uint8Array(mp3buf))
  }
  const tail = encoder.flush()
  if (tail.length > 0) chunks.push(new Uint8Array(tail))

  return new Blob(chunks, { type: 'audio/mpeg' })
}

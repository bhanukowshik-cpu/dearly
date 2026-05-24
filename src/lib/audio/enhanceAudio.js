/* ─────────────────────────────────────────────────────────────────────────
   enhanceAudio — post-recording denoising via the RNNoise worklet
   ────────────────────────────────────────────────────────────────
   Takes a recorded audio Blob (any browser-decodable format), renders it
   offline through @sapphi-red/web-noise-suppressor's RNNoise worklet,
   and returns a cleaned Blob (WAV, mono, same sample rate as the input).

   Library-driven — RNNoise is the only enhancer in the chain. No custom
   hand-built filters or compressors. If anything in this path fails, the
   caller is responsible for falling back to the original Blob (this
   function just throws).

   Usage:
     try {
       const cleaned = await enhanceAudio(blob)
       useCleanedBlob(cleaned)
     } catch {
       useOriginalBlob(blob)
     }
   ───────────────────────────────────────────────────────────────────────── */

import { loadRnnoise, RnnoiseWorkletNode } from '@sapphi-red/web-noise-suppressor'
import rnnoiseWasmUrl     from '@sapphi-red/web-noise-suppressor/rnnoise.wasm?url'
import rnnoiseWasmSimdUrl from '@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url'
import rnnoiseWorkletUrl  from '@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url'

/* Cache the WASM binary at module scope so we only fetch it once per page
   load. Reset on failure so a later call can retry. */
let rnnoiseWasmPromise = null
function getRnnoiseWasm() {
  if (!rnnoiseWasmPromise) {
    rnnoiseWasmPromise = loadRnnoise({
      url:     rnnoiseWasmUrl,
      simdUrl: rnnoiseWasmSimdUrl,
    }).catch(err => {
      rnnoiseWasmPromise = null
      throw err
    })
  }
  return rnnoiseWasmPromise
}

/* Minimal WAV (PCM16, mono) encoder — pure bit-packing, not DSP. */
function encodeWavMono(audioBuffer) {
  const samples = audioBuffer.getChannelData(0)
  const sampleRate = audioBuffer.sampleRate
  const byteLength = 44 + samples.length * 2
  const buffer = new ArrayBuffer(byteLength)
  const view   = new DataView(buffer)

  function writeStr(offset, s) {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i))
  }

  // RIFF header
  writeStr(0, 'RIFF')
  view.setUint32(4, byteLength - 8, true)
  writeStr(8, 'WAVE')
  // fmt chunk
  writeStr(12, 'fmt ')
  view.setUint32(16, 16, true)         // PCM chunk size
  view.setUint16(20, 1, true)          // PCM format
  view.setUint16(22, 1, true)          // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)  // byte rate
  view.setUint16(32, 2, true)          // block align
  view.setUint16(34, 16, true)         // bits per sample
  // data chunk
  writeStr(36, 'data')
  view.setUint32(40, samples.length * 2, true)

  let offset = 44
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true)
    offset += 2
  }
  return buffer
}

/* Quick "is this blob actually audible?" check used by the recorder to
   decide whether to swap the enhanced blob in or fall back to original.
   Decodes the blob, scans for any sample above the threshold. Throws on
   decode failure so the caller can treat it as "use original". */
export async function isBlobAudible(blob, { peakThreshold = 0.01 } = {}) {
  const ctx = new (window.AudioContext || window.webkitAudioContext)()
  let audible = false
  try {
    const buf = await ctx.decodeAudioData(await blob.arrayBuffer())
    const ch  = buf.getChannelData(0)
    // Sample every 50th sample — plenty fast, plenty accurate for a
    // gate check at peak ≥ 0.01 (-40 dBFS).
    for (let i = 0; i < ch.length; i += 50) {
      if (Math.abs(ch[i]) >= peakThreshold) { audible = true; break }
    }
  } finally {
    try { await ctx.close() } catch { /* ignore */ }
  }
  return audible
}

/* The enhancer. Returns a Blob — the caller decides whether to use it. */
export async function enhanceAudio(blob, { signal } = {}) {
  if (!blob || !blob.size) throw new Error('enhanceAudio: empty blob')
  if (signal?.aborted) throw new DOMException('aborted', 'AbortError')

  // 1. Decode the recorded blob into an AudioBuffer.
  const arrayBuffer = await blob.arrayBuffer()
  if (signal?.aborted) throw new DOMException('aborted', 'AbortError')

  const decodeCtx = new (window.AudioContext || window.webkitAudioContext)()
  let inputBuffer
  try {
    inputBuffer = await decodeCtx.decodeAudioData(arrayBuffer.slice(0))
  } finally {
    try { await decodeCtx.close() } catch { /* ignore */ }
  }
  if (signal?.aborted) throw new DOMException('aborted', 'AbortError')

  // 2. Offline-render through RNNoise. The worklet is trained at 48kHz, so
  //    we render the context at 48kHz regardless of the input rate — that
  //    way RNNoise gets its native rate without internal resampling, and
  //    the rendered length matches the source duration exactly.
  const TARGET_RATE = 48000
  const offlineCtx = new OfflineAudioContext({
    numberOfChannels: 1,
    length:           Math.ceil(inputBuffer.duration * TARGET_RATE),
    sampleRate:       TARGET_RATE,
  })

  await offlineCtx.audioWorklet.addModule(rnnoiseWorkletUrl)
  const wasmBinary = await getRnnoiseWasm()
  if (signal?.aborted) throw new DOMException('aborted', 'AbortError')

  const rnnoise = new RnnoiseWorkletNode(offlineCtx, {
    wasmBinary,
    maxChannels: 1,
  })

  const source = offlineCtx.createBufferSource()
  source.buffer = inputBuffer
  source.connect(rnnoise).connect(offlineCtx.destination)
  source.start()

  const rendered = await offlineCtx.startRendering()
  if (signal?.aborted) throw new DOMException('aborted', 'AbortError')

  // 3. Encode back as WAV. WebM/Opus encoding would need a JS encoder
  //    library; WAV is uncompressed but universally decodable by <audio>
  //    and keeps this layer dependency-light.
  const wav = encodeWavMono(rendered)
  return new Blob([wav], { type: 'audio/wav' })
}

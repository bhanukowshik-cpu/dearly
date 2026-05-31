import { useCallback, useEffect, useRef, useState } from 'react'
import WaveSurfer from 'wavesurfer.js'
import RecordPlugin from 'wavesurfer.js/dist/plugins/record.esm.js'
// vad-web ships CJS only — Vite exposes the named exports under `default`.
// Bring the whole module namespace in so we can fall back to either shape
// (some Vite optimization passes return undefined for the default during
// heavy HMR cycles; guarding here keeps the module loadable rather than
// crashing the entire app at import time).
import * as vadWebNs from '@ricky0123/vad-web'
const MicVAD = vadWebNs?.default?.MicVAD ?? vadWebNs?.MicVAD ?? null
import penAudio from '../audio/penSoundManager'
import inkAudio from '../audio/inkSoundManager'
import * as Tone from 'tone'
import { getEnhancedMicStream } from './audio/getEnhancedMicStream'
import { enhanceAudio, isBlobAudible } from './audio/enhanceAudio'
import { dlog } from './debugLog'

/* ─────────────────────────────────────────────────────────────────────────
   useVoiceRecorder — V2 audio stack
   ──────────────────────────────────
   Built on top of:
     • wavesurfer.js + Record plugin   → MediaRecorder lifecycle + blob
     • @ricky0123/vad-web (MicVAD)    → speech-activity detection
     • Web Audio AnalyserNode         → drives the custom hand-drawn waveform

   The UI components (VoiceRecorderPanel + VoiceNoteRenderer) consume the
   same API as the previous custom implementation — `state`, `duration`,
   `audioUrl`, `blob`, `waveformData`, `analyserRef`, `start/stop/reset/
   consume()` — so nothing visual changes. The new `isSpeaking` flag is
   exposed for future UI use (currently advisory; the waveform already
   visualises volume via the analyser).

   States: 'idle' | 'requesting' | 'recording' | 'recorded' | 'error'
   ───────────────────────────────────────────────────────────────────────── */

const MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
]

function pickMimeType() {
  if (typeof MediaRecorder === 'undefined') return ''
  for (const t of MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported?.(t)) return t
  }
  return ''
}

// Downsample dense RMS samples to a fixed bucket count for waveformData.
function downsample(samples, buckets) {
  if (!samples.length) return new Array(buckets).fill(0)
  const out = new Array(buckets).fill(0)
  const step = samples.length / buckets
  for (let i = 0; i < buckets; i++) {
    const a = Math.floor(i * step)
    const b = Math.max(a + 1, Math.floor((i + 1) * step))
    let max = 0
    for (let j = a; j < b && j < samples.length; j++) {
      if (samples[j] > max) max = samples[j]
    }
    out[i] = max
  }
  return out
}

/* Spec-compliant capture constraints — mono, 44.1kHz, native AEC/NS/AGC.
   These match the spec exactly; level smoothing is handled by AGC again
   (no more custom compressor). Used for the analyser tap; wavesurfer's
   Record plugin uses the same shape when started below. */
function buildAudioConstraints(deviceId) {
  const base = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl:  true,
    channelCount:     1,
    sampleRate:       44100,
  }
  if (deviceId) base.deviceId = { exact: deviceId }
  return base
}

async function openMicStream(deviceId) {
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: buildAudioConstraints(deviceId),
    })
  } catch (e) {
    if (e?.name === 'OverconstrainedError' || e?.name === 'TypeError') {
      return await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl:  true,
          ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
        },
      })
    }
    throw e
  }
}

/* Belt-and-suspenders silencer for every in-app audio source during a
   recording. Mutes the two Tone-based managers AND the Tone master output,
   so no system audio bleeds into the mic. Idempotent. */
function silenceAppAudio(silent) {
  try { penAudio.setMuted?.(silent) } catch { /* ignore */ }
  try { inkAudio.setMuted?.(silent) } catch { /* ignore */ }
  try {
    const dest = Tone.getDestination?.() ?? Tone.Destination
    if (dest && 'mute' in dest) dest.mute = silent
  } catch { /* ignore */ }
}

export function useVoiceRecorder({ maxDurationMs = 5 * 60 * 1000, deviceId = null } = {}) {
  const [state, setState]         = useState('idle')
  const [error, setError]         = useState(null)
  const [duration, setDuration]   = useState(0)
  const [audioUrl, setAudioUrl]   = useState(null)
  const [blob, setBlob]           = useState(null)
  const [waveformData, setWaveformData] = useState(null)
  const [isSpeaking, setIsSpeaking]     = useState(false)
  // True while enhanceAudio is running. Distinct from `state` so the UI
  // can keep showing the waveform while a small "Enhancing audio…" hint
  // overlays — but the convenient state machine value 'processing'
  // matches the spec, so we expose that too.
  const enhanceAbortRef = useRef(null)
  // Snapshot of the unprocessed recording — used to fall back to the
  // original if enhancement fails OR the user clicks "Use original"
  // while it's still running.
  const originalCaptureRef = useRef(null) // { blob, url, duration, waveformData }

  // wavesurfer + Record plugin handle MediaRecorder for us.
  const wavesurferRef     = useRef(null)
  const recordPluginRef   = useRef(null)
  const containerRef      = useRef(null)

  // VAD (speech activity)
  const vadRef            = useRef(null)

  // Our own audio graph for the analyser + RMS sampling that drives the
  // custom waveform component. This is a separate MediaStream from the
  // one wavesurfer's plugin grabs internally — both share the same
  // physical mic; modern browsers handle concurrent capture fine.
  const streamRef         = useRef(null)
  const audioCtxRef       = useRef(null)
  const analyserRef       = useRef(null)
  const samplesRef        = useRef([])
  const sampleTimerRef    = useRef(null)
  const maxDurationTimerRef = useRef(null)
  const stopGuardRef      = useRef(false)
  const startedAtRef      = useRef(0)

  /* Full teardown — safe to call multiple times. Closes/destroys everything
     except the finalised audioUrl (which the caller adopts). */
  const teardown = useCallback(() => {
    if (sampleTimerRef.current)    { clearInterval(sampleTimerRef.current);    sampleTimerRef.current = null }
    if (maxDurationTimerRef.current) { clearInterval(maxDurationTimerRef.current); maxDurationTimerRef.current = null }

    if (vadRef.current) {
      try { vadRef.current.destroy() } catch { /* ignore */ }
      vadRef.current = null
    }

    if (recordPluginRef.current) {
      try { recordPluginRef.current.destroy() } catch { /* ignore */ }
      recordPluginRef.current = null
    }
    if (wavesurferRef.current) {
      try { wavesurferRef.current.destroy() } catch { /* ignore */ }
      wavesurferRef.current = null
    }
    if (containerRef.current && containerRef.current.parentNode) {
      try { containerRef.current.parentNode.removeChild(containerRef.current) } catch { /* ignore */ }
      containerRef.current = null
    }

    if (streamRef.current) {
      for (const t of streamRef.current.getTracks()) {
        try { t.stop() } catch { /* ignore */ }
      }
      streamRef.current = null
    }
    if (audioCtxRef.current) {
      try { audioCtxRef.current.close() } catch { /* ignore */ }
      audioCtxRef.current = null
    }
    analyserRef.current = null

    // Restore in-app audio.
    silenceAppAudio(false)
    setIsSpeaking(false)
  }, [])

  /* Cleanup on unmount. Doesn't revoke a finalised audioUrl — the canvas
     object adopts that URL and is responsible for revoking it on delete. */
  useEffect(() => () => {
    teardown()
  }, [teardown])

  const start = useCallback(async () => {
    if (state === 'recording' || state === 'requesting') return
    setError(null)
    setState('requesting')

    // Silence in-app audio for the entire recording window — no pen ticks
    // or ink whoosh can bleed into the mic. Restored on every exit path.
    silenceAppAudio(true)

    // ── 1. Open our own mic stream for the analyser tap + VAD ─────────
    // NOTE: getUserMedia MUST be the first await in this gesture — inserting
    // any awaited call before it (e.g. permissions.query) can consume the
    // user-activation on Safari and trigger a spurious NotAllowedError.
    let inIframe = false
    try { inIframe = window.self !== window.top } catch { inIframe = true }
    dlog('rec.start',
      'secureContext', window.isSecureContext,
      'inIframe', inIframe,
      'hasMediaDevices', !!navigator.mediaDevices,
      'hasGUM', !!navigator.mediaDevices?.getUserMedia,
      'deviceId', deviceId || 'default')
    let stream
    try {
      // Use the feature-detected mic helper. Returns the stream + the
      // constraints the browser actually accepted, with graceful tier-
      // down fallback for browsers that reject specific properties.
      const opened = await getEnhancedMicStream({ deviceId })
      stream = opened.stream
      dlog('getUserMedia OK', 'tier', opened.tier, 'tracks', stream.getAudioTracks().map(t => t.label || 'mic').join(','))
    } catch (e) {
      silenceAppAudio(false)
      const name = e?.name || ''
      dlog('getUserMedia FAILED', name, e?.message || '')
      // Safe to await here — the gesture is already spent and we're on the
      // error path. Permission state tells us whether this is a hard browser
      // block vs. an iframe allow-attribute / first-prompt situation.
      let permState = ''
      try {
        const ps = await navigator.permissions?.query?.({ name: 'microphone' })
        if (ps) { permState = ps.state; dlog('mic permission state', ps.state) }
      } catch (pe) { dlog('permissions.query unavailable', pe?.name) }

      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (/Macintosh/.test(navigator.userAgent) && (navigator.maxTouchPoints || 0) > 1)

      // An embedded iframe without allow="microphone" yields NotAllowedError
      // no matter what the user does — the fix is to open the page directly,
      // so call that out specifically.
      const msg =
        inIframe
          ? "Recording is blocked because this page is embedded. Open dearlynotes.app directly in your browser, then try again."
        : name === 'NotAllowedError' || name === 'SecurityError'
          ? (permState === 'denied'
              ? (isIOS
                  ? "Microphone access is blocked for this site. In Safari, tap the “aA” icon in the address bar → Website Settings → set Microphone to Allow, then reload and try again."
                  : "Microphone access is blocked for this site. Click the lock/mic icon in your browser's address bar, set Microphone to Allow, then reload and try again.")
              : "We couldn't access your microphone. When the browser asks for permission, choose Allow — then try again.")
        : name === 'NotFoundError'
          ? "No microphone found. Plug one in or check your input device, then try again."
        : name === 'NotReadableError' || name === 'AbortError'
          ? "Your mic is busy in another app or browser tab. Close it (and any other open tabs), then try again."
          : "Your browser couldn't start recording. Try refreshing the page."
      setError(msg)
      setState('error')
      return
    }
    streamRef.current = stream

    // ── 2. AudioContext + AnalyserNode for the custom waveform UI ─────
    let audioCtx
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext
      audioCtx = new Ctx()
    } catch (e) {
      dlog('AudioContext FAILED', e?.name, e?.message)
      teardown()
      setError("Your browser doesn't support audio recording.")
      setState('error')
      return
    }
    audioCtxRef.current = audioCtx
    const source = audioCtx.createMediaStreamSource(stream)
    const analyser = audioCtx.createAnalyser()
    analyser.fftSize = 1024
    analyser.smoothingTimeConstant = 0.6
    source.connect(analyser)
    analyserRef.current = analyser

    // ── 3. RMS sampling at 50ms for the saved waveformData ────────────
    samplesRef.current = []
    const timeBuf = new Uint8Array(analyser.fftSize)
    sampleTimerRef.current = setInterval(() => {
      if (!analyserRef.current) return
      analyserRef.current.getByteTimeDomainData(timeBuf)
      let sum = 0
      for (let i = 0; i < timeBuf.length; i++) {
        const v = (timeBuf[i] - 128) / 128
        sum += v * v
      }
      samplesRef.current.push(Math.sqrt(sum / timeBuf.length))
    }, 50)

    // ── 4. MicVAD on the same stream (no second mic capture) ──────────
    try {
      if (!MicVAD) throw new Error('MicVAD not available')
      const vad = await MicVAD.new({
        getStream: async () => stream,
        onSpeechStart:     () => setIsSpeaking(true),
        onSpeechRealStart: () => setIsSpeaking(true),
        onSpeechEnd:       () => setIsSpeaking(false),
        onVADMisfire:      () => setIsSpeaking(false),
      })
      vadRef.current = vad
      await vad.start()
    } catch (e) {
      // VAD failure is non-fatal — recording still works without it.
      // (Most often this is a CDN reach failure for the ONNX/WASM assets.)
      dlog('VAD unavailable (non-fatal)', e?.name, e?.message)
      console.warn('[VoiceRecorder] VAD unavailable — continuing without speech detection', e)
      vadRef.current = null
    }

    // ── 5. wavesurfer + Record plugin for the actual recording ────────
    // Hidden container — we don't want wavesurfer to render anything;
    // our custom canvas waveform owns the visual. The container is
    // required by the wavesurfer constructor.
    const container = document.createElement('div')
    container.setAttribute('aria-hidden', 'true')
    container.style.cssText =
      'position:absolute;left:-9999px;top:-9999px;width:1px;height:1px;overflow:hidden;'
    document.body.appendChild(container)
    containerRef.current = container

    let ws, record
    try {
      ws = WaveSurfer.create({
        container,
        waveColor:     'transparent',
        progressColor: 'transparent',
        cursorColor:   'transparent',
        height:        1,
        interact:      false,
      })
      wavesurferRef.current = ws
      const recordOptions = {
        renderRecordedAudio: false,
      }
      const mime = pickMimeType()
      dlog('wavesurfer create OK', 'mime', mime || '(browser default)')
      if (mime) recordOptions.mimeType = mime
      record = ws.registerPlugin(RecordPlugin.create(recordOptions))
      recordPluginRef.current = record

      // ── SHARE THE STREAM ──────────────────────────────────────────
      // RecordPlugin.startRecording() checks `this.stream || startMic()`
      // and reuses an existing stream if set. By pre-injecting ours we
      // avoid a second getUserMedia call — concurrent captures from the
      // same mic can return a silent track on macOS/Safari, which is
      // why recordings were coming out empty.
      record.stream = stream
    } catch (e) {
      dlog('wavesurfer/RecordPlugin FAILED', e?.name, e?.message)
      teardown()
      setError("Your browser doesn't support audio recording.")
      setState('error')
      return
    }

    record.on('record-progress', (durationMs) => {
      setDuration(durationMs / 1000)
    })
    record.on('record-end', async (recordedBlob) => {
      const type   = recordedBlob.type || pickMimeType() || 'audio/webm'
      // Re-wrap so the blob type matches what was actually produced — some
      // browsers leave it empty otherwise, which trips up <audio> decode.
      const originalBlob = new Blob([recordedBlob], { type })
      const originalUrl  = URL.createObjectURL(originalBlob)
      const elapsed      = (performance.now() - startedAtRef.current) / 1000
      const wf           = downsample(samplesRef.current, 64)

      // Diagnostic log — surfaces in the browser console so we can see
      // whether the recording itself is silent (small blob, near-zero RMS).
      const peakRms = samplesRef.current.length
        ? Math.max(...samplesRef.current)
        : 0
      console.log('[VoiceRecorder] record-end',
        'bytes:', originalBlob.size,
        'duration:', elapsed.toFixed(2) + 's',
        'peakRms:', peakRms.toFixed(4))

      // Stash the unprocessed capture as the fallback (used by useOriginal()).
      originalCaptureRef.current = {
        blob: originalBlob, url: originalUrl, duration: elapsed, waveformData: wf,
      }

      setBlob(originalBlob)
      setAudioUrl(originalUrl)
      setDuration(elapsed)
      setWaveformData(wf)

      // Release mic + recorder resources NOW. Enhancement runs on a
      // fresh OfflineAudioContext and doesn't need them.
      teardown()

      // If the user didn't actually capture anything (mic muted, near-
      // silent room, very short tap), skip enhancement — there's no
      // point cleaning silence, and RNNoise on near-silent input can
      // produce odd artefacts.
      if (originalBlob.size < 1024 || peakRms < 0.005) {
        setState('recorded')
        return
      }

      // ── Post-stop enhancement (denoise via RNNoise, offline) ─────────
      setState('processing')
      const controller = new AbortController()
      enhanceAbortRef.current = controller

      // Hard 8s timeout — long enough for ~1 min recordings on slow
      // hardware, short enough that the user is never stuck on a spinner.
      const timeoutId = setTimeout(() => {
        console.warn('[VoiceRecorder] enhancement timed out — using original audio')
        controller.abort()
      }, 8000)

      try {
        const enhanced = await enhanceAudio(originalBlob, { signal: controller.signal })
        clearTimeout(timeoutId)
        if (controller.signal.aborted) {
          // User asked for original while we were running — drop the result.
          return
        }

        // Safety net: if the enhanced blob is silent (RNNoise occasionally
        // over-suppresses very-quiet input, or worklet rendering returns
        // empty audio in some browser builds), keep the original recording
        // rather than handing the user a silent file.
        const enhancedOK = await isBlobAudible(enhanced).catch(() => false)
        if (!enhancedOK) {
          console.warn('[VoiceRecorder] enhanced output near-silent — using original audio')
          enhanceAbortRef.current = null
          setState('recorded')
          return
        }

        const enhancedUrl = URL.createObjectURL(enhanced)
        // Swap to the enhanced blob; revoke the original URL we minted
        // earlier since the caller will use the new one.
        setBlob(enhanced)
        setAudioUrl(prev => {
          if (prev && prev !== enhancedUrl) {
            try { URL.revokeObjectURL(prev) } catch { /* ignore */ }
          }
          return enhancedUrl
        })
        originalCaptureRef.current = null
        enhanceAbortRef.current    = null
        setState('recorded')
      } catch (err) {
        clearTimeout(timeoutId)
        if (err?.name === 'AbortError') {
          // Aborted by timeout watchdog or useOriginal(). Original is
          // already in state — just settle into the recorded view.
          enhanceAbortRef.current = null
          setState('recorded')
          return
        }
        console.warn('[VoiceRecorder] enhancement failed — using original audio', err)
        enhanceAbortRef.current = null
        setState('recorded')
      }
    })

    // Max-duration watchdog — Record plugin doesn't enforce a cap, so we
    // poll its duration and call stopRecording when we hit the ceiling.
    stopGuardRef.current = false
    maxDurationTimerRef.current = setInterval(() => {
      const ms = recordPluginRef.current?.getDuration?.() ?? 0
      if (ms >= maxDurationMs && !stopGuardRef.current) {
        stopGuardRef.current = true
        try { recordPluginRef.current?.stopRecording() } catch { /* ignore */ }
      }
    }, 200)

    // ── 6. Start recording ────────────────────────────────────────────
    try {
      // Use the same deviceId so wavesurfer's stream matches our analyser
      // stream (same physical mic). Constraints are minimal here because
      // the spec says trust the browser; AEC/NS/AGC defaults are applied.
      const recOpts = deviceId
        ? { deviceId: { exact: deviceId } }
        : {}
      startedAtRef.current = performance.now()
      setDuration(0)
      await record.startRecording(recOpts)
      dlog('recording STARTED')
      setState('recording')
    } catch (e) {
      dlog('startRecording FAILED', e?.name, e?.message)
      teardown()
      setError("Recording couldn't start. Try refreshing the page.")
      setState('error')
    }
  }, [state, teardown, maxDurationMs, deviceId])

  const stop = useCallback(() => {
    const record = recordPluginRef.current
    if (!record) return
    if (!record.isRecording()) return
    try { record.stopRecording() } catch { /* ignore */ }
  }, [])

  /* Skip enhancement — use the unprocessed recording as the final blob.
     Safe to call any time while state === 'processing'. Idempotent. */
  const useOriginal = useCallback(() => {
    if (!enhanceAbortRef.current && !originalCaptureRef.current) return
    enhanceAbortRef.current?.abort()
    enhanceAbortRef.current = null
    const cap = originalCaptureRef.current
    if (cap) {
      // The original capture's blob/url is already set in state from the
      // record-end handler — we just need to flip to 'recorded'.
      setBlob(cap.blob)
      setAudioUrl(cap.url)
      setDuration(cap.duration)
      setWaveformData(cap.waveformData)
    }
    originalCaptureRef.current = null
    setState('recorded')
  }, [])

  const reset = useCallback(() => {
    teardown()
    // Abort any in-flight enhancement so its result doesn't race the reset.
    enhanceAbortRef.current?.abort()
    enhanceAbortRef.current = null
    // Revoke both the active URL and the stashed original if they differ.
    if (audioUrl) {
      try { URL.revokeObjectURL(audioUrl) } catch { /* ignore */ }
    }
    if (originalCaptureRef.current?.url && originalCaptureRef.current.url !== audioUrl) {
      try { URL.revokeObjectURL(originalCaptureRef.current.url) } catch { /* ignore */ }
    }
    originalCaptureRef.current = null
    samplesRef.current = []
    setBlob(null)
    setAudioUrl(null)
    setWaveformData(null)
    setDuration(0)
    setError(null)
    setState('idle')
  }, [audioUrl, teardown])

  /* consume — hand the recording off to a canvas object. Returns
     { audioUrl, blob, duration, waveformData } and clears local state
     WITHOUT revoking the URL (the caller now owns it). */
  const consume = useCallback(() => {
    if (state !== 'recorded' || !audioUrl) return null
    const payload = { audioUrl, blob, duration, waveformData }
    samplesRef.current = []
    setBlob(null)
    setAudioUrl(null)
    setWaveformData(null)
    setDuration(0)
    setError(null)
    setState('idle')
    return payload
  }, [state, audioUrl, blob, duration, waveformData])

  return {
    state, error, duration, audioUrl, blob, waveformData,
    analyserRef,
    isSpeaking,
    start, stop, reset, consume, useOriginal,
  }
}

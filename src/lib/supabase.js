import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_KEY,
)

/* ──────────────────────────────────────────────────────────────────────────
   REQUIRED SCHEMA EXTENSION for full-letter QR sharing
   ──────────────────────────────────────────────────────────────────────────
   The QR code on a downloaded letter encodes a `?id=<uuid>` URL that loads
   the WHOLE letter on the recipient's phone (not just the audio). For that
   to work, the `notes` table needs to store voice notes and media frames
   alongside the text content.

   Run this once in Supabase → SQL Editor:

     ALTER TABLE notes
       ADD COLUMN IF NOT EXISTS voice_notes  jsonb,
       ADD COLUMN IF NOT EXISTS media_frames jsonb;

   Until those columns exist, save/get gracefully skip them (the letter still
   loads, but voice notes / media won't be persisted across the QR jump).
   ────────────────────────────────────────────────────────────────────────── */

// Postgres error code for "column does not exist" — most reliable signal
// that the schema migration hasn't been run yet (more robust than regex
// matching on the localised error message).
const PG_UNDEFINED_COLUMN = '42703'

export async function saveNote(noteData) {
  // Always log what we're attempting so users can diagnose share-link
  // failures from the console (e.g. "QR opens the homepage" → check
  // here for the underlying saveNote response).
  const basePayload = {
    sender_name:    noteData.senderName    ?? null,
    recipient:      noteData.recipient     ?? null,
    recipient_name: noteData.recipientName ?? null,
    message:        noteData.message       ?? null,
    paper_config:   noteData.paperConfig   ?? null,
    stickers:       noteData.stickers      ?? null,
    show_recipient: noteData.showRecipient ?? null,
    text_size:      noteData.textSize      ?? null,
  }
  const extendedPayload = {
    ...basePayload,
    voice_notes:    noteData.voiceNotes    ?? null,
    media_frames:   noteData.mediaFrames   ?? null,
  }

  const { data, error } = await supabase
    .from('notes')
    .insert(extendedPayload)
    .select('id')
    .single()

  if (!error) {
    console.log('[dearly] saveNote ok → id', data.id)
    return data.id
  }

  // If the voice/media columns don't exist yet, gracefully retry with the
  // original schema. Detect via Postgres error code first (most reliable),
  // then fall back to message-pattern matching for older supabase-js
  // versions that don't surface the code consistently.
  const isMissingColumn =
    error.code === PG_UNDEFINED_COLUMN ||
    /column .* does not exist/i.test(error.message || '') ||
    /could not find the .* column/i.test(error.message || '')

  if (isMissingColumn) {
    console.warn(
      '[dearly] saveNote: voice_notes / media_frames columns missing — falling back. ' +
      'Run this once in Supabase SQL editor to enable full QR letter restore:\n' +
      '  ALTER TABLE notes ADD COLUMN IF NOT EXISTS voice_notes jsonb, ADD COLUMN IF NOT EXISTS media_frames jsonb;'
    )
    const retry = await supabase
      .from('notes')
      .insert(basePayload)
      .select('id')
      .single()
    if (retry.error) {
      console.error('[dearly] saveNote retry also failed:', retry.error)
      return null
    }
    console.log('[dearly] saveNote ok (fallback schema) → id', retry.data.id)
    return retry.data.id
  }

  // Any other failure: surface the FULL error object so the user can see
  // RLS policy / constraint violations etc. instead of just `.message`.
  console.error('[dearly] saveNote failed:', error)
  return null
}

export async function getNoteById(id) {
  // Try the extended schema first; gracefully fall back if the new
  // columns aren't present yet.
  let { data, error } = await supabase
    .from('notes')
    .select('sender_name, recipient, recipient_name, message, paper_config, stickers, voice_notes, media_frames, show_recipient, text_size')
    .eq('id', id)
    .single()

  if (error && /column .* does not exist/i.test(error.message)) {
    ({ data, error } = await supabase
      .from('notes')
      .select('sender_name, recipient, recipient_name, message, paper_config, stickers, show_recipient, text_size')
      .eq('id', id)
      .single())
  }

  if (error) {
    console.error('[dearly] getNoteById failed:', error.message)
    return null
  }
  return {
    senderName:    data.sender_name    ?? '',
    recipient:     data.recipient      ?? '',
    recipientName: data.recipient_name ?? '',
    message:       data.message        ?? '',
    paperConfig:   data.paper_config   ?? {},
    stickers:      data.stickers       ?? [],
    voiceNotes:    data.voice_notes    ?? [],
    mediaFrames:   data.media_frames   ?? [],
    showRecipient: data.show_recipient ?? true,
    textSize:      data.text_size      ?? 'lg',
  }
}

export async function submitFeedback(stars, feedbackText) {
  const payload = { stars, ...(feedbackText ? { feedback_text: feedbackText } : {}) }
  const { error } = await supabase.from('feedback').insert(payload)
  if (error) console.error('[dearly] submitFeedback failed:', error.message)
}

/* ──────────────────────────────────────────────────────────────────────────
   Voice-note storage
   ──────────────────────────────────────────────────────────────────────────
   When the user downloads a letter, each voice-note element gets its audio
   blob uploaded to Supabase Storage. The PDF417 barcode in the exported
   PNG encodes a URL like  `<origin>/v/<id>`  — the playback landing page
   reads `<id>` and fetches the audio from this bucket.

   REQUIRED BUCKET SETUP (one-time, do in Supabase dashboard):
     1. Create a public bucket named `voice-notes`.
     2. Storage → Policies → add SELECT policy "Public can read voice notes":
            bucket_id = 'voice-notes'
     3. Add INSERT policy "Anyone can upload voice notes" with the same
        check (or scope to authenticated users if you tighten auth later).
   ────────────────────────────────────────────────────────────────────────── */

const VOICE_BUCKET = 'voice-notes'

/** Short random id — 10 chars of url-safe alphabet ≈ 60 bits, plenty for our scale. */
function shortId() {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let s = ''
  for (let i = 0; i < 10; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)]
  return s
}

/**
 * Upload a voice-note audio blob to Supabase Storage.
 *
 * Transcodes any browser-native recording (typically webm/opus from
 * Chrome's MediaRecorder) to MP3 before upload. Two reasons:
 *   1. iOS Safari can't decode webm/opus at all — recipients on iPhone
 *      would have a silent voice pill if we shipped the original blob.
 *   2. MP3 at 64 kbps mono is ~6× smaller than the equivalent WAV
 *      (~240 KB / 30 s vs ~1.4 MB), which makes a huge difference on
 *      Supabase's egress quota when letters are scanned repeatedly.
 *
 * If transcoding fails, falls back to uploading the original blob —
 * preserves sender-side playback even if the cross-browser case is
 * degraded.
 *
 * @param {Blob} blob — audio blob (typically webm/opus from MediaRecorder)
 * @returns {Promise<{id: string, url: string} | null>}
 */
export async function uploadVoiceNote(blob) {
  let finalBlob = blob
  let ext = 'webm'

  try {
    const { transcodeToMp3 } = await import('./audio/transcodeToMp3')
    finalBlob = await transcodeToMp3(blob)
    ext = 'mp3'
  } catch (err) {
    console.warn('[dearly] voice transcode to MP3 failed — uploading original blob (may not play on iOS Safari)', err)
    // Recover original extension hint from the source blob's MIME.
    ext = blob.type.includes('mp4')  ? 'mp4'
        : blob.type.includes('mpeg') ? 'mp3'
        : blob.type.includes('ogg')  ? 'ogg'
        : 'webm'
  }

  const id   = shortId()
  const path = `${id}.${ext}`

  const { error } = await supabase.storage
    .from(VOICE_BUCKET)
    .upload(path, finalBlob, {
      contentType: finalBlob.type || 'audio/mpeg',
      cacheControl: '31536000',  // 1 year — the file is immutable
      upsert: false,
    })

  if (error) {
    console.error('[dearly] uploadVoiceNote failed:', error.message)
    return null
  }

  const { data } = supabase.storage.from(VOICE_BUCKET).getPublicUrl(path)
  return { id: path, url: data.publicUrl }
}

/**
 * Resolve a voice-note id (the storage path, e.g. `abc123.webm`) to its
 * playable public URL. Used by the /v/:id landing page.
 */
export function getVoiceNoteUrl(id) {
  const { data } = supabase.storage.from(VOICE_BUCKET).getPublicUrl(id)
  return data.publicUrl
}

/**
 * Upload every blob-backed voice note and media frame in a note to Supabase
 * Storage, returning a copy of `noteData` with the blob: URLs swapped for
 * permanent Storage URLs.
 *
 * WHY this exists: voice/media live in the editor as `blob:` URLs, which only
 * resolve inside the browser session that created them. If we saveNote() with
 * those URLs, the recipient on any OTHER device gets a dead `blob:` URL — a
 * silent broken photo and a voice note that fails with
 * "NotSupportedError — the element has no supported sources." The QR/download
 * pipeline (captureUtils) already does this swap; the share-link + email paths
 * must do it too before persisting, or shared links are broken cross-device.
 *
 * Idempotent: URLs that aren't `blob:` (already uploaded, or re-sharing a
 * loaded letter) pass through untouched. Upload failures leave that item's
 * original URL in place so the rest of the letter still saves.
 */
export async function uploadNoteMedia(noteData) {
  if (!noteData) return noteData

  const voiceNotes  = noteData.voiceNotes  || []
  const mediaFrames = noteData.mediaFrames || []

  const [uploadedVoice, uploadedFrames] = await Promise.all([
    Promise.all(voiceNotes.map(async (v) => {
      if (!v?.audioUrl || !/^blob:/.test(v.audioUrl)) return v
      try {
        const blob   = await fetch(v.audioUrl).then(r => r.blob())
        const upload = await uploadVoiceNote(blob)
        if (!upload) return v
        return { ...v, audioUrl: upload.url, storagePath: upload.id }
      } catch (err) {
        console.warn('[dearly] uploadNoteMedia: voice upload failed for', v.id, err)
        return v
      }
    })),
    Promise.all(mediaFrames.map(async (f) => {
      if (!f?.mediaUrl || !/^blob:/.test(f.mediaUrl)) return f
      try {
        const blob   = await fetch(f.mediaUrl).then(r => r.blob())
        const upload = await uploadMediaFrame(blob)
        if (!upload) return f
        return { ...f, mediaUrl: upload.url, storagePath: upload.id }
      } catch (err) {
        console.warn('[dearly] uploadNoteMedia: media upload failed for', f.id, err)
        return f
      }
    })),
  ])

  return { ...noteData, voiceNotes: uploadedVoice, mediaFrames: uploadedFrames }
}

/**
 * Upload a media-frame image to Supabase Storage so it survives the
 * share-link jump. Without this, the saved letter's mediaFrames
 * contain `blob:` URLs that only exist on the sender's browser —
 * recipient sees a broken-image placeholder.
 *
 * Uses the same `voice-notes` bucket to avoid making the user create
 * + configure a second bucket; storage paths just get a `media-` prefix
 * so the two media types stay browsable separately in the dashboard.
 *
 * @param {Blob} blob — image blob (JPEG/PNG/GIF/WebP from the file picker)
 * @returns {Promise<{id: string, url: string} | null>}
 */
export async function uploadMediaFrame(blob) {
  // Pick a sensible extension from the blob's MIME so the file is
  // browsable in the Supabase dashboard and served with the right
  // Content-Type.
  const ext = blob.type.includes('jpeg') || blob.type.includes('jpg') ? 'jpg'
            : blob.type.includes('png')  ? 'png'
            : blob.type.includes('gif')  ? 'gif'
            : blob.type.includes('webp') ? 'webp'
            : 'bin'
  const id   = shortId()
  const path = `media-${id}.${ext}`

  const { error } = await supabase.storage
    .from(VOICE_BUCKET)
    .upload(path, blob, {
      contentType: blob.type || 'application/octet-stream',
      cacheControl: '31536000',
      upsert: false,
    })

  if (error) {
    console.error('[dearly] uploadMediaFrame failed:', error.message)
    return null
  }

  const { data } = supabase.storage.from(VOICE_BUCKET).getPublicUrl(path)
  return { id: path, url: data.publicUrl }
}

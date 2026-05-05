import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_KEY,
)

export async function saveNote(noteData, shareUrl) {
  const { error } = await supabase.from('notes').insert({
    sender_name:    noteData.senderName    ?? null,
    recipient_name: noteData.recipientName ?? null,
    message:        noteData.message       ?? null,
    paper_config:   noteData.paperConfig   ?? null,
    stickers:       noteData.stickers      ?? null,
    show_recipient: noteData.showRecipient ?? null,
    text_size:      noteData.textSize      ?? null,
    share_url:      shareUrl,
  })
  if (error) console.error('[dearly] saveNote failed:', error.message)
}

export async function submitFeedback(stars) {
  const { error } = await supabase.from('feedback').insert({ stars })
  if (error) console.error('[dearly] submitFeedback failed:', error.message)
}

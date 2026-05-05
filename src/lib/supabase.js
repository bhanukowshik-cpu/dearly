import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_KEY,
)

export async function saveNote(noteData) {
  const { data, error } = await supabase.from('notes').insert({
    sender_name:    noteData.senderName    ?? null,
    recipient:      noteData.recipient     ?? null,
    recipient_name: noteData.recipientName ?? null,
    message:        noteData.message       ?? null,
    paper_config:   noteData.paperConfig   ?? null,
    stickers:       noteData.stickers      ?? null,
    show_recipient: noteData.showRecipient ?? null,
    text_size:      noteData.textSize      ?? null,
  }).select('id').single()
  if (error) {
    console.error('[dearly] saveNote failed:', error.message)
    return null
  }
  return data.id
}

export async function getNoteById(id) {
  const { data, error } = await supabase
    .from('notes')
    .select('sender_name, recipient, recipient_name, message, paper_config, stickers, show_recipient, text_size')
    .eq('id', id)
    .single()
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
    showRecipient: data.show_recipient ?? true,
    textSize:      data.text_size      ?? 'lg',
  }
}

export async function submitFeedback(stars) {
  const { error } = await supabase.from('feedback').insert({ stars })
  if (error) console.error('[dearly] submitFeedback failed:', error.message)
}

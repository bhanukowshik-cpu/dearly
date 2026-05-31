export function encodeNote(noteData) {
  const json   = JSON.stringify(noteData)
  const bytes  = new TextEncoder().encode(json)
  const binary = Array.from(bytes, b => String.fromCharCode(b)).join('')
  return btoa(binary)
}

export function decodeNote(encoded) {
  try {
    const binary = atob(encoded)
    const bytes  = new Uint8Array([...binary].map(c => c.charCodeAt(0)))
    return JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    return null
  }
}

const DEARLY_PUBLIC_URL =
  (import.meta.env.VITE_PUBLIC_URL || 'https://dearlynotes.app').replace(/\/$/, '')

export function generateShareUrl(id, noteData) {
  const base = new URL(DEARLY_PUBLIC_URL)
  base.pathname = '/api/share'
  base.searchParams.set('id', id)
  base.searchParams.set('r', noteData.recipientName || '')
  base.searchParams.set('s', noteData.senderName    || '')
  return base.toString()
}

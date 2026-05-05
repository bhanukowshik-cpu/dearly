export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).end(); return }

  const { text, voiceId = 'EXAVITQu4vr4xnSDxMaL' } = req.body ?? {}
  if (!text?.trim()) { res.status(400).json({ error: 'text required' }); return }

  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey) { res.status(500).json({ error: 'missing ELEVENLABS_API_KEY' }); return }

  const upstream = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps`,
    {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.50, similarity_boost: 0.75, style: 0.20 },
      }),
    }
  )

  if (!upstream.ok) {
    const msg = await upstream.text()
    res.status(502).json({ error: msg })
    return
  }

  const data = await upstream.json()
  res.setHeader('Cache-Control', 'no-store')
  res.json(data)
}

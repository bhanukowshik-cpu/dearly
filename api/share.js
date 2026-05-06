// Escape user-supplied strings before interpolating into HTML attributes/text
function esc(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Sanitise a name param: trim, cap length, fall back to default if empty
function name(raw, fallback) {
  const decoded = decodeURIComponent(raw || '').trim().slice(0, 40)
  return decoded || fallback
}

export default function handler(req, res) {
  const { r = '', s = '', id = '', share = '' } = req.query

  const recipientName = name(r, 'Friend')
  const senderName    = name(s, 'Someone')

  const baseUrl  = `https://${req.headers.host}`
  const ogImage  = `${baseUrl}/api/og?r=${encodeURIComponent(recipientName)}&s=${encodeURIComponent(senderName)}`
  // Support both new short ?id= links and legacy ?share= links
  const noteUrl  = id
    ? `${baseUrl}/?id=${encodeURIComponent(id)}`
    : `${baseUrl}/?share=${encodeURIComponent(share)}`

  const title       = `Hi ${recipientName}, you have a note from ${senderName}`
  const description = `${senderName} wrote something just for you. Open it on Dearly and let their words sink in.`

  // Escaped versions safe for HTML attribute values
  const eTitle       = esc(title)
  const eDescription = esc(description)
  const eOgImage     = esc(ogImage)
  const eNoteUrl     = esc(noteUrl)

  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.status(200).send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${eTitle}</title>

  <!-- Open Graph -->
  <meta property="og:type"         content="website" />
  <meta property="og:url"          content="${eNoteUrl}" />
  <meta property="og:title"        content="${eTitle}" />
  <meta property="og:description"  content="${eDescription}" />
  <meta property="og:image"        content="${eOgImage}" />
  <meta property="og:image:type"   content="image/png" />
  <meta property="og:image:width"  content="1200" />
  <meta property="og:image:height" content="800" />
  <meta property="og:site_name"    content="Dearly" />

  <!-- Twitter / X -->
  <meta name="twitter:card"        content="summary_large_image" />
  <meta name="twitter:title"       content="${eTitle}" />
  <meta name="twitter:description" content="${eDescription}" />
  <meta name="twitter:image"       content="${eOgImage}" />

  <!-- iMessage / Apple -->
  <meta name="apple-mobile-web-app-title" content="Dearly" />

  <!-- Instant redirect for real users -->
  <meta http-equiv="refresh" content="0; url=${eNoteUrl}" />
  <script>window.location.replace(${JSON.stringify(noteUrl)})</script>
</head>
<body style="margin:0;background:#0a1628;display:flex;align-items:center;justify-content:center;min-height:100vh;">
  <p style="font-family:Georgia,serif;font-style:italic;color:rgba(255,255,255,0.5);font-size:18px;">
    Opening your note…
  </p>
</body>
</html>`)
}

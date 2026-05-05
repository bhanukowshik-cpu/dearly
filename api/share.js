export default function handler(req, res) {
  const { r = 'Friend', s = 'Someone', share = '' } = req.query

  const recipientName = decodeURIComponent(r)
  const senderName    = decodeURIComponent(s)

  const baseUrl  = `https://${req.headers.host}`
  const ogImage  = `${baseUrl}/api/og?r=${encodeURIComponent(recipientName)}&s=${encodeURIComponent(senderName)}`
  const noteUrl  = `${baseUrl}/?share=${encodeURIComponent(share)}`
  const title    = `${senderName} wrote you a note`
  const description = `Hi ${recipientName}, open this to read the note ${senderName} wrote just for you — on Dearly.`

  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.status(200).send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>

  <!-- Open Graph -->
  <meta property="og:type"        content="website" />
  <meta property="og:url"         content="${baseUrl}/api/share?r=${encodeURIComponent(recipientName)}&s=${encodeURIComponent(senderName)}&share=${encodeURIComponent(share)}" />
  <meta property="og:title"       content="${title}" />
  <meta property="og:description" content="${description}" />
  <meta property="og:image"       content="${ogImage}" />
  <meta property="og:image:width"  content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:site_name"   content="Dearly" />

  <!-- Twitter / X -->
  <meta name="twitter:card"        content="summary_large_image" />
  <meta name="twitter:title"       content="${title}" />
  <meta name="twitter:description" content="${description}" />
  <meta name="twitter:image"       content="${ogImage}" />

  <!-- iMessage / Apple -->
  <meta name="apple-mobile-web-app-title" content="Dearly" />

  <!-- Instant redirect for real users -->
  <meta http-equiv="refresh" content="0; url=${noteUrl}" />
  <script>window.location.replace(${JSON.stringify(noteUrl)})</script>
</head>
<body style="margin:0;background:#1e0e06;display:flex;align-items:center;justify-content:center;min-height:100vh;">
  <p style="font-family:Georgia,serif;font-style:italic;color:rgba(255,255,255,0.5);font-size:18px;">
    Opening your note…
  </p>
</body>
</html>`)
}

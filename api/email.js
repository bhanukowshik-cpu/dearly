/**
 * /api/email — sends a Dearly note as an email via Resend.
 *
 * POST body:
 *   {
 *     to:            string  required  recipient email address
 *     fromName:      string  required  sender's display name (from the note)
 *     recipientName: string  optional  recipient's name (for greeting + subject)
 *     shareUrl:      string  required  the share URL to embed in the body
 *     personalNote:  string  optional  user-added note (above the link)
 *   }
 *
 * Env vars:
 *   RESEND_API_KEY  required  https://resend.com/api-keys
 *   EMAIL_FROM      optional  "Dearly <noreply@yourdomain.com>"
 *                             defaults to Resend's "onboarding@resend.dev"
 *                             which only works for testing — for production
 *                             you must verify a domain in Resend.
 *
 * Response:
 *   200  { ok: true,  id: <resend_message_id> }
 *   4xx  { ok: false, error: '...' }
 *   5xx  { ok: false, error: '...' }
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function badRequest(res, msg) {
  res.statusCode = 400
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify({ ok: false, error: msg }))
}

function serverError(res, msg) {
  res.statusCode = 500
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify({ ok: false, error: msg }))
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

// Plain-text alt body for clients that don't render HTML.
function buildPlainBody({ fromName, recipientName, shareUrl, personalNote }) {
  const lines = [
    `Hi ${recipientName || 'there'},`,
    '',
    `${fromName} sent you a note on Dearly.`,
  ]
  if (personalNote) {
    lines.push('', personalNote)
  }
  lines.push(
    '',
    `Open it here: ${shareUrl}`,
    '',
    '— Dearly',
  )
  return lines.join('\n')
}

// HTML body — mobile-friendly, single-column, brand-tinted.
function buildHtmlBody({ fromName, recipientName, shareUrl, personalNote }) {
  const greeting = recipientName ? `Hi ${esc(recipientName)},` : 'Hi there,'
  const note     = personalNote
    ? `<p style="margin:0 0 18px;font-size:15px;line-height:1.55;color:#1c1c1e;white-space:pre-wrap;">${esc(personalNote)}</p>`
    : ''
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px 16px;background:#f4ede0;font-family:'Helvetica Neue',Arial,sans-serif;color:#1c1c1e;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;margin:0 auto;background:#fffdf8;border:1px solid #e8dfcd;border-radius:14px;overflow:hidden;">
    <tr><td style="padding:28px 28px 8px;">
      <p style="margin:0 0 6px;font-size:13px;letter-spacing:0.04em;text-transform:uppercase;color:#8a7d63;">dearly</p>
      <h1 style="margin:0 0 18px;font-size:22px;line-height:1.3;font-weight:600;color:#1c1c1e;">${greeting}</h1>
      <p style="margin:0 0 18px;font-size:15px;line-height:1.55;color:#3a3a3a;">${esc(fromName)} sent you a note on Dearly.</p>
      ${note}
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 4px;">
        <tr><td style="background:#1c1c1e;border-radius:10px;">
          <a href="${esc(shareUrl)}" target="_blank" style="display:inline-block;padding:13px 22px;color:#fffdf8;font-size:15px;font-weight:600;text-decoration:none;">Open the note →</a>
        </td></tr>
      </table>
      <p style="margin:18px 0 0;font-size:12px;line-height:1.55;color:#8a7d63;word-break:break-all;">Or paste this link: ${esc(shareUrl)}</p>
    </td></tr>
    <tr><td style="padding:14px 28px 24px;border-top:1px solid #efe6d3;">
      <p style="margin:0;font-size:11px;line-height:1.55;color:#a89a7e;">Dearly — letters people actually keep.</p>
    </td></tr>
  </table>
</body></html>`
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.statusCode = 405
    res.setHeader('Allow', 'POST')
    res.end()
    return
  }

  let body = ''
  for await (const chunk of req) body += chunk
  let payload
  try { payload = JSON.parse(body) }
  catch { return badRequest(res, 'Invalid JSON body') }

  const to            = (payload.to            ?? '').trim()
  const fromName      = (payload.fromName      ?? '').trim().slice(0, 60) || 'Someone'
  const recipientName = (payload.recipientName ?? '').trim().slice(0, 60)
  const shareUrl      = (payload.shareUrl      ?? '').trim()
  const personalNote  = (payload.personalNote  ?? '').trim().slice(0, 500)

  if (!to || !EMAIL_RE.test(to))   return badRequest(res, 'A valid recipient email is required.')
  if (!shareUrl)                   return badRequest(res, 'shareUrl is required.')
  if (!/^https?:\/\//i.test(shareUrl)) return badRequest(res, 'shareUrl must be a http(s) URL.')

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return serverError(res, 'Email service is not configured (RESEND_API_KEY missing).')

  // "Dearly <onboarding@resend.dev>" works out of the box on Resend's sandbox
  // for testing — but only sends to the email you signed up with. For prod,
  // verify a domain at https://resend.com/domains and set EMAIL_FROM.
  const fromAddress = process.env.EMAIL_FROM || 'Dearly <onboarding@resend.dev>'
  const subject     = recipientName
    ? `${fromName} sent you a note, ${recipientName}`
    : `${fromName} sent you a note on Dearly`

  try {
    const upstream = await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        from:     fromAddress,
        to,
        subject,
        html:     buildHtmlBody({ fromName, recipientName, shareUrl, personalNote }),
        text:     buildPlainBody({ fromName, recipientName, shareUrl, personalNote }),
        reply_to: undefined,  // sender's email isn't collected here; leave default
      }),
    })

    if (!upstream.ok) {
      const errText = await upstream.text()
      return serverError(res, `Resend rejected the email: ${errText.slice(0, 300)}`)
    }

    const data = await upstream.json()
    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ ok: true, id: data.id }))
  } catch (e) {
    return serverError(res, e.message || 'Failed to send email.')
  }
}

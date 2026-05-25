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
 *     subject:       string  optional  user-supplied / pre-generated subject;
 *                                      falls back to a contextual template
 *                                      if absent or blank
 *   }
 *
 * Env vars:
 *   RESEND_API_KEY  required  https://resend.com/api-keys
 *   EMAIL_FROM      optional  "Dearly <noreply@yourdomain.com>"
 *                             defaults to Resend's "onboarding@resend.dev"
 *                             which only works for testing — for production
 *                             you must verify a domain in Resend.
 *   PUBLIC_ORIGIN   optional  Where assets like the blurred background live.
 *                             Defaults to https://bhanu-dearly.vercel.app.
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

// First name only — "Marcus Aurelius" → "Marcus". Used in greetings so
// the email reads as warm direct address rather than full-form.
function firstName(name) {
  if (!name) return ''
  return String(name).trim().split(/\s+/)[0] || ''
}

// Plain-text alt body for clients that don't render HTML.
function buildPlainBody({ fromName, recipientName, shareUrl, personalNote }) {
  const lines = [
    `Hi ${firstName(recipientName) || 'there'},`,
    '',
    `${fromName} wrote you a personal note on Dearly.`,
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

/**
 * HTML body — matches the app's aesthetic:
 *   - blurred bg.jpg behind everything (same image as the writing screen)
 *   - cinematic vignette + warm tint overlay
 *   - Caveat headline ("Hi Marcus,") loaded via Google Fonts with a safe
 *     cursive fallback for clients that strip the link tag
 *   - cream postcard card holding the body copy + CTA, with deckled feel
 *     via a soft drop shadow
 *
 * Built with email-client compatibility in mind: outer table layout, inline
 * styles only on every element, no external CSS, no `backdrop-filter`. The
 * bg image is rendered as a real <img> positioned absolutely behind the
 * content table — works in Gmail (web + iOS + Android), Apple Mail, and
 * Yahoo. Outlook falls back to a solid warm-dark colour because Outlook
 * famously doesn't honour absolute positioning; the email still reads.
 */
function buildHtmlBody({ fromName, recipientName, shareUrl, personalNote, assetOrigin }) {
  const recipFirst = firstName(recipientName)
  const greeting   = recipFirst ? `Hi ${esc(recipFirst)},` : 'Hi there,'
  const senderFirst = firstName(fromName) || fromName

  const personalBlock = personalNote
    ? `<p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#3a2f1f;white-space:pre-wrap;font-family:'Caveat','Brush Script MT',cursive;font-size:22px;line-height:1.45;">${esc(personalNote)}</p>`
    : ''

  const bgUrl = `${assetOrigin}/bg.jpg`

  return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<!-- Caveat via Google Fonts — clients that strip <link> fall back to the
     'Brush Script MT' / cursive stack in the inline font-family below. -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Caveat:wght@500;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<title>${esc(senderFirst)} wrote you a note</title>
</head>
<body style="margin:0;padding:0;background:#1a1208;font-family:'Inter','Helvetica Neue',Arial,sans-serif;">

  <!-- Outer wrapper. Background image as a real <img>, positioned via
       absolute under a content table. Outlook ignores the absolute
       positioning and falls back to the solid bg colour. -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
         style="background:#1a1208;min-height:100vh;">
    <tr><td align="center" valign="top" style="padding:0;position:relative;">

      <!--[if !mso]><!-->
      <!-- Blurred background image — only rendered by non-Outlook clients
           via the absolute positioning. The CSS filter blur isn't supported
           in most email clients, so we ship a regular sharp bg and rely on
           the dark tint overlay + low opacity to give it the moody feel. -->
      <div style="position:absolute;inset:0;z-index:0;overflow:hidden;">
        <img src="${esc(bgUrl)}" alt="" width="100%" height="100%"
             style="display:block;width:100%;height:100%;object-fit:cover;opacity:0.55;filter:blur(18px) saturate(115%);transform:scale(1.08);"/>
        <!-- Warm vignette + tint, layered above the bg image -->
        <div style="position:absolute;inset:0;background:radial-gradient(ellipse at 50% 50%,transparent 30%,rgba(4,9,20,0.65) 100%),linear-gradient(180deg,rgba(8,14,28,0.30),rgba(8,14,28,0.55));"></div>
      </div>
      <!--<![endif]-->

      <!-- Content -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
             style="max-width:560px;position:relative;z-index:1;">

        <!-- Headline -->
        <tr><td align="center" style="padding:48px 24px 8px;">
          <h1 style="margin:0;font-family:'Caveat','Brush Script MT',cursive;font-size:46px;font-weight:700;line-height:1.1;color:#ffffff;letter-spacing:0.01em;">${greeting}</h1>
        </td></tr>

        <!-- Subhead -->
        <tr><td align="center" style="padding:6px 24px 28px;">
          <p style="margin:0;font-family:'Caveat','Brush Script MT',cursive;font-size:22px;line-height:1.4;color:rgba(255,255,255,0.78);">${esc(senderFirst)} wrote you a personal note.</p>
        </td></tr>

        <!-- Postcard card -->
        <tr><td align="center" style="padding:0 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                 style="max-width:480px;background:#F4ECD5;border-radius:8px;box-shadow:0 24px 60px rgba(0,0,0,0.32),0 6px 14px rgba(0,0,0,0.18);">
            <tr><td style="padding:36px 32px 28px;">

              ${personalBlock || `<p style="margin:0 0 24px;font-family:'Caveat','Brush Script MT',cursive;font-size:21px;line-height:1.45;color:#3a2f1f;">Open the note to read what ${esc(senderFirst)} sent you.</p>`}

              <!-- CTA button — bulletproof button pattern for max client support -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="left">
                <tr><td style="background:#1a1208;border-radius:999px;">
                  <a href="${esc(shareUrl)}" target="_blank"
                     style="display:inline-block;padding:14px 26px;font-family:'Inter','Helvetica Neue',Arial,sans-serif;font-size:15px;font-weight:600;color:#F4ECD5;text-decoration:none;letter-spacing:0.02em;">
                    Open the note &nbsp;→
                  </a>
                </td></tr>
              </table>

              <p style="margin:24px 0 0;font-family:'Inter','Helvetica Neue',Arial,sans-serif;font-size:12px;line-height:1.6;color:rgba(58,47,31,0.55);word-break:break-all;">
                Or paste this link into your browser:<br/>
                <span style="color:rgba(58,47,31,0.78);">${esc(shareUrl)}</span>
              </p>

            </td></tr>
          </table>
        </td></tr>

        <!-- Footer -->
        <tr><td align="center" style="padding:36px 24px 56px;">
          <p style="margin:0;font-family:'Inter','Helvetica Neue',Arial,sans-serif;font-size:12px;line-height:1.6;color:rgba(255,255,255,0.42);letter-spacing:0.02em;">
            Dearly &middot; letters people actually keep.
          </p>
        </td></tr>

      </table>

    </td></tr>
  </table>

</body></html>`
}

// Template subject for when the client didn't pre-generate one (e.g.
// the suggest-subject endpoint failed and the form was sent anyway).
// Mirrors the fallback logic in /api/suggest-subject.
function templateSubject({ fromName, recipientName }) {
  const who  = (firstName(recipientName) || '').trim()
  const from = (firstName(fromName) || fromName || 'Someone').trim()
  if (who) return `Hey ${who}, ${from} wrote you a personal note`
  return       `${from} wrote you a personal note on Dearly`
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

  // Recipients: accept either a single string or an array of strings.
  // Dedupe + validate each. Hard-cap at 5 to match the client; protects
  // the Resend free tier from a runaway client bug.
  const MAX_RECIPIENTS = 5
  const rawTo = payload.to
  let recipients = []
  if (typeof rawTo === 'string') {
    recipients = rawTo.split(/[\s,;]+/).map(s => s.trim()).filter(Boolean)
  } else if (Array.isArray(rawTo)) {
    recipients = rawTo.map(s => String(s ?? '').trim()).filter(Boolean)
  }
  recipients = Array.from(new Set(recipients.map(r => r.toLowerCase())))
  if (recipients.length === 0)                return badRequest(res, 'At least one recipient email is required.')
  if (recipients.length > MAX_RECIPIENTS)     return badRequest(res, `Too many recipients — keep it to ${MAX_RECIPIENTS} or fewer.`)
  const invalid = recipients.find(r => !EMAIL_RE.test(r))
  if (invalid)                                 return badRequest(res, `"${invalid}" is not a valid email.`)

  const fromName      = (payload.fromName      ?? '').trim().slice(0, 60) || 'Someone'
  const recipientName = (payload.recipientName ?? '').trim().slice(0, 60)
  const shareUrl      = (payload.shareUrl      ?? '').trim()
  const personalNote  = (payload.personalNote  ?? '').trim().slice(0, 500)
  // Subject: pre-generated by /api/suggest-subject and (optionally) edited
  // by the user in the ShareSheet. Falls back to a template if absent or
  // blank — never trust the client to always send one.
  const subject = (payload.subject ?? '').trim().slice(0, 160)
                || templateSubject({ fromName, recipientName })

  if (!shareUrl)                   return badRequest(res, 'shareUrl is required.')
  if (!/^https?:\/\//i.test(shareUrl)) return badRequest(res, 'shareUrl must be a http(s) URL.')

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return serverError(res, 'Email service is not configured (RESEND_API_KEY missing).')

  // "Dearly <onboarding@resend.dev>" works out of the box on Resend's sandbox
  // for testing — but only sends to the email you signed up with. For prod,
  // verify a domain at https://resend.com/domains and set EMAIL_FROM.
  const fromAddress = process.env.EMAIL_FROM || 'Dearly <onboarding@resend.dev>'

  // Asset origin for the blurred bg image. Production deploys default to
  // the canonical URL; can be overridden per-deploy via PUBLIC_ORIGIN.
  const assetOrigin = (process.env.PUBLIC_ORIGIN || 'https://bhanu-dearly.vercel.app').replace(/\/$/, '')

  // Build the bodies once (identical content per recipient — only the
  // `to` field changes). Pre-building avoids re-doing the HTML/text work
  // five times in the loop.
  const html = buildHtmlBody({ fromName, recipientName, shareUrl, personalNote, assetOrigin })
  const text = buildPlainBody({ fromName, recipientName, shareUrl, personalNote })

  // Send one PRIVATE email per recipient (not a single email with all
  // addresses in the TO header). Recipients don't see each other's
  // addresses — important for personal notes. Promise.allSettled so a
  // single bounce doesn't sink the others.
  try {
    const results = await Promise.allSettled(recipients.map(to =>
      fetch('https://api.resend.com/emails', {
        method:  'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({ from: fromAddress, to, subject, html, text }),
      }).then(async r => {
        if (!r.ok) {
          const errText = await r.text()
          throw new Error(`${r.status}: ${errText.slice(0, 160)}`)
        }
        return r.json()
      })
    ))

    const sent     = results.filter(r => r.status === 'fulfilled').map((r, i) => recipients[i])
    const failures = results
      .map((r, i) => ({ r, addr: recipients[i] }))
      .filter(({ r }) => r.status === 'rejected')
      .map(({ r, addr }) => ({ addr, reason: r.reason?.message || 'send failed' }))

    res.statusCode = sent.length > 0 ? 200 : 500
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({
      ok:       sent.length > 0,
      sent:     sent.length,
      failed:   failures.length,
      failures, // [{ addr, reason }, ...] — empty array on full success
      error:    sent.length === 0
        ? `All ${failures.length} sends failed. First reason: ${failures[0]?.reason}`
        : undefined,
    }))
  } catch (e) {
    return serverError(res, e.message || 'Failed to send email.')
  }
}

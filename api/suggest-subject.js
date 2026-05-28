/**
 * /api/suggest-subject — generates a personalised email subject line
 * for a Dearly note via Claude Haiku.
 *
 * The browser calls this when the user opens the "Send via email" form.
 * The generated subject pre-fills the subject input; the user can edit
 * before sending. The actual email send happens through /api/email,
 * which receives the (possibly user-edited) subject verbatim.
 *
 * POST body:
 *   {
 *     fromName:      string  required  sender's display name
 *     recipientName: string  optional  recipient's name (greeting)
 *     message:       string  required  the note body (with markup)
 *   }
 *
 * Env vars:
 *   ANTHROPIC_API_KEY  required  https://console.anthropic.com → API Keys
 *
 * Response:
 *   200  { ok: true,  subject: "<one-line subject>" }
 *   4xx  { ok: false, error: '...' }
 *   5xx  { ok: false, error: '...', fallback: "<safe default subject>" }
 *
 * Fallback behaviour: on any failure (missing key, API down, model
 * refused) we return a 200 with `ok: true` and a template-built
 * subject. The caller treats this as a normal suggestion so the email
 * flow is never blocked.
 */

const MODEL          = 'claude-haiku-4-5'        // fast + cheap
const MAX_TOKENS     = 60
const MAX_MSG_CHARS  = 1800                      // truncate long letters for the prompt

function badRequest(res, msg) {
  res.statusCode = 400
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify({ ok: false, error: msg }))
}

function ok(res, subject) {
  res.statusCode = 200
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify({ ok: true, subject }))
}

// Strip the markup syntax so the LLM reads natural prose, not =={text}==
// soup. Mirrors markupToPlainText in InputPanel.jsx.
function markupToPlainText(markup) {
  if (!markup) return ''
  return markup
    .replace(/==(?:pink::|sage::)?([^=]+)==/g, '$1')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/~~([^~\n]+)~~/g, '$1')
    .replace(/@@(?:sm|lg)::([^@\n]+)@@/g, '$1')
    .trim()
}

// Template fallback — used when the LLM call fails or the API key is
// missing. Gift-framed ("a letter") rather than transactional ("a note"),
// declarative, short — mirrors the templateSubject in /api/email.js.
// Period at the end is deliberate: reads as a single statement, not a
// clickbait open.
function templateSubject({ fromName, recipientName, plain }) {
  const who   = (recipientName || '').trim()
  const from  = (fromName || 'Someone').trim()
  const snippet = plain.split(/[.!?\n]/)[0]?.trim().slice(0, 50) || ''
  if (who && snippet) return `A letter from ${from} — ${snippet}`
  if (who)            return `A letter from ${from}, for ${who}.`
  if (snippet)        return `A letter from ${from} — ${snippet}`
  return                  `A letter from ${from}.`
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.statusCode = 405
    res.setHeader('Allow', 'POST')
    res.end()
    return
  }

  let payload
  try {
    if (req.body && typeof req.body === 'object') {
      payload = req.body
    } else {
      const text = await new Promise((resolve, reject) => {
        let raw = ''
        req.on('data', c => { raw += c })
        req.on('end',  () => resolve(raw))
        req.on('error', reject)
      })
      payload = JSON.parse(text || '{}')
    }
  } catch {
    return badRequest(res, 'Invalid JSON body.')
  }

  const fromName      = (payload.fromName      ?? '').trim().slice(0, 60) || 'Someone'
  const recipientName = (payload.recipientName ?? '').trim().slice(0, 60)
  const message       = (payload.message       ?? '').toString()
  if (!message.trim()) return badRequest(res, 'message is required.')

  const plain = markupToPlainText(message).slice(0, MAX_MSG_CHARS)

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    // No key configured — still return a useful subject from the template
    // so the UX isn't broken. Server logs help operators notice.
    // eslint-disable-next-line no-console
    console.warn('[suggest-subject] ANTHROPIC_API_KEY missing — falling back to template')
    return ok(res, templateSubject({ fromName, recipientName, plain }))
  }

  // Prompt designed to lean on the actual note content rather than
  // generic copy. Constraints in the prompt match common subject-line
  // best practices: include both names, mention the topic, no
  // clickbait, ≤ 80 chars, no emoji unless the note's tone clearly
  // invites it.
  const system = [
    'You write email subject lines for Dearly — an app where people send handwritten letters to each other.',
    'These are not marketing emails or notifications. Each subject announces a letter that one specific person has written to one specific other person.',
    'Frame it like a letter being delivered, not an email being sent.',
    '',
    'Rules:',
    '- ONE line, ≤ 70 characters total. Shorter is better.',
    '- Always use the sender\'s first name. If a recipient name is provided, use their first name too.',
    '- Prefer the word "letter" over "note", "message", "email", or "update".',
    '- Reference the actual topic of the letter when you can — but only if you can do it in 3–5 words. Topic-less is fine.',
    '- Declarative, calm, gift-like. Periods are good. "A letter from Bhanu, for Marcus." beats "Bhanu has a special note for you!".',
    '- No emoji unless the letter itself reads playful/celebratory.',
    '- No "RE:", "FW:", clickbait, salesy verbs ("don\'t miss", "open now"), or exclamation marks.',
    '- Never ask a question in the subject — questions look broken in inboxes.',
    '- Output ONLY the subject text. No quotes, no "Subject:" prefix, no meta commentary.',
    '- Never ask the user for more information — always write the best subject you can with what you have.',
    '',
    'Good examples:',
    '- "A letter from Bhanu, for Marcus."',
    '- "Bhanu wrote you something."',
    '- "A letter about last weekend, from Priya."',
    '- "For Kowshik, from Bhanu."',
    'Bad examples:',
    '- "Hey Marcus, Bhanu wrote you a personal note on Dearly!"',
    '- "📬 You\'ve got mail from Bhanu"',
    '- "Don\'t miss this letter from Bhanu"',
  ].join('\n')

  const user = [
    `Sender's name: ${fromName}`,
    `Recipient's name: ${recipientName || '(not provided)'}`,
    '',
    'Note content:',
    '"""',
    plain,
    '"""',
    '',
    'Write the subject line:',
  ].join('\n')

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: {
        'Content-Type':       'application/json',
        'x-api-key':          apiKey,
        'anthropic-version':  '2023-06-01',
      },
      body: JSON.stringify({
        model:       MODEL,
        max_tokens:  MAX_TOKENS,
        system,
        messages: [{ role: 'user', content: user }],
      }),
    })

    if (!upstream.ok) {
      const errText = await upstream.text()
      // eslint-disable-next-line no-console
      console.warn(`[suggest-subject] Anthropic ${upstream.status}: ${errText.slice(0, 200)}`)
      return ok(res, templateSubject({ fromName, recipientName, plain }))
    }

    const data    = await upstream.json()
    const raw     = data?.content?.[0]?.text ?? ''
    // Clean up: strip surrounding quotes, "Subject:" prefix, newlines,
    // and clip to 120 chars defensively (the prompt asks for 80).
    const subject = raw
      .replace(/^["'`]+|["'`]+$/g, '')
      .replace(/^subject:\s*/i, '')
      .replace(/[\r\n].*$/s, '')
      .trim()
      .slice(0, 120)

    // Sanity gate: if the model ignored the "no questions" rule and asked
    // for more info (e.g. "Could you provide the recipient's name?"),
    // fall back to the template — a question mark in an email subject
    // looks broken in inboxes.
    const looksLikeAQuestion = /\?\s*$/.test(subject) ||
                               /^(could|can|would|please|i need|provide)\b/i.test(subject)

    if (!subject || looksLikeAQuestion) {
      return ok(res, templateSubject({ fromName, recipientName, plain }))
    }
    return ok(res, subject)
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[suggest-subject] threw:', e?.message || e)
    return ok(res, templateSubject({ fromName, recipientName, plain }))
  }
}

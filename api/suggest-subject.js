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
 *   200  {
 *          ok:      true,
 *          subject: "<the chosen subject — equals options[0] when present>",
 *          options: ["<specific anchor>", "<emotional hook>", "<short & intriguing>"]
 *                    // up to 3 archetype-specific candidates; absent on
 *                    // the template-fallback path (key missing / API down).
 *        }
 *   4xx  { ok: false, error: '...' }
 *
 * Fallback behaviour: on any failure (missing key, API down, model
 * refused, all candidates filtered out) we return a 200 with `ok: true`
 * and a template-built subject so the email flow is never blocked.
 * The `options` array is omitted on the fallback path to signal that
 * the model didn't actually produce 3 alternatives.
 */

const MODEL          = 'claude-haiku-4-5'        // fast + cheap
// Bumped from 60 → 240. The new prompt asks for THREE candidate subjects
// (Specific Anchor / Emotional Hook / Short & Intriguing). Each can be
// up to ~80 chars; 240 tokens gives headroom without burning budget.
const MAX_TOKENS     = 240
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
  // User-authored prompt — kept verbatim so changes to copy can be made
  // here without diffing helper code. The trailing "Output Format" block
  // is the only addendum; it constrains the response shape so the API
  // route can parse exactly three candidates back out.
  const system = `You are an expert copywriter specializing in micro-copy, email subject lines, and notifications. Your task is to analyze a personal letter written by a user and generate 3 distinct "Summary Lines" (also known as preview text or email hooks).

The sole purpose of this summary line is to be so specific, relevant, and engaging that the recipient immediately opens the message.

### Core Philosophy
A great summary line avoids generic platitudes (e.g., "Just checking in" or "A quick update"). Instead, it pulls a specific "anchor" from the text—a shared memory, a precise pain point, a unique location, a time, or an unsaid truth that ONLY makes sense to the sender and recipient.

### Instructions
1. Analyze the relationship between the sender and recipient based on the text.
2. Identify the core "anchor" of the letter (e.g., a specific meeting place, a shared problem, a professional milestone, or a family inside joke).
3. Generate 3 options based on the following archetypes:
   - Option 1: The Specific Anchor (Leans into a concrete detail like a time, place, or exact topic).
   - Option 2: The Emotional/Relational Hook (Leans into the feeling or the core "why" of the message).
   - Option 3: Short & Intriguing (A high-curiosity snippet optimized for tight mobile screen spaces).

### Adaptation Framework by Relationship Type:
- Friends/Family: Focus on nostalgic anchors, shared specific memories, dates, locations, or inside jokes (e.g., "That 2 AM conversation on the balcony in Goa...").
- Managers/Colleagues: Focus on relief of a pain point, specific project names, urgency, or direct professional value (e.g., "The final solution for the Q3 pipeline blocker...").
- Clients/Online Connections: Focus on where you met, a specific topic they mentioned, or an immediate value proposition (e.g., "Following up on our conversation at the tech mixer about AI design tools...").

### Output Format
Output ONLY the three subject lines, one per line, in this exact order: Specific Anchor first, then Emotional/Relational Hook, then Short & Intriguing.
- Each line ≤ 80 characters.
- No "Option 1:" / "1." / "-" / bullet prefixes or labels.
- No surrounding quotation marks.
- No commentary, preamble, or explanation before or after.
- No question marks at the end (they look broken in inboxes).
- Never ask the user for more information; always write the best subjects you can with what you have.`

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

    const data = await upstream.json()
    const raw  = data?.content?.[0]?.text ?? ''

    // The prompt asks for THREE candidates, one per line, ordered:
    //   1. Specific Anchor
    //   2. Emotional / Relational Hook
    //   3. Short & Intriguing
    // Parse them out, scrub any prefixes the model might have added
    // despite the format rules (numbered lists, bullets, "Option N:",
    // surrounding quotes, "Subject:" prefix). Per-line caps applied.
    const looksLikeAQuestion = s =>
      /\?\s*$/.test(s) || /^(could|can|would|please|i need|provide)\b/i.test(s)

    const candidates = raw
      .split(/\r?\n/)
      .map(l => l
        .replace(/^\s*(?:option\s*\d+\s*[:.\-]?|[\d]+[.\)]|[-*•])\s*/i, '')
        .replace(/^["'`]+|["'`]+$/g, '')
        .replace(/^subject:\s*/i, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 120))
      .filter(l => l && !looksLikeAQuestion(l))
      .slice(0, 3)

    // Backward compat: clients today expect a single `subject` field.
    // We return the first (Specific Anchor) as the canonical pick and
    // ALSO expose the full list via `options` so a future ShareSheet
    // UI can let the sender choose between archetypes without a
    // second round-trip.
    if (candidates.length === 0) {
      return ok(res, templateSubject({ fromName, recipientName, plain }))
    }
    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({
      ok:      true,
      subject: candidates[0],
      options: candidates,
    }))
    return
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[suggest-subject] threw:', e?.message || e)
    return ok(res, templateSubject({ fromName, recipientName, plain }))
  }
}

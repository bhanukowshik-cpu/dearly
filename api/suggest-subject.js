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
 *          subject: "<inbox subject — confession_teaser>",
 *          options: ["<confession>", "<sharpest_edge>", "<emotional_hook>"]
 *                    // archetype-keyed candidates, in slot order:
 *                    //   [0] subject       — confession_teaser (inbox)
 *                    //   [1] summary       — sharpest_edge_teaser (body H2)
 *                    //   [2] previewHook   — emotional_hook_teaser (preheader)
 *                    // Absent on the template-fallback path.
 *        }
 *   4xx  { ok: false, error: '...' }
 *
 * Fallback behaviour: on any failure (missing key, API down, model
 * refused, JSON malformed, all candidates filtered out) we return a 200
 * with `ok: true` and a template-built subject so the email flow is
 * never blocked. The `options` array is omitted on the fallback path to
 * signal that the model didn't actually produce archetype candidates.
 */

const MODEL          = 'claude-haiku-4-5'        // fast + cheap
// 320 tokens covers: three ≤60-char teaser lines + the JSON wrapper
// ({ "sharpest_edge_teaser": "…", … }) with a little headroom. Going
// over slows nothing — just lets Haiku breathe if it adds whitespace.
const MAX_TOKENS     = 320
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
  // User-authored prompt — kept verbatim so copy changes happen here
  // without touching helper code. The `{{USER_LETTER_TEXT}}` placeholder
  // is replaced inline at request time with the markup-stripped letter.
  const FLAWLESS_HOOK_PROMPT = `You are a master of human psychology and the lead UX writer for "Dearly"—a cinematic, multimedia letter-sending platform. Your job is to analyze a letter written by a user and generate 3 "On-Screen Teaser Lines" (MAX 60 characters each).

This teaser line will be prominently displayed directly beneath the recipient's greeting (e.g., "Hi Marcus,") and right above the envelope asset. Its sole psychological purpose is to make the user freeze and immediately tap to open the letter.

### The Formula for a "Flawless" Hook:
1. THE "RIPPED FROM THE MIDDLE" RULE: Do not summarize the letter. Do not introduce the letter. Instead, take a raw sentence or phrase from the *middle* of the text that feels heavy, blunt, or deeply specific. It should look like an accidental leak of a private thought.
2. ZERO RE-WRITING: Whenever possible, extract the exact 3-to-7 word phrase the user wrote. Real human phrasing is messy and authentic; AI summaries are polished and fake.
3. STRIP THE POLISH: Use lowercase, conversational punctuation (like em-dashes or ellipses), and zero corporate or formal etiquette.
4. NO FILLER WORDS: Never use words like "about," "regarding," "stay," "update," "note," or "letter."

---
### TRAINING EXAMPLES (Study the raw, unfiltered intensity of these hooks):

#### Case 1: Post-Conference/Event (The "Real Talk" Hook)
- Input Text: "Hey Sarah, it was great meeting you at the Config design mixer on Wednesday. I'm still laughing about how the main stage projector completely died right during the keynote intro—talk about irony for a tech conference. You mentioned you were struggling to find an interaction designer who actually understands mathematical pedagogy and 2D character assets for an ed-tech project. I built a quick, interactive layout using Figma and Rive to show you how a non-animal mascot would look in motion. Let me know if I hit the mark."
- Expected Output:
{
  "sharpest_edge_teaser": "the main stage projector completely dying...",
  "confession_teaser": "i'm still laughing about Wednesday night",
  "emotional_hook_teaser": "i built a quick prototype to see if I hit the mark"
}

#### Case 2: Deep Personal / Vulnerable (The Goa/Delhi Context)
- Input Text: "Anjali, It's been almost two years since we last saw each other properly – that weekend in Goa. I keep coming back to the conversation we had at 2am on the balcony, the one about whether you should take the Delhi job. You asked me what I'd do. I gave you a useless answer because I didn't know either. I wanted to say: I think you should go, but I also don't want you to. I never said the second half. I hope you're well, wherever you are now. – Priya"
- Expected Output:
{
  "sharpest_edge_teaser": "i never said the second half.",
  "confession_teaser": "that 2am conversation on the balcony...",
  "emotional_hook_teaser": "i gave you a useless answer because i didn't know either"
}

#### Case 3: High-Stakes Workplace Relief (The "I Have Your Back" Hook)
- Input Text: "Subash, I'm pulling an all-nighter right now because I can see how stressed you are about the product launch timeline. The production count error from yesterday wasn't on you. I stayed up and completely rebuilt the design system logic for the lesson flows so you don't have to face the heat in the leadership meeting tomorrow morning. It's fixed. Look at this."
- Expected Output:
{
  "sharpest_edge_teaser": "the production count error wasn't on you.",
  "confession_teaser": "so you don't have to face the heat tomorrow morning",
  "emotional_hook_teaser": "i stayed up and completely rebuilt the logic. it's fixed."
}

#### Case 4: Casual Creative / Online Collaboration
- Input Text: "Hi David, I saw your tweet about how generic most 2D flat educational aesthetics look these days. I completely agree—everything looks like a corporate illustration library. I took 10 minutes to wireframe an adaptive learning interface with a clean, modern alien character just to see if we could break that mold. Would love to get your thoughts on the lesson flow."
- Expected Output:
{
  "sharpest_edge_teaser": "everything looks like a corporate illustration library.",
  "confession_teaser": "just to see if we could break that mold",
  "emotional_hook_teaser": "i saw your tweet and completely agreed"
}

---
### Execution:
Read the user's input letter below. Mine it for the rawest, most conversational sentence fragment under 60 characters. Do not clean it up or make it sound professional—leave it human.

Output Format:
Return ONLY a valid JSON object. Do not include markdown code blocks (like \`\`\`json) or any conversational introduction/outro text.

---
### INPUT LETTER TO ANALYZE:
{{USER_LETTER_TEXT}}`

  const system = FLAWLESS_HOOK_PROMPT.replace('{{USER_LETTER_TEXT}}', plain)

  // The letter is already embedded in the system prompt via the
  // {{USER_LETTER_TEXT}} substitution above. Sender/recipient names are
  // passed as a lightweight user turn so the model has the relationship
  // context the prompt's "Adaptation Framework" section asks for.
  const user = [
    `Sender's first name (for context): ${fromName}`,
    `Recipient's first name (for context): ${recipientName || '(not provided)'}`,
    '',
    'Output the JSON object now. No code fences, no commentary.',
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

    // The prompt asks for a JSON object with three named keys:
    //   sharpest_edge_teaser  → BLUNT punch — body H2 after open
    //   confession_teaser     → intimate time/place anchor — inbox subject
    //   emotional_hook_teaser → curiosity tease — inbox preheader snippet
    //
    // Strip any ```json fence the model might wrap around it despite the
    // prompt rules, then JSON.parse. If parsing fails or the object is
    // missing all three keys, fall back to the template subject — we
    // intentionally do NOT try to line-parse non-JSON output here because
    // it would produce JSON-syntax artifacts in the email body.
    const cleanedRaw = raw
      .replace(/^\s*```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/i, '')
      .trim()

    let parsed = null
    try { parsed = JSON.parse(cleanedRaw) } catch { /* fall through */ }

    if (!parsed || typeof parsed !== 'object') {
      // eslint-disable-next-line no-console
      console.warn('[suggest-subject] non-JSON response — falling back. First 200 chars:', cleanedRaw.slice(0, 200))
      return ok(res, templateSubject({ fromName, recipientName, plain }))
    }

    const looksLikeAQuestion = s =>
      /\?\s*$/.test(s) || /^(could|can|would|please|i need|provide)\b/i.test(s)

    // Per-key clean: trim, strip surrounding quotes Haiku sometimes adds,
    // cap at 80 chars (prompt asks 60 but allow slight overage rather
    // than truncating mid-thought). Drop empties + question-shaped lines.
    const clean = s => (typeof s === 'string' ? s : '')
      .trim()
      .replace(/^["'`]+|["'`]+$/g, '')
      .replace(/\s+/g, ' ')
      .slice(0, 80)

    const sharpest   = clean(parsed.sharpest_edge_teaser)
    const confession = clean(parsed.confession_teaser)
    const emotional  = clean(parsed.emotional_hook_teaser)

    // Archetype → slot mapping. The client reads:
    //   data.subject       → inbox subject line
    //   data.options[1]    → summary (body H2 directly under greeting)
    //   data.options[2]    → previewHook (hidden preheader / inbox snippet)
    //
    // Why this order:
    //   subject     = confession   — time/place anchor scans cleanly in
    //                                an inbox list, raises curiosity
    //                                without revealing the punch.
    //   summary     = sharpest_edge — the BLUNT line lands right after
    //                                 the recipient opens — this is the
    //                                 "freeze and tap" moment the user
    //                                 designed the prompt around.
    //   previewHook = emotional    — bridges subject and body in the
    //                                inbox preview snippet.
    const candidates = [confession, sharpest, emotional]
      .filter(s => s && !looksLikeAQuestion(s))

    if (candidates.length === 0) {
      // eslint-disable-next-line no-console
      console.warn('[suggest-subject] JSON parsed but no usable keys — falling back. Parsed:', JSON.stringify(parsed).slice(0, 200))
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

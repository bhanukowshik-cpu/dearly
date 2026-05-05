const GREETING_RE = /^(hey|hi|dear|hello|to|dearest|beloved|darling|yo|hiya|howdy|greetings)[,!.\s]+/i

export function extractName(raw) {
  return raw.trim().replace(GREETING_RE, '').replace(/[,!.]+$/, '').trim().split(/\s+/)[0] || ''
}

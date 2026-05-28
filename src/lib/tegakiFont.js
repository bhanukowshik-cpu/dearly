import caveatBundle from 'tegaki/fonts/caveat'

/**
 * Tegaki bundle for our local Caveat .ttf files.
 *
 * `family` is overridden away from Tegaki's default `'Caveat Tegaki 3dc76002'`.
 * Why: Safari silently rejects `document.fonts.add(face)` when the family
 * name contains a token that starts with a digit ('3dc76002' starts with 3).
 * Internally Safari validates the family as a CSS identifier, which can't
 * start with a digit unquoted. The fetch + load chain ran fine in our preload
 * below, but the add was no-op'd, so when Tegaki later iterated
 * `document.fonts` looking for this family it found nothing and fell through
 * to its broken `new FontFace(family, url(...))` path — same SyntaxError we
 * were chasing.
 *
 * 'CaveatTegakiSubset' is a clean CSS identifier (no spaces, no leading
 * digits). Tegaki reads `font.family` for two things:
 *   1. Lookup key in document.fonts (matches our preload now)
 *   2. The `font-family` CSS property on rendered text spans
 * Both work fine under the renamed family — the glyph data inside the bundle
 * is keyed by character codepoint, not by family name, so renaming is safe.
 *
 * `fullFamily` stays as 'Caveat' because we DO want to reuse the Google
 * Fonts Caveat (already loaded via <link> in index.html) as Tegaki's
 * fallback for unsupported chars.
 */
const SUBSET_FAMILY = 'CaveatTegakiSubset'
const FULL_FAMILY   = 'Caveat'

export const font = {
  ...caveatBundle,
  family:      SUBSET_FAMILY,
  fullFamily:  FULL_FAMILY,
  fontUrl:     '/fonts/caveat-subset.ttf',
  fullFontUrl: '/fonts/caveat-full.ttf',
  fontFaceCSS: `
    @font-face { font-family: '${SUBSET_FAMILY}'; src: url('/fonts/caveat-subset.ttf'); }
    @font-face { font-family: '${FULL_FAMILY}';   src: url('/fonts/caveat-full.ttf'); }
  `,
}

/**
 * Safari workaround — preload Tegaki's fonts as binary, NOT via url() string.
 *
 * Why this exists:
 * Tegaki's runtime calls `new FontFace(family, `url(${url})`).load()` to load
 * its glyph font. Safari's CSS parser rejects unquoted `url()` strings in the
 * FontFace constructor's `source` arg with "SyntaxError: The string did not
 * match the expected pattern". The error is async (rejection from .load()),
 * the font never enters `document.fonts`, Tegaki's `_fontReady` flag stays
 * false, no glyphs animate, `onComplete` never fires — and any UI gated on
 * that (e.g. RecipientScreen's phase machine) freezes on the greeting frame.
 *
 * The binary-buffer overload of FontFace bypasses CSS parsing entirely
 * (fetch the .ttf as ArrayBuffer, pass the buffer directly). Once added to
 * document.fonts under Tegaki's exact `font.family`, Tegaki's `ensureFont`
 * finds it via the lookup loop and short-circuits — its broken
 * `new FontFace(family, url(...))` call never runs.
 *
 * `fontsReady` resolves when both fonts finish (or fail). Consumers should
 * await it before mounting <TegakiRenderer>. Fails open — if the fetch
 * errors, we log a warning and resolve anyway so the caller's safety
 * timeout can take over and prevent a dead-end blank screen.
 */
async function preloadOne(family, url) {
  if (typeof window === 'undefined' || typeof FontFace === 'undefined' || !document.fonts) return
  try {
    const r = await fetch(url, { credentials: 'omit' })
    if (!r.ok) throw new Error('HTTP ' + r.status + ' for ' + url)
    const buf = await r.arrayBuffer()
    // Binary-source FontFace: no CSS parsing involved, Safari-safe.
    const face = new FontFace(family, buf)
    await face.load()
    document.fonts.add(face)
    // eslint-disable-next-line no-console
    console.info('[dearly] preloaded Tegaki font:', family, '— status:', face.status)
  } catch (e) {
    // Don't throw — fail open so the consumer's safety-timeout path can run.
    // eslint-disable-next-line no-console
    console.warn('[dearly] Tegaki font preload failed for', family, '—', e && e.message)
  }
}

export const fontsReady = (typeof window !== 'undefined')
  ? Promise.all([
      preloadOne(SUBSET_FAMILY, '/fonts/caveat-subset.ttf'),
      preloadOne(FULL_FAMILY,   '/fonts/caveat-full.ttf'),
    ]).then(() => undefined)
  : Promise.resolve()

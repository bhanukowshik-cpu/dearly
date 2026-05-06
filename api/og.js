import { ImageResponse } from '@vercel/og'

export const config = { runtime: 'edge' }

const h = (type, props, ...children) => ({
  type,
  props: {
    ...props,
    children:
      children.length === 1 ? children[0]
      : children.length > 1 ? children
      : undefined,
  },
})

// Sanitise a name: trim, cap length, fall back to default if empty
function name(raw, fallback) {
  const v = (raw || '').trim().slice(0, 40)
  return v || fallback
}

export default async function handler(req) {
  const url       = new URL(req.url)
  const recipient = name(url.searchParams.get('r'), 'Friend')
  const sender    = name(url.searchParams.get('s'), 'Someone')
  const baseUrl   = `${url.protocol}//${url.host}`

  // Fetch bg image and Caveat font in parallel
  const [bgResult, fontResult] = await Promise.allSettled([
    fetch(`${baseUrl}/og-bg.jpg`).then(r => r.ok ? r.arrayBuffer() : null),
    fetch(`${baseUrl}/fonts/caveat-subset.ttf`).then(r => r.ok ? r.arrayBuffer() : null),
  ])

  // Convert bg to base64 data URI
  let bgSrc = null
  if (bgResult.status === 'fulfilled' && bgResult.value) {
    const bytes = new Uint8Array(bgResult.value)
    let binary  = ''
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i])
    bgSrc = `data:image/jpeg;base64,${btoa(binary)}`
  }

  const fontData = fontResult.status === 'fulfilled' ? fontResult.value : null
  const fonts    = fontData ? [{ name: 'Caveat', data: fontData, style: 'normal', weight: 400 }] : []
  const headingFont  = fontData ? 'Caveat' : 'Georgia, "Times New Roman", serif'
  const subtitleFont = 'Georgia, "Times New Roman", serif'

  const background = bgSrc ? undefined : 'linear-gradient(160deg, #0a1628 0%, #1a3050 50%, #0a1628 100%)'

  // 1200×630 — standard WhatsApp / Facebook / Twitter OG image ratio (1.91:1)
  return new ImageResponse(
    h('div', {
      style: {
        width:      '100%',
        height:     '100%',
        display:    'flex',
        position:   'relative',
        overflow:   'hidden',
        background: background ?? '#0a1628',
      },
    },

      // Background photo (only if fetched successfully)
      ...(bgSrc ? [
        h('img', {
          src: bgSrc,
          style: {
            position:       'absolute',
            top: 0, left: 0,
            width:          '100%',
            height:         '100%',
            objectFit:      'cover',
            objectPosition: 'center',
          },
        }),
      ] : []),

      // Dark overlay — ensures text contrast
      h('div', {
        style: {
          position:   'absolute',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'linear-gradient(160deg, rgba(6,14,30,0.74) 0%, rgba(10,22,45,0.65) 50%, rgba(6,14,30,0.80) 100%)',
          display:    'flex',
        },
      }),

      // Vignette
      h('div', {
        style: {
          position:   'absolute',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'radial-gradient(ellipse at 50% 48%, transparent 30%, rgba(0,0,0,0.55) 100%)',
          display:    'flex',
        },
      }),

      // Content
      h('div', {
        style: {
          position:       'absolute',
          top: 0, left: 0, right: 0, bottom: 0,
          display:        'flex',
          flexDirection:  'column',
          alignItems:     'center',
          justifyContent: 'center',
          padding:        '0 96px',
        },
      },

        // H1 — Hi [Recipient],
        h('div', {
          style: {
            fontFamily:    headingFont,
            fontSize:      recipient.length > 20 ? 114 : 150,
            fontStyle:     'normal',
            fontWeight:    400,
            color:         '#ffffff',
            lineHeight:    1.1,
            textAlign:     'center',
            display:       'flex',
          },
        }, `Hi ${recipient},`),

        // H2 — [Sender] wrote you a note
        h('div', {
          style: {
            fontFamily:  subtitleFont,
            fontSize:    sender.length > 20 ? 39 : 47,
            fontStyle:   'italic',
            fontWeight:  400,
            color:       'rgba(255, 238, 205, 0.90)',
            marginTop:   24,
            lineHeight:  1.35,
            textAlign:   'center',
            display:     'flex',
          },
        }, `${sender} wrote you a note — read it now.`),

        // Rule
        h('div', {
          style: {
            width:        64,
            height:       2,
            background:   'rgba(255,255,255,0.28)',
            borderRadius: 1,
            marginTop:    36,
            display:      'flex',
          },
        }),
      ),

      // Branding
      h('div', {
        style: {
          position:       'absolute',
          bottom:         28,
          left:           0,
          right:          0,
          display:        'flex',
          justifyContent: 'center',
          fontFamily:     subtitleFont,
          fontSize:       24,
          fontStyle:      'italic',
          fontWeight:     400,
          color:          'rgba(255,255,255,0.35)',
          letterSpacing:  '0.5px',
        },
      }, 'Dearly'),
    ),
    { width: 1200, height: 630, fonts },
  )
}

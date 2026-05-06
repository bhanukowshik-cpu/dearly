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

  // Fetch bg image and convert to base64 safely (loop avoids stack overflow
  // from spreading large Uint8Arrays into String.fromCharCode)
  let bgSrc = null
  try {
    const res   = await fetch(`${baseUrl}/og-bg.jpg`, { cf: { cacheEverything: true } })
    if (res.ok) {
      const buf   = await res.arrayBuffer()
      const bytes = new Uint8Array(buf)
      let binary  = ''
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i])
      }
      bgSrc = `data:image/jpeg;base64,${btoa(binary)}`
    }
  } catch {
    // bgSrc stays null — gradient fallback renders instead
  }

  const background = bgSrc ? undefined : 'linear-gradient(160deg, #0a1628 0%, #1a3050 50%, #0a1628 100%)'

  // 3:2 = 1200 × 800
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

      // Dark overlay — simulates blur, ensures text contrast
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
            fontFamily:    'Georgia, "Times New Roman", serif',
            fontSize:      recipient.length > 20 ? 80 : 108,
            fontStyle:     'italic',
            fontWeight:    700,
            color:         '#ffffff',
            lineHeight:    1.1,
            letterSpacing: '-1px',
            textAlign:     'center',
            display:       'flex',
          },
        }, `Hi ${recipient},`),

        // H2 — [Sender] wrote you a note
        h('div', {
          style: {
            fontFamily:  'Georgia, "Times New Roman", serif',
            fontSize:    sender.length > 20 ? 32 : 40,
            fontStyle:   'italic',
            color:       'rgba(255, 238, 205, 0.90)',
            marginTop:   28,
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
            marginTop:    44,
            display:      'flex',
          },
        }),
      ),

      // Branding
      h('div', {
        style: {
          position:       'absolute',
          bottom:         36,
          left:           0,
          right:          0,
          display:        'flex',
          justifyContent: 'center',
          fontFamily:     'Georgia, "Times New Roman", serif',
          fontSize:       26,
          fontStyle:      'italic',
          color:          'rgba(255,255,255,0.35)',
          letterSpacing:  '0.5px',
        },
      }, 'Dearly'),
    ),
    { width: 1200, height: 800 },
  )
}

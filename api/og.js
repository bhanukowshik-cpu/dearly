import { ImageResponse } from '@vercel/og'

export const config = { runtime: 'edge' }

export default function handler(req) {
  const url = new URL(req.url)
  const recipient = url.searchParams.get('r') || 'Friend'
  const sender    = url.searchParams.get('s') || 'Someone'

  const h = (type, props, ...children) => ({ type, props: { ...props, children: children.length === 1 ? children[0] : children } })

  return new ImageResponse(
    h('div', {
      style: {
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(145deg, #1e0e06 0%, #4a2512 40%, #7a4a1a 75%, #a36a22 100%)',
        position: 'relative',
        overflow: 'hidden',
      },
    },
      // Soft vignette overlay
      h('div', {
        style: {
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.45) 100%)',
          display: 'flex',
        },
      }),
      // Paper card
      h('div', {
        style: {
          background: '#fdf6e3',
          borderRadius: 20,
          padding: '52px 72px 48px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          width: 880,
          boxShadow: '0 12px 64px rgba(0,0,0,0.45)',
          position: 'relative',
          zIndex: 1,
          gap: 16,
        },
      },
        // Greeting
        h('div', {
          style: {
            fontFamily: 'Georgia, "Times New Roman", serif',
            fontSize: 72,
            fontStyle: 'italic',
            fontWeight: 700,
            color: '#1c0e05',
            lineHeight: 1.1,
          },
        }, `Hi ${recipient},`),
        // Sender line
        h('div', {
          style: {
            fontFamily: 'Georgia, "Times New Roman", serif',
            fontSize: 38,
            fontStyle: 'italic',
            color: '#5a3520',
            marginTop: 8,
          },
        }, `${sender} wrote you a note.`),
        // Divider
        h('div', {
          style: {
            width: 64,
            height: 3,
            background: '#c4922a',
            borderRadius: 2,
            marginTop: 20,
          },
        }),
        // CTA hint
        h('div', {
          style: {
            fontFamily: 'Georgia, "Times New Roman", serif',
            fontSize: 22,
            color: '#8b6040',
            marginTop: 4,
            fontStyle: 'italic',
          },
        }, 'Tap to open and read it.'),
      ),
      // Branding
      h('div', {
        style: {
          position: 'absolute',
          bottom: 32,
          fontFamily: 'Georgia, "Times New Roman", serif',
          fontSize: 26,
          fontStyle: 'italic',
          color: 'rgba(255,255,255,0.45)',
          letterSpacing: 1,
          zIndex: 1,
          display: 'flex',
        },
      }, 'Dearly,'),
    ),
    { width: 1200, height: 630 },
  )
}

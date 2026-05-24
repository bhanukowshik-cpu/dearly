import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// Dev-only middleware: proxies /api/tts to ElevenLabs using VITE_ELEVENLABS_API_KEY.
// In production (Vercel) the real api/tts.js serverless function runs instead.
function elevenLabsDevApi(apiKey) {
  return {
    name: 'elevenlabs-dev-api',
    configureServer(server) {
      server.middlewares.use('/api/tts', async (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return }
        let raw = ''
        req.on('data', c => { raw += c })
        req.on('end', async () => {
          try {
            const { text, voiceId = 'EXAVITQu4vr4xnSDxMaL' } = JSON.parse(raw)
            if (!apiKey) throw new Error('VITE_ELEVENLABS_API_KEY is not set in .env')
            const upstream = await fetch(
              `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps`,
              {
                method: 'POST',
                headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  text,
                  model_id: 'eleven_multilingual_v2',
                  voice_settings: { stability: 0.50, similarity_boost: 0.75, style: 0.20 },
                }),
              }
            )
            if (!upstream.ok) {
              const msg = await upstream.text()
              res.statusCode = 502
              res.end(JSON.stringify({ error: msg }))
              return
            }
            const data = await upstream.json()
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(data))
          } catch (e) {
            res.statusCode = 500
            res.end(JSON.stringify({ error: e.message }))
          }
        })
      })
    },
  }
}

// Dev-only middleware: proxies /api/email to the same handler used in prod.
// We dynamically import api/email.js so behavior is identical between dev
// and the Vercel serverless deploy — no parallel code paths to keep in sync.
function emailDevApi() {
  return {
    name: 'email-dev-api',
    configureServer(server) {
      server.middlewares.use('/api/email', async (req, res) => {
        try {
          // Re-import on every request so edits to api/email.js hot-reload.
          const mod = await server.ssrLoadModule('/api/email.js')
          await mod.default(req, res)
        } catch (e) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ ok: false, error: e.message || 'dev api error' }))
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // Make RESEND_API_KEY + EMAIL_FROM available to api/email.js at dev time —
  // Vercel sets these via env-var dashboard in prod.
  if (env.RESEND_API_KEY) process.env.RESEND_API_KEY = env.RESEND_API_KEY
  if (env.EMAIL_FROM)     process.env.EMAIL_FROM     = env.EMAIL_FROM
  return {
    base: '/',
    plugins: [react(), elevenLabsDevApi(env.VITE_ELEVENLABS_API_KEY), emailDevApi()],
    resolve: {
      // Force all packages to share the same React instance
      alias: {
        react: resolve('./node_modules/react'),
        'react-dom': resolve('./node_modules/react-dom'),
      },
    },
    build: {
      target: ['es2020', 'safari14'],
    },
    // Transpile for Safari 14+ compatibility in dev mode
    esbuild: {
      target: ['es2020', 'safari14'],
    },
    optimizeDeps: {
      include: ['emoji-mart', '@emoji-mart/data', '@emoji-mart/react'],
      esbuildOptions: {
        target: 'safari14',
      },
    },
  }
})

#!/usr/bin/env node
// Uploads public/music/ and public/videos/ to Supabase Storage.
// Run: node scripts/upload-media.js
import { createClient } from '@supabase/supabase-js'
import { readFileSync, readdirSync } from 'fs'
import { join, extname } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

const SUPABASE_URL = 'https://hdxswlhlbnbvfektdkuq.supabase.co'
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY

if (!SERVICE_KEY) {
  console.error('SUPABASE_SERVICE_KEY env var is required.')
  console.error('Run: SUPABASE_SERVICE_KEY=<key> node scripts/upload-media.js')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
})

const BUCKET = 'media'

const MIME = {
  '.mp4': 'video/mp4',
  '.mp3': 'audio/mpeg',
  '.webm': 'video/webm',
}

async function ensureBucket() {
  const { data: buckets } = await supabase.storage.listBuckets()
  if (buckets?.find(b => b.name === BUCKET)) {
    console.log(`Bucket "${BUCKET}" already exists.`)
    return
  }
  const { error } = await supabase.storage.createBucket(BUCKET, { public: true })
  if (error) throw new Error(`Create bucket failed: ${error.message}`)
  console.log(`Bucket "${BUCKET}" created.`)
}

async function upload(localPath, storagePath) {
  const mime = MIME[extname(localPath).toLowerCase()] ?? 'application/octet-stream'
  const file = readFileSync(localPath)
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, file, { contentType: mime, upsert: true })
  if (error) throw new Error(`Upload "${storagePath}" failed: ${error.message}`)
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(storagePath)
  return data.publicUrl
}

async function uploadDir(localDir, storagePrefix) {
  const files = readdirSync(localDir)
  const urls = {}
  for (const name of files) {
    const localPath   = join(localDir, name)
    const storagePath = `${storagePrefix}/${name}`
    process.stdout.write(`  Uploading ${name}... `)
    const url = await upload(localPath, storagePath)
    console.log('done')
    urls[`/${storagePrefix}/${name}`] = url
  }
  return urls
}

async function main() {
  await ensureBucket()

  console.log('\nUploading music...')
  const musicUrls = await uploadDir(join(ROOT, 'public/music'), 'music')

  console.log('\nUploading videos...')
  const videoUrls = await uploadDir(join(ROOT, 'public/videos'), 'videos')

  const all = { ...musicUrls, ...videoUrls }
  console.log('\n=== CDN URL map ===')
  for (const [local, cdn] of Object.entries(all)) {
    console.log(`${local}  →  ${cdn}`)
  }

  console.log('\nDone. Copy these URLs into RecipientScreen.jsx (MUSIC_TRACKS) and VideoBackground.jsx (VIDEOS).')
}

main().catch(e => { console.error(e); process.exit(1) })

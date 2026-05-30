import { useRef, useState } from 'react'
import styles from './VideoBackground.module.css'

// Served same-origin from /public/loops/ (same assets LoadingScreen uses).
// Previously these pointed at Supabase Storage, which loaded unreliably
// (CDN/ORB blocking) and left the recipient/preview background blank while
// the splash — which already used the local copies — played fine.
const VIDEOS = [
  '/loops/Intro%20Updated.mp4',
  '/loops/Dreamy%20Evening.mp4',
  '/loops/Warm%20Clouds%202.mp4',
  '/loops/Warm%20River%20Scenary%20Moving%201.mp4',
]

export default function VideoBackground() {
  const [src] = useState(() => VIDEOS[Math.floor(Math.random() * VIDEOS.length)])

  return (
    <div className={styles.container} aria-hidden>
      <video
        autoPlay
        loop
        muted
        playsInline
        className={styles.video}
        ref={el => { if (el) el.playbackRate = 0.75 }}
      >
        <source src={src} type="video/mp4" />
      </video>
    </div>
  )
}

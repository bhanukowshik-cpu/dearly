import { useRef, useState } from 'react'
import styles from './VideoBackground.module.css'

const VIDEOS = [
  'https://hdxswlhlbnbvfektdkuq.supabase.co/storage/v1/object/public/media/videos/Intro%20Updated.mp4',
  'https://hdxswlhlbnbvfektdkuq.supabase.co/storage/v1/object/public/media/videos/Dreamy%20Evening.mp4',
  'https://hdxswlhlbnbvfektdkuq.supabase.co/storage/v1/object/public/media/videos/Warm%20Clouds%202.mp4',
  'https://hdxswlhlbnbvfektdkuq.supabase.co/storage/v1/object/public/media/videos/Warm%20River%20Scenary%20Moving%201.mp4',
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

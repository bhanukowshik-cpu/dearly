/**
 * Hand-drawn SVG sticker pack — pen-sketch style, sized 40×40 viewBox.
 * All strokes use round caps/joins for a natural ink feel.
 * Light fills give dimension without looking digital.
 */

const INK  = '#3A2410'          // warm dark-brown ink
const S    = { strokeLinecap: 'round', strokeLinejoin: 'round', fill: 'none' }

/* ── Botanicals ────────────────────────────────────────────────────────────── */

export function Blossom() {
  return (
    <svg viewBox="0 0 40 40" fill="none">
      {/* 5 petals */}
      {[0,72,144,216,288].map(deg => (
        <ellipse key={deg}
          cx={20 + 6.5 * Math.cos((deg - 90) * Math.PI / 180)}
          cy={20 + 6.5 * Math.sin((deg - 90) * Math.PI / 180)}
          rx="4.5" ry="3"
          transform={`rotate(${deg}, ${20 + 6.5 * Math.cos((deg - 90) * Math.PI / 180)}, ${20 + 6.5 * Math.sin((deg - 90) * Math.PI / 180)})`}
          stroke={INK} strokeWidth="1.4" {...S}
          fill="rgba(255,180,190,0.30)"
        />
      ))}
      {/* Centre */}
      <circle cx="20" cy="20" r="3" stroke={INK} strokeWidth="1.3" fill="rgba(255,210,80,0.55)" />
    </svg>
  )
}

export function LeafSprig() {
  return (
    <svg viewBox="0 0 40 40" fill="none">
      {/* Stem */}
      <path d="M20 34 C20 30 19 24 20 14" stroke={INK} strokeWidth="1.5" {...S}/>
      {/* Left leaf */}
      <path d="M20 22 C16 18 11 17 13 23 C15 27 19 26 20 22Z" stroke={INK} strokeWidth="1.4" {...S} fill="rgba(100,180,100,0.22)"/>
      {/* Right leaf */}
      <path d="M20 16 C24 12 29 12 27 18 C25 22 21 20 20 16Z" stroke={INK} strokeWidth="1.4" {...S} fill="rgba(100,180,100,0.22)"/>
      {/* Small left leaf */}
      <path d="M20 28 C17 25 13 25 14 29 C15 32 19 30 20 28Z" stroke={INK} strokeWidth="1.3" {...S} fill="rgba(100,180,100,0.18)"/>
    </svg>
  )
}

export function Daisy() {
  return (
    <svg viewBox="0 0 40 40" fill="none">
      {/* 8 petals */}
      {[0,45,90,135,180,225,270,315].map(deg => (
        <ellipse key={deg}
          cx={20 + 7 * Math.cos((deg - 90) * Math.PI / 180)}
          cy={20 + 7 * Math.sin((deg - 90) * Math.PI / 180)}
          rx="3.2" ry="2"
          transform={`rotate(${deg}, ${20 + 7 * Math.cos((deg - 90) * Math.PI / 180)}, ${20 + 7 * Math.sin((deg - 90) * Math.PI / 180)})`}
          stroke={INK} strokeWidth="1.3" {...S}
          fill="rgba(255,255,255,0.55)"
        />
      ))}
      <circle cx="20" cy="20" r="3.5" stroke={INK} strokeWidth="1.3" fill="rgba(255,200,50,0.60)"/>
    </svg>
  )
}

export function RoseBud() {
  return (
    <svg viewBox="0 0 40 40" fill="none">
      {/* Stem */}
      <path d="M20 34 C20 31 20 27 20 24" stroke={INK} strokeWidth="1.4" {...S}/>
      {/* Leaves */}
      <path d="M20 30 C17 27 13 28 15 32Z" stroke={INK} strokeWidth="1.3" {...S} fill="rgba(80,160,80,0.20)"/>
      <path d="M20 28 C23 25 27 26 25 30Z" stroke={INK} strokeWidth="1.3" {...S} fill="rgba(80,160,80,0.20)"/>
      {/* Petals — outer */}
      <path d="M14 18 C14 12 26 12 26 18 C26 22 23 24 20 24 C17 24 14 22 14 18Z" stroke={INK} strokeWidth="1.4" {...S} fill="rgba(255,140,150,0.25)"/>
      {/* Inner bud */}
      <path d="M17 17 C17 14 23 14 23 17 C23 20 21 22 20 22 C19 22 17 20 17 17Z" stroke={INK} strokeWidth="1.3" {...S} fill="rgba(255,100,120,0.30)"/>
      {/* Sepals */}
      <path d="M16 19 C14 17 13 14 15 14" stroke={INK} strokeWidth="1.2" {...S}/>
      <path d="M24 19 C26 17 27 14 25 14" stroke={INK} strokeWidth="1.2" {...S}/>
    </svg>
  )
}

/* ── Celestial ──────────────────────────────────────────────────────────────── */

export function CrescentMoon() {
  return (
    <svg viewBox="0 0 40 40" fill="none">
      <path d="M24 10 C16 12 12 18 14 26 C16 33 23 36 30 33 C22 35 14 29 14 20 C14 13 20 8 27 9 Z"
        stroke={INK} strokeWidth="1.5" {...S} fill="rgba(255,220,100,0.25)"/>
      {/* Small stars */}
      <path d="M30 12 L30.8 14 L33 14 L31.3 15.5 L31.8 18 L30 17 L28.2 18 L28.7 15.5 L27 14 L29.2 14Z"
        stroke={INK} strokeWidth="0.9" {...S} fill="rgba(255,220,100,0.40)"/>
      <circle cx="34" cy="22" r="1.2" stroke={INK} strokeWidth="1"  fill="rgba(255,220,100,0.40)"/>
    </svg>
  )
}

export function StarCluster() {
  return (
    <svg viewBox="0 0 40 40" fill="none">
      {/* Big star */}
      <path d="M20 8 L22 15 L29 15 L23.5 19.5 L25.5 27 L20 22.5 L14.5 27 L16.5 19.5 L11 15 L18 15Z"
        stroke={INK} strokeWidth="1.4" {...S} fill="rgba(255,220,80,0.30)"/>
      {/* Small stars */}
      <path d="M32 9 L33 12 L36 12 L33.7 14 L34.7 17 L32 15.5 L29.3 17 L30.3 14 L28 12 L31 12Z"
        stroke={INK} strokeWidth="1.0" {...S} fill="rgba(255,220,80,0.25)"/>
      <path d="M8 22 L9 24.5 L11.5 24.5 L9.7 26 L10.5 29 L8 27.5 L5.5 29 L6.3 26 L4.5 24.5 L7 24.5Z"
        stroke={INK} strokeWidth="0.9" {...S} fill="rgba(255,220,80,0.22)"/>
    </svg>
  )
}

export function SunRays() {
  return (
    <svg viewBox="0 0 40 40" fill="none">
      <circle cx="20" cy="20" r="6.5" stroke={INK} strokeWidth="1.5" fill="rgba(255,210,60,0.35)"/>
      {/* 8 rays */}
      {[0,45,90,135,180,225,270,315].map(deg => {
        const r1 = 9, r2 = 13
        const rad = (deg - 90) * Math.PI / 180
        return (
          <line key={deg}
            x1={20 + r1 * Math.cos(rad)} y1={20 + r1 * Math.sin(rad)}
            x2={20 + r2 * Math.cos(rad)} y2={20 + r2 * Math.sin(rad)}
            stroke={INK} strokeWidth="1.5" strokeLinecap="round"
          />
        )
      })}
    </svg>
  )
}

export function Comet() {
  return (
    <svg viewBox="0 0 40 40" fill="none">
      <circle cx="28" cy="12" r="4.5" stroke={INK} strokeWidth="1.4" fill="rgba(180,200,255,0.30)"/>
      <path d="M24 15 C18 20 12 24 7 27" stroke={INK} strokeWidth="1.8" strokeLinecap="round"/>
      <path d="M22 17 C16 21 11 25 7 30" stroke={INK} strokeWidth="1.2" strokeLinecap="round" strokeOpacity="0.5"/>
      <path d="M25 17 C20 23 15 28 10 33" stroke={INK} strokeWidth="1.0" strokeLinecap="round" strokeOpacity="0.4"/>
    </svg>
  )
}

/* ── Love & warmth ──────────────────────────────────────────────────────────── */

export function Heart() {
  return (
    <svg viewBox="0 0 40 40" fill="none">
      <path d="M20 31 C18 29 9 24 8 17 C7 12 10 8 14 8 C17 8 19 10 20 13 C21 10 23 8 26 8 C30 8 33 12 32 17 C31 24 22 29 20 31Z"
        stroke={INK} strokeWidth="1.5" {...S} fill="rgba(255,100,120,0.25)"/>
      {/* Small sparkle */}
      <path d="M28 11 L28.5 13 L30 11 L28.5 13 L28 15 L27.5 13 L26 11 L27.5 13Z"
        stroke={INK} strokeWidth="0.9" {...S} fill="rgba(255,200,100,0.50)"/>
    </svg>
  )
}

export function Bow() {
  return (
    <svg viewBox="0 0 40 40" fill="none">
      {/* Left loop */}
      <path d="M20 20 C18 17 12 14 10 17 C8 20 12 24 20 20Z"
        stroke={INK} strokeWidth="1.5" {...S} fill="rgba(255,150,170,0.25)"/>
      {/* Right loop */}
      <path d="M20 20 C22 17 28 14 30 17 C32 20 28 24 20 20Z"
        stroke={INK} strokeWidth="1.5" {...S} fill="rgba(255,150,170,0.25)"/>
      {/* Left tail */}
      <path d="M20 20 C17 22 13 28 11 30" stroke={INK} strokeWidth="1.4" strokeLinecap="round"/>
      {/* Right tail */}
      <path d="M20 20 C23 22 27 28 29 30" stroke={INK} strokeWidth="1.4" strokeLinecap="round"/>
      {/* Centre knot */}
      <circle cx="20" cy="20" r="2.5" stroke={INK} strokeWidth="1.3" fill="rgba(255,150,170,0.45)"/>
    </svg>
  )
}

export function Butterfly() {
  return (
    <svg viewBox="0 0 40 40" fill="none">
      {/* Top-left wing */}
      <path d="M20 20 C17 16 11 11 10 15 C9 19 14 23 20 20Z"
        stroke={INK} strokeWidth="1.4" {...S} fill="rgba(160,100,220,0.22)"/>
      {/* Top-right wing */}
      <path d="M20 20 C23 16 29 11 30 15 C31 19 26 23 20 20Z"
        stroke={INK} strokeWidth="1.4" {...S} fill="rgba(160,100,220,0.22)"/>
      {/* Bottom-left wing */}
      <path d="M20 20 C16 23 11 27 12 30 C13 33 18 32 20 20Z"
        stroke={INK} strokeWidth="1.4" {...S} fill="rgba(220,130,180,0.22)"/>
      {/* Bottom-right wing */}
      <path d="M20 20 C24 23 29 27 28 30 C27 33 22 32 20 20Z"
        stroke={INK} strokeWidth="1.4" {...S} fill="rgba(220,130,180,0.22)"/>
      {/* Body */}
      <path d="M20 15 C20.8 17 20.5 22 20 26" stroke={INK} strokeWidth="1.5" strokeLinecap="round"/>
      {/* Antennae */}
      <path d="M20 15 C18 12 16 10 15 8" stroke={INK} strokeWidth="1.1" strokeLinecap="round"/>
      <circle cx="15" cy="8" r="1.2" stroke={INK} strokeWidth="1" fill={INK}/>
      <path d="M20 15 C22 12 24 10 25 8" stroke={INK} strokeWidth="1.1" strokeLinecap="round"/>
      <circle cx="25" cy="8" r="1.2" stroke={INK} strokeWidth="1" fill={INK}/>
    </svg>
  )
}

export function TeaCup() {
  return (
    <svg viewBox="0 0 40 40" fill="none">
      {/* Cup body */}
      <path d="M9 18 L12 31 C12.3 32 13 33 14 33 L26 33 C27 33 27.7 32 28 31 L31 18Z"
        stroke={INK} strokeWidth="1.5" {...S} fill="rgba(220,200,180,0.30)"/>
      {/* Rim */}
      <path d="M8 18 C8 17 9 16 10 16 L30 16 C31 16 32 17 32 18" stroke={INK} strokeWidth="1.5" strokeLinecap="round"/>
      {/* Handle */}
      <path d="M31 20 C35 20 36 24 36 26 C36 28 35 30 31 30" stroke={INK} strokeWidth="1.5" strokeLinecap="round"/>
      {/* Saucer */}
      <path d="M5 34 C8 36 32 36 35 34" stroke={INK} strokeWidth="1.4" strokeLinecap="round"/>
      {/* Steam */}
      <path d="M16 13 C16 11 17 10 16 8" stroke={INK} strokeWidth="1.2" strokeLinecap="round"/>
      <path d="M20 12 C20 10 21 9 20 7" stroke={INK} strokeWidth="1.2" strokeLinecap="round"/>
      <path d="M24 13 C24 11 25 10 24 8" stroke={INK} strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  )
}

/* ── Letter-themed ──────────────────────────────────────────────────────────── */

export function Envelope() {
  return (
    <svg viewBox="0 0 40 40" fill="none">
      {/* Body */}
      <path d="M6 11 C6 10 7 9 8 9 L32 9 C33 9 34 10 34 11 L34 31 C34 32 33 33 32 33 L8 33 C7 33 6 32 6 31 Z"
        stroke={INK} strokeWidth="1.5" {...S} fill="rgba(255,240,210,0.35)"/>
      {/* V-flap */}
      <path d="M6 12 L19 22 C19.5 22.5 20.5 22.5 21 22 L34 12" stroke={INK} strokeWidth="1.4" strokeLinecap="round"/>
      {/* Bottom seam lines */}
      <path d="M6 28 L14 22" stroke={INK} strokeWidth="1.2" strokeLinecap="round" strokeOpacity="0.4"/>
      <path d="M34 28 L26 22" stroke={INK} strokeWidth="1.2" strokeLinecap="round" strokeOpacity="0.4"/>
    </svg>
  )
}

export function FeatherQuill() {
  return (
    <svg viewBox="0 0 40 40" fill="none">
      {/* Quill shaft */}
      <path d="M8 34 C12 28 18 20 28 8" stroke={INK} strokeWidth="1.4" strokeLinecap="round"/>
      {/* Nib */}
      <path d="M8 34 L10 30 L14 32 Z" stroke={INK} strokeWidth="1.3" {...S} fill={INK}/>
      {/* Feather right side */}
      <path d="M28 8 C32 10 34 18 28 26 C24 30 16 32 10 30" stroke={INK} strokeWidth="1.4" strokeLinecap="round" fill="rgba(200,220,255,0.25)" />
      {/* Feather left side */}
      <path d="M28 8 C22 9 17 18 14 26" stroke={INK} strokeWidth="1.3" strokeLinecap="round"/>
      {/* Barbs right */}
      <path d="M26 11 C30 14 31 18 28 22" stroke={INK} strokeWidth="0.9" strokeLinecap="round" strokeOpacity="0.55"/>
      <path d="M24 13 C28 16 29 20 26 24" stroke={INK} strokeWidth="0.9" strokeLinecap="round" strokeOpacity="0.55"/>
    </svg>
  )
}

export function WaxSeal() {
  return (
    <svg viewBox="0 0 40 40" fill="none">
      {/* Drip at top */}
      <path d="M20 8 C19 10 18 12 18 14 L22 14 C22 12 21 10 20 8Z" stroke={INK} strokeWidth="1.2" {...S} fill="rgba(200,60,60,0.35)"/>
      {/* Main seal circle */}
      <circle cx="20" cy="23" r="11" stroke={INK} strokeWidth="1.5" fill="rgba(200,60,60,0.28)"/>
      {/* Inner circle */}
      <circle cx="20" cy="23" r="8" stroke={INK} strokeWidth="1.1" strokeDasharray="1.5 2"/>
      {/* D monogram */}
      <path d="M16 18 L16 28 L20 28 C24 28 26 26 26 23 C26 20 24 18 20 18 Z"
        stroke={INK} strokeWidth="1.3" {...S}/>
    </svg>
  )
}

export function PaperPlane() {
  return (
    <svg viewBox="0 0 40 40" fill="none">
      {/* Main body */}
      <path d="M6 20 L34 8 L24 34 L20 22 Z" stroke={INK} strokeWidth="1.5" {...S} fill="rgba(180,200,255,0.25)"/>
      {/* Fold line */}
      <path d="M20 22 L34 8" stroke={INK} strokeWidth="1.3" strokeLinecap="round" strokeOpacity="0.5"/>
      {/* Wing underside */}
      <path d="M6 20 L20 22 L16 30" stroke={INK} strokeWidth="1.3" strokeLinecap="round" strokeOpacity="0.6"/>
      {/* Trail dots */}
      <circle cx="3" cy="22" r="1"   fill={INK} fillOpacity="0.35"/>
      <circle cx="1" cy="25" r="0.7" fill={INK} fillOpacity="0.22"/>
    </svg>
  )
}

/* ── Business ───────────────────────────────────────────────────────────────── */

export function Rocket() {
  return (
    <svg viewBox="0 0 40 40" fill="none">
      <path d="M20 5 C13 9 10 18 11 27 L20 32 L29 27 C30 18 27 9 20 5Z"
        stroke={INK} strokeWidth="1.5" {...S} fill="rgba(180,200,255,0.30)"/>
      <circle cx="20" cy="17" r="3.8" stroke={INK} strokeWidth="1.3" fill="rgba(140,190,255,0.50)"/>
      <path d="M11 27 C8 29 7 33 9 34 L13 30 Z"
        stroke={INK} strokeWidth="1.3" {...S} fill="rgba(180,200,255,0.22)"/>
      <path d="M29 27 C32 29 33 33 31 34 L27 30 Z"
        stroke={INK} strokeWidth="1.3" {...S} fill="rgba(180,200,255,0.22)"/>
      <path d="M17 32 C16 35 17 37 20 38 C23 37 24 35 23 32 C21 34 19 34 17 32Z"
        stroke={INK} strokeWidth="1.2" {...S} fill="rgba(255,160,50,0.50)"/>
    </svg>
  )
}

export function Trophy() {
  return (
    <svg viewBox="0 0 40 40" fill="none">
      <path d="M13 8 L27 8 L25 21 C25 24 23 26 20 26 C17 26 15 24 15 21 Z"
        stroke={INK} strokeWidth="1.4" {...S} fill="rgba(255,200,60,0.30)"/>
      <path d="M13 10 C9 10 8 13 8 15 C8 18 10 20 13 19" stroke={INK} strokeWidth="1.3" strokeLinecap="round"/>
      <path d="M27 10 C31 10 32 13 32 15 C32 18 30 20 27 19" stroke={INK} strokeWidth="1.3" strokeLinecap="round"/>
      <path d="M20 26 L20 30" stroke={INK} strokeWidth="1.4" strokeLinecap="round"/>
      <path d="M14 30 L26 30" stroke={INK} strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M12 33 L28 33" stroke={INK} strokeWidth="1.4" strokeLinecap="round"/>
      <path d="M20 11 L21.2 15 L25 15 L22 17.5 L23 21 L20 19 L17 21 L18 17.5 L15 15 L18.8 15Z"
        stroke={INK} strokeWidth="0.9" {...S} fill="rgba(255,200,60,0.55)"/>
    </svg>
  )
}

export function Lightbulb() {
  return (
    <svg viewBox="0 0 40 40" fill="none">
      <path d="M14 17 C14 11 26 11 26 17 C26 22 24 25 22 27 L18 27 C16 25 14 22 14 17Z"
        stroke={INK} strokeWidth="1.4" {...S} fill="rgba(255,235,80,0.38)"/>
      <path d="M18 27 L18 31 L22 31 L22 27" stroke={INK} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M17 29 L23 29" stroke={INK} strokeWidth="1.2" strokeLinecap="round"/>
      <path d="M17.5 31 L22.5 31" stroke={INK} strokeWidth="1.1" strokeLinecap="round"/>
      <path d="M18 21 C18.5 20 19.2 19.5 20 19.5 C20.8 19.5 21.5 20 22 21" stroke={INK} strokeWidth="1.1" strokeLinecap="round"/>
      <path d="M20 7 L20 9.5" stroke={INK} strokeWidth="1.2" strokeLinecap="round"/>
      <path d="M10 17 L12 17" stroke={INK} strokeWidth="1.2" strokeLinecap="round"/>
      <path d="M28 17 L30 17" stroke={INK} strokeWidth="1.2" strokeLinecap="round"/>
      <path d="M12.5 10.5 L14 12" stroke={INK} strokeWidth="1.1" strokeLinecap="round"/>
      <path d="M27.5 10.5 L26 12" stroke={INK} strokeWidth="1.1" strokeLinecap="round"/>
    </svg>
  )
}

export function Briefcase() {
  return (
    <svg viewBox="0 0 40 40" fill="none">
      <path d="M6 18 C6 17 7 16 8 16 L32 16 C33 16 34 17 34 18 L34 32 C34 33 33 34 32 34 L8 34 C7 34 6 33 6 32 Z"
        stroke={INK} strokeWidth="1.5" {...S} fill="rgba(185,145,100,0.25)"/>
      <path d="M15 16 L15 12 C15 11 16 10 17 10 L23 10 C24 10 25 11 25 12 L25 16"
        stroke={INK} strokeWidth="1.4" {...S}/>
      <rect x="18" y="23" width="4" height="3.5" rx="1" stroke={INK} strokeWidth="1.2" fill="rgba(185,145,100,0.45)"/>
      <path d="M6 25 L34 25" stroke={INK} strokeWidth="1.1" strokeLinecap="round" strokeOpacity="0.4"/>
    </svg>
  )
}

export function BarChart() {
  return (
    <svg viewBox="0 0 40 40" fill="none">
      <rect x="7"  y="22" width="7" height="11" rx="1.2" stroke={INK} strokeWidth="1.3" fill="rgba(100,170,255,0.30)"/>
      <rect x="16.5" y="15" width="7" height="18" rx="1.2" stroke={INK} strokeWidth="1.3" fill="rgba(100,200,150,0.30)"/>
      <rect x="26" y="9"  width="7" height="24" rx="1.2" stroke={INK} strokeWidth="1.3" fill="rgba(255,200,80,0.38)"/>
      <path d="M5 33 L37 33" stroke={INK} strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M5 33 L5 7"   stroke={INK} strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M10.5 22 L20 15 L29.5 9" stroke={INK} strokeWidth="1.1" strokeLinecap="round" strokeDasharray="2 2" strokeOpacity="0.50"/>
    </svg>
  )
}

export function Target() {
  return (
    <svg viewBox="0 0 40 40" fill="none">
      <circle cx="20" cy="20" r="13" stroke={INK} strokeWidth="1.4" fill="rgba(255,180,180,0.15)"/>
      <circle cx="20" cy="20" r="8.5" stroke={INK} strokeWidth="1.3" fill="rgba(255,120,120,0.18)"/>
      <circle cx="20" cy="20" r="4"   stroke={INK} strokeWidth="1.4" fill="rgba(220,50,50,0.32)"/>
      <path d="M30 10 L23.5 16.5" stroke={INK} strokeWidth="1.6" strokeLinecap="round"/>
      <path d="M27 9 L31 9 L31 13" stroke={INK} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

export function Crown() {
  return (
    <svg viewBox="0 0 40 40" fill="none">
      <path d="M7 28 L7 17 L13 24 L20 11 L27 24 L33 17 L33 28 Z"
        stroke={INK} strokeWidth="1.5" {...S} fill="rgba(255,200,60,0.28)"/>
      <rect x="7" y="28" width="26" height="4" rx="1" stroke={INK} strokeWidth="1.3" fill="rgba(255,200,60,0.40)"/>
      <circle cx="20" cy="29" r="2"   stroke={INK} strokeWidth="1.0" fill="rgba(210,70,70,0.60)"/>
      <circle cx="12" cy="29" r="1.4" stroke={INK} strokeWidth="0.9" fill="rgba(70,120,220,0.60)"/>
      <circle cx="28" cy="29" r="1.4" stroke={INK} strokeWidth="0.9" fill="rgba(70,190,130,0.60)"/>
    </svg>
  )
}

export function Handshake() {
  return (
    <svg viewBox="0 0 40 40" fill="none">
      <path d="M4 26 C7 24 11 22 15 22" stroke={INK} strokeWidth="2" strokeLinecap="round"/>
      <path d="M36 26 C33 24 29 22 25 22" stroke={INK} strokeWidth="2" strokeLinecap="round"/>
      <path d="M15 18 C15 15 18 14 20 15.5 C22 14 25 15 25 18 L25 24 L15 24 Z"
        stroke={INK} strokeWidth="1.4" {...S} fill="rgba(220,190,160,0.30)"/>
      <path d="M15 20 C12 19 11 17 13 16" stroke={INK} strokeWidth="1.1" strokeLinecap="round"/>
      <path d="M15 22.5 C12 22.5 11 20 13 19" stroke={INK} strokeWidth="1.1" strokeLinecap="round"/>
      <path d="M25 20 C28 19 29 17 27 16" stroke={INK} strokeWidth="1.1" strokeLinecap="round"/>
      <path d="M25 22.5 C28 22.5 29 20 27 19" stroke={INK} strokeWidth="1.1" strokeLinecap="round"/>
      <path d="M20 12 L20.6 10 L21.2 12 L23 12.5 L21.2 13 L20.6 15 L20 13 L18.2 12.5Z"
        stroke={INK} strokeWidth="0.8" {...S} fill="rgba(255,220,80,0.60)"/>
    </svg>
  )
}

/* ── Export catalogue ──────────────────────────────────────────────────────── */

export const STICKER_GROUPS = [
  {
    label: 'Botanicals',
    stickers: [
      { id: 'blossom',   label: 'Blossom',      Component: Blossom      },
      { id: 'leafsprig', label: 'Leaf Sprig',   Component: LeafSprig    },
      { id: 'daisy',     label: 'Daisy',         Component: Daisy        },
      { id: 'rosebud',   label: 'Rose Bud',      Component: RoseBud      },
    ],
  },
  {
    label: 'Celestial',
    stickers: [
      { id: 'moon',  label: 'Moon',  Component: CrescentMoon },
      { id: 'stars', label: 'Stars', Component: StarCluster  },
      { id: 'sun',   label: 'Sun',   Component: SunRays      },
      { id: 'comet', label: 'Comet', Component: Comet        },
    ],
  },
  {
    label: 'Love',
    stickers: [
      { id: 'heart',     label: 'Heart',     Component: Heart     },
      { id: 'bow',       label: 'Bow',       Component: Bow       },
      { id: 'butterfly', label: 'Butterfly', Component: Butterfly },
      { id: 'teacup',    label: 'Tea Cup',   Component: TeaCup    },
    ],
  },
  {
    label: 'Letter',
    stickers: [
      { id: 'envelope', label: 'Envelope',      Component: Envelope     },
      { id: 'quill',    label: 'Feather Quill', Component: FeatherQuill },
      { id: 'waxseal',  label: 'Wax Seal',      Component: WaxSeal      },
      { id: 'plane',    label: 'Paper Plane',   Component: PaperPlane   },
    ],
  },
  {
    label: 'Business',
    stickers: [
      { id: 'rocket',     label: 'Rocket',     Component: Rocket     },
      { id: 'trophy',     label: 'Trophy',     Component: Trophy     },
      { id: 'lightbulb',  label: 'Lightbulb',  Component: Lightbulb  },
      { id: 'briefcase',  label: 'Briefcase',  Component: Briefcase  },
      { id: 'barchart',   label: 'Bar Chart',  Component: BarChart   },
      { id: 'target',     label: 'Target',     Component: Target     },
      { id: 'crown',      label: 'Crown',      Component: Crown      },
      { id: 'handshake',  label: 'Handshake',  Component: Handshake  },
    ],
  },
]

// id → Component lookup used when sticker data is decoded from a share URL
// (JSON serialization drops function properties, so Component must be re-resolved by id)
export const STICKER_REGISTRY = Object.fromEntries(
  STICKER_GROUPS.flatMap(g => g.stickers).map(s => [s.id, s.Component])
)

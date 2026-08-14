/**
 * The Lantern mark: an L whose stem carries a lit head, so the letter and the
 * lamp are one shape. Warm light on a deep ground.
 */
export default function LanternMark({ size }: { size: number }): React.JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 1024 1024">
      <defs>
        <linearGradient id="lantern-mark-ink" x1="0" y1="0" x2="0.85" y2="1">
          <stop offset="0" stopColor="#1b2740" />
          <stop offset="1" stopColor="#0b1220" />
        </linearGradient>
        <radialGradient id="lantern-mark-halo" cx="0.5" cy="0.46" r="0.55">
          <stop offset="0" stopColor="#ffb340" stopOpacity="0.42" />
          <stop offset="1" stopColor="#ffb340" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="lantern-mark-orb" cx="0.5" cy="0.38" r="0.7">
          <stop offset="0" stopColor="#fff3d0" />
          <stop offset="0.5" stopColor="#ffb340" />
          <stop offset="1" stopColor="#f08a1c" />
        </radialGradient>
      </defs>
      <rect width="1024" height="1024" rx="224" fill="url(#lantern-mark-ink)" />
      <rect width="1024" height="1024" rx="224" fill="url(#lantern-mark-halo)" />
      <path d="M356 336 h132 v368 h236 v132 h-368 z" fill="#f6f3ec" />
      <circle cx="422" cy="252" r="96" fill="url(#lantern-mark-orb)" />
    </svg>
  )
}

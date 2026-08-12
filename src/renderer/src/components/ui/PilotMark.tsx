/** The Pilot mark: paper plane with a teal trail and the pulsing red lead dot.
 *  `subtle` tones the glow down for small placements like the top bar. */
export default function PilotMark({ size, subtle }: { size: number; subtle?: boolean }): React.JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      style={{
        filter: subtle
          ? 'drop-shadow(0 2px 10px rgba(41,172,194,0.35))'
          : 'drop-shadow(0 14px 44px rgba(41,172,194,0.5))'
      }}
    >
      <defs>
        <linearGradient id="pilot-mark-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0d2c40" />
          <stop offset="1" stopColor="#116e78" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="15" fill="url(#pilot-mark-bg)" />
      <circle cx="13.3" cy="46.8" r="2.1" fill="#5ecfe0" opacity="0.6" />
      <circle cx="19.1" cy="43.1" r="1.6" fill="#5ecfe0" opacity="0.45" />
      <circle cx="23.9" cy="40.2" r="1.25" fill="#5ecfe0" opacity="0.32" />
      <polygon points="8,32 54.5,12.5 38,51.5 27.3,37.5" fill="#f4fbfd" />
      <polygon points="27.3,37.5 54.5,12.5 32,34.8" fill="#b5e3ef" />
      <circle className="lead-dot" cx="55.3" cy="11.8" r="2.9" fill="#e4125c" />
    </svg>
  )
}

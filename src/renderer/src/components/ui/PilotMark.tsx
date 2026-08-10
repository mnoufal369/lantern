/** The Pilot dot-logo with its pulsing lead dot, as used across the app and site. */
export default function PilotMark({ size }: { size: number }): React.JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      style={{ filter: 'drop-shadow(0 14px 44px rgba(41,172,194,0.5))' }}
    >
      <rect width="64" height="64" rx="15" fill="#0d2536" />
      <circle cx="26.9" cy="17.5" r="3.6" fill="#29acc2" />
      <circle cx="36.8" cy="18.5" r="3.6" fill="#16998f" />
      <circle cx="42" cy="26.5" r="3.6" fill="#3baa93" />
      <circle cx="36.8" cy="34.5" r="3.6" fill="#8bc6ad" />
      <circle cx="26.9" cy="26.5" r="3.6" fill="#8bc6ad" />
      <circle cx="26.9" cy="35.5" r="3.6" fill="#f5ba0e" />
      <circle cx="26.9" cy="44.3" r="3.9" fill="#ee7d12" />
      <circle className="lead-dot" cx="26.9" cy="53" r="4.25" fill="#e4125c" />
    </svg>
  )
}

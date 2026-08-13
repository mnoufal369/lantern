/**
 * The Loods mark: signal flag "H" of the international code of signals, which
 * means "I have a pilot on board" — white hoist, red fly, one soft wave in the
 * fly edge so it reads as cloth rather than a rectangle.
 */
export default function LoodsMark({ size }: { size: number }): React.JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 1024 1024">
      <defs>
        <linearGradient id="loods-mark-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0b2a45" />
          <stop offset="1" stopColor="#14567f" />
        </linearGradient>
      </defs>
      <rect width="1024" height="1024" rx="224" fill="url(#loods-mark-bg)" />
      <g transform="rotate(-4 512 512)">
        <path d="M228 322 h286 v380 h-286 z" fill="#f4fbfd" />
        <path d="M514 322 h282 c-46 95 -46 285 0 380 h-282 z" fill="#e4125c" />
      </g>
    </svg>
  )
}

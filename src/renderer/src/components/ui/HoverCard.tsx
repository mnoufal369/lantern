import { useRef, useState } from 'react'

const CARD_WIDTH = 248

/**
 * Small titled tooltip in the app's own styling. It positions itself with `fixed`
 * coordinates taken on hover, so it survives ancestors that clip their overflow.
 */
export default function HoverCard({
  title,
  body,
  className = '',
  children
}: {
  title: string
  body: string
  className?: string
  children: React.ReactNode
}): React.JSX.Element {
  const triggerRef = useRef<HTMLSpanElement>(null)
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null)

  const show = (): void => {
    const rect = triggerRef.current?.getBoundingClientRect()
    if (rect) {
      setAnchor({ top: rect.bottom + 6, left: Math.max(8, Math.min(rect.left, window.innerWidth - CARD_WIDTH - 8)) })
    }
  }

  return (
    <span
      ref={triggerRef}
      onMouseEnter={show}
      onMouseLeave={() => setAnchor(null)}
      className={`inline-flex items-center ${className}`}
    >
      {children}
      {anchor && (
        <span
          style={{ top: anchor.top, left: anchor.left, width: CARD_WIDTH }}
          // whitespace-normal: triggers live inside nowrap rows, and that would inherit.
          className="menu-in pointer-events-none fixed z-50 block whitespace-normal break-words rounded-md border border-deck-border bg-deck-panel p-2.5 text-left shadow-[0_10px_32px_rgba(0,0,0,0.4)]"
        >
          <span className="block text-[12px] font-semibold text-zinc-100">{title}</span>
          <span className="mt-1 block text-[11px] leading-relaxed text-zinc-400">{body}</span>
        </span>
      )}
    </span>
  )
}

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { MoreVertical } from 'lucide-react'

export interface OverflowItem {
  id: string
  /** Items with the lowest priority are the first to move into the ⋮ menu. */
  priority: number
  bar: React.ReactNode
  menu: React.ReactNode
}

/** Kept as a constant so the reserved slot never changes with the menu appearing or disappearing. */
const MENU_BUTTON_WIDTH = 20

/**
 * Right-aligned row that keeps only what fits and moves the rest into a ⋮ menu,
 * measured against real available space rather than window breakpoints.
 */
export default function OverflowRow({
  items,
  gap = 8,
  className = ''
}: {
  items: OverflowItem[]
  gap?: number
  className?: string
}): React.JSX.Element {
  const outerRef = useRef<HTMLDivElement>(null)
  const itemElements = useRef(new Map<string, HTMLElement>())
  const measuredWidths = useRef(new Map<string, number>())
  const [hiddenIds, setHiddenIds] = useState<string[]>([])
  const [menuOpen, setMenuOpen] = useState(false)

  const measure = (): void => {
    const outer = outerRef.current
    if (!outer) {
      return
    }
    for (const [id, element] of itemElements.current) {
      measuredWidths.current.set(id, element.offsetWidth)
    }
    const available = outer.clientWidth - MENU_BUTTON_WIDTH - gap
    let used = 0
    const keep = new Set<string>()
    for (const item of [...items].sort((a, b) => b.priority - a.priority)) {
      const width = measuredWidths.current.get(item.id)
      if (width === undefined) {
        keep.add(item.id)
        continue
      }
      const nextUsed = used + width + (used > 0 ? gap : 0)
      if (nextUsed > available) {
        break
      }
      used = nextUsed
      keep.add(item.id)
    }
    const nextHidden = items.filter((item) => !keep.has(item.id)).map((item) => item.id)
    setHiddenIds((previous) =>
      previous.length === nextHidden.length && previous.every((id, i) => id === nextHidden[i]) ? previous : nextHidden
    )
  }

  const latestMeasure = useRef(measure)
  latestMeasure.current = measure

  useLayoutEffect(() => {
    latestMeasure.current()
  })

  useEffect(() => {
    const outer = outerRef.current
    if (!outer) {
      return
    }
    const observer = new ResizeObserver(() => latestMeasure.current())
    observer.observe(outer)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (hiddenIds.length === 0) {
      setMenuOpen(false)
    }
  }, [hiddenIds])

  useEffect(() => {
    if (!menuOpen) {
      return
    }
    const close = (e: MouseEvent): void => {
      if (outerRef.current && !outerRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        setMenuOpen(false)
      }
    }
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  const hidden = new Set(hiddenIds)
  // An item nobody has measured yet renders in the bar for one pass so it can be sized.
  const inBar = items.filter((item) => !hidden.has(item.id) || !measuredWidths.current.has(item.id))
  const inMenu = items.filter((item) => hidden.has(item.id) && measuredWidths.current.has(item.id))

  return (
    <div ref={outerRef} className={`relative flex min-w-0 items-center justify-end ${className}`} style={{ gap }}>
      <div className="flex min-w-0 items-center overflow-hidden" style={{ gap }}>
        {inBar.map((item) => (
          <div
            key={item.id}
            ref={(element) => {
              if (element) {
                itemElements.current.set(item.id, element)
              } else {
                itemElements.current.delete(item.id)
              }
            }}
            className="flex shrink-0 items-center"
          >
            {item.bar}
          </div>
        ))}
      </div>
      {inMenu.length > 0 && (
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          title="More"
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded hover:bg-deck-raised hover:text-zinc-200 ${
            menuOpen ? 'bg-deck-raised text-zinc-200' : ''
          }`}
        >
          <MoreVertical size={13} />
        </button>
      )}
      {menuOpen && inMenu.length > 0 && (
        <div
          onClick={() => setMenuOpen(false)}
          className="menu-in absolute right-0 top-6 z-30 flex min-w-[190px] flex-col gap-0.5 rounded-lg border border-deck-border bg-deck-panel p-1 shadow-[0_10px_32px_rgba(0,0,0,0.4)]"
        >
          {inMenu.map((item) => (
            <div key={item.id} className="flex items-center">
              {item.menu}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

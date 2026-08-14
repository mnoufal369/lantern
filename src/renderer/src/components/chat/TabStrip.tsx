import { useEffect, useRef, useState } from 'react'
import { Pencil, X } from 'lucide-react'
import { PROFILE_COLORS } from '@shared/constants'
import { useSessionsStore } from '@/stores/useSessionsStore'

/** Walks up the fork chain to the session every tab in this strip descends from. */
function rootOf(sessionId: string, parentOf: Record<string, string | undefined>): string {
  const seen = new Set<string>()
  let current = sessionId
  while (parentOf[current] && !seen.has(current)) {
    seen.add(current)
    current = parentOf[current] as string
  }
  return current
}

function ColorMenu({
  current,
  onPick,
  onClose
}: {
  current?: string
  onPick: (color: string | null) => void
  onClose: () => void
}): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const away = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    window.addEventListener('mousedown', away)
    return () => window.removeEventListener('mousedown', away)
  }, [onClose])

  return (
    <div
      ref={ref}
      className="menu-in absolute left-0 top-7 z-40 w-[132px] rounded-md border border-deck-border bg-deck-panel p-2 shadow-[0_10px_32px_rgba(0,0,0,0.4)]"
    >
      <div className="grid grid-cols-4 gap-1.5">
        {PROFILE_COLORS.map((color) => (
          <button
            key={color}
            onClick={() => onPick(color)}
            title={color}
            className={`h-5 w-5 rounded-full ${current === color ? 'ring-2 ring-inset ring-white/70' : ''}`}
            style={{ backgroundColor: color }}
          />
        ))}
      </div>
      {current && (
        <button
          onClick={() => onPick(null)}
          className="mt-2 w-full rounded px-1 py-0.5 text-left text-[11px] text-zinc-500 hover:bg-deck-raised hover:text-zinc-300"
        >
          Clear colour
        </button>
      )}
    </div>
  )
}

export default function TabStrip({ sessionId }: { sessionId: string }): React.JSX.Element | null {
  const sessions = useSessionsStore((s) => s.sessions)
  const order = useSessionsStore((s) => s.order)
  const setActive = useSessionsStore((s) => s.setActive)
  const rename = useSessionsStore((s) => s.rename)
  const setColor = useSessionsStore((s) => s.setColor)
  const archive = useSessionsStore((s) => s.archive)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [colorMenuId, setColorMenuId] = useState<string | null>(null)

  const parentOf: Record<string, string | undefined> = {}
  for (const id of order) {
    parentOf[id] = sessions[id]?.meta.forkedFrom
  }
  const root = rootOf(sessionId, parentOf)
  // Oldest first: a new tab lands to the right of the ones it was opened from, and stays
  // there after a restart (the sidebar's order is newest-first).
  const family = order
    .filter((id) => !sessions[id].meta.archived && rootOf(id, parentOf) === root)
    .sort((a, b) => sessions[a].meta.createdAt - sessions[b].meta.createdAt)

  // Every session gets a tab, including one on its own. A session imported from
  // terminal history has no branches, and hiding the strip for it left it with
  // no name, no colour and nowhere to rename it.
  if (family.length === 0) {
    return null
  }

  const commitRename = (id: string): void => {
    if (draft.trim()) {
      void rename(id, draft.trim())
    }
    setRenamingId(null)
  }

  const closeTab = (id: string): void => {
    const entry = sessions[id]
    const busy =
      entry.meta.status.kind === 'thinking' ||
      entry.meta.status.kind === 'running-tool' ||
      entry.meta.status.kind === 'waiting-permission'
    const hasContent = entry.blocks.length > 0 || entry.meta.stats.turns > 0
    const warning = busy
      ? `"${entry.meta.title || 'This tab'}" is still working. Close it anyway?`
      : hasContent
        ? `Close "${entry.meta.title || 'this tab'}"? It moves to Archived, so you can reopen it later.`
        : null
    if (warning && !window.confirm(warning)) {
      return
    }
    // Land on the tab to the left (or the right, when closing the first one) so closing
    // a tab never drops out of the session.
    const position = family.indexOf(id)
    const neighbour = family[position - 1] ?? family[position + 1]
    void archive(id).then(() => {
      if (neighbour) {
        setActive(neighbour)
      }
    })
  }

  return (
    <div className="flex h-8 shrink-0 items-stretch border-b border-deck-border bg-deck-panel">
      {family.map((id) => {
        const { meta } = sessions[id]
        const active = id === sessionId
        return (
          <div
            key={id}
            onClick={() => setActive(id)}
            onDoubleClick={() => {
              setRenamingId(id)
              setDraft(meta.title)
            }}
            title={renamingId === id ? undefined : 'Double-click to rename'}
            className={`group relative flex max-w-[220px] cursor-pointer items-center gap-1.5 border-r border-deck-border px-3 text-[12px] ${
              active ? 'bg-deck-bg text-zinc-100' : 'text-zinc-500 hover:bg-deck-bg/50 hover:text-zinc-300'
            }`}
          >
            {/* One circle does both jobs: shows the tag, opens the picker. Space is always
                reserved so the title never shifts when it appears on hover. */}
            <button
              title="Colour-code this tab"
              onClick={(e) => {
                e.stopPropagation()
                setColorMenuId(colorMenuId === id ? null : id)
              }}
              className={`flex h-3 w-3 shrink-0 items-center justify-center ${
                meta.color ? '' : 'opacity-0 group-hover:opacity-100'
              }`}
            >
              {meta.color ? (
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: meta.color }} />
              ) : (
                <span className="h-2.5 w-2.5 rounded-full border border-zinc-600 hover:border-zinc-300" />
              )}
            </button>
            {renamingId === id ? (
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => commitRename(id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    commitRename(id)
                  }
                  if (e.key === 'Escape') {
                    setRenamingId(null)
                  }
                }}
                onClick={(e) => e.stopPropagation()}
                className="selectable w-28 rounded border border-deck-border bg-deck-raised px-1 text-[12px] text-zinc-100 outline-none"
              />
            ) : (
              <span className="truncate">{meta.title || 'New tab'}</span>
            )}
            <span className="ml-1 flex shrink-0 items-center gap-1.5 opacity-0 group-hover:opacity-100">
              <button
                title="Rename"
                onClick={(e) => {
                  e.stopPropagation()
                  setRenamingId(id)
                  setDraft(meta.title)
                }}
                className="text-zinc-500 hover:text-zinc-200"
              >
                <Pencil size={11} />
              </button>
              <button
                title="Close tab"
                onClick={(e) => {
                  e.stopPropagation()
                  closeTab(id)
                }}
                className="text-zinc-500 hover:text-zinc-200"
              >
                <X size={12} />
              </button>
            </span>
            {colorMenuId === id && (
              <ColorMenu
                current={meta.color}
                onPick={(color) => {
                  void setColor(id, color)
                  setColorMenuId(null)
                }}
                onClose={() => setColorMenuId(null)}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

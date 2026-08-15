import { useEffect, useRef, useState } from 'react'
import { Pencil, X } from 'lucide-react'
import { PROFILE_COLORS } from '@shared/constants'
import { useSessionsStore } from '@/stores/useSessionsStore'
import type { SessionStatus } from '@shared/types'

/** Folder name, for a session nobody has named yet. */
function folderName(cwd: string): string {
  const parts = cwd.split('/').filter(Boolean)
  return parts[parts.length - 1] ?? 'Session'
}

/**
 * A tab shows what its agent is doing, because the sidebar no longer lists live
 * sessions — this is the only place a background agent can ask for you.
 */
function statusOf(status: SessionStatus): { tone: string; label: string; pulse: boolean } | null {
  switch (status.kind) {
    case 'waiting-permission':
      return { tone: '#f59e0b', label: 'Needs your approval', pulse: true }
    case 'thinking':
    case 'running-tool':
      return { tone: '#4ade80', label: 'Working', pulse: true }
    case 'error':
      return { tone: '#f87171', label: 'Stopped with an error', pulse: false }
    default:
      return null
  }
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

/**
 * One tab is one session. Nothing groups them: a tab can be any folder on any
 * branch, exactly like terminal tabs. Closing a tab moves the session to
 * History, where it can be reopened.
 */
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

  // Oldest first, so a new tab lands on the right and tabs never reshuffle
  // under the pointer as sessions become active.
  const open = order
    .filter((id) => sessions[id] && !sessions[id].meta.archived)
    .sort((a, b) => sessions[a].meta.createdAt - sessions[b].meta.createdAt)

  if (open.length === 0) {
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
    const name = entry.meta.title || folderName(entry.meta.cwd)
    const hasContent = entry.blocks.length > 0 || entry.meta.stats.turns > 0
    const warning = busy
      ? `"${name}" is still working. Close it anyway?`
      : hasContent
        ? `Close "${name}"? It moves to History, so you can reopen it later.`
        : null
    if (warning && !window.confirm(warning)) {
      return
    }
    // Land on the tab to the left (or the right, when closing the first one) so
    // closing never drops you out of the app entirely.
    const position = open.indexOf(id)
    const neighbour = open[position - 1] ?? open[position + 1]
    void archive(id).then(() => {
      if (neighbour) {
        setActive(neighbour)
      }
    })
  }

  return (
    <div className="flex h-8 shrink-0 items-stretch overflow-x-auto border-b border-deck-border bg-deck-panel">
      {open.map((id) => {
        const { meta } = sessions[id]
        const active = id === sessionId
        const status = statusOf(meta.status)
        return (
          <div
            key={id}
            onClick={() => setActive(id)}
            onDoubleClick={() => {
              setRenamingId(id)
              setDraft(meta.title)
            }}
            title={
              renamingId === id
                ? undefined
                : `${meta.title || folderName(meta.cwd)} — ${meta.cwd.replace(/^\/Users\/[^/]+/, '~')}${
                    status ? ` · ${status.label}` : ''
                  }`
            }
            className={`group relative flex max-w-[220px] shrink-0 cursor-pointer items-center gap-1.5 border-r border-deck-border px-3 text-[12px] ${
              active ? 'bg-deck-bg text-zinc-100' : 'text-zinc-500 hover:bg-deck-bg/50 hover:text-zinc-300'
            }`}
          >
            {/* One circle, two jobs: it reports status when there is any, shows the
                colour tag otherwise, and opens the tag picker either way. */}
            <button
              title={status ? status.label : 'Colour-code this tab'}
              onClick={(e) => {
                e.stopPropagation()
                setColorMenuId(colorMenuId === id ? null : id)
              }}
              className={`flex h-3 w-3 shrink-0 items-center justify-center ${
                meta.color || status ? '' : 'opacity-0 group-hover:opacity-100'
              }`}
            >
              <span
                className={`h-2.5 w-2.5 rounded-full ${status?.pulse ? 'status-pulse' : ''} ${
                  meta.color || status ? '' : 'border border-zinc-600 hover:border-zinc-300'
                }`}
                style={{ backgroundColor: status?.tone ?? meta.color }}
              />
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
              <span className="truncate">{meta.title || folderName(meta.cwd)}</span>
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

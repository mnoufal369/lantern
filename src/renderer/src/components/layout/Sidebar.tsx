import { useEffect, useRef, useState } from 'react'
import { CircleStop, History, Pencil, Pin, PinOff, Plus, RotateCcw, Search, Trash2, X } from 'lucide-react'
import { useSessionsStore } from '@/stores/useSessionsStore'
import { useProfilesStore } from '@/stores/useProfilesStore'
import { APP_NAME, PROFILE_COLORS } from '@shared/constants'
import type { SessionStatus } from '@shared/types'

/** Folder name, for a session nobody has named. */
function folderName(cwd: string): string {
  const parts = cwd.split('/').filter(Boolean)
  return parts[parts.length - 1] ?? 'Session'
}

function shortPath(cwd: string): string {
  return cwd.replace(/^\/Users\/[^/]+/, '~')
}

/** What the dot says. Null when the session is simply sitting there. */
function statusOf(status: SessionStatus): { tone: string; label: string; pulse: boolean } | null {
  switch (status.kind) {
    case 'waiting-permission':
      return { tone: '#f59e0b', label: 'Needs your approval', pulse: true }
    case 'thinking':
      return { tone: '#4ade80', label: 'Thinking', pulse: true }
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
      className="menu-in absolute left-5 top-6 z-40 w-[132px] rounded-md border border-deck-border bg-deck-panel p-2 shadow-[0_10px_32px_rgba(0,0,0,0.4)]"
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
 * The single list of sessions. A session and a tab are the same thing, and this
 * is where they live — pinned first, then open, then the ones you have closed.
 * There is no second surface: whatever you are looking at is a row here.
 */
export default function Sidebar({
  onNewSession,
  onOpenHistory
}: {
  onNewSession: () => void
  onOpenHistory: () => void
}): React.JSX.Element {
  const sessions = useSessionsStore((s) => s.sessions)
  const order = useSessionsStore((s) => s.order)
  const activeId = useSessionsStore((s) => s.activeId)
  const setActive = useSessionsStore((s) => s.setActive)
  const interrupt = useSessionsStore((s) => s.interrupt)
  const archive = useSessionsStore((s) => s.archive)
  const reopen = useSessionsStore((s) => s.reopen)
  const deleteSession = useSessionsStore((s) => s.deleteSession)
  const rename = useSessionsStore((s) => s.rename)
  const setColor = useSessionsStore((s) => s.setColor)
  const setPinned = useSessionsStore((s) => s.setPinned)
  const profiles = useProfilesStore((s) => s.profiles)
  const [search, setSearch] = useState('')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [colorMenuId, setColorMenuId] = useState<string | null>(null)
  const [version, setVersion] = useState('')

  useEffect(() => {
    void window.api
      .invoke('app:getVersion')
      .then(setVersion)
      .catch(() => undefined)
  }, [])

  const needle = search.trim().toLowerCase()
  const matches = (id: string): boolean => {
    const entry = sessions[id]
    if (!entry) {
      return false
    }
    if (needle === '') {
      return true
    }
    return entry.meta.title.toLowerCase().includes(needle) || entry.meta.cwd.toLowerCase().includes(needle)
  }

  const all = order.filter(matches)
  // Stable ordering where you click a lot, recency where you browse.
  const byCreated = (a: string, b: string): number => sessions[a].meta.createdAt - sessions[b].meta.createdAt
  const pinned = all.filter((id) => sessions[id].meta.pinned).sort(byCreated)
  const open = all
    .filter((id) => !sessions[id].meta.pinned && (!sessions[id].meta.archived || id === activeId))
    .sort(byCreated)
  // Closed sessions are not shown here: they belong to History. A pinned one
  // still appears, because pinning means "keep this in front of me".
  const closedCount = order.filter((id) => sessions[id].meta.archived && !sessions[id].meta.pinned).length

  const commitRename = (id: string): void => {
    if (renameDraft.trim()) {
      void rename(id, renameDraft.trim())
    }
    setRenamingId(null)
  }

  const openSession = (id: string): void => {
    if (sessions[id].meta.archived) {
      void reopen(id)
    } else {
      setActive(id)
    }
  }

  const closeSession = (id: string): void => {
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
        ? `Close "${name}"? It stays in the list under Closed, so you can reopen it later.`
        : null
    if (warning && !window.confirm(warning)) {
      return
    }
    // From the whole list, not the search-filtered one, and never a closed
    // session — landing on one would silently reopen it.
    const siblings = order.filter(
      (other) => other !== id && !sessions[other].meta.archived
    )
    void archive(id).then(() => {
      if (id === activeId && siblings.length > 0) {
        setActive(siblings[siblings.length - 1])
      }
    })
  }

  const row = (id: string): React.JSX.Element => {
    const { meta } = sessions[id]
    const profile = profiles.find((p) => p.id === meta.profileId)
    const active = id === activeId
    const status = statusOf(meta.status)
    const isClosed = meta.archived
    const busy = meta.status.kind === 'thinking' || meta.status.kind === 'running-tool'
    return (
      <div
        key={id}
        onClick={() => openSession(id)}
        onDoubleClick={() => {
          setRenamingId(id)
          setRenameDraft(meta.title)
        }}
        title={`${meta.title || folderName(meta.cwd)} — ${shortPath(meta.cwd)}${status ? ` · ${status.label}` : ''}`}
        className={`group relative flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 ${
          active ? 'bg-deck-raised' : 'hover:bg-deck-raised/60'
        } ${isClosed ? 'opacity-70 hover:opacity-100' : ''}`}
      >
        <button
          title={status ? status.label : 'Colour-code this session'}
          onClick={(e) => {
            e.stopPropagation()
            setColorMenuId(colorMenuId === id ? null : id)
          }}
          className="flex h-3 w-3 shrink-0 items-center justify-center"
        >
          <span
            className={`h-2.5 w-2.5 rounded-full ${status?.pulse ? 'status-pulse' : ''}`}
            style={{ backgroundColor: status?.tone ?? meta.color ?? profile?.color ?? '#52525b' }}
          />
        </button>

        <span className="min-w-0 flex-1">
          {renamingId === id ? (
            <input
              autoFocus
              value={renameDraft}
              onChange={(e) => setRenameDraft(e.target.value)}
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
              className="selectable w-full rounded border border-deck-border bg-deck-panel px-1 text-[12.5px] text-zinc-100 outline-none"
            />
          ) : (
            <span
              className={`block truncate text-[12.5px] ${
                active ? 'font-medium text-zinc-100' : isClosed ? 'text-zinc-400' : 'text-zinc-200'
              }`}
            >
              {meta.title || folderName(meta.cwd)}
            </span>
          )}
          <span className="block truncate text-[10.5px] text-zinc-600">
            {status && !isClosed ? (
              <span style={{ color: profile?.color ?? '#8aa3ae' }}>{status.label}</span>
            ) : (
              shortPath(meta.cwd)
            )}
          </span>
        </span>

        <span className="hidden shrink-0 items-center gap-1.5 group-hover:flex">
          {busy && (
            <button
              title="Interrupt"
              onClick={(e) => {
                e.stopPropagation()
                void interrupt(id)
              }}
              className="text-zinc-500 hover:text-red-400"
            >
              <CircleStop size={12} />
            </button>
          )}
          <button
            title={meta.pinned ? 'Unpin' : 'Pin to the top'}
            onClick={(e) => {
              e.stopPropagation()
              void setPinned(id, !meta.pinned)
            }}
            className="text-zinc-500 hover:text-zinc-200"
          >
            {meta.pinned ? <PinOff size={12} /> : <Pin size={12} />}
          </button>
          <button
            title="Rename"
            onClick={(e) => {
              e.stopPropagation()
              setRenamingId(id)
              setRenameDraft(meta.title)
            }}
            className="text-zinc-500 hover:text-zinc-200"
          >
            <Pencil size={12} />
          </button>
          {isClosed ? (
            <>
              <button
                title="Reopen"
                onClick={(e) => {
                  e.stopPropagation()
                  void reopen(id)
                }}
                className="text-zinc-500 hover:text-zinc-200"
              >
                <RotateCcw size={12} />
              </button>
              <button
                title="Delete permanently (removes transcript and fetched workspace)"
                onClick={(e) => {
                  e.stopPropagation()
                  if (
                    window.confirm(
                      `Delete "${meta.title || 'this session'}" permanently? The transcript is removed too, and this cannot be undone.`
                    )
                  ) {
                    void deleteSession(id)
                  }
                }}
                className="text-zinc-500 hover:text-red-400"
              >
                <Trash2 size={12} />
              </button>
            </>
          ) : (
            <button
              title="Close"
              onClick={(e) => {
                e.stopPropagation()
                closeSession(id)
              }}
              className="text-zinc-500 hover:text-zinc-200"
            >
              <X size={12} />
            </button>
          )}
        </span>

        {/* Pinned rows keep a visible marker once the hover actions are gone. */}
        {meta.pinned && (
          <Pin size={10} className="shrink-0 text-zinc-600 group-hover:hidden" />
        )}

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
  }

  const group = (label: string, ids: string[]): React.JSX.Element | null =>
    ids.length === 0 ? null : (
      <div className="mb-1">
        <p className="px-2 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-[0.07em] text-zinc-600">
          {label}
        </p>
        {ids.map(row)}
      </div>
    )

  return (
    <aside className="flex w-[260px] shrink-0 flex-col border-r border-deck-border bg-deck-panel">
      <div className="flex h-9 shrink-0 items-center gap-1.5 border-b border-deck-border px-3">
        <Search size={12} className="shrink-0 text-zinc-600" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search sessions…"
          className="selectable w-full bg-transparent text-xs text-zinc-200 outline-none placeholder:text-zinc-600"
        />
      </div>

      <div className="flex-1 overflow-y-auto px-1.5 pb-2">
        {pinned.length === 0 && open.length === 0 && (
          <p className="px-2 py-4 text-xs leading-relaxed text-zinc-500">
            {search
              ? 'Nothing open matches. Closed sessions live in History.'
              : 'Nothing open. Start one with ⌘T, or reopen an earlier one from History.'}
          </p>
        )}
        {group('Pinned', pinned)}
        {group('Open', open)}
        {closedCount > 0 && (
          <button
            onClick={onOpenHistory}
            className="mt-2 flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] text-zinc-600 hover:bg-deck-raised hover:text-zinc-400"
          >
            <History size={11} />
            {closedCount} closed {closedCount === 1 ? 'session' : 'sessions'} in History
          </button>
        )}
      </div>

      <p className="shrink-0 px-3 pb-1 text-[11px] text-zinc-600">
        {APP_NAME}
        {version && ` v${version}`}
      </p>
      <div className="flex h-9 shrink-0 items-center gap-1 border-t border-deck-border px-1.5">
        <button
          onClick={onNewSession}
          title="New session (⌘T)"
          className="flex flex-1 items-center gap-1.5 rounded-md px-1.5 py-1 text-xs text-zinc-400 hover:bg-deck-raised hover:text-zinc-200"
        >
          <Plus size={13} /> New session
        </button>
        <button
          onClick={onOpenHistory}
          title="History: sessions you closed, and your terminal Claude Code conversations"
          className="flex h-6 w-6 items-center justify-center rounded-md text-zinc-500 hover:bg-deck-raised hover:text-zinc-300"
        >
          <History size={13} />
        </button>
      </div>
    </aside>
  )
}

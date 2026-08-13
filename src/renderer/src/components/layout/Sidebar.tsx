import { useEffect, useState } from 'react'
import { Plus, Archive, ArchiveRestore, ChevronDown, ChevronRight, CircleStop, History, Search, Trash2 } from 'lucide-react'
import { useSessionsStore } from '@/stores/useSessionsStore'
import { useProfilesStore } from '@/stores/useProfilesStore'
import { formatTokens } from '@/lib/format'
import type { SessionStatus } from '@shared/types'
import { APP_NAME } from '@shared/constants'

function statusLabel(status: SessionStatus): string {
  switch (status.kind) {
    case 'idle':
      return 'Idle'
    case 'thinking':
      return 'Thinking…'
    case 'running-tool':
      return `Running ${status.toolName}`
    case 'waiting-permission':
      return 'Needs permission'
    case 'done':
      return 'Done'
    case 'error':
      return 'Error'
  }
}

/** The agent's colour, worn as a Finder-style tag chip rather than a hairline. */
function AgentChip({ color, name, status }: { color: string; name: string; status: SessionStatus }): React.JSX.Element {
  const busy = status.kind === 'thinking' || status.kind === 'running-tool'
  return (
    <span className="relative shrink-0">
      <span
        className="flex h-[18px] w-[18px] items-center justify-center rounded-[5px] text-[10px] font-bold text-black/70"
        style={{ backgroundColor: color }}
      >
        {name.slice(0, 1).toUpperCase() || '?'}
      </span>
      {(busy || status.kind === 'waiting-permission' || status.kind === 'error') && (
        <span
          className={`absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full ring-2 ring-deck-panel ${
            busy ? 'status-pulse' : ''
          } ${
            status.kind === 'error'
              ? 'bg-red-500'
              : status.kind === 'waiting-permission'
                ? 'bg-amber-500'
                : 'bg-deck-accent'
          }`}
        />
      )}
    </span>
  )
}

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
  const profiles = useProfilesStore((s) => s.profiles)
  const [search, setSearch] = useState('')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [archivedOpen, setArchivedOpen] = useState(false)
  const [version, setVersion] = useState('')

  useEffect(() => {
    void window.api.invoke('app:getVersion').then(setVersion).catch(() => undefined)
  }, [])

  const matchesSearch = (id: string): boolean => {
    if (search.trim() === '') {
      return true
    }
    const meta = sessions[id].meta
    const needle = search.toLowerCase()
    return meta.title.toLowerCase().includes(needle) || meta.cwd.toLowerCase().includes(needle)
  }

  const visible = order.filter((id) => !sessions[id].meta.archived && matchesSearch(id))
  const archived = order.filter((id) => sessions[id].meta.archived && matchesSearch(id))

  const commitRename = (id: string): void => {
    if (renameDraft.trim()) {
      void rename(id, renameDraft.trim())
    }
    setRenamingId(null)
  }

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

      <div className="flex-1 overflow-y-auto px-1.5 py-1.5">
        {visible.length === 0 && (
          <p className="px-2 py-4 text-xs text-zinc-500">
            {search ? 'No sessions match.' : 'No sessions yet. Start one with ⌘N.'}
          </p>
        )}
        {visible.map((id) => {
          const { meta } = sessions[id]
          const profile = profiles.find((p) => p.id === meta.profileId)
          const active = id === activeId
          const busyWorking = meta.status.kind === 'thinking' || meta.status.kind === 'running-tool'
          const busy = busyWorking || meta.status.kind === 'waiting-permission'
          return (
            <div
              key={id}
              onClick={() => setActive(id)}
              className={`group cursor-pointer rounded-md px-2 py-1.5 ${
                active
                  ? 'bg-deck-bg ring-1 ring-inset ring-deck-border'
                  : 'hover:bg-deck-bg/50'
              }`}
            >
              <div className="flex items-center gap-2">
                <AgentChip color={profile?.color ?? '#7e9cbf'} name={profile?.name ?? '?'} status={meta.status} />
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
                    className="selectable w-full rounded border border-deck-border bg-deck-panel px-1 text-[13px] text-zinc-100 outline-none"
                  />
                ) : (
                  <span
                    onDoubleClick={(e) => {
                      e.stopPropagation()
                      setRenamingId(id)
                      setRenameDraft(meta.title)
                    }}
                    title="Double-click to rename"
                    className={`truncate text-[13px] font-medium ${active ? 'text-zinc-100' : 'text-zinc-200'}`}
                  >
                    {meta.title || 'New session'}
                  </span>
                )}
                <div className="ml-auto hidden shrink-0 gap-1 group-hover:flex">
                  {busy && (
                    <button
                      title="Interrupt"
                      onClick={(e) => {
                        e.stopPropagation()
                        void interrupt(id)
                      }}
                      className="text-zinc-500 hover:text-red-400"
                    >
                      <CircleStop size={13} />
                    </button>
                  )}
                  <button
                    title="Archive"
                    onClick={(e) => {
                      e.stopPropagation()
                      void archive(id)
                    }}
                    className="text-zinc-500 hover:text-zinc-300"
                  >
                    <Archive size={13} />
                  </button>
                </div>
              </div>
              <p className="mt-0.5 truncate pl-[26px] text-[11px] text-zinc-500">
                {meta.cwd.replace(/^\/Users\/[^/]+/, '~')}
              </p>
              <div className="flex items-center justify-between pl-[26px] text-[11px]">
                {busyWorking ? (
                  <span
                    className="shimmer-text font-medium"
                    style={{ '--shimmer-color': profile?.color ?? '#7e9cbf' } as React.CSSProperties}
                  >
                    {statusLabel(meta.status)}
                  </span>
                ) : (
                  <span
                    className={
                      meta.status.kind === 'waiting-permission'
                        ? 'font-medium text-amber-500'
                        : meta.status.kind === 'error'
                          ? 'text-red-400'
                          : 'text-zinc-500'
                    }
                  >
                    {statusLabel(meta.status)}
                  </span>
                )}
                <span className="tabular-nums text-zinc-500">
                  ${meta.stats.totalCostUsd.toFixed(2)} · {formatTokens(meta.stats.inputTokens + meta.stats.outputTokens)}
                </span>
              </div>
            </div>
          )
        })}

        {archived.length > 0 && (
          <div className="mt-3">
            <button
              onClick={() => setArchivedOpen(!archivedOpen)}
              className="flex w-full items-center gap-1 px-1.5 py-1 text-[11px] font-semibold text-zinc-600 hover:text-zinc-400"
            >
              {archivedOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
              Archived
              <span className="font-normal text-zinc-600">({archived.length})</span>
            </button>
            {archivedOpen &&
              archived.map((id) => {
                const { meta } = sessions[id]
                const profile = profiles.find((p) => p.id === meta.profileId)
                return (
                  <div
                    key={id}
                    className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-deck-raised"
                  >
                    <span
                      className="h-[18px] w-[18px] shrink-0 rounded-[5px] opacity-40"
                      style={{ backgroundColor: profile?.color ?? '#7e9cbf' }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] text-zinc-500">{meta.title || 'New session'}</span>
                      <span className="block truncate text-[10.5px] text-zinc-600">
                        {meta.cwd.replace(/^\/Users\/[^/]+/, '~')}
                      </span>
                    </span>
                    <button
                      title="Restore session"
                      onClick={() => void reopen(id)}
                      className="hidden shrink-0 text-zinc-500 hover:text-zinc-200 group-hover:block"
                    >
                      <ArchiveRestore size={13} />
                    </button>
                    <button
                      title="Delete permanently (removes transcript and fetched workspace)"
                      onClick={() => {
                        if (
                          window.confirm(
                            `Delete "${meta.title || 'this session'}" permanently? The transcript is removed too, and this cannot be undone.`
                          )
                        ) {
                          void deleteSession(id)
                        }
                      }}
                      className="hidden shrink-0 text-zinc-500 hover:text-red-400 group-hover:block"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                )
              })}
          </div>
        )}
      </div>

      <p className="shrink-0 px-3 pb-1 text-[11px] text-zinc-600">
        {APP_NAME}
        {version && ` v${version}`}
      </p>
      <div className="flex h-9 shrink-0 items-center gap-1 border-t border-deck-border px-1.5">
        <button
          onClick={onNewSession}
          title="New session (⌘N)"
          className="flex flex-1 items-center gap-1.5 rounded-md px-1.5 py-1 text-xs text-zinc-400 hover:bg-deck-raised hover:text-zinc-200"
        >
          <Plus size={13} /> New session
        </button>
        <button
          onClick={onOpenHistory}
          title="Continue a terminal Claude Code conversation — browse, or paste a session ID"
          className="flex h-6 w-6 items-center justify-center rounded-md text-zinc-500 hover:bg-deck-raised hover:text-zinc-300"
        >
          <History size={13} />
        </button>
      </div>
    </aside>
  )
}


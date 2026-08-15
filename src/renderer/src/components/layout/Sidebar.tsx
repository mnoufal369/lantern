import { useEffect, useState } from 'react'
import { Plus, History, RotateCcw, Search, Trash2 } from 'lucide-react'
import { useSessionsStore } from '@/stores/useSessionsStore'
import { useProfilesStore } from '@/stores/useProfilesStore'
import { APP_NAME } from '@shared/constants'

function ago(ms: number): string {
  const days = Math.floor((Date.now() - ms) / 86_400_000)
  if (days === 0) {
    return 'today'
  }
  if (days === 1) {
    return 'yesterday'
  }
  if (days < 30) {
    return `${days}d ago`
  }
  return new Date(ms).toLocaleDateString()
}

/**
 * History: the sessions you have closed, and the way back into one.
 *
 * Live sessions are not listed here — they are the tabs. Keeping both surfaces
 * meant two competing answers to "what am I looking at", so this side owns the
 * past and the tab strip owns the present.
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
  const reopen = useSessionsStore((s) => s.reopen)
  const deleteSession = useSessionsStore((s) => s.deleteSession)
  const profiles = useProfilesStore((s) => s.profiles)
  const [search, setSearch] = useState('')
  const [version, setVersion] = useState('')

  useEffect(() => {
    void window.api
      .invoke('app:getVersion')
      .then(setVersion)
      .catch(() => undefined)
  }, [])

  const needle = search.trim().toLowerCase()
  const closed = order.filter((id) => {
    const entry = sessions[id]
    if (!entry || !entry.meta.archived) {
      return false
    }
    if (needle === '') {
      return true
    }
    return (
      entry.meta.title.toLowerCase().includes(needle) || entry.meta.cwd.toLowerCase().includes(needle)
    )
  })

  return (
    <aside className="flex w-[260px] shrink-0 flex-col border-r border-deck-border bg-deck-panel">
      <div className="flex h-9 shrink-0 items-center gap-1.5 border-b border-deck-border px-3">
        <Search size={12} className="shrink-0 text-zinc-600" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search history…"
          className="selectable w-full bg-transparent text-xs text-zinc-200 outline-none placeholder:text-zinc-600"
        />
      </div>

      <p className="shrink-0 px-3 pt-2 text-[10.5px] font-semibold uppercase tracking-[0.07em] text-zinc-600">
        History
      </p>

      <div className="flex-1 overflow-y-auto px-1.5 py-1.5">
        {closed.length === 0 && (
          <p className="px-2 py-4 text-xs leading-relaxed text-zinc-500">
            {search
              ? 'Nothing in history matches.'
              : 'Sessions you close land here, and you can reopen them any time.'}
          </p>
        )}
        {closed.map((id) => {
          const { meta } = sessions[id]
          const profile = profiles.find((p) => p.id === meta.profileId)
          return (
            <div
              key={id}
              onDoubleClick={() => void reopen(id)}
              title="Double-click to reopen in a tab"
              className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-deck-raised"
            >
              <span
                className="h-[18px] w-[18px] shrink-0 rounded-[5px] opacity-45"
                style={{ backgroundColor: meta.color ?? profile?.color ?? '#7e9cbf' }}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] text-zinc-400">
                  {meta.title || 'Untitled session'}
                </span>
                <span className="flex items-center gap-1.5 text-[10.5px] text-zinc-600">
                  <span className="truncate">{meta.cwd.replace(/^\/Users\/[^/]+/, '~')}</span>
                  <span className="shrink-0">· {ago(meta.lastActiveAt)}</span>
                </span>
              </span>
              <button
                title="Reopen in a tab"
                onClick={() => void reopen(id)}
                className="hidden shrink-0 text-zinc-500 hover:text-zinc-200 group-hover:block"
              >
                <RotateCcw size={13} />
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
          title="Continue a terminal Claude Code conversation — browse, or paste a session ID"
          className="flex h-6 w-6 items-center justify-center rounded-md text-zinc-500 hover:bg-deck-raised hover:text-zinc-300"
        >
          <History size={13} />
        </button>
      </div>
    </aside>
  )
}

import { useEffect, useState } from 'react'
import { GitBranch, Hash, Loader2, RotateCcw, Search, TerminalSquare } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { useSessionsStore } from '@/stores/useSessionsStore'
import { extractSessionId } from '@shared/sessionId'
import { APP_NAME } from '@shared/constants'
import type { ClaudeHistoryItem } from '@shared/types'

function timeAgo(ms: number): string {
  const days = Math.floor((Date.now() - ms) / 86_400_000)
  if (days === 0) {
    return 'today'
  }
  if (days === 1) {
    return 'yesterday'
  }
  if (days < 30) {
    return `${days} days ago`
  }
  return new Date(ms).toLocaleDateString()
}

const shortPath = (cwd: string): string => cwd.replace(/^\/Users\/[^/]+/, '~')

export default function TerminalHistoryModal({ onClose }: { onClose: () => void }): React.JSX.Element {
  const [items, setItems] = useState<ClaudeHistoryItem[] | null>(null)
  const [search, setSearch] = useState('')
  const [importing, setImporting] = useState<string | null>(null)
  const [error, setError] = useState('')
  // Result of resolving a pasted id: `item: null` means the store has no such session.
  const [byId, setById] = useState<{ id: string; item: ClaudeHistoryItem | null } | null>(null)
  const sessions = useSessionsStore((s) => s.sessions)
  const reopen = useSessionsStore((s) => s.reopen)

  const pastedId = extractSessionId(search)
  const found = byId?.item ?? null
  const alreadyOpen = pastedId
    ? Object.values(sessions).find((s) => s.meta.sdkSessionId === pastedId)
    : undefined

  useEffect(() => {
    void window.api
      .invoke('history:list')
      .then(setItems)
      .catch(() => setItems([]))
  }, [])

  // An id reaches sessions far older than the listing covers, so it is looked
  // up on its own rather than filtered out of `items`.
  useEffect(() => {
    if (!pastedId || alreadyOpen) {
      setById(null)
      return
    }
    let live = true
    setById(null)
    const timer = setTimeout(() => {
      void window.api
        .invoke('history:find', { sdkSessionId: pastedId })
        .then((item) => live && setById({ id: pastedId, item }))
        .catch(() => live && setById({ id: pastedId, item: null }))
    }, 150)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [pastedId, alreadyOpen])

  const openItem = async (item: ClaudeHistoryItem): Promise<void> => {
    setImporting(item.sdkSessionId)
    setError('')
    try {
      const meta = await window.api.invoke('history:import', { sdkSessionId: item.sdkSessionId })
      useSessionsStore.setState((state) => ({
        sessions: { ...state.sessions, [meta.id]: { meta, blocks: [], historyLoaded: false } },
        order: [meta.id, ...state.order],
        activeId: null
      }))
      useSessionsStore.getState().setActive(meta.id)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': Error: /, '') : 'Import failed')
      setImporting(null)
    }
  }

  const needle = search.trim().toLowerCase()
  const closed = Object.values(sessions)
    // Pinned ones stay visible in the panel; listing them here too would put
    // the same session in two places.
    .filter((s) => s.meta.archived && !s.meta.pinned)
    .filter(
      (s) => s.meta.title.toLowerCase().includes(needle) || s.meta.cwd.toLowerCase().includes(needle)
    )
    .sort((a, b) => b.meta.lastActiveAt - a.meta.lastActiveAt)

  const visible = items?.filter(
    (item) => item.title.toLowerCase().includes(needle) || item.cwd.toLowerCase().includes(needle)
  )

  return (
    <Modal title="History" onClose={onClose} wide>
      <div className="space-y-3">
        <div className="flex items-center gap-2 rounded-lg border border-deck-border bg-deck-raised px-3 py-2">
          <Search size={13} className="shrink-0 text-zinc-500" />
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title or folder — or paste a session ID…"
            className="selectable w-full bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-600"
          />
        </div>

        <p className="text-[11px] text-zinc-600">
          Everything you are not currently working on: sessions you closed in {APP_NAME}, and the conversations you
          ran with <span className="font-mono">claude</span> in a terminal — same store, same account. Opening one
          puts it back in the list on the left. Older than this reaches? Paste its ID above.
        </p>

        {error && <p className="text-xs text-red-400">{error}</p>}

        {pastedId && (
          <div className="rounded-lg border border-deck-border bg-deck-panel p-3">
            {alreadyOpen ? (
              <div className="flex items-center gap-3">
                <Hash size={14} className="shrink-0 text-zinc-500" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] text-zinc-200">{alreadyOpen.meta.title}</span>
                  <span className="text-[11px] text-zinc-500">
                    {alreadyOpen.meta.archived ? 'Closed in Lantern — reopen it.' : 'Already open in Lantern.'}
                  </span>
                </span>
                <button
                  onClick={() => {
                    if (alreadyOpen.meta.archived) {
                      void reopen(alreadyOpen.meta.id)
                    } else {
                      useSessionsStore.getState().setActive(alreadyOpen.meta.id)
                    }
                    onClose()
                  }}
                  className="btn-brand shrink-0 rounded-md px-3 py-1.5 text-xs font-medium"
                >
                  {alreadyOpen.meta.archived ? 'Reopen' : 'Switch to it'}
                </button>
              </div>
            ) : byId === null ? (
              <p className="flex items-center gap-2 text-xs text-zinc-500">
                <Loader2 size={13} className="animate-spin" /> Looking up{' '}
                <span className="font-mono">{pastedId.slice(0, 8)}…</span>
              </p>
            ) : found ? (
              <div className="flex items-center gap-3">
                <Hash size={14} className="shrink-0 text-zinc-500" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-zinc-200">{found.title}</span>
                  <span className="mt-0.5 flex items-center gap-2 text-[11px] text-zinc-500">
                    <span className="truncate font-mono">{shortPath(found.cwd)}</span>
                    {found.gitBranch && (
                      <span className="flex shrink-0 items-center gap-0.5">
                        <GitBranch size={10} />
                        {found.gitBranch}
                      </span>
                    )}
                    <span className="shrink-0">{timeAgo(found.lastModified)}</span>
                  </span>
                </span>
                <button
                  onClick={() => void openItem(found)}
                  disabled={importing !== null}
                  className="btn-brand shrink-0 rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                >
                  {importing === found.sdkSessionId ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    'Restore session'
                  )}
                </button>
              </div>
            ) : (
              <p className="text-xs text-zinc-500">
                No session with that ID in your Claude store. It may belong to another machine or account.
              </p>
            )}
          </div>
        )}

        <div className="max-h-96 space-y-1 overflow-y-auto">
          {!pastedId && closed.length > 0 && (
            <>
              <p className="px-1 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-[0.07em] text-zinc-600">
                Closed in {APP_NAME}
              </p>
              {closed.map(({ meta }) => (
                <button
                  key={meta.id}
                  onClick={() => {
                    void reopen(meta.id)
                    onClose()
                  }}
                  className="flex w-full items-start gap-3 rounded-lg border border-transparent px-3 py-2 text-left hover:border-deck-border hover:bg-deck-raised"
                >
                  <RotateCcw size={14} className="mt-0.5 shrink-0 text-zinc-500" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-zinc-200">
                      {meta.title || shortPath(meta.cwd).split('/').pop()}
                    </span>
                    <span className="mt-0.5 block truncate font-mono text-[11px] text-zinc-500">
                      {shortPath(meta.cwd)}
                    </span>
                  </span>
                  <span className="shrink-0 text-[11px] tabular-nums text-zinc-600">
                    {timeAgo(meta.lastActiveAt)}
                  </span>
                </button>
              ))}
              <p className="px-1 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.07em] text-zinc-600">
                From your terminal
              </p>
            </>
          )}
          {items === null && (
            <p className="flex items-center gap-2 py-6 text-sm text-zinc-500">
              <Loader2 size={14} className="animate-spin" /> Reading your Claude store…
            </p>
          )}
          {items !== null && visible?.length === 0 && !pastedId && (
            <p className="py-6 text-center text-sm text-zinc-500">
              {search ? 'Nothing matches.' : 'No past terminal sessions found on this machine.'}
            </p>
          )}
          {visible?.map((item) => (
            <button
              key={item.sdkSessionId}
              onClick={() => void openItem(item)}
              disabled={importing !== null}
              className="flex w-full items-start gap-3 rounded-lg border border-transparent px-3 py-2 text-left hover:border-deck-border hover:bg-deck-raised disabled:opacity-50"
            >
              <TerminalSquare size={15} className="mt-0.5 shrink-0 text-zinc-500" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-zinc-200">{item.title}</span>
                <span className="mt-0.5 flex items-center gap-2 text-[11px] text-zinc-500">
                  <span className="truncate font-mono">{shortPath(item.cwd)}</span>
                  {item.gitBranch && (
                    <span className="flex shrink-0 items-center gap-0.5">
                      <GitBranch size={10} />
                      {item.gitBranch}
                    </span>
                  )}
                </span>
              </span>
              <span className="shrink-0 text-[11px] tabular-nums text-zinc-600">
                {importing === item.sdkSessionId ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  timeAgo(item.lastModified)
                )}
              </span>
            </button>
          ))}
        </div>
      </div>
    </Modal>
  )
}

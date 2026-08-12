import { useEffect, useState } from 'react'
import { GitBranch, Loader2, Search, TerminalSquare } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { useSessionsStore } from '@/stores/useSessionsStore'
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

export default function TerminalHistoryModal({ onClose }: { onClose: () => void }): React.JSX.Element {
  const [items, setItems] = useState<ClaudeHistoryItem[] | null>(null)
  const [search, setSearch] = useState('')
  const [importing, setImporting] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    void window.api
      .invoke('history:list')
      .then(setItems)
      .catch(() => setItems([]))
  }, [])

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

  const needle = search.toLowerCase()
  const visible = items?.filter(
    (item) => item.title.toLowerCase().includes(needle) || item.cwd.toLowerCase().includes(needle)
  )

  return (
    <Modal title="Terminal history — your Claude Code conversations" onClose={onClose} wide>
      <div className="space-y-3">
        <div className="flex items-center gap-2 rounded-lg border border-deck-border bg-deck-raised px-3 py-2">
          <Search size={13} className="shrink-0 text-zinc-500" />
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title or project folder…"
            className="selectable w-full bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-600"
          />
        </div>

        <p className="text-[11px] text-zinc-600">
          These are the sessions you ran with <span className="font-mono">claude</span> in the terminal — same store,
          same account. Opening one imports the transcript and lets you continue the conversation here.
        </p>

        {error && <p className="text-xs text-red-400">{error}</p>}

        <div className="max-h-96 space-y-1 overflow-y-auto">
          {items === null && (
            <p className="flex items-center gap-2 py-6 text-sm text-zinc-500">
              <Loader2 size={14} className="animate-spin" /> Reading your Claude store…
            </p>
          )}
          {items !== null && visible?.length === 0 && (
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
                  <span className="truncate font-mono">{item.cwd.replace(/^\/Users\/[^/]+/, '~')}</span>
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

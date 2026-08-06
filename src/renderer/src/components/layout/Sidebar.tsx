import { Plus, Archive, CircleStop } from 'lucide-react'
import { useSessionsStore } from '@/stores/useSessionsStore'
import { useProfilesStore } from '@/stores/useProfilesStore'
import type { SessionStatus } from '@shared/types'

function statusLabel(status: SessionStatus): string {
  switch (status.kind) {
    case 'idle':
      return 'idle'
    case 'thinking':
      return 'thinking…'
    case 'running-tool':
      return `running ${status.toolName}`
    case 'waiting-permission':
      return 'needs permission'
    case 'done':
      return 'done'
    case 'error':
      return 'error'
  }
}

function StatusDot({ status, color }: { status: SessionStatus; color: string }): React.JSX.Element {
  const active = status.kind === 'thinking' || status.kind === 'running-tool'
  const waiting = status.kind === 'waiting-permission'
  return (
    <span
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${active ? 'status-pulse' : ''}`}
      style={{ backgroundColor: waiting ? '#f59e0b' : status.kind === 'error' ? '#ef4444' : color }}
    />
  )
}

export default function Sidebar({ onNewSession }: { onNewSession: () => void }): React.JSX.Element {
  const sessions = useSessionsStore((s) => s.sessions)
  const order = useSessionsStore((s) => s.order)
  const activeId = useSessionsStore((s) => s.activeId)
  const setActive = useSessionsStore((s) => s.setActive)
  const interrupt = useSessionsStore((s) => s.interrupt)
  const archive = useSessionsStore((s) => s.archive)
  const profiles = useProfilesStore((s) => s.profiles)

  const visible = order.filter((id) => !sessions[id].meta.archived)

  return (
    <aside className="flex w-[260px] shrink-0 flex-col border-r border-deck-border bg-deck-panel">
      <div className="flex-1 overflow-y-auto p-2">
        {visible.length === 0 && (
          <p className="px-2 py-4 text-xs text-zinc-500">No sessions yet. Start one with ⌘N.</p>
        )}
        {visible.map((id) => {
          const { meta } = sessions[id]
          const profile = profiles.find((p) => p.id === meta.profileId)
          const busy =
            meta.status.kind === 'thinking' ||
            meta.status.kind === 'running-tool' ||
            meta.status.kind === 'waiting-permission'
          return (
            <div
              key={id}
              onClick={() => setActive(id)}
              className={`group mb-1 cursor-pointer rounded-lg border px-3 py-2 ${
                id === activeId
                  ? 'border-deck-border bg-deck-raised'
                  : 'border-transparent hover:bg-deck-raised/60'
              }`}
            >
              <div className="flex items-center gap-2">
                <StatusDot status={meta.status} color={profile?.color ?? '#6366f1'} />
                <span className="truncate text-[13px] font-medium text-zinc-200">
                  {meta.title || 'New session'}
                </span>
                <div className="ml-auto hidden gap-1 group-hover:flex">
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
              <div className="mt-1 flex items-center justify-between text-[11px] text-zinc-500">
                <span className="truncate">{meta.cwd.replace(/^\/Users\/[^/]+/, '~')}</span>
              </div>
              <div className="mt-0.5 flex items-center justify-between text-[11px]">
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
                <span className="tabular-nums text-zinc-500">
                  ${meta.stats.totalCostUsd.toFixed(2)} · {formatTokens(meta.stats.inputTokens + meta.stats.outputTokens)}
                </span>
              </div>
            </div>
          )
        })}
      </div>
      <button
        onClick={onNewSession}
        className="m-2 flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-deck-border py-2 text-xs text-zinc-400 hover:bg-deck-raised hover:text-zinc-200"
      >
        <Plus size={13} /> New session
      </button>
    </aside>
  )
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(1)}M`
  }
  if (n >= 1_000) {
    return `${(n / 1_000).toFixed(1)}k`
  }
  return String(n)
}

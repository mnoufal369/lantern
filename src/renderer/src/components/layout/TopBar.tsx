import { Plus, Settings, Users } from 'lucide-react'
import LoodsMark from '@/components/ui/LoodsMark'
import { APP_NAME } from '@shared/constants'

interface Props {
  onNewSession: () => void
  onOpenSettings: () => void
  onOpenBuilder: () => void
}

export default function TopBar({ onNewSession, onOpenSettings, onOpenBuilder }: Props): React.JSX.Element {
  return (
    <header className="drag-region flex h-11 shrink-0 items-center justify-between border-b border-deck-border bg-deck-panel pl-20 pr-3">
      {/* Left of the buttons, clear of the traffic lights — the window's only branding. */}
      <div className="flex min-w-0 items-center gap-2">
        <LoodsMark size={17} />
        <span className="truncate text-[13.5px] font-semibold tracking-[-0.01em] text-zinc-200">{APP_NAME}</span>
      </div>
      <div className="no-drag flex shrink-0 items-center gap-1">
        <button
          onClick={onOpenBuilder}
          title="Agent profiles"
          className="flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-zinc-400 hover:bg-deck-raised hover:text-zinc-200"
        >
          <Users size={14} />
          Agents
        </button>
        <button
          onClick={onNewSession}
          title="New session (⌘N)"
          className="btn-brand flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium"
        >
          <Plus size={14} />
          New Session
        </button>
        <button
          onClick={onOpenSettings}
          title="Settings"
          className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 hover:bg-deck-raised hover:text-zinc-200"
        >
          <Settings size={14} />
        </button>
      </div>
    </header>
  )
}

import { Plus, Settings, Users } from 'lucide-react'

interface Props {
  onNewSession: () => void
  onOpenSettings: () => void
  onOpenBuilder: () => void
}

export default function TopBar({ onNewSession, onOpenSettings, onOpenBuilder }: Props): React.JSX.Element {
  return (
    <header className="drag-region flex h-11 shrink-0 items-center border-b border-deck-border bg-deck-panel pl-20 pr-3">
      <span className="text-[13px] font-semibold tracking-wide text-zinc-300">
        Pilot <span className="text-[10px] font-normal text-zinc-600">by Salesdock</span>
      </span>
      <div className="flex-1" />
      <div className="no-drag flex items-center gap-1">
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
          className="flex h-7 items-center gap-1.5 rounded-md bg-deck-accent/90 px-2.5 text-xs font-medium text-white hover:bg-deck-accent"
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

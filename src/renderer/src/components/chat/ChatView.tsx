import { useEffect, useRef } from 'react'
import { FolderGit2, Sparkles } from 'lucide-react'
import Transcript from './Transcript'
import Composer from './Composer'
import { useSessionsStore } from '@/stores/useSessionsStore'

export default function ChatView({ sessionId }: { sessionId: string }): React.JSX.Element {
  const entry = useSessionsStore((s) => s.sessions[sessionId])
  const scrollRef = useRef<HTMLDivElement>(null)
  const stickToBottom = useRef(true)
  const subagentCount = entry?.blocks.filter((b) => b.kind === 'tool' && b.toolName === 'Task').length ?? 0

  useEffect(() => {
    const el = scrollRef.current
    if (el && stickToBottom.current) {
      el.scrollTop = el.scrollHeight
    }
  }, [entry?.blocks])

  if (!entry) {
    return <div className="flex-1" />
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-3 border-b border-deck-border px-4 py-1.5 text-[11px] text-zinc-500">
        <span className="flex items-center gap-1 truncate">
          <FolderGit2 size={11} />
          <span className="truncate font-mono">{entry.meta.cwd.replace(/^\/Users\/[^/]+/, '~')}</span>
        </span>
        {subagentCount > 0 && (
          <span className="flex items-center gap-1 text-purple-400">
            <Sparkles size={11} />
            {subagentCount} subagent{subagentCount > 1 ? 's' : ''} used
          </span>
        )}
        <span className="ml-auto tabular-nums">
          {entry.meta.stats.turns} turn{entry.meta.stats.turns === 1 ? '' : 's'} · $
          {entry.meta.stats.totalCostUsd.toFixed(3)}
        </span>
      </div>
      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget
          stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60
        }}
        className="selectable min-h-0 flex-1 overflow-y-auto px-6 py-4"
      >
        <Transcript blocks={entry.blocks} />
        {entry.blocks.length === 0 && (
          <p className="mt-16 text-center text-sm text-zinc-500">
            Send a message to start the agent in{' '}
            <span className="font-mono text-zinc-400">{entry.meta.cwd}</span>
          </p>
        )}
      </div>
      <Composer sessionId={sessionId} status={entry.meta.status} />
    </div>
  )
}

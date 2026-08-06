import { useEffect, useRef, useState } from 'react'
import { Check, Download, FolderGit2, Sparkles } from 'lucide-react'
import Transcript from './Transcript'
import Composer from './Composer'
import BranchSwitcher from './BranchSwitcher'
import QuickActions from './QuickActions'
import { useSessionsStore } from '@/stores/useSessionsStore'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { transcriptToMarkdown } from '@/lib/exportMarkdown'

export default function ChatView({ sessionId }: { sessionId: string }): React.JSX.Element {
  const entry = useSessionsStore((s) => s.sessions[sessionId])
  const simple = useSettingsStore((s) => s.settings?.uiMode === 'simple')
  const scrollRef = useRef<HTMLDivElement>(null)
  const stickToBottom = useRef(true)
  const [exported, setExported] = useState(false)
  const [draft, setDraft] = useState<{ text: string; nonce: number } | null>(null)
  const subagentCount = entry?.blocks.filter((b) => b.kind === 'tool' && b.toolName === 'Task').length ?? 0

  const exportTranscript = async (): Promise<void> => {
    if (!entry) {
      return
    }
    const markdown = transcriptToMarkdown(entry.meta, entry.blocks)
    const saved = await window.api.invoke('sessions:exportTranscript', { sessionId, markdown })
    if (saved) {
      setExported(true)
      setTimeout(() => setExported(false), 2000)
    }
  }

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
        <BranchSwitcher key={sessionId} sessionId={sessionId} />
        {subagentCount > 0 && (
          <span className="flex items-center gap-1 text-purple-400">
            <Sparkles size={11} />
            {subagentCount} subagent{subagentCount > 1 ? 's' : ''} used
          </span>
        )}
        <span className="ml-auto tabular-nums">
          {simple
            ? `$${entry.meta.stats.totalCostUsd.toFixed(2)}`
            : `${entry.meta.stats.turns} turn${entry.meta.stats.turns === 1 ? '' : 's'} · $${entry.meta.stats.totalCostUsd.toFixed(3)}`}
        </span>
        <button
          onClick={() => void exportTranscript()}
          disabled={entry.blocks.length === 0}
          title="Export session as Markdown report"
          className="flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-deck-raised hover:text-zinc-300 disabled:opacity-30"
        >
          {exported ? <Check size={11} className="text-green-400" /> : <Download size={11} />}
          {exported ? 'Saved' : 'Export'}
        </button>
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
        {entry.blocks.length === 0 && <StarterPrompts sessionId={sessionId} cwd={entry.meta.cwd} />}
      </div>
      <QuickActions
        sessionId={sessionId}
        profileId={entry.meta.profileId}
        onPrefill={(text) => setDraft({ text, nonce: Date.now() })}
      />
      <Composer sessionId={sessionId} status={entry.meta.status} injectedDraft={draft} />
    </div>
  )
}

const STARTERS = [
  'Give me a tour of this project — what is it and how is it organized?',
  'Look for anything broken or risky here and propose fixes',
  'Write a clear README for this folder',
  'Build a simple, beautiful landing page in this folder'
]

function StarterPrompts({ sessionId, cwd }: { sessionId: string; cwd: string }): React.JSX.Element {
  const sendMessage = useSessionsStore((s) => s.sendMessage)
  return (
    <div className="mt-14 flex flex-col items-center gap-4">
      <p className="text-sm text-zinc-500">
        Your agent is ready in <span className="font-mono text-zinc-400">{cwd.replace(/^\/Users\/[^/]+/, '~')}</span>
      </p>
      <div className="flex max-w-lg flex-wrap justify-center gap-2">
        {STARTERS.map((prompt) => (
          <button
            key={prompt}
            onClick={() => void sendMessage(sessionId, prompt)}
            className="rounded-full border border-deck-border bg-deck-panel px-3.5 py-1.5 text-[12.5px] text-zinc-300 transition-colors hover:border-deck-accent/60 hover:bg-deck-accent/10 hover:text-zinc-100"
          >
            {prompt}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-zinc-600">…or type anything below. The agent asks before changing files.</p>
    </div>
  )
}

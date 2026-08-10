import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, ChevronUp, Copy, Download, FolderGit2, Search, Sparkles, X } from 'lucide-react'
import Transcript from './Transcript'
import Composer from './Composer'
import BranchSwitcher from './BranchSwitcher'
import QuickActions from './QuickActions'
import { useSessionsStore } from '@/stores/useSessionsStore'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { useProfilesStore } from '@/stores/useProfilesStore'
import { transcriptToMarkdown } from '@/lib/exportMarkdown'

export default function ChatView({ sessionId }: { sessionId: string }): React.JSX.Element {
  const entry = useSessionsStore((s) => s.sessions[sessionId])
  const simple = useSettingsStore((s) => s.settings?.uiMode === 'simple')
  const profile = useProfilesStore((s) => s.profiles.find((p) => p.id === entry?.meta.profileId))
  const scrollRef = useRef<HTMLDivElement>(null)
  const stickToBottom = useRef(true)
  const [exported, setExported] = useState(false)
  const [copied, setCopied] = useState(false)
  const [draft, setDraft] = useState<{ text: string; nonce: number } | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [matchIndex, setMatchIndex] = useState(0)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const subagentCount = entry?.blocks.filter((b) => b.kind === 'tool' && b.toolName === 'Task').length ?? 0

  const matches = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase()
    if (!searchOpen || needle === '' || !entry) {
      return []
    }
    return entry.blocks
      .filter(
        (b) =>
          ((b.kind === 'user' || b.kind === 'text' || b.kind === 'thinking') &&
            b.text.toLowerCase().includes(needle)) ||
          (b.kind === 'tool' && JSON.stringify(b.input ?? '').toLowerCase().includes(needle))
      )
      .map((b) => b.id)
  }, [entry, searchQuery, searchOpen])

  const activeMatch = matches.length > 0 ? matches[Math.min(matchIndex, matches.length - 1)] : null

  useEffect(() => {
    setMatchIndex(0)
  }, [searchQuery])

  useEffect(() => {
    if (activeMatch && scrollRef.current) {
      stickToBottom.current = false
      scrollRef.current.querySelector(`[data-block-id="${activeMatch}"]`)?.scrollIntoView({ block: 'center' })
    }
  }, [activeMatch])

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.metaKey && e.key === 'f') {
        e.preventDefault()
        setSearchOpen(true)
        setTimeout(() => searchInputRef.current?.focus(), 0)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const closeSearch = (): void => {
    setSearchOpen(false)
    setSearchQuery('')
    stickToBottom.current = true
  }

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

  const copyTranscript = async (): Promise<void> => {
    if (!entry) {
      return
    }
    await navigator.clipboard.writeText(transcriptToMarkdown(entry.meta, entry.blocks))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
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

  const budget = profile?.maxBudgetUsd
  const spent = entry.meta.stats.totalCostUsd
  const budgetRatio = budget && budget > 0 ? Math.min(1, spent / budget) : null

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
        <span className="ml-auto flex items-center gap-2 tabular-nums">
          {budgetRatio !== null && (
            <span
              className="flex items-center gap-1.5"
              title={`Budget: $${spent.toFixed(2)} of $${budget?.toFixed(2)} used`}
            >
              <span className="h-1.5 w-16 overflow-hidden rounded-full bg-deck-raised">
                <span
                  className={`block h-full rounded-full ${
                    budgetRatio > 0.9 ? 'bg-red-500' : budgetRatio > 0.75 ? 'bg-amber-500' : 'bg-deck-accent'
                  }`}
                  style={{ width: `${budgetRatio * 100}%` }}
                />
              </span>
              <span className={budgetRatio > 0.9 ? 'text-red-400' : undefined}>
                ${spent.toFixed(2)} / ${budget?.toFixed(0)}
              </span>
            </span>
          )}
          {budgetRatio === null &&
            (simple
              ? `$${spent.toFixed(2)}`
              : `${entry.meta.stats.turns} turn${entry.meta.stats.turns === 1 ? '' : 's'} · $${spent.toFixed(3)}`)}
        </span>
        <button
          onClick={() => {
            setSearchOpen(true)
            setTimeout(() => searchInputRef.current?.focus(), 0)
          }}
          title="Search this conversation (⌘F)"
          className="flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-deck-raised hover:text-zinc-300"
        >
          <Search size={11} />
        </button>
        <button
          onClick={() => void copyTranscript()}
          disabled={entry.blocks.length === 0}
          title="Copy the whole session as Markdown — paste it into a ticket or chat"
          className="flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-deck-raised hover:text-zinc-300 disabled:opacity-30"
        >
          {copied ? <Check size={11} className="text-green-400" /> : <Copy size={11} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
        <button
          onClick={() => void exportTranscript()}
          disabled={entry.blocks.length === 0}
          title="Export session as a Markdown report file"
          className="flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-deck-raised hover:text-zinc-300 disabled:opacity-30"
        >
          {exported ? <Check size={11} className="text-green-400" /> : <Download size={11} />}
          {exported ? 'Saved' : 'Export'}
        </button>
      </div>

      {searchOpen && (
        <div className="flex shrink-0 items-center gap-2 border-b border-deck-border bg-deck-panel px-4 py-1.5">
          <Search size={12} className="shrink-0 text-zinc-500" />
          <input
            ref={searchInputRef}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                closeSearch()
              }
              if (e.key === 'Enter' && matches.length > 0) {
                setMatchIndex((i) => (e.shiftKey ? (i - 1 + matches.length) % matches.length : (i + 1) % matches.length))
              }
            }}
            placeholder="Search in this conversation…"
            className="selectable w-64 bg-transparent text-xs text-zinc-100 outline-none placeholder:text-zinc-600"
          />
          <span className="text-[11px] tabular-nums text-zinc-500">
            {matches.length > 0 ? `${Math.min(matchIndex + 1, matches.length)}/${matches.length}` : searchQuery ? '0 results' : ''}
          </span>
          <button
            onClick={() => setMatchIndex((i) => (i - 1 + matches.length) % Math.max(1, matches.length))}
            disabled={matches.length === 0}
            title="Previous match (⇧⏎)"
            className="text-zinc-500 hover:text-zinc-200 disabled:opacity-30"
          >
            <ChevronUp size={13} />
          </button>
          <button
            onClick={() => setMatchIndex((i) => (i + 1) % Math.max(1, matches.length))}
            disabled={matches.length === 0}
            title="Next match (⏎)"
            className="text-zinc-500 hover:text-zinc-200 disabled:opacity-30"
          >
            <ChevronDown size={13} />
          </button>
          <button onClick={closeSearch} title="Close (esc)" className="text-zinc-500 hover:text-zinc-200">
            <X size={13} />
          </button>
        </div>
      )}

      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget
          stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60
        }}
        className="selectable min-h-0 flex-1 overflow-y-auto px-6 py-4"
      >
        <Transcript blocks={entry.blocks} highlightId={activeMatch} />
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

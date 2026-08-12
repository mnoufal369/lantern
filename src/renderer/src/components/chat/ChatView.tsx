import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, ChevronUp, Copy, Download, Plus, Search, Sparkles, X } from 'lucide-react'
import { CONTEXT_WINDOW_TOKENS } from '@shared/constants'
import Transcript from './Transcript'
import Composer from './Composer'
import BranchSwitcher from './BranchSwitcher'
import TabStrip from './TabStrip'
import QuickActions from './QuickActions'
import HoverCard from '@/components/ui/HoverCard'
import OverflowRow from '@/components/ui/OverflowRow'
import type { OverflowItem } from '@/components/ui/OverflowRow'
import { useSessionsStore } from '@/stores/useSessionsStore'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { useProfilesStore } from '@/stores/useProfilesStore'
import { transcriptToMarkdown } from '@/lib/exportMarkdown'

const COST_DISCLAIMER =
  'Added up from what the Claude Code SDK reports for each turn in this session. Treat it as a close guide rather than a bill: subscription plans, cached reads and retries can all make your real charge differ.'

/** Set the first time a tab is opened, so the hint never returns. */
const TABS_HINT_KEY = 'pilot.tabsHintUsed'

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
  const hasForked = useSessionsStore((s) => Object.values(s.sessions).some((e) => e.meta.forkedFrom))
  const [tabsHintUsed, setTabsHintUsed] = useState(localStorage.getItem(TABS_HINT_KEY) === '1')
  const showTabsHint = !tabsHintUsed && !hasForked

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
  const totalTokens = formatTokens(entry.meta.stats.inputTokens + entry.meta.stats.outputTokens)
  const contextTokens = entry.meta.stats.contextTokens ?? 0
  const contextWindow = entry.meta.stats.contextWindow || CONTEXT_WINDOW_TOKENS
  const contextPct = Math.min(100, Math.round((contextTokens / contextWindow) * 100))
  const nothingToShare = entry.blocks.length === 0

  const openSearch = (): void => {
    setSearchOpen(true)
    setTimeout(() => searchInputRef.current?.focus(), 0)
  }

  const openParallelTab = (): void => {
    localStorage.setItem(TABS_HINT_KEY, '1')
    setTabsHintUsed(true)
    useSessionsStore
      .getState()
      .forkSession(sessionId)
      .catch((e: unknown) => {
        window.alert(
          e instanceof Error
            ? e.message.replace(/^Error invoking remote method '[^']+': Error: /, '')
            : 'Could not open a new tab'
        )
      })
  }

  const stats = (
    <span className="flex items-center gap-2 whitespace-nowrap tabular-nums">
      {budgetRatio !== null ? (
        <span className="flex items-center gap-1.5" title={`Budget: $${spent.toFixed(2)} of $${budget?.toFixed(2)} used`}>
          <span className="h-1.5 w-16 overflow-hidden rounded-full bg-deck-raised">
            <span
              className={`block h-full rounded-full ${
                budgetRatio > 0.9 ? 'bg-red-500' : budgetRatio > 0.75 ? 'bg-amber-500' : 'bg-deck-accent'
              }`}
              style={{ width: `${budgetRatio * 100}%` }}
            />
          </span>
          <HoverCard title="How this is counted" body={COST_DISCLAIMER}>
            <span
              className={`underline decoration-zinc-600 decoration-dotted underline-offset-[3px] ${
                budgetRatio > 0.9 ? 'text-red-400' : ''
              }`}
            >
              ${spent.toFixed(2)} / ${budget?.toFixed(0)} · {totalTokens} tokens
            </span>
          </HoverCard>
        </span>
      ) : (
        <HoverCard title="How this is counted" body={COST_DISCLAIMER}>
          <span className="underline decoration-zinc-600 decoration-dotted underline-offset-[3px]">
            {simple
              ? `$${spent.toFixed(2)} · ${totalTokens} tokens`
              : `${entry.meta.stats.turns} turn${entry.meta.stats.turns === 1 ? '' : 's'} · $${spent.toFixed(3)} · ${totalTokens} tokens`}
          </span>
        </HoverCard>
      )}
    </span>
  )

  const contextMeter = (
    <span
      title={
        contextTokens > 0
          ? `Context: ~${formatTokens(contextTokens)} of ${formatTokens(contextWindow)} tokens in the model's memory. Near 100% the agent starts forgetting the oldest parts of the conversation.`
          : 'Context meter, fills in after the agent’s first reply in this session.'
      }
      className={`flex items-center gap-1 whitespace-nowrap tabular-nums ${contextPct > 90 ? 'text-red-400' : contextPct > 70 ? 'text-amber-500' : ''}`}
    >
      <span className="h-1.5 w-8 overflow-hidden rounded-full bg-deck-raised">
        <span
          className={`block h-full rounded-full ${contextPct > 90 ? 'bg-red-500' : contextPct > 70 ? 'bg-amber-500' : 'bg-zinc-500'}`}
          style={{ width: `${contextTokens > 0 ? Math.max(4, contextPct) : 0}%` }}
        />
      </span>
      {contextPct}% ctx
    </span>
  )

  const subagentBadge = (
    <span className="flex items-center gap-1 whitespace-nowrap text-purple-400">
      <Sparkles size={11} />
      {subagentCount} subagent{subagentCount > 1 ? 's' : ''} used
    </span>
  )

  const headerItems: OverflowItem[] = [
    ...(subagentCount > 0
      ? [{ id: 'subagents', priority: 20, bar: subagentBadge, menu: <MenuReadout>{subagentBadge}</MenuReadout> }]
      : []),
    { id: 'stats', priority: 50, bar: stats, menu: <MenuReadout>{stats}</MenuReadout> },
    { id: 'context', priority: 60, bar: contextMeter, menu: <MenuReadout>{contextMeter}</MenuReadout> },
    {
      id: 'search',
      priority: 40,
      bar: (
        <button
          onClick={openSearch}
          title="Search this conversation (⌘F)"
          className="flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-deck-raised hover:text-zinc-300"
        >
          <Search size={11} />
        </button>
      ),
      menu: (
        <MenuAction onClick={openSearch} icon={<Search size={12} />} shortcut="⌘F">
          Find in conversation
        </MenuAction>
      )
    },
    {
      id: 'copy',
      priority: 15,
      bar: (
        <button
          onClick={() => void copyTranscript()}
          disabled={nothingToShare}
          title="Copy the whole session as Markdown, ready to paste into a ticket or chat"
          className="flex items-center gap-1 whitespace-nowrap rounded px-1.5 py-0.5 hover:bg-deck-raised hover:text-zinc-300 disabled:opacity-30"
        >
          {copied ? <Check size={11} className="text-green-400" /> : <Copy size={11} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      ),
      menu: (
        <MenuAction
          onClick={() => void copyTranscript()}
          disabled={nothingToShare}
          icon={copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
        >
          {copied ? 'Copied' : 'Copy as Markdown'}
        </MenuAction>
      )
    },
    {
      id: 'export',
      priority: 10,
      bar: (
        <button
          onClick={() => void exportTranscript()}
          disabled={nothingToShare}
          title="Export session as a Markdown report file"
          className="flex items-center gap-1 whitespace-nowrap rounded px-1.5 py-0.5 hover:bg-deck-raised hover:text-zinc-300 disabled:opacity-30"
        >
          {exported ? <Check size={11} className="text-green-400" /> : <Download size={11} />}
          {exported ? 'Saved' : 'Export'}
        </button>
      ),
      menu: (
        <MenuAction
          onClick={() => void exportTranscript()}
          disabled={nothingToShare}
          icon={exported ? <Check size={12} className="text-green-400" /> : <Download size={12} />}
        >
          {exported ? 'Saved' : 'Export as Markdown…'}
        </MenuAction>
      )
    }
  ]

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex h-9 shrink-0 items-center gap-3 border-b border-deck-border px-4 text-[11px] text-zinc-500">
        <BranchSwitcher key={sessionId} sessionId={sessionId} />
        <OverflowRow items={headerItems} gap={10} className="flex-1" />
        <HoverCard
          title={showTabsHint ? 'Introducing tabs' : 'New tab'}
          body="Branch this conversation into a second tab. It keeps everything said so far and runs in its own process, so two things can happen at once."
          className="relative shrink-0"
        >
          <button
            onClick={openParallelTab}
            className="flex h-6 w-6 items-center justify-center rounded-md text-zinc-500 hover:bg-deck-raised hover:text-zinc-200"
          >
            <Plus size={14} />
          </button>
          {showTabsHint && (
            <span className="ripple-dot pointer-events-none absolute -right-px -top-px h-1.5 w-1.5 rounded-full bg-deck-accent" />
          )}
        </HoverCard>
      </div>

      <TabStrip sessionId={sessionId} />

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

function MenuAction({
  onClick,
  icon,
  shortcut,
  disabled,
  children
}: {
  onClick: () => void
  icon: React.ReactNode
  shortcut?: string
  disabled?: boolean
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[12px] text-zinc-300 hover:bg-deck-raised hover:text-zinc-100 disabled:opacity-30 disabled:hover:bg-transparent"
    >
      <span className="shrink-0 text-zinc-500">{icon}</span>
      <span className="flex-1 truncate">{children}</span>
      {shortcut && <span className="shrink-0 text-[10.5px] text-zinc-600">{shortcut}</span>}
    </button>
  )
}

/** Read-only stat parked in the overflow menu — same markup as in the bar, just given room. */
function MenuReadout({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <span className="flex w-full items-center px-2 py-1 text-[11px] text-zinc-500">{children}</span>
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

const STARTERS = [
  { emoji: '🗺️', text: 'Give me a tour of this project. What is it and how is it organized?' },
  { emoji: '🕵️', text: 'Look for anything broken or risky here and propose fixes' },
  { emoji: '📝', text: 'Write a clear README for this folder' },
  { emoji: '🎨', text: 'Build a simple, beautiful landing page in this folder' }
]

function StarterPrompts({ sessionId, cwd }: { sessionId: string; cwd: string }): React.JSX.Element {
  const sendMessage = useSessionsStore((s) => s.sendMessage)
  return (
    <div className="relative mt-14 flex flex-col items-center gap-4">
      <p className="z-10 text-sm text-zinc-500">
        Your agent is ready in <span className="font-mono text-zinc-400">{cwd.replace(/^\/Users\/[^/]+/, '~')}</span>
      </p>
      <div className="z-10 flex max-w-lg flex-wrap justify-center gap-2">
        {STARTERS.map((starter) => (
          <button
            key={starter.text}
            onClick={() => void sendMessage(sessionId, starter.text)}
            className="rounded-md border border-deck-border bg-deck-panel px-3.5 py-1.5 text-[12.5px] text-zinc-300 hover:border-deck-accent/50 hover:bg-deck-raised hover:text-zinc-100"
          >
            <span className="mr-1.5">{starter.emoji}</span>
            {starter.text}
          </button>
        ))}
      </div>
      <p className="z-10 text-[11px] text-zinc-600">…or type anything below. The agent asks before changing files.</p>
    </div>
  )
}

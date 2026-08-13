import { memo, useEffect, useState } from 'react'
import type { TranscriptBlock } from '@/lib/transcript'
import Markdown, { CopyButton } from './Markdown'
import ToolCallCard from '@/components/tools/ToolCallCard'
import { Brain, ChevronDown, ChevronUp, CircleAlert } from 'lucide-react'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { formatTokens } from '@/lib/format'
import type { SessionStatus } from '@shared/types'

/** Long finished responses collapse to this many lines until expanded. */
const COLLAPSE_LINES = 30
const COLLAPSE_CHARS = 2400

function CollapsibleText({ text, done }: { text: string; done: boolean }): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const lineCount = text.split('\n').length
  const isLong = done && !expanded && (lineCount > COLLAPSE_LINES + 8 || text.length > COLLAPSE_CHARS * 1.3)

  if (!isLong) {
    return (
      <>
        <Markdown text={text} />
        {expanded && (
          <button
            onClick={() => setExpanded(false)}
            className="mt-1 flex items-center gap-1 text-[11.5px] text-sky-400/80 hover:text-sky-300"
          >
            <ChevronUp size={12} /> Show less
          </button>
        )}
      </>
    )
  }

  // Cut on a line boundary near the budget so we never split mid-sentence badly.
  const lines = text.split('\n')
  let preview = lines.slice(0, COLLAPSE_LINES).join('\n')
  if (preview.length > COLLAPSE_CHARS) {
    preview = preview.slice(0, COLLAPSE_CHARS)
  }
  return (
    <>
      <div className="relative max-h-none overflow-hidden">
        <Markdown text={preview} />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-deck-bg to-transparent" />
      </div>
      <button
        onClick={() => setExpanded(true)}
        className="mt-1 flex items-center gap-1 text-[11.5px] text-sky-400/80 hover:text-sky-300"
      >
        <ChevronDown size={12} /> Show the rest ({lineCount - COLLAPSE_LINES > 0 ? `${lineCount - COLLAPSE_LINES} more lines` : 'long response'})
      </button>
    </>
  )
}

const START_WORDS = ['Dazzling…', 'Skedaddling…', 'Percolating…', 'Noodling…', 'Tinkering…', 'Limbering up…', 'Spooling up…']

/** Delightful stand-in for the session-start dump; the facts hide behind a link. */
function SessionStart({ block }: { block: TranscriptBlock & { kind: 'init' } }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  // Keyed off the block id so the word is stable per session, not reshuffled on every render.
  const word = START_WORDS[[...block.id].reduce((sum, c) => sum + c.charCodeAt(0), 0) % START_WORDS.length]
  const stalledServers = block.mcpServers.filter((server) => server.status !== 'connected')

  return (
    <div className="my-2 text-[11px] text-zinc-600">
      <div className="flex items-center gap-2.5">
        <span className="text-[13.5px] text-zinc-400">
          {[...word].map((letter, i) => (
            <span key={i} className="letter-in" style={{ animationDelay: `${i * 40}ms` }}>
              {letter}
            </span>
          ))}
        </span>
        <button onClick={() => setOpen(!open)} className="text-zinc-600 hover:text-zinc-400">
          {open ? 'Hide details' : 'Expand details'}
        </button>
      </div>
      {open && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <span>
            {block.model} · {block.tools.length} tools
            {block.mcpServers.length > 0 && ` · ${block.mcpServers.length} MCP server${block.mcpServers.length > 1 ? 's' : ''}`}
          </span>
          {block.newNames.map((name) => (
            <span
              key={name}
              className="rounded-full border border-deck-border bg-deck-raised px-2 py-0.5 font-mono text-[10px] text-zinc-400"
              title="First time this tool appears on your deck"
            >
              {name.replace(/^mcp:/, '')} <span className="font-sans font-semibold">NEW</span>
            </span>
          ))}
          {stalledServers.map((server) => (
            <span
              key={server.name}
              className="rounded-full border border-amber-900/60 bg-amber-950/40 px-2 py-0.5 font-mono text-[10px] text-amber-400"
            >
              {server.name}: {server.status}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

/** Names of sub-agents still running, taken from the Task tool calls in flight. */
function runningSubagents(blocks: TranscriptBlock[]): string[] {
  return blocks
    .filter((b) => b.kind === 'tool' && b.toolName === 'Task' && b.output === undefined)
    .map((b) => {
      const input = (b.kind === 'tool' ? b.input : null) as Record<string, unknown> | null
      const label = input?.description ?? input?.subagent_type
      return typeof label === 'string' && label.trim() !== '' ? label : 'a sub-agent'
    })
}

/** Shown whenever the agent is busy, so there is always a sign of life. */
function WorkingIndicator({
  blocks,
  agentColor
}: {
  blocks: TranscriptBlock[]
  agentColor: string
}): React.JSX.Element {
  const [wordIndex, setWordIndex] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => setWordIndex((i) => i + 1), 2600)
    return () => clearInterval(timer)
  }, [])

  const word = START_WORDS[wordIndex % START_WORDS.length]
  const subagents = runningSubagents(blocks)

  return (
    <div className="my-3 text-[13px]">
      <span
        key={word}
        className="shimmer-text font-medium"
        style={{ '--shimmer-color': agentColor } as React.CSSProperties}
      >
        {word}
      </span>
      {subagents.length > 0 && (
        <p className="mt-1 text-[11px] text-zinc-600">
          waiting for {subagents.length > 2 ? `${subagents.length} sub-agents` : subagents.join(' and ')}
        </p>
      )}
    </div>
  )
}

const Block = memo(function Block({
  block,
  simple
}: {
  block: TranscriptBlock
  simple: boolean
}): React.JSX.Element | null {
  switch (block.kind) {
    case 'user':
      return (
        <div className="my-3 flex justify-end">
          {/* Square bottom-right corner points back at the composer, like a speech bubble tail. */}
          <div className="max-w-[85%] rounded-lg rounded-br-none border border-deck-accent/25 bg-deck-accent/10 px-4 py-2.5 text-sm text-zinc-100">
            {block.images && block.images.length > 0 && (
              <div className="mb-1.5 flex flex-wrap gap-1.5">
                {block.images.map((src, i) => (
                  <img key={i} src={src} alt="screenshot" className="max-h-48 rounded-lg border border-deck-border" />
                ))}
              </div>
            )}
            {block.text.trim() !== '' && <Markdown text={block.text} />}
          </div>
        </div>
      )

    case 'text':
      return (
        // mt-7 reserves a clear band for the hovering Copy button, which sits above the
        // block: without it the button lands on whatever was rendered just before.
        <div className="group relative mb-3 mt-7 max-w-[95%] text-sm leading-relaxed text-zinc-200">
          {block.done && block.text.trim() !== '' && (
            <span className="absolute -top-6 right-0 z-10 opacity-0 transition-opacity group-hover:opacity-100">
              <CopyButton text={block.text} />
            </span>
          )}
          <CollapsibleText text={block.text} done={block.done} />
          {!block.done && <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-zinc-400 align-text-bottom" />}
        </div>
      )

    case 'thinking':
      if (simple) {
        return null
      }
      return (
        <details className="my-2 max-w-[95%]">
          <summary className="flex cursor-pointer items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-400">
            <Brain size={12} />
            {block.done ? 'Thought process' : 'Thinking…'}
          </summary>
          <div className="mt-1 border-l-2 border-deck-border pl-3 text-xs italic leading-relaxed text-zinc-500">
            {block.text}
          </div>
        </details>
      )

    case 'tool':
      return <ToolCallCard block={block} simple={simple} />

    case 'todo':
      return (
        <div className="my-2 max-w-[85%] rounded-lg border border-deck-border bg-deck-panel px-3 py-2">
          <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
            Tasks ({block.items.filter((i) => i.status === 'completed').length}/{block.items.length})
          </p>
          {block.items.map((item, i) => (
            <div key={i} className="flex items-start gap-2 py-0.5 text-[13px]">
              <span className="mt-0.5">
                {item.status === 'completed' ? '✅' : item.status === 'in_progress' ? '🔄' : '⬜'}
              </span>
              <span className={item.status === 'completed' ? 'text-zinc-500 line-through' : 'text-zinc-300'}>
                {item.text}
              </span>
            </div>
          ))}
        </div>
      )

    case 'turn':
      return (
        <div className="my-3 flex items-center gap-2 text-[11px] text-zinc-600">
          <div className="h-px flex-1 bg-deck-border" />
          {block.isError ? (
            <span className="text-red-400">turn failed{block.errorMessage ? `: ${block.errorMessage}` : ''}</span>
          ) : simple ? (
            <span>✓ done · ${block.costUsd.toFixed(2)}</span>
          ) : (
            <span>
              ✓ turn done · ${block.costUsd.toFixed(3)} · {formatTokens(block.usage.inputTokens + block.usage.outputTokens)} tokens
            </span>
          )}
          <div className="h-px flex-1 bg-deck-border" />
        </div>
      )

    case 'error':
      if (simple) {
        return (
          <div className="my-3 max-w-[95%] rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-300">
            <div className="flex items-start gap-2">
              <CircleAlert size={15} className="mt-0.5 shrink-0" />
              <span>Something went wrong on the agent's side. Just send your message again. It picks up where it left off.</span>
            </div>
            <details className="mt-1.5 pl-6">
              <summary className="cursor-pointer text-[11px] text-red-400/70 hover:text-red-300">technical details</summary>
              <p className="selectable mt-1 font-mono text-[11px] text-red-400/80">{block.message}</p>
            </details>
          </div>
        )
      }
      return (
        <div className="my-3 flex max-w-[95%] items-start gap-2 rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-300">
          <CircleAlert size={15} className="mt-0.5 shrink-0" />
          <span className="selectable">{block.message}</span>
        </div>
      )

    case 'init':
      if (simple) {
        return null
      }
      return <SessionStart block={block} />
  }
})

export default function Transcript({
  blocks,
  highlightId,
  status,
  agentColor
}: {
  blocks: TranscriptBlock[]
  highlightId?: string | null
  status: SessionStatus
  agentColor: string
}): React.JSX.Element {
  const simple = useSettingsStore((s) => s.settings?.uiMode === 'simple')
  return (
    <div className="mx-auto max-w-3xl">
      {blocks.map((block) => (
        <div
          key={block.id}
          data-block-id={block.id}
          className={`block-in ${block.id === highlightId ? 'rounded-lg ring-2 ring-amber-500/60' : ''}`}
        >
          <Block block={block} simple={simple} />
        </div>
      ))}
      {(status.kind === 'thinking' || status.kind === 'running-tool') && (
        <WorkingIndicator blocks={blocks} agentColor={agentColor} />
      )}
    </div>
  )
}

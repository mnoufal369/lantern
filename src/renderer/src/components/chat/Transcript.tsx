import { memo } from 'react'
import type { TranscriptBlock } from '@/lib/transcript'
import Markdown from './Markdown'
import ToolCallCard from '@/components/tools/ToolCallCard'
import { Brain, CircleAlert } from 'lucide-react'
import { useSettingsStore } from '@/stores/useSettingsStore'

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
          <div className="max-w-[85%] rounded-2xl rounded-br-md border border-cyan-500/15 bg-gradient-to-br from-cyan-500/15 to-teal-500/10 px-4 py-2.5 text-sm text-zinc-100">
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
        <div className="my-3 max-w-[95%] text-sm leading-relaxed text-zinc-200">
          <Markdown text={block.text} />
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
            <span className="text-red-400">turn failed{block.errorMessage ? ` — ${block.errorMessage}` : ''}</span>
          ) : simple ? (
            <span>✓ done · ${block.costUsd.toFixed(2)}</span>
          ) : (
            <span>
              ✓ turn done · ${block.costUsd.toFixed(3)} · {block.usage.inputTokens + block.usage.outputTokens} tokens
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
              <span>Something went wrong on the agent's side. Just send your message again — it picks up where it left off.</span>
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
      return (
        <div className="my-2 flex flex-wrap items-center gap-1.5 text-[11px] text-zinc-600">
          <span>
            session started · {block.model} · {block.tools.length} tools
            {block.mcpServers.length > 0 && ` · ${block.mcpServers.length} MCP server${block.mcpServers.length > 1 ? 's' : ''}`}
          </span>
          {block.newNames.map((name) => (
            <span
              key={name}
              className="rounded-full border border-deck-accent/40 bg-deck-accent/10 px-2 py-0.5 font-mono text-[10px] text-sky-300"
              title="First time this tool appears on your deck"
            >
              {name.replace(/^mcp:/, '')} <span className="font-sans font-semibold">NEW</span>
            </span>
          ))}
          {block.mcpServers.filter((s) => s.status !== 'connected').map((server) => (
            <span
              key={server.name}
              className="rounded-full border border-amber-900/60 bg-amber-950/40 px-2 py-0.5 font-mono text-[10px] text-amber-400"
            >
              {server.name}: {server.status}
            </span>
          ))}
        </div>
      )
  }
})

export default function Transcript({
  blocks,
  highlightId
}: {
  blocks: TranscriptBlock[]
  highlightId?: string | null
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
    </div>
  )
}

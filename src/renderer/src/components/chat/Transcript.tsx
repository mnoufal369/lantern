import { memo } from 'react'
import type { TranscriptBlock } from '@/lib/transcript'
import Markdown from './Markdown'
import ToolCallCard from '@/components/tools/ToolCallCard'
import { Brain, CircleAlert } from 'lucide-react'

const Block = memo(function Block({ block }: { block: TranscriptBlock }): React.JSX.Element | null {
  switch (block.kind) {
    case 'user':
      return (
        <div className="my-3 flex justify-end">
          <div className="max-w-[85%] rounded-2xl rounded-br-md bg-deck-accent/15 px-4 py-2.5 text-sm text-zinc-100">
            <Markdown text={block.text} />
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
      return <ToolCallCard block={block} />

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
          ) : (
            <span>
              ✓ turn done · ${block.costUsd.toFixed(3)} · {block.usage.inputTokens + block.usage.outputTokens} tokens
            </span>
          )}
          <div className="h-px flex-1 bg-deck-border" />
        </div>
      )

    case 'error':
      return (
        <div className="my-3 flex max-w-[95%] items-start gap-2 rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-300">
          <CircleAlert size={15} className="mt-0.5 shrink-0" />
          <span className="selectable">{block.message}</span>
        </div>
      )
  }
})

export default function Transcript({ blocks }: { blocks: TranscriptBlock[] }): React.JSX.Element {
  return (
    <div className="mx-auto max-w-3xl">
      {blocks.map((block) => (
        <Block key={block.id} block={block} />
      ))}
    </div>
  )
}

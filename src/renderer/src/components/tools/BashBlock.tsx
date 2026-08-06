import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { ansiToSpans } from '@/lib/ansi'

const COLLAPSE_AFTER_LINES = 30

interface Props {
  command: string
  output?: string
  isError?: boolean
}

export default function BashBlock({ command, output, isError }: Props): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const lines = output ? output.split('\n') : []
  const isLong = lines.length > COLLAPSE_AFTER_LINES
  const shown = isLong && !expanded ? lines.slice(-COLLAPSE_AFTER_LINES) : lines

  return (
    <div className="overflow-hidden rounded-md bg-[#0d0d10]">
      <div className="selectable flex items-start gap-2 border-b border-deck-border/60 px-2.5 py-1.5 font-mono text-[12px] text-zinc-300">
        <span className="select-none text-green-500">❯</span>
        <span className="whitespace-pre-wrap break-all">{command}</span>
      </div>
      {output !== undefined && (
        <div className="p-2.5">
          {isLong && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="mb-1 flex items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-300"
            >
              {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              {expanded ? 'Collapse' : `Show all ${lines.length} lines`}
            </button>
          )}
          <pre
            className={`selectable overflow-x-auto whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed ${
              isError ? 'text-red-300' : 'text-zinc-300'
            }`}
          >
            {ansiToSpans(shown.join('\n'))}
          </pre>
        </div>
      )}
    </div>
  )
}

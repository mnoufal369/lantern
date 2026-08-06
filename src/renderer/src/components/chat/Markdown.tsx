import { memo, useState } from 'react'
import { Check, Copy } from 'lucide-react'

function CopyButton({ text }: { text: string }): React.JSX.Element {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => {
        void navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
      title="Copy"
      className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-zinc-500 hover:bg-deck-raised hover:text-zinc-300"
    >
      {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

export function CodeSnippet({ code, lang }: { code: string; lang?: string }): React.JSX.Element {
  return (
    <div className="group/code my-2 overflow-hidden rounded-lg border border-deck-border bg-[#0d0d10]">
      <div className="flex items-center justify-between border-b border-deck-border/60 px-3 py-1">
        <span className="text-[11px] text-zinc-500">{lang || 'code'}</span>
        <CopyButton text={code} />
      </div>
      <pre className="selectable overflow-x-auto p-3 font-mono text-[12.5px] leading-relaxed text-zinc-200">
        {code}
      </pre>
    </div>
  )
}

function renderInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*)/g
  let last = 0
  let match: RegExpExecArray | null
  let key = 0
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) {
      nodes.push(text.slice(last, match.index))
    }
    const token = match[0]
    if (token.startsWith('`')) {
      nodes.push(
        <code key={key++} className="rounded bg-deck-raised px-1 py-0.5 font-mono text-[12px] text-amber-200/90">
          {token.slice(1, -1)}
        </code>
      )
    } else {
      nodes.push(
        <strong key={key++} className="font-semibold text-zinc-100">
          {token.slice(2, -2)}
        </strong>
      )
    }
    last = match.index + token.length
  }
  if (last < text.length) {
    nodes.push(text.slice(last))
  }
  return nodes
}

function Prose({ text }: { text: string }): React.JSX.Element {
  const lines = text.split('\n')
  return (
    <>
      {lines.map((line, i) => {
        const heading = /^(#{1,4})\s+(.*)/.exec(line)
        if (heading) {
          return (
            <p key={i} className="mb-1 mt-3 text-[15px] font-semibold text-zinc-100">
              {renderInline(heading[2])}
            </p>
          )
        }
        const bullet = /^\s*[-*]\s+(.*)/.exec(line)
        if (bullet) {
          return (
            <p key={i} className="flex gap-2 pl-2">
              <span className="text-zinc-500">•</span>
              <span>{renderInline(bullet[1])}</span>
            </p>
          )
        }
        const numbered = /^\s*(\d+)\.\s+(.*)/.exec(line)
        if (numbered) {
          return (
            <p key={i} className="flex gap-2 pl-2">
              <span className="text-zinc-500">{numbered[1]}.</span>
              <span>{renderInline(numbered[2])}</span>
            </p>
          )
        }
        if (line.trim() === '') {
          return <div key={i} className="h-2" />
        }
        return <p key={i}>{renderInline(line)}</p>
      })}
    </>
  )
}

/**
 * Minimal markdown renderer: fenced code blocks (with copy button),
 * inline code, bold, headings and lists. Deliberately dependency-free.
 */
const Markdown = memo(function Markdown({ text }: { text: string }): React.JSX.Element {
  const parts: React.ReactNode[] = []
  const fence = /```([\w+-]*)\n?([\s\S]*?)(?:```|$)/g
  let last = 0
  let match: RegExpExecArray | null
  let key = 0
  while ((match = fence.exec(text)) !== null) {
    if (match.index > last) {
      parts.push(<Prose key={key++} text={text.slice(last, match.index)} />)
    }
    parts.push(<CodeSnippet key={key++} lang={match[1]} code={match[2].replace(/\n$/, '')} />)
    last = match.index + match[0].length
  }
  if (last < text.length) {
    parts.push(<Prose key={key++} text={text.slice(last)} />)
  }
  return <div className="space-y-0.5">{parts}</div>
})

export default Markdown

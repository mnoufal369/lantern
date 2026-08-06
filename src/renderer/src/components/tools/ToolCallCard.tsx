import { memo, useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  FileText,
  FolderSearch,
  Loader2,
  Pencil,
  Search,
  Sparkles,
  Terminal,
  Wrench
} from 'lucide-react'
import type { TranscriptBlock } from '@/lib/transcript'
import EditDiffView from './EditDiffView'
import BashBlock from './BashBlock'

type ToolBlock = TranscriptBlock & { kind: 'tool' }

function asRecord(input: unknown): Record<string, unknown> {
  return typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {}
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function shortPath(path: string): string {
  return path.replace(/^\/Users\/[^/]+/, '~')
}

const PermissionChip = ({ permission }: { permission?: 'allowed' | 'denied' }): React.JSX.Element | null => {
  if (!permission) {
    return null
  }
  return permission === 'allowed' ? (
    <span className="rounded bg-green-950/70 px-1.5 py-0.5 text-[10px] text-green-400">✓ allowed</span>
  ) : (
    <span className="rounded bg-red-950/70 px-1.5 py-0.5 text-[10px] text-red-400">✗ denied</span>
  )
}

/** Compact single-line rendering for read-only lookups. */
function CompactTool({ block }: { block: ToolBlock }): React.JSX.Element {
  const input = asRecord(block.input)
  const running = block.output === undefined
  const icon =
    block.toolName === 'Read' ? (
      <FileText size={12} />
    ) : block.toolName === 'Glob' ? (
      <FolderSearch size={12} />
    ) : (
      <Search size={12} />
    )
  const label =
    block.toolName === 'Read'
      ? shortPath(str(input.file_path))
      : str(input.pattern) || JSON.stringify(block.input)

  return (
    <div className="my-1 flex items-center gap-2 text-[12px] text-zinc-500">
      <span className="text-zinc-600">{icon}</span>
      <span className="font-medium text-zinc-400">{block.toolName}</span>
      <span className="truncate font-mono">{label}</span>
      {running && <Loader2 size={11} className="animate-spin text-zinc-600" />}
      <PermissionChip permission={block.permission} />
    </div>
  )
}

const ToolCallCard = memo(function ToolCallCard({ block }: { block: ToolBlock }): React.JSX.Element {
  const [open, setOpen] = useState(true)
  const input = asRecord(block.input)
  const running = block.output === undefined && block.permission !== 'denied'

  if (block.toolName === 'Read' || block.toolName === 'Glob' || block.toolName === 'Grep') {
    return <CompactTool block={block} />
  }

  const isEdit = block.toolName === 'Edit' || block.toolName === 'MultiEdit'
  const isWrite = block.toolName === 'Write'
  const isBash = block.toolName === 'Bash'
  const isSubagent = block.toolName === 'Task'

  const icon = isBash ? (
    <Terminal size={13} />
  ) : isEdit || isWrite ? (
    <Pencil size={13} />
  ) : isSubagent ? (
    <Sparkles size={13} />
  ) : (
    <Wrench size={13} />
  )

  const title = isBash
    ? str(input.description) || 'Run command'
    : isEdit || isWrite
      ? shortPath(str(input.file_path))
      : isSubagent
        ? `Subagent: ${str(input.description) || str(input.subagent_type) || 'task'}`
        : block.toolName

  return (
    <div className="my-2 max-w-[95%] overflow-hidden rounded-lg border border-deck-border bg-deck-panel">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12.5px] hover:bg-deck-raised/50"
      >
        {open ? (
          <ChevronDown size={13} className="shrink-0 text-zinc-600" />
        ) : (
          <ChevronRight size={13} className="shrink-0 text-zinc-600" />
        )}
        <span className={isSubagent ? 'text-purple-400' : 'text-zinc-400'}>{icon}</span>
        <span className="font-medium text-zinc-300">{block.toolName}</span>
        <span className="truncate font-mono text-zinc-500">{title}</span>
        {running && <Loader2 size={12} className="ml-1 shrink-0 animate-spin text-zinc-500" />}
        <span className="ml-auto shrink-0">
          <PermissionChip permission={block.permission} />
        </span>
      </button>

      {open && (
        <div className="border-t border-deck-border/60 px-3 py-2">
          {isBash && <BashBlock command={str(input.command)} output={block.output} isError={block.isError} />}

          {isEdit && (
            <EditDiffView
              oldText={
                block.toolName === 'MultiEdit'
                  ? (asArray(input.edits).map((e) => str(asRecord(e).old_string)).join('\n…\n'))
                  : str(input.old_string)
              }
              newText={
                block.toolName === 'MultiEdit'
                  ? (asArray(input.edits).map((e) => str(asRecord(e).new_string)).join('\n…\n'))
                  : str(input.new_string)
              }
            />
          )}

          {isWrite && <EditDiffView oldText="" newText={str(input.content)} />}

          {isSubagent && (
            <div className="space-y-1">
              {str(input.prompt) && (
                <p className="line-clamp-3 text-[12px] text-zinc-500">{str(input.prompt)}</p>
              )}
              {block.children.length > 0 && (
                <div className="mt-1 border-l-2 border-purple-900/60 pl-3">
                  {block.children.map((child) =>
                    child.kind === 'tool' ? <ToolCallCard key={child.id} block={child} /> : null
                  )}
                </div>
              )}
              {block.output !== undefined && (
                <pre className="selectable mt-1 max-h-48 overflow-y-auto whitespace-pre-wrap rounded bg-[#0d0d10] p-2 font-mono text-[11.5px] text-zinc-400">
                  {block.output}
                </pre>
              )}
            </div>
          )}

          {!isBash && !isEdit && !isWrite && !isSubagent && (
            <div className="space-y-1.5">
              <pre className="selectable overflow-x-auto rounded bg-[#0d0d10] p-2 font-mono text-[11.5px] text-zinc-400">
                {JSON.stringify(block.input, null, 2)}
              </pre>
              {block.output !== undefined && (
                <pre
                  className={`selectable max-h-48 overflow-y-auto whitespace-pre-wrap rounded bg-[#0d0d10] p-2 font-mono text-[11.5px] ${
                    block.isError ? 'text-red-300' : 'text-zinc-400'
                  }`}
                >
                  {block.output}
                </pre>
              )}
            </div>
          )}

          {(isBash || isEdit || isWrite) && block.isError && block.output && !isBash && (
            <pre className="selectable mt-1 whitespace-pre-wrap rounded bg-red-950/40 p-2 font-mono text-[11.5px] text-red-300">
              {block.output}
            </pre>
          )}
        </div>
      )}
    </div>
  )
})

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

export default ToolCallCard

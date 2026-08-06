import { useCallback, useEffect, useState } from 'react'
import { FileDiff, GitBranch, PanelRightClose, PanelRightOpen, RotateCcw } from 'lucide-react'
import parseDiff from 'parse-diff'
import type { GitStatusSummary } from '@shared/types'
import { useSessionsStore } from '@/stores/useSessionsStore'

const KIND_BADGE: Record<string, { label: string; className: string }> = {
  modified: { label: 'M', className: 'text-amber-400' },
  added: { label: 'A', className: 'text-green-400' },
  deleted: { label: 'D', className: 'text-red-400' },
  renamed: { label: 'R', className: 'text-blue-400' },
  untracked: { label: 'U', className: 'text-purple-400' },
  conflicted: { label: '!', className: 'text-red-500' }
}

export default function RightPanel({ sessionId }: { sessionId: string }): React.JSX.Element | null {
  const [collapsed, setCollapsed] = useState(false)
  const [status, setStatus] = useState<GitStatusSummary | null>(null)
  const [openFile, setOpenFile] = useState<string | null>(null)
  const [diffText, setDiffText] = useState('')
  const filesTouched = useSessionsStore((s) => s.sessions[sessionId]?.meta.filesTouched ?? [])

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const result = await window.api.invoke('git:status', { sessionId })
      setStatus(result)
    } catch {
      setStatus(null)
    }
  }, [sessionId])

  useEffect(() => {
    void refresh()
    const off = window.api.on('git:changed', (payload) => {
      if (payload.sessionId === sessionId) {
        void refresh()
      }
    })
    return off
  }, [sessionId, refresh])

  const showDiff = async (path: string): Promise<void> => {
    if (openFile === path) {
      setOpenFile(null)
      return
    }
    const diff = await window.api.invoke('git:diffFile', { sessionId, path })
    setDiffText(diff)
    setOpenFile(path)
  }

  const revert = async (path: string): Promise<void> => {
    if (!window.confirm(`Revert all changes to ${path}? This cannot be undone.`)) {
      return
    }
    await window.api.invoke('git:revertFile', { sessionId, path })
    setOpenFile(null)
    void refresh()
  }

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        title="Show project panel"
        className="flex w-8 shrink-0 items-start justify-center border-l border-deck-border bg-deck-panel pt-3 text-zinc-500 hover:text-zinc-200"
      >
        <PanelRightOpen size={15} />
      </button>
    )
  }

  return (
    <aside className="flex w-[320px] shrink-0 flex-col border-l border-deck-border bg-deck-panel">
      <div className="flex items-center gap-2 border-b border-deck-border px-3 py-2">
        <GitBranch size={13} className="text-zinc-500" />
        {status?.isRepo ? (
          <span className="truncate text-xs font-medium text-zinc-300">
            {status.branch}
            {(status.ahead ?? 0) > 0 && <span className="ml-1 text-zinc-500">↑{status.ahead}</span>}
            {(status.behind ?? 0) > 0 && <span className="ml-1 text-zinc-500">↓{status.behind}</span>}
          </span>
        ) : (
          <span className="text-xs text-zinc-600">no git repo</span>
        )}
        <button
          onClick={() => setCollapsed(true)}
          className="ml-auto text-zinc-500 hover:text-zinc-200"
          title="Hide panel"
        >
          <PanelRightClose size={14} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {status?.isRepo && (
          <div className="border-b border-deck-border p-3">
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
              Changes ({status.files.length})
            </p>
            {status.files.length === 0 && <p className="text-xs text-zinc-600">Working tree clean</p>}
            {status.files.map((file) => {
              const badge = KIND_BADGE[file.kind] ?? KIND_BADGE.modified
              return (
                <div key={file.path} className="mb-0.5">
                  <div className="group flex items-center gap-2 rounded px-1.5 py-1 hover:bg-deck-raised">
                    <span className={`w-3 shrink-0 text-center font-mono text-[11px] font-bold ${badge.className}`}>
                      {badge.label}
                    </span>
                    <button
                      onClick={() => void showDiff(file.path)}
                      className="min-w-0 flex-1 truncate text-left font-mono text-[11.5px] text-zinc-300 hover:text-zinc-100"
                      title={file.path}
                    >
                      {file.path}
                    </button>
                    <button
                      onClick={() => void showDiff(file.path)}
                      title="Show diff"
                      className="hidden text-zinc-500 hover:text-zinc-200 group-hover:block"
                    >
                      <FileDiff size={12} />
                    </button>
                    <button
                      onClick={() => void revert(file.path)}
                      title="Revert file"
                      className="hidden text-zinc-500 hover:text-red-400 group-hover:block"
                    >
                      <RotateCcw size={12} />
                    </button>
                  </div>
                  {openFile === file.path && <DiffPreview diffText={diffText} />}
                </div>
              )
            })}
          </div>
        )}

        <div className="p-3">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
            Files touched this session ({filesTouched.length})
          </p>
          {filesTouched.length === 0 && <p className="text-xs text-zinc-600">Nothing yet</p>}
          {filesTouched.map((path) => (
            <p key={path} className="truncate py-0.5 font-mono text-[11.5px] text-zinc-400" title={path}>
              {path}
            </p>
          ))}
        </div>
      </div>
    </aside>
  )
}

const MAX_DIFF_LINES = 400

function DiffPreview({ diffText }: { diffText: string }): React.JSX.Element {
  const files = parseDiff(diffText)
  let rendered = 0
  return (
    <div className="selectable my-1 max-h-72 overflow-auto rounded-md bg-[#0d0d10] p-2 font-mono text-[11px] leading-relaxed">
      {files.map((file, fi) =>
        file.chunks.map((chunk, ci) => (
          <div key={`${fi}-${ci}`} className="mb-1">
            <p className="text-zinc-600">{chunk.content}</p>
            {chunk.changes.map((change, i) => {
              if (rendered++ > MAX_DIFF_LINES) {
                return null
              }
              return (
                <div
                  key={i}
                  className={
                    change.type === 'add'
                      ? 'bg-green-950/60 text-green-300'
                      : change.type === 'del'
                        ? 'bg-red-950/60 text-red-300'
                        : 'text-zinc-500'
                  }
                >
                  {change.content}
                </div>
              )
            })}
          </div>
        ))
      )}
      {rendered > MAX_DIFF_LINES && <p className="mt-1 text-zinc-600">… diff truncated</p>}
      {files.length === 0 && <p className="text-zinc-600">No diff available</p>}
    </div>
  )
}

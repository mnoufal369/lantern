import { useCallback, useEffect, useState } from 'react'
import {
  RefreshCw,
  Braces,
  File,
  FileCode2,
  FileCog,
  FileDiff,
  FileImage,
  FileLock,
  FileTerminal,
  FileText,
  FileType2,
  GitBranch,
  PanelRightClose,
  PanelRightOpen,
  RotateCcw
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
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

const FILE_ICONS: Record<string, LucideIcon> = {
  ts: FileCode2,
  tsx: FileCode2,
  js: FileCode2,
  jsx: FileCode2,
  mjs: FileCode2,
  cjs: FileCode2,
  py: FileCode2,
  rb: FileCode2,
  go: FileCode2,
  rs: FileCode2,
  swift: FileCode2,
  java: FileCode2,
  html: FileCode2,
  vue: FileCode2,
  svelte: FileCode2,
  json: Braces,
  yml: FileCog,
  yaml: FileCog,
  toml: FileCog,
  env: FileCog,
  css: FileType2,
  scss: FileType2,
  md: FileText,
  mdx: FileText,
  txt: FileText,
  sh: FileTerminal,
  zsh: FileTerminal,
  bash: FileTerminal,
  lock: FileLock,
  png: FileImage,
  jpg: FileImage,
  jpeg: FileImage,
  gif: FileImage,
  svg: FileImage,
  webp: FileImage,
  ico: FileImage
}

function iconForPath(path: string): LucideIcon {
  const name = path.slice(path.lastIndexOf('/') + 1)
  const dot = name.lastIndexOf('.')
  return (dot > 0 ? FILE_ICONS[name.slice(dot + 1).toLowerCase()] : undefined) ?? File
}

const NAME_BUDGET = 26

/**
 * Splits a path so the directory part can collapse with CSS while the file name — and its
 * extension — always stays readable. Over-long names fold in the middle themselves.
 */
function splitPathForDisplay(path: string): { head: string; tail: string } {
  const lastSlash = path.lastIndexOf('/')
  const name = path.slice(lastSlash + 1)
  if (name.length <= NAME_BUDGET) {
    return { head: path.slice(0, lastSlash + 1), tail: name }
  }
  const front = Math.ceil((NAME_BUDGET - 1) / 2)
  const back = NAME_BUDGET - 1 - front
  return { head: '', tail: `${name.slice(0, front)}…${name.slice(-back)}` }
}

function TouchedFileRow({ path, cwd }: { path: string; cwd: string }): React.JSX.Element {
  const relative = cwd && path.startsWith(`${cwd}/`) ? path.slice(cwd.length + 1) : path.replace(/^\/Users\/[^/]+/, '~')
  const { head, tail } = splitPathForDisplay(relative)
  const Icon = iconForPath(path)
  return (
    <div className="flex items-center gap-1.5 py-0.5 font-mono text-[11.5px]" title={path}>
      <Icon size={12} className="shrink-0 text-zinc-600" />
      <span className="flex min-w-0 text-zinc-400">
        {head && <span className="truncate text-zinc-500">{head}</span>}
        <span className="shrink-0">{tail}</span>
      </span>
    </div>
  )
}

/** "6d ago" / "20m ago" — short enough to sit in a 320px header. */
function fetchedAgo(ms: number): string {
  const mins = Math.max(0, Math.round((Date.now() - ms) / 60_000))
  if (mins < 60) {
    return `${mins}m ago`
  }
  const hours = Math.round(mins / 60)
  return hours < 24 ? `${hours}h ago` : `${Math.round(hours / 24)}d ago`
}

export default function RightPanel({ sessionId }: { sessionId: string }): React.JSX.Element | null {
  const [collapsed, setCollapsed] = useState(false)
  const [status, setStatus] = useState<GitStatusSummary | null>(null)
  const [openFile, setOpenFile] = useState<string | null>(null)
  const [diffText, setDiffText] = useState('')
  const filesTouched = useSessionsStore((s) => s.sessions[sessionId]?.meta.filesTouched ?? [])
  const cwd = useSessionsStore((s) => s.sessions[sessionId]?.meta.cwd ?? '')

  // A file the agent edited and then reverted has no diff left, so it drops off the list.
  // Git paths are repo-root relative while touched paths are absolute, hence the suffix match.
  const stillChanged =
    status?.isRepo === true
      ? filesTouched.filter((path) => status.files.some((file) => path.endsWith(`/${file.path}`)))
      : filesTouched

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const result = await window.api.invoke('git:status', { sessionId })
      setStatus(result)
    } catch {
      setStatus(null)
    }
  }, [sessionId])

  const [refreshing, setRefreshing] = useState(false)

  /** Explicit ask: bring the fetched snapshot up to date with origin. */
  const refreshCode = useCallback(async (): Promise<void> => {
    setRefreshing(true)
    try {
      setStatus(await window.api.invoke('git:refresh', { sessionId }))
    } catch {
      // leave the existing status on screen; the panel is not the place to shout
    } finally {
      setRefreshing(false)
    }
  }, [sessionId])

  useEffect(() => {
    void refresh()
    // Main decides whether this is due: managed workspace, read-only session,
    // snapshot older than half a day. Otherwise it just returns the status.
    void window.api
      .invoke('git:refresh', { sessionId, auto: true })
      .then(setStatus)
      .catch(() => undefined)
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
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-deck-border px-3">
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
        {status?.managed && (
          <button
            onClick={() => void refreshCode()}
            disabled={refreshing}
            title={
              status.fetchedAt
                ? `Code fetched ${fetchedAgo(status.fetchedAt)} — click to bring it up to date with origin`
                : 'Bring this snapshot up to date with origin'
            }
            className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-[10.5px] text-zinc-500 hover:bg-deck-raised hover:text-zinc-300 disabled:opacity-50"
          >
            <RefreshCw size={11} className={refreshing ? 'animate-spin' : ''} />
            {status.fetchedAt ? fetchedAgo(status.fetchedAt) : 'refresh'}
          </button>
        )}
        <button
          onClick={() => setCollapsed(true)}
          className={`${status?.managed ? '' : 'ml-auto '}text-zinc-500 hover:text-zinc-200`}
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
            Files touched this session ({stillChanged.length})
          </p>
          {stillChanged.length === 0 && (
            <p className="text-xs text-zinc-600">
              {filesTouched.length > 0 ? 'Nothing left changed' : 'Nothing yet'}
            </p>
          )}
          {stillChanged.map((path) => (
            <TouchedFileRow key={path} path={path} cwd={cwd} />
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
    <div className="selectable my-1 max-h-72 overflow-auto rounded-md bg-deck-code p-2 font-mono text-[11px] leading-relaxed">
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
                      ? 'bg-diff-add text-diff-add-text'
                      : change.type === 'del'
                        ? 'bg-diff-del text-diff-del-text'
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

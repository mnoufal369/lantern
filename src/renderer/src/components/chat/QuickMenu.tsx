import { useEffect, useMemo, useState } from 'react'
import { useSessionsStore } from '@/stores/useSessionsStore'
import { FALLBACK_MODELS } from '@shared/constants'
import type { PermissionMode } from '@shared/types'
import { transcriptToMarkdown } from '@/lib/exportMarkdown'

export interface QuickCommand {
  id: string
  icon: string
  label: string
  hint?: string
  keywords: string
  run: () => void | Promise<void>
}

export const MODE_SEQUENCE: { value: PermissionMode; label: string }[] = [
  { value: 'plan', label: 'Plan' },
  { value: 'default', label: 'Ask' },
  { value: 'acceptEdits', label: 'Auto-edit' },
  { value: 'bypassPermissions', label: 'Full auto' }
]

interface Props {
  sessionId: string
  query: string
  onClose: () => void
  selectedIndex: number
  setSelectedIndex: (i: number) => void
  registerCommands: (commands: QuickCommand[]) => void
}

export default function QuickMenu({
  sessionId,
  query,
  onClose,
  selectedIndex,
  setSelectedIndex,
  registerCommands
}: Props): React.JSX.Element | null {
  const meta = useSessionsStore((s) => s.sessions[sessionId]?.meta)
  const blocks = useSessionsStore((s) => s.sessions[sessionId]?.blocks)
  const setModel = useSessionsStore((s) => s.setModel)
  const setPermissionMode = useSessionsStore((s) => s.setPermissionMode)
  const interrupt = useSessionsStore((s) => s.interrupt)
  const rename = useSessionsStore((s) => s.rename)
  const [branches, setBranches] = useState<string[]>([])

  useEffect(() => {
    let cancelled = false
    void window.api
      .invoke('git:status', { sessionId })
      .then((status) => {
        if (!cancelled && status.isRepo && status.managed) {
          return window.api.invoke('git:remoteBranches', { sessionId }).then((remote) => {
            if (!cancelled) {
              setBranches(remote)
            }
          })
        }
        return undefined
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [sessionId])

  const commands = useMemo<QuickCommand[]>(() => {
    if (!meta) {
      return []
    }
    const all: QuickCommand[] = []

    for (const mode of MODE_SEQUENCE) {
      all.push({
        id: `mode-${mode.value}`,
        icon: mode.value === 'bypassPermissions' ? '🔴' : '🛡️',
        label: `Mode: ${mode.label}`,
        hint: meta.permissionMode === mode.value ? 'current' : undefined,
        keywords: `mode permission switch ${mode.label} ${mode.value} plan ask auto`,
        run: () => void setPermissionMode(sessionId, mode.value)
      })
    }

    for (const model of FALLBACK_MODELS) {
      all.push({
        id: `model-${model.id}`,
        icon: '🧠',
        label: `Model: ${model.displayName}`,
        hint: meta.model === model.id ? 'current' : undefined,
        keywords: `model switch ${model.displayName} ${model.id}`,
        run: () => void setModel(sessionId, model.id)
      })
    }

    for (const branch of branches) {
      all.push({
        id: `branch-${branch}`,
        icon: '⎇',
        label: `Branch: ${branch}`,
        keywords: `branch checkout switch git ${branch}`,
        run: async () => {
          await window.api.invoke('git:checkoutBranch', { sessionId, branch })
        }
      })
    }

    all.push({
      id: 'export',
      icon: '📄',
      label: 'Export transcript as Markdown',
      keywords: 'export save report markdown download',
      run: async () => {
        if (blocks) {
          const markdown = transcriptToMarkdown(meta, blocks)
          await window.api.invoke('sessions:exportTranscript', { sessionId, markdown })
        }
      }
    })

    all.push({
      id: 'rename',
      icon: '✏️',
      label: 'Rename session',
      keywords: 'rename title name session thread',
      run: () => {
        const title = window.prompt('Session name', meta.title)
        if (title?.trim()) {
          void rename(sessionId, title.trim())
        }
      }
    })

    const busy = meta.status.kind === 'thinking' || meta.status.kind === 'running-tool'
    if (busy) {
      all.push({
        id: 'interrupt',
        icon: '⏹️',
        label: 'Interrupt the agent',
        keywords: 'stop interrupt cancel halt',
        run: () => void interrupt(sessionId)
      })
    }

    return all
  }, [meta, branches, blocks, sessionId, setModel, setPermissionMode, interrupt, rename])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (needle === '') {
      return commands
    }
    return commands.filter(
      (c) => c.label.toLowerCase().includes(needle) || c.keywords.toLowerCase().includes(needle)
    )
  }, [commands, query])

  useEffect(() => {
    registerCommands(filtered)
    if (selectedIndex >= filtered.length) {
      setSelectedIndex(Math.max(0, filtered.length - 1))
    }
  }, [filtered, registerCommands, selectedIndex, setSelectedIndex])

  if (!meta) {
    return null
  }

  return (
    <div className="absolute bottom-full left-0 right-0 z-40 mb-2 max-h-72 overflow-y-auto rounded-xl border border-deck-border bg-deck-panel shadow-2xl">
      <p className="border-b border-deck-border px-3 py-1.5 text-[10.5px] uppercase tracking-wide text-zinc-600">
        Quick actions — ↑↓ navigate · ⏎ run · esc close
      </p>
      {filtered.length === 0 && <p className="px-3 py-3 text-xs text-zinc-500">No matching action</p>}
      {filtered.map((command, index) => (
        <button
          key={command.id}
          onClick={() => {
            void command.run()
            onClose()
          }}
          onMouseEnter={() => setSelectedIndex(index)}
          className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-[12.5px] ${
            index === selectedIndex ? 'bg-deck-accent/15 text-zinc-100' : 'text-zinc-300'
          }`}
        >
          <span className="w-5 text-center">{command.icon}</span>
          <span className="truncate">{command.label}</span>
          {command.hint && (
            <span className="ml-auto rounded bg-deck-raised px-1.5 py-0.5 text-[10px] text-zinc-500">
              {command.hint}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}

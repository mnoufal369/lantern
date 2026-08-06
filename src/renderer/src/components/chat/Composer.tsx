import { useState } from 'react'
import { SendHorizonal, Square } from 'lucide-react'
import { useSessionsStore } from '@/stores/useSessionsStore'
import { FALLBACK_MODELS } from '@shared/constants'
import type { PermissionMode, SessionStatus } from '@shared/types'

const MODE_OPTIONS: { value: PermissionMode; label: string; hint: string }[] = [
  { value: 'plan', label: 'Plan', hint: 'Plans before acting' },
  { value: 'default', label: 'Ask', hint: 'Asks before risky tools' },
  { value: 'acceptEdits', label: 'Auto-edit', hint: 'Auto-approves file edits' },
  { value: 'bypassPermissions', label: 'Full auto', hint: 'Never asks — careful!' }
]

export default function Composer({
  sessionId,
  status
}: {
  sessionId: string
  status: SessionStatus
}): React.JSX.Element {
  const [text, setText] = useState('')
  const sendMessage = useSessionsStore((s) => s.sendMessage)
  const interrupt = useSessionsStore((s) => s.interrupt)
  const meta = useSessionsStore((s) => s.sessions[sessionId]?.meta)
  const setModel = useSessionsStore((s) => s.setModel)
  const setPermissionMode = useSessionsStore((s) => s.setPermissionMode)

  const busy = status.kind === 'thinking' || status.kind === 'running-tool'

  const submit = (): void => {
    const trimmed = text.trim()
    if (!trimmed) {
      return
    }
    void sendMessage(sessionId, trimmed)
    setText('')
  }

  return (
    <div className="shrink-0 border-t border-deck-border bg-deck-panel p-3">
      <div className="flex items-end gap-2 rounded-xl border border-deck-border bg-deck-raised p-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || !e.shiftKey)) {
              e.preventDefault()
              submit()
            }
            if (e.key === 'Escape' && busy) {
              void interrupt(sessionId)
            }
          }}
          rows={Math.min(6, Math.max(1, text.split('\n').length))}
          placeholder="Message the agent…  (⏎ send, ⇧⏎ newline, Esc interrupt)"
          className="selectable max-h-40 flex-1 resize-none bg-transparent px-1 py-1 text-sm text-zinc-100 outline-none placeholder:text-zinc-600"
        />
        {busy ? (
          <button
            onClick={() => void interrupt(sessionId)}
            title="Interrupt (Esc)"
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-600/90 text-white hover:bg-red-500"
          >
            <Square size={14} />
          </button>
        ) : (
          <button
            onClick={submit}
            disabled={!text.trim()}
            title="Send (⏎)"
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-deck-accent text-white disabled:opacity-30"
          >
            <SendHorizonal size={14} />
          </button>
        )}
      </div>
      {meta && (
        <div className="mt-2 flex items-center gap-2 px-1">
          <select
            value={meta.model}
            onChange={(e) => void setModel(sessionId, e.target.value)}
            title="Model for this session"
            className="rounded-md border border-deck-border bg-deck-raised px-1.5 py-0.5 text-[11px] text-zinc-400 outline-none hover:text-zinc-200"
          >
            {FALLBACK_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.displayName}
              </option>
            ))}
            {!FALLBACK_MODELS.some((m) => m.id === meta.model) && (
              <option value={meta.model}>{meta.model}</option>
            )}
          </select>
          <div className="flex rounded-md border border-deck-border bg-deck-raised p-0.5">
            {MODE_OPTIONS.map((mode) => (
              <button
                key={mode.value}
                onClick={() => void setPermissionMode(sessionId, mode.value)}
                title={mode.hint}
                className={`rounded px-2 py-0.5 text-[11px] ${
                  meta.permissionMode === mode.value
                    ? mode.value === 'bypassPermissions'
                      ? 'bg-red-700/80 text-white'
                      : 'bg-deck-accent text-white'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>
          {meta.permissionMode === 'bypassPermissions' && (
            <span className="text-[11px] text-red-400">agent acts without asking</span>
          )}
        </div>
      )}
    </div>
  )
}

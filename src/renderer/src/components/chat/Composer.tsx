import { useState } from 'react'
import { SendHorizonal, Square } from 'lucide-react'
import { useSessionsStore } from '@/stores/useSessionsStore'
import type { SessionStatus } from '@shared/types'

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
    </div>
  )
}

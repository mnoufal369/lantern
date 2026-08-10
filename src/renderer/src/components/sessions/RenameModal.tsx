import { useState } from 'react'
import Modal from '@/components/ui/Modal'
import { useSessionsStore } from '@/stores/useSessionsStore'
import { useUiStore } from '@/stores/useUiStore'

/** Rename dialog reachable from anywhere (quick menu, future context menus). */
export default function RenameModal(): React.JSX.Element | null {
  const sessionId = useUiStore((s) => s.renameSessionId)
  const closeRename = useUiStore((s) => s.closeRename)
  const meta = useSessionsStore((s) => (sessionId ? s.sessions[sessionId]?.meta : undefined))
  const rename = useSessionsStore((s) => s.rename)
  const [draft, setDraft] = useState<string | null>(null)

  if (!sessionId || !meta) {
    return null
  }

  const value = draft ?? meta.title
  const close = (): void => {
    setDraft(null)
    closeRename()
  }
  const save = (): void => {
    if (value.trim()) {
      void rename(sessionId, value.trim())
    }
    close()
  }

  return (
    <Modal title="Rename session" onClose={close}>
      <div className="space-y-3">
        <input
          autoFocus
          value={value}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              save()
            }
          }}
          placeholder="Session name"
          className="selectable w-full rounded-lg border border-deck-border bg-deck-raised px-3 py-2 text-sm text-zinc-100 outline-none focus:border-deck-accent"
        />
        <div className="flex justify-end gap-2">
          <button
            onClick={close}
            className="rounded-lg border border-deck-border px-3 py-1.5 text-xs text-zinc-300 hover:bg-deck-raised"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={!value.trim()}
            className="rounded-lg bg-deck-accent px-4 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </div>
    </Modal>
  )
}

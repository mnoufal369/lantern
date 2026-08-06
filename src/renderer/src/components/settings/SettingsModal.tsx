import { useState } from 'react'
import Modal from '@/components/ui/Modal'
import { useSettingsStore } from '@/stores/useSettingsStore'

export default function SettingsModal({ onClose }: { onClose: () => void }): React.JSX.Element {
  const settings = useSettingsStore((s) => s.settings)
  const update = useSettingsStore((s) => s.update)
  const [apiKey, setApiKey] = useState(settings?.apiKey ?? '')
  const [maxSessions, setMaxSessions] = useState(settings?.maxConcurrentSessions ?? 5)
  const [saving, setSaving] = useState(false)

  const save = async (): Promise<void> => {
    setSaving(true)
    await update({ apiKey: apiKey.trim(), maxConcurrentSessions: maxSessions })
    setSaving(false)
    onClose()
  }

  return (
    <Modal title="Settings" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-400">Anthropic API key</label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-ant-…"
            className="selectable w-full rounded-lg border border-deck-border bg-deck-raised px-3 py-2 font-mono text-sm text-zinc-100 outline-none focus:border-deck-accent"
          />
          <p className="mt-1 text-[11px] text-zinc-600">
            Stored locally on this Mac. Get one at console.anthropic.com.
          </p>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-400">Max concurrent running sessions</label>
          <input
            type="number"
            min={1}
            max={10}
            value={maxSessions}
            onChange={(e) => setMaxSessions(Number(e.target.value))}
            className="w-24 rounded-lg border border-deck-border bg-deck-raised px-3 py-2 text-sm text-zinc-100 outline-none focus:border-deck-accent"
          />
          <p className="mt-1 text-[11px] text-zinc-600">
            Each running session is its own agent process — keep this modest.
          </p>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-deck-border px-3 py-1.5 text-xs text-zinc-300 hover:bg-deck-raised"
          >
            Cancel
          </button>
          <button
            onClick={() => void save()}
            disabled={saving}
            className="rounded-lg bg-deck-accent px-4 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

import { useEffect, useState } from 'react'
import { KeyRound, ShieldCheck, TerminalSquare, UserRound } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { useSettingsStore } from '@/stores/useSettingsStore'
import type { AuthStatus } from '@shared/types'

function AuthStatusLine({ status }: { status: AuthStatus | null }): React.JSX.Element {
  if (!status) {
    return <p className="text-[11px] text-zinc-600">Checking auth…</p>
  }
  const content = {
    'settings-key': {
      icon: <KeyRound size={13} className="text-green-400" />,
      text: 'Using the API key saved below',
      sub: status.detail
    },
    'env-key': {
      icon: <TerminalSquare size={13} className="text-green-400" />,
      text: 'Using ANTHROPIC_API_KEY from your environment',
      sub: 'Set before launching Crew'
    },
    'claude-login': {
      icon: <UserRound size={13} className="text-green-400" />,
      text: `Using your Claude Code login — ${status.detail}`,
      sub: 'Sessions bill to your existing Claude plan'
    },
    none: {
      icon: <ShieldCheck size={13} className="text-amber-500" />,
      text: 'No auth found',
      sub: 'Add an API key below, or log in once with the claude CLI'
    }
  }[status.source]

  return (
    <div className="flex items-start gap-2 rounded-lg border border-deck-border bg-deck-raised px-3 py-2">
      <span className="mt-0.5">{content.icon}</span>
      <div>
        <p className="text-xs font-medium text-zinc-200">{content.text}</p>
        <p className="text-[11px] text-zinc-500">{content.sub}</p>
      </div>
    </div>
  )
}

export default function SettingsModal({ onClose }: { onClose: () => void }): React.JSX.Element {
  const settings = useSettingsStore((s) => s.settings)
  const update = useSettingsStore((s) => s.update)
  const [apiKey, setApiKey] = useState('')
  const [maxSessions, setMaxSessions] = useState(settings?.maxConcurrentSessions ?? 5)
  const [saving, setSaving] = useState(false)
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null)

  useEffect(() => {
    void window.api.invoke('app:getAuthStatus').then(setAuthStatus)
  }, [])

  const save = async (): Promise<void> => {
    setSaving(true)
    const patch: { apiKey?: string; maxConcurrentSessions: number } = { maxConcurrentSessions: maxSessions }
    if (apiKey.trim() !== '') {
      patch.apiKey = apiKey.trim()
    }
    await update(patch)
    setSaving(false)
    onClose()
  }

  const removeKey = async (): Promise<void> => {
    await update({ apiKey: '' })
    setApiKey('')
    void window.api.invoke('app:getAuthStatus').then(setAuthStatus)
  }

  return (
    <Modal title="Settings" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-zinc-400">Active authentication</label>
          <AuthStatusLine status={authStatus} />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-400">Anthropic API key (optional)</label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={settings?.hasApiKey ? '••••••••  key saved — type to replace' : 'sk-ant-…'}
            className="selectable w-full rounded-lg border border-deck-border bg-deck-raised px-3 py-2 font-mono text-sm text-zinc-100 outline-none focus:border-deck-accent"
          />
          {settings?.hasApiKey && (
            <button onClick={() => void removeKey()} className="mt-1 text-[11px] text-red-400/80 hover:text-red-400">
              Remove saved key
            </button>
          )}
          <p className="mt-1 text-[11px] text-zinc-600">
            Encrypted with your Mac's keychain, never shown again, never leaves this machine. Overrides your Claude
            Code login when set.
          </p>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-400">Interface mode</label>
          <div className="flex rounded-lg border border-deck-border bg-deck-raised p-0.5">
            {(
              [
                { value: 'simple', label: 'Simple', hint: 'Plain language, guided, no jargon' },
                { value: 'pro', label: 'Pro', hint: 'Diffs, git panel, models, all the dials' }
              ] as const
            ).map((mode) => (
              <button
                key={mode.value}
                onClick={() => void update({ uiMode: mode.value })}
                title={mode.hint}
                className={`flex-1 rounded-md py-1.5 text-xs ${
                  settings?.uiMode === mode.value ? 'bg-deck-accent text-white' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-zinc-600">
            Simple hides technical detail and explains changes in plain words. Same agents, same power.
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

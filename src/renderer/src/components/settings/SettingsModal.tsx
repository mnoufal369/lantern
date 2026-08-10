import { useEffect, useMemo, useState } from 'react'
import { KeyRound, ShieldCheck, TerminalSquare, UserRound } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { useSessionsStore } from '@/stores/useSessionsStore'
import { useProfilesStore } from '@/stores/useProfilesStore'
import type { AuthStatus } from '@shared/types'

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

/** Spend summary computed from persisted session stats — no extra bookkeeping. */
function UsageSection(): React.JSX.Element {
  const sessions = useSessionsStore((s) => s.sessions)
  const profiles = useProfilesStore((s) => s.profiles)

  const usage = useMemo(() => {
    const metas = Object.values(sessions).map((entry) => entry.meta)
    const total = metas.reduce((sum, m) => sum + m.stats.totalCostUsd, 0)
    const week = metas
      .filter((m) => Date.now() - m.lastActiveAt < WEEK_MS)
      .reduce((sum, m) => sum + m.stats.totalCostUsd, 0)
    const byProfile = new Map<string, number>()
    for (const m of metas) {
      byProfile.set(m.profileId, (byProfile.get(m.profileId) ?? 0) + m.stats.totalCostUsd)
    }
    const perProfile = [...byProfile.entries()]
      .map(([profileId, cost]) => ({
        name: profiles.find((p) => p.id === profileId)?.name ?? 'Deleted profile',
        cost
      }))
      .filter((row) => row.cost > 0.005)
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 5)
    return { total, week, perProfile, count: metas.length }
  }, [sessions, profiles])

  return (
    <div className="rounded-lg border border-deck-border bg-deck-raised p-3">
      <div className="flex gap-6">
        <div>
          <p className="text-lg font-semibold tabular-nums text-zinc-100">${usage.week.toFixed(2)}</p>
          <p className="text-[11px] text-zinc-500">last 7 days</p>
        </div>
        <div>
          <p className="text-lg font-semibold tabular-nums text-zinc-100">${usage.total.toFixed(2)}</p>
          <p className="text-[11px] text-zinc-500">all sessions on this Mac ({usage.count})</p>
        </div>
      </div>
      {usage.perProfile.length > 0 && (
        <div className="mt-2 space-y-0.5 border-t border-deck-border pt-2">
          {usage.perProfile.map((row) => (
            <div key={row.name} className="flex justify-between text-[11.5px]">
              <span className="text-zinc-400">{row.name}</span>
              <span className="tabular-nums text-zinc-500">${row.cost.toFixed(2)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

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
      sub: 'Set before launching Pilot'
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
  const [customInstructions, setCustomInstructions] = useState(settings?.customInstructions ?? '')
  const [saving, setSaving] = useState(false)
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null)
  const [version, setVersion] = useState('')

  useEffect(() => {
    void window.api.invoke('app:getAuthStatus').then(setAuthStatus)
    void window.api.invoke('app:getVersion').then(setVersion)
  }, [])

  const save = async (): Promise<void> => {
    setSaving(true)
    const patch: { apiKey?: string; maxConcurrentSessions: number; customInstructions: string } = {
      maxConcurrentSessions: maxSessions,
      customInstructions
    }
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
          <label className="mb-1 block text-xs font-medium text-zinc-400">Appearance</label>
          <div className="flex rounded-lg border border-deck-border bg-deck-raised p-0.5">
            {(
              [
                { value: 'dark', label: '🌙 Dark' },
                { value: 'light', label: '☀️ Light' }
              ] as const
            ).map((theme) => (
              <button
                key={theme.value}
                onClick={() => void update({ theme: theme.value })}
                className={`flex-1 rounded-md py-1.5 text-xs ${
                  settings?.theme === theme.value ? 'bg-deck-accent text-white' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {theme.label}
              </button>
            ))}
          </div>
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
          <label className="mb-1 block text-xs font-medium text-zinc-400">Instructions for your agents</label>
          <textarea
            value={customInstructions}
            onChange={(e) => setCustomInstructions(e.target.value)}
            rows={4}
            placeholder={'Style and behaviour rules every agent follows, e.g.\n- Keep answers scannable: short headers, bullets, key point first\n- No filler openers like "Certainly" or "Great question"'}
            className="selectable w-full resize-y rounded-lg border border-deck-border bg-deck-raised px-3 py-2 text-xs text-zinc-100 outline-none focus:border-deck-accent"
          />
          <p className="mt-1 text-[11px] text-zinc-600">
            Applies to every agent and session, on top of each agent's own prompt. Takes effect on new sessions.
          </p>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-400">Max concurrent running sessions</label>
          <input
            type="number"
            min={1}
            max={10}
            value={maxSessions}
            onChange={(e) => {
              const value = Number(e.target.value)
              setMaxSessions(Number.isFinite(value) && e.target.value !== '' ? value : 5)
            }}
            className="w-24 rounded-lg border border-deck-border bg-deck-raised px-3 py-2 text-sm text-zinc-100 outline-none focus:border-deck-accent"
          />
          <p className="mt-1 text-[11px] text-zinc-600">
            Each running session is its own agent process — keep this modest.
          </p>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-400">Usage</label>
          <UsageSection />
        </div>

        {version && <p className="text-center text-[11px] text-zinc-600">Pilot v{version}</p>}

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

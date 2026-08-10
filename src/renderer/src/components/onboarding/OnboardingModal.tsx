import { useEffect, useState } from 'react'
import { KeyRound, Loader2, TerminalSquare, UserRound } from 'lucide-react'
import type { AuthStatus, UiMode } from '@shared/types'
import { useSettingsStore } from '@/stores/useSettingsStore'

const CHOICES: {
  mode: UiMode
  emoji: string
  title: string
  text: string
  footer: string
}[] = [
  {
    mode: 'simple',
    emoji: '🌱',
    title: 'Keep it simple',
    text: 'Plain language, guided actions, changes explained in sentences. Great for QA, analysis and anyone who doesn’t live in code.',
    footer: 'You can switch anytime in Settings'
  },
  {
    mode: 'pro',
    emoji: '👩‍💻',
    title: 'Show me everything',
    text: 'The full cockpit — live diffs, git panel, models, permission modes and all the dials.',
    footer: 'You can switch anytime in Settings'
  }
]

export default function OnboardingModal(): React.JSX.Element {
  const update = useSettingsStore((s) => s.update)
  const [mode, setMode] = useState<UiMode | null>(null)
  const [auth, setAuth] = useState<AuthStatus | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (mode) {
      void window.api.invoke('app:getAuthStatus').then(setAuth)
    }
  }, [mode])

  const finish = async (): Promise<void> => {
    setSaving(true)
    if (apiKey.trim()) {
      await update({ apiKey: apiKey.trim() })
    }
    await update({ uiMode: mode ?? 'simple', onboarded: true })
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-deck-bg">
      <div className="w-full max-w-xl px-8">
        <div className="text-center">
          <div className="text-5xl">🛰️</div>
          <h1 className="mt-3 bg-gradient-to-r from-sky-300 via-zinc-100 to-cyan-300 bg-clip-text text-2xl font-bold text-transparent">
            Welcome aboard Pilot
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            {mode === null ? 'One question: how do you like your cockpit?' : 'Last thing — connecting your agent.'}
          </p>
        </div>

        {mode === null ? (
          <div className="mt-8 grid grid-cols-2 gap-4">
            {CHOICES.map((choice) => (
              <button
                key={choice.mode}
                onClick={() => setMode(choice.mode)}
                className="group rounded-2xl border border-deck-border bg-deck-panel p-6 text-left transition-all hover:-translate-y-0.5 hover:border-deck-accent/60 hover:bg-deck-accent/5"
              >
                <div className="text-3xl">{choice.emoji}</div>
                <p className="mt-3 text-[16px] font-semibold text-zinc-100">{choice.title}</p>
                <p className="mt-1.5 text-[13px] leading-relaxed text-zinc-400">{choice.text}</p>
                <p className="mt-4 text-[11px] font-medium text-sky-400/80">{choice.footer}</p>
              </button>
            ))}
          </div>
        ) : (
          <div className="mt-8 space-y-4">
            {auth === null && (
              <p className="flex items-center justify-center gap-2 py-6 text-sm text-zinc-500">
                <Loader2 size={14} className="animate-spin" /> Checking what’s already set up…
              </p>
            )}

            {auth !== null && auth.source !== 'none' && (
              <div className="rounded-2xl border border-green-900/50 bg-green-950/20 p-5">
                <p className="flex items-center gap-2 text-sm font-medium text-zinc-100">
                  {auth.source === 'claude-login' ? (
                    <UserRound size={15} className="text-green-400" />
                  ) : (
                    <TerminalSquare size={15} className="text-green-400" />
                  )}
                  You’re already connected
                </p>
                <p className="mt-1.5 text-[13px] text-zinc-400">
                  {auth.source === 'claude-login'
                    ? `Pilot found your Claude Code login (${auth.detail}) and will use it automatically.`
                    : auth.detail}
                </p>
              </div>
            )}

            {auth !== null && auth.source === 'none' && (
              <div className="rounded-2xl border border-deck-border bg-deck-panel p-5">
                <p className="flex items-center gap-2 text-sm font-medium text-zinc-100">
                  <KeyRound size={15} className="text-amber-400" /> Add your Anthropic API key
                </p>
                <p className="mt-1.5 text-[13px] text-zinc-400">
                  No Claude login was found on this Mac. Paste an API key — it’s encrypted in your keychain and never
                  leaves this machine.
                </p>
                <input
                  autoFocus
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-ant-…"
                  className="selectable mt-3 w-full rounded-lg border border-deck-border bg-deck-raised px-3 py-2 font-mono text-sm text-zinc-100 outline-none focus:border-deck-accent"
                />
              </div>
            )}

            {auth !== null && (
              <div className="flex items-center justify-between">
                <button onClick={() => setMode(null)} className="text-xs text-zinc-500 hover:text-zinc-300">
                  ← Back
                </button>
                <div className="flex items-center gap-3">
                  {auth.source === 'none' && !apiKey.trim() && (
                    <button
                      onClick={() => void finish()}
                      disabled={saving}
                      className="text-xs text-zinc-500 underline-offset-2 hover:underline"
                    >
                      Skip for now
                    </button>
                  )}
                  <button
                    onClick={() => void finish()}
                    disabled={saving || (auth.source === 'none' && apiKey.trim() !== '' && !apiKey.startsWith('sk-'))}
                    className="rounded-lg bg-deck-accent px-5 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                  >
                    {saving ? 'Setting up…' : 'Start flying'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

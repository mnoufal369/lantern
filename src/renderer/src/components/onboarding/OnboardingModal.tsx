import { useState } from 'react'
import type { UiMode } from '@shared/types'
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
  const [picking, setPicking] = useState<UiMode | null>(null)

  const choose = async (mode: UiMode): Promise<void> => {
    setPicking(mode)
    await update({ uiMode: mode, onboarded: true })
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-deck-bg">
      <div className="w-full max-w-xl px-8">
        <div className="text-center">
          <div className="text-5xl">🛰️</div>
          <h1 className="mt-3 bg-gradient-to-r from-sky-300 via-zinc-100 to-cyan-300 bg-clip-text text-2xl font-bold text-transparent">
            Welcome aboard Pilot
          </h1>
          <p className="mt-2 text-sm text-zinc-400">One question: how do you like your cockpit?</p>
        </div>
        <div className="mt-8 grid grid-cols-2 gap-4">
          {CHOICES.map((choice) => (
            <button
              key={choice.mode}
              disabled={picking !== null}
              onClick={() => void choose(choice.mode)}
              className="group rounded-2xl border border-deck-border bg-deck-panel p-6 text-left transition-all hover:-translate-y-0.5 hover:border-deck-accent/60 hover:bg-deck-accent/5 disabled:opacity-60"
            >
              <div className="text-3xl">{choice.emoji}</div>
              <p className="mt-3 text-[16px] font-semibold text-zinc-100">{choice.title}</p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-zinc-400">{choice.text}</p>
              <p className="mt-4 text-[11px] font-medium text-sky-400/80">
                {picking === choice.mode ? 'Setting up…' : choice.footer}
              </p>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

import { useState } from 'react'
import type { Persona, UiMode } from '@shared/types'
import { useSettingsStore } from '@/stores/useSettingsStore'

const PERSONAS: {
  key: Persona
  emoji: string
  title: string
  text: string
  mode: UiMode
  footer: string
}[] = [
  {
    key: 'developer',
    emoji: '👩‍💻',
    title: 'Developer',
    text: 'I write code. Give me diffs, terminals, git, models and all the dials.',
    mode: 'pro',
    footer: 'Pro interface'
  },
  {
    key: 'qa',
    emoji: '🐞',
    title: 'QA / Tester',
    text: 'I verify software. I want to hunt bugs, check flows and get clear reports.',
    mode: 'simple',
    footer: 'Simple interface + QA agent'
  },
  {
    key: 'consultant',
    emoji: '💼',
    title: 'Consultant / Analyst',
    text: 'I assess products. I ask questions about codebases and write findings.',
    mode: 'simple',
    footer: 'Simple interface + Consultant agent'
  },
  {
    key: 'curious',
    emoji: '🌱',
    title: 'Just curious',
    text: 'I don’t code. I want to understand apps and build things by describing them.',
    mode: 'simple',
    footer: 'Simple interface + Explainer agent'
  }
]

export default function OnboardingModal(): React.JSX.Element {
  const update = useSettingsStore((s) => s.update)
  const [picking, setPicking] = useState<Persona | null>(null)

  const choose = async (persona: (typeof PERSONAS)[number]): Promise<void> => {
    setPicking(persona.key)
    await update({ uiMode: persona.mode, onboarded: true })
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-deck-bg">
      <div className="w-full max-w-2xl px-8">
        <div className="text-center">
          <div className="text-5xl">🛰️</div>
          <h1 className="mt-3 bg-gradient-to-r from-sky-300 via-zinc-100 to-violet-300 bg-clip-text text-2xl font-bold text-transparent">
            Welcome aboard dockPilot
          </h1>
          <p className="mt-2 text-sm text-zinc-400">What describes you best? This tunes the whole app — you can switch anytime in Settings.</p>
        </div>
        <div className="mt-8 grid grid-cols-2 gap-3">
          {PERSONAS.map((persona) => (
            <button
              key={persona.key}
              disabled={picking !== null}
              onClick={() => void choose(persona)}
              className="group rounded-2xl border border-deck-border bg-deck-panel p-5 text-left transition-all hover:-translate-y-0.5 hover:border-deck-accent/60 hover:bg-deck-accent/5 disabled:opacity-60"
            >
              <div className="text-3xl">{persona.emoji}</div>
              <p className="mt-2.5 text-[15px] font-semibold text-zinc-100">{persona.title}</p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-zinc-400">{persona.text}</p>
              <p className="mt-3 text-[11px] font-medium text-sky-400/80">
                {picking === persona.key ? 'Setting up…' : persona.footer}
              </p>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

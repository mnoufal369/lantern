import { useEffect, useState } from 'react'
import TopBar from '@/components/layout/TopBar'
import Sidebar from '@/components/layout/Sidebar'
import ChatView from '@/components/chat/ChatView'
import RightPanel from '@/components/git/RightPanel'
import PermissionDialog from '@/components/permissions/PermissionDialog'
import SettingsModal from '@/components/settings/SettingsModal'
import NewSessionModal from '@/components/sessions/NewSessionModal'
import TerminalHistoryModal from '@/components/sessions/TerminalHistoryModal'
import RenameModal from '@/components/sessions/RenameModal'
import AgentBuilder from '@/components/agents/AgentBuilder'
import OnboardingModal from '@/components/onboarding/OnboardingModal'
import { useSessionsStore } from '@/stores/useSessionsStore'
import { useProfilesStore } from '@/stores/useProfilesStore'
import { usePermissionsStore } from '@/stores/usePermissionsStore'
import { useSettingsStore } from '@/stores/useSettingsStore'
import PilotMark from '@/components/ui/PilotMark'

export default function App(): React.JSX.Element {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [newSessionOpen, setNewSessionOpen] = useState(false)
  const [builderOpen, setBuilderOpen] = useState(false)
  const [droppedFolder, setDroppedFolder] = useState<string | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const activeId = useSessionsStore((s) => s.activeId)
  const settings = useSettingsStore((s) => s.settings)
  const simple = settings?.uiMode === 'simple'

  useEffect(() => {
    void useSessionsStore.getState().init()
    void useProfilesStore.getState().init()
    void useSettingsStore.getState().init()

    const offEvents = window.api.on('session:events', ({ sessionId, events }) => {
      useSessionsStore.getState().applyEventBatch(sessionId, events)
    })
    const offStatus = window.api.on('session:status', ({ sessionId, status, stats, filesTouched }) => {
      useSessionsStore.getState().applyStatus(sessionId, status, stats, filesTouched)
    })
    const offPermission = window.api.on('permission:request', (request) => {
      usePermissionsStore.getState().push(request)
    })
    const offResolved = window.api.on('permission:resolved', ({ requestId }) => {
      usePermissionsStore.getState().removeResolved(requestId)
    })
    const offFocus = window.api.on('session:focus', ({ sessionId }) => {
      useSessionsStore.getState().setActive(sessionId)
    })

    return () => {
      offEvents()
      offStatus()
      offPermission()
      offResolved()
      offFocus()
    }
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.metaKey && e.key === 'n') {
        e.preventDefault()
        setNewSessionOpen(true)
      }
      if (e.metaKey && e.key >= '1' && e.key <= '9') {
        const { order, sessions, setActive } = useSessionsStore.getState()
        const visible = order.filter((id) => !sessions[id].meta.archived)
        const target = visible[Number(e.key) - 1]
        if (target) {
          e.preventDefault()
          setActive(target)
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('light', settings?.theme === 'light')
  }, [settings?.theme])

  const needsApiKey = settings !== null && !settings.hasApiKey

  const onDrop = (e: React.DragEvent): void => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (!file) {
      return
    }
    const path = window.api.getPathForFile(file)
    if (path) {
      setDroppedFolder(path)
      setNewSessionOpen(true)
    }
  }

  if (settings && !settings.onboarded) {
    return <OnboardingModal />
  }

  return (
    <div className="flex h-full flex-col" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
      <TopBar
        onNewSession={() => setNewSessionOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenBuilder={() => setBuilderOpen(true)}
      />
      <div className="flex min-h-0 flex-1">
        <Sidebar onNewSession={() => setNewSessionOpen(true)} onOpenHistory={() => setHistoryOpen(true)} />
        <main className="flex min-w-0 flex-1">
          {activeId ? (
            <ChatView key={activeId} sessionId={activeId} />
          ) : (
            <EmptyState onNewSession={() => setNewSessionOpen(true)} needsApiKey={needsApiKey} onOpenSettings={() => setSettingsOpen(true)} />
          )}
          {activeId && !simple && <RightPanel sessionId={activeId} />}
        </main>
      </div>

      <PermissionDialog />
      <RenameModal />
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      {newSessionOpen && (
        <NewSessionModal
          onClose={() => {
            setNewSessionOpen(false)
            setDroppedFolder(null)
          }}
          onOpenBuilder={() => setBuilderOpen(true)}
          initialCwd={droppedFolder ?? undefined}
        />
      )}
      {builderOpen && <AgentBuilder onClose={() => setBuilderOpen(false)} />}
      {historyOpen && <TerminalHistoryModal onClose={() => setHistoryOpen(false)} />}
    </div>
  )
}

const MISSIONS = [
  {
    emoji: '🌱',
    title: 'Build something new',
    text: 'A website, a script, a tiny app — describe it in plain words, your agent writes every line.',
    gradient: 'from-emerald-500/20 via-teal-500/10 to-transparent',
    border: 'border-emerald-500/30 hover:border-emerald-400/60',
    chip: 'bg-emerald-500/20',
    glow: 'hover:shadow-[0_12px_44px_rgba(16,185,129,0.18)]'
  },
  {
    emoji: '🔧',
    title: 'Fix or improve a project',
    text: 'Point it at a folder. It reads the code, proposes changes as diffs, and asks before touching anything.',
    gradient: 'from-sky-500/20 via-cyan-500/10 to-transparent',
    border: 'border-sky-500/30 hover:border-sky-400/60',
    chip: 'bg-sky-500/20',
    glow: 'hover:shadow-[0_12px_44px_rgba(41,172,194,0.2)]'
  },
  {
    emoji: '📖',
    title: 'Understand anything',
    text: 'Drop it into an unfamiliar project and ask "explain this to me" — get a guided tour, no jargon.',
    gradient: 'from-amber-500/20 via-orange-500/10 to-transparent',
    border: 'border-amber-500/30 hover:border-amber-400/60',
    chip: 'bg-amber-500/20',
    glow: 'hover:shadow-[0_12px_44px_rgba(245,158,11,0.16)]'
  }
]

const HINTS = [
  { keys: '⌘N', label: 'new session' },
  { keys: '⌘K', label: 'quick actions' },
  { keys: '⌘F', label: 'search chat' },
  { keys: '⌘V', label: 'paste a screenshot' },
  { keys: 'esc', label: 'interrupt' }
]

function EmptyState({
  onNewSession,
  needsApiKey,
  onOpenSettings
}: {
  onNewSession: () => void
  needsApiKey: boolean
  onOpenSettings: () => void
}): React.JSX.Element {
  return (
    <div className="relative flex flex-1 flex-col items-center justify-center gap-6 px-8">
      <div className="hero-glow" />
      <PilotMark size={84} />
      <div className="text-center">
        <h1 className="hero-title bg-clip-text text-3xl font-extrabold tracking-tight text-transparent">
          You talk. Pilot builds.
        </h1>
        <p className="mt-2 max-w-md text-sm text-zinc-400">
          A whole team of AI agents at your command — and you approve every change.
        </p>
      </div>
      <div className="z-10 grid w-full max-w-2xl grid-cols-3 gap-3">
        {MISSIONS.map((mission) => (
          <button
            key={mission.title}
            onClick={onNewSession}
            className={`group rounded-2xl border ${mission.border} bg-gradient-to-b ${mission.gradient} p-4 text-left transition-all hover:-translate-y-1 ${mission.glow}`}
          >
            <span className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${mission.chip} text-xl`}>
              {mission.emoji}
            </span>
            <p className="mt-3 text-sm font-semibold text-zinc-100">{mission.title}</p>
            <p className="mt-1 text-[12px] leading-relaxed text-zinc-400">{mission.text}</p>
            <p className="mt-2 text-[11px] font-medium text-deck-accent opacity-0 transition-opacity group-hover:opacity-100">
              Start →
            </p>
          </button>
        ))}
      </div>
      <button
        onClick={onNewSession}
        className="btn-brand z-10 rounded-xl px-6 py-2.5 text-sm font-semibold text-white"
      >
        Start a session&ensp;⌘N
      </button>
      <div className="z-10 flex flex-wrap items-center justify-center gap-2">
        {HINTS.map((hint) => (
          <span
            key={hint.keys}
            className="rounded-full border border-deck-border bg-deck-panel/60 px-2.5 py-1 text-[10.5px] text-zinc-500"
          >
            <span className="font-mono font-semibold text-zinc-300">{hint.keys}</span> {hint.label}
          </span>
        ))}
      </div>
      {needsApiKey && (
        <button onClick={onOpenSettings} className="z-10 text-xs text-zinc-500 underline-offset-2 hover:underline">
          Using your Claude Code login — or add an API key in Settings
        </button>
      )}
    </div>
  )
}

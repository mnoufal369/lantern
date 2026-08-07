import { useEffect, useState } from 'react'
import TopBar from '@/components/layout/TopBar'
import Sidebar from '@/components/layout/Sidebar'
import ChatView from '@/components/chat/ChatView'
import RightPanel from '@/components/git/RightPanel'
import PermissionDialog from '@/components/permissions/PermissionDialog'
import SettingsModal from '@/components/settings/SettingsModal'
import NewSessionModal from '@/components/sessions/NewSessionModal'
import TerminalHistoryModal from '@/components/sessions/TerminalHistoryModal'
import AgentBuilder from '@/components/agents/AgentBuilder'
import OnboardingModal from '@/components/onboarding/OnboardingModal'
import { useSessionsStore } from '@/stores/useSessionsStore'
import { useProfilesStore } from '@/stores/useProfilesStore'
import { usePermissionsStore } from '@/stores/usePermissionsStore'
import { useSettingsStore } from '@/stores/useSettingsStore'

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

    return () => {
      offEvents()
      offStatus()
      offPermission()
      offResolved()
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
    gradient: 'from-emerald-500/15 to-teal-500/5'
  },
  {
    emoji: '🔧',
    title: 'Fix or improve a project',
    text: 'Point it at a folder. It reads the code, proposes changes as diffs, and asks before touching anything.',
    gradient: 'from-sky-500/15 to-violet-500/5'
  },
  {
    emoji: '📖',
    title: 'Understand anything',
    text: 'Drop it into an unfamiliar project and ask "explain this to me" — get a guided tour, no jargon.',
    gradient: 'from-amber-500/15 to-orange-500/5'
  }
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
    <div className="flex flex-1 flex-col items-center justify-center gap-5 px-8">
      <div className="text-5xl">🛰️</div>
      <div className="text-center">
        <h1 className="bg-gradient-to-r from-sky-300 via-zinc-100 to-cyan-300 bg-clip-text text-2xl font-bold text-transparent">
          You talk. Pilot builds.
        </h1>
        <p className="mt-1.5 max-w-md text-sm text-zinc-400">
          A whole team of AI agents at your command — and you approve every change.
        </p>
      </div>
      <div className="grid w-full max-w-2xl grid-cols-3 gap-3">
        {MISSIONS.map((mission) => (
          <button
            key={mission.title}
            onClick={onNewSession}
            className={`group rounded-xl border border-deck-border bg-gradient-to-b ${mission.gradient} p-4 text-left transition-transform hover:-translate-y-0.5 hover:border-zinc-600`}
          >
            <div className="text-2xl">{mission.emoji}</div>
            <p className="mt-2 text-sm font-semibold text-zinc-100">{mission.title}</p>
            <p className="mt-1 text-[12px] leading-relaxed text-zinc-400">{mission.text}</p>
          </button>
        ))}
      </div>
      <button
        onClick={onNewSession}
        className="rounded-lg bg-deck-accent px-5 py-2 text-sm font-medium text-white shadow-lg shadow-sky-950/40 hover:opacity-90"
      >
        Start a session&ensp;⌘N
      </button>
      {needsApiKey && (
        <button onClick={onOpenSettings} className="text-xs text-zinc-500 underline-offset-2 hover:underline">
          Using your Claude Code login — or add an API key in Settings
        </button>
      )}
    </div>
  )
}

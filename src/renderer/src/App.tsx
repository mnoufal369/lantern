import { useEffect, useState } from 'react'
import TopBar from '@/components/layout/TopBar'
import Sidebar from '@/components/layout/Sidebar'
import ChatView from '@/components/chat/ChatView'
import RightPanel from '@/components/git/RightPanel'
import PermissionDialog from '@/components/permissions/PermissionDialog'
import SettingsModal from '@/components/settings/SettingsModal'
import NewSessionModal from '@/components/sessions/NewSessionModal'
import AgentBuilder from '@/components/agents/AgentBuilder'
import { useSessionsStore } from '@/stores/useSessionsStore'
import { useProfilesStore } from '@/stores/useProfilesStore'
import { usePermissionsStore } from '@/stores/usePermissionsStore'
import { useSettingsStore } from '@/stores/useSettingsStore'

export default function App(): React.JSX.Element {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [newSessionOpen, setNewSessionOpen] = useState(false)
  const [builderOpen, setBuilderOpen] = useState(false)
  const activeId = useSessionsStore((s) => s.activeId)
  const settings = useSettingsStore((s) => s.settings)

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

  const needsApiKey = settings !== null && settings.apiKey.trim() === ''

  return (
    <div className="flex h-full flex-col">
      <TopBar
        onNewSession={() => setNewSessionOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenBuilder={() => setBuilderOpen(true)}
      />
      <div className="flex min-h-0 flex-1">
        <Sidebar onNewSession={() => setNewSessionOpen(true)} />
        <main className="flex min-w-0 flex-1">
          {activeId ? (
            <ChatView key={activeId} sessionId={activeId} />
          ) : (
            <EmptyState onNewSession={() => setNewSessionOpen(true)} needsApiKey={needsApiKey} onOpenSettings={() => setSettingsOpen(true)} />
          )}
          {activeId && <RightPanel sessionId={activeId} />}
        </main>
      </div>

      <PermissionDialog />
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      {newSessionOpen && (
        <NewSessionModal onClose={() => setNewSessionOpen(false)} onOpenBuilder={() => setBuilderOpen(true)} />
      )}
      {builderOpen && <AgentBuilder onClose={() => setBuilderOpen(false)} />}
    </div>
  )
}

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
    <div className="flex flex-1 flex-col items-center justify-center gap-4">
      <div className="text-5xl">🛰️</div>
      <h1 className="text-xl font-semibold text-zinc-100">Welcome to AgentDeck</h1>
      <p className="max-w-sm text-center text-sm text-zinc-400">
        Run and configure AI agents in parallel — with rich diffs, permission control and git awareness.
      </p>
      <button
        onClick={onNewSession}
        className="rounded-lg bg-deck-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
      >
        New Session&ensp;⌘N
      </button>
      {needsApiKey && (
        <button onClick={onOpenSettings} className="text-xs text-zinc-500 underline-offset-2 hover:underline">
          Using your Claude Code login — or add an API key in Settings
        </button>
      )}
    </div>
  )
}

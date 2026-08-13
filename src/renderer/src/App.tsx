import { useEffect, useState } from 'react'
import { Check, Copy, FolderOpen, History, Plus, Rocket, Settings as SettingsIcon, Users, X } from 'lucide-react'
import { APP_NAME, UPDATE_COMMAND } from '@shared/constants'
import type { UpdateProgress } from '@shared/types'
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

export default function App(): React.JSX.Element {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [newSessionOpen, setNewSessionOpen] = useState(false)
  const [builderOpen, setBuilderOpen] = useState(false)
  const [droppedFolder, setDroppedFolder] = useState<string | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [update, setUpdate] = useState<{ available: boolean; canSelf: boolean; version?: string }>({
    available: false,
    canSelf: false
  })
  const [progress, setProgress] = useState<UpdateProgress | null>(null)
  const [updateDismissed, setUpdateDismissed] = useState(false)
  const activeId = useSessionsStore((s) => s.activeId)
  const settings = useSettingsStore((s) => s.settings)
  const simple = settings?.uiMode === 'simple'

  useEffect(() => {
    const check = (): void => {
      window.api
        .invoke('app:checkForUpdate')
        .then(({ updateAvailable, canSelfUpdate, latestVersion }) =>
          setUpdate({ available: updateAvailable, canSelf: canSelfUpdate, version: latestVersion })
        )
        .catch(() => undefined)
    }
    check()
    const timer = setInterval(check, 6 * 60 * 60 * 1000)
    return () => clearInterval(timer)
  }, [])

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
    const offProgress = window.api.on('update:progress', (p) => setProgress(p))
    const offCreated = window.api.on('session:created', (meta) => {
      useSessionsStore.setState((state) => ({
        sessions: { ...state.sessions, [meta.id]: { meta, blocks: [], historyLoaded: true } },
        order: [meta.id, ...state.order.filter((id) => id !== meta.id)],
        activeId: meta.id
      }))
    })

    return () => {
      offEvents()
      offStatus()
      offPermission()
      offResolved()
      offFocus()
      offCreated()
      offProgress()
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

  const openFolderPicker = async (): Promise<void> => {
    const picked = await window.api.invoke('dialog:pickFolder')
    if (picked) {
      setDroppedFolder(picked)
      setNewSessionOpen(true)
    }
  }

  const onDrop = (e: React.DragEvent): void => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    // Only folders start a session (folders have no MIME type). Images are
    // handled by the composer; other files are ignored.
    if (!file || file.type !== '') {
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
      {(progress ? progress.phase !== 'ready' || !updateDismissed : update.available && !updateDismissed) && (
        <UpdateBanner
          canSelfUpdate={update.canSelf}
          version={progress?.version ?? update.version}
          progress={progress}
          onDismiss={() => setUpdateDismissed(true)}
          onRetry={() => setProgress(null)}
        />
      )}
      <div className="flex min-h-0 flex-1">
        <Sidebar onNewSession={() => setNewSessionOpen(true)} onOpenHistory={() => setHistoryOpen(true)} />
        <main className="flex min-w-0 flex-1">
          {activeId ? (
            <ChatView key={activeId} sessionId={activeId} />
          ) : (
            <EmptyState
              onNewSession={() => setNewSessionOpen(true)}
              onOpenFolder={() => void openFolderPicker()}
              onOpenHistory={() => setHistoryOpen(true)}
              onOpenBuilder={() => setBuilderOpen(true)}
              onOpenSettings={() => setSettingsOpen(true)}
              needsApiKey={needsApiKey}
            />
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

function UpdateBanner({
  canSelfUpdate,
  version,
  progress,
  onDismiss,
  onRetry
}: {
  canSelfUpdate: boolean
  version?: string
  progress: UpdateProgress | null
  onDismiss: () => void
  onRetry: () => void
}): React.JSX.Element {
  const [copied, setCopied] = useState(false)
  const name = version ? `Pilot ${version}` : 'A new Pilot version'
  const phase = progress?.phase

  const shell = (children: React.ReactNode): React.JSX.Element => (
    <div className="flex shrink-0 items-center gap-2.5 border-b border-deck-accent/30 bg-deck-accent/10 px-4 py-1.5 text-[12px]">
      {children}
    </div>
  )

  // ── working: download or rebuild, app stays usable ────────────────────────
  if (phase === 'downloading' || phase === 'preparing') {
    const pct = progress?.percent
    return shell(
      <>
        <Rocket size={13} className="shrink-0 animate-pulse text-deck-accent-text" />
        <span className="text-zinc-300">
          Getting {name} ready. You can keep working — Pilot will ask before it restarts.
        </span>
        <span className="upd-track" title={progress?.detail}>
          <span
            className={pct === undefined ? 'upd-fill upd-fill-indet' : 'upd-fill'}
            style={pct === undefined ? undefined : { width: `${pct}%` }}
          />
        </span>
        <span className="tabular-nums text-zinc-500">
          {progress?.detail ?? (pct !== undefined ? `${pct}%` : 'Working…')}
        </span>
      </>
    )
  }

  // ── ready: nothing restarts until the user says so ────────────────────────
  if (phase === 'ready') {
    return shell(
      <>
        <Rocket size={13} className="shrink-0 text-deck-accent-text" />
        <span className="text-zinc-300">
          {name} is downloaded and ready. Restarting takes a few seconds.
        </span>
        <button
          onClick={() => {
            void window.api
              .invoke('app:busyCount')
              .then((busy) => {
                if (
                  busy > 0 &&
                  !window.confirm(
                    `${busy} agent${busy > 1 ? 's are' : ' is'} still working.\n\n` +
                      'Restarting now stops them mid-task. Their conversations are saved either way.'
                  )
                ) {
                  return undefined
                }
                return window.api.invoke('app:installUpdate').then(({ started, reason }) => {
                  if (!started && reason) {
                    window.alert(reason)
                  }
                })
              })
              .catch(() => undefined)
          }}
          className="btn-brand rounded-md px-2.5 py-0.5 text-[11.5px] font-medium"
        >
          Restart now
        </button>
        <button
          onClick={onDismiss}
          title="Keep working. Pilot will offer the update again next time you open it."
          className="rounded px-2 py-0.5 text-[11.5px] text-zinc-400 hover:bg-deck-raised hover:text-zinc-200"
        >
          Later
        </button>
      </>
    )
  }

  // ── restarting ────────────────────────────────────────────────────────────
  if (phase === 'installing') {
    return shell(
      <>
        <Rocket size={13} className="shrink-0 animate-pulse text-deck-accent-text" />
        <span className="text-zinc-300">Restarting Pilot to finish the update…</span>
      </>
    )
  }

  // ── failed ────────────────────────────────────────────────────────────────
  if (phase === 'error') {
    return shell(
      <>
        <X size={13} className="shrink-0 text-red-400" />
        <span className="text-zinc-300">
          The update could not be completed.{' '}
          <span className="text-zinc-500">{progress?.reason}</span>
        </span>
        <button
          onClick={onRetry}
          className="rounded border border-deck-border px-2 py-0.5 text-[11.5px] text-zinc-300 hover:bg-deck-raised"
        >
          Try again
        </button>
        <button onClick={onDismiss} className="ml-auto text-zinc-500 hover:text-zinc-200">
          <X size={13} />
        </button>
      </>
    )
  }

  // ── available ─────────────────────────────────────────────────────────────
  return shell(
    <>
      <Rocket size={13} className="shrink-0 text-deck-accent-text" />
      <span className="text-zinc-300">{name} is available.</span>
      {canSelfUpdate ? (
        <button
          onClick={() => {
            if (
              !window.confirm(
                `Download ${name}?\n\n` +
                  'Pilot keeps running while it downloads, then asks you before restarting. ' +
                  'Nothing is replaced until you agree.'
              )
            ) {
              return
            }
            window.api
              .invoke('app:prepareUpdate')
              .then(({ started, reason }) => {
                if (!started && reason) {
                  window.alert(reason)
                }
              })
              .catch(() => undefined)
          }}
          className="btn-brand rounded-md px-2.5 py-0.5 text-[11.5px] font-medium"
        >
          Update now
        </button>
      ) : (
        <code className="rounded bg-deck-raised px-2 py-0.5 font-mono text-[11px] text-zinc-200">{UPDATE_COMMAND}</code>
      )}
      <button
        onClick={() => {
          void navigator.clipboard.writeText(UPDATE_COMMAND)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        }}
        title="Copy the manual update command"
        className="flex items-center gap-1 rounded px-1.5 py-0.5 text-zinc-400 hover:bg-deck-raised hover:text-zinc-200"
      >
        {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
        {copied ? 'Copied' : 'Copy'}
      </button>
      <button
        onClick={onDismiss}
        title="Dismiss until next launch"
        className="ml-auto text-zinc-500 hover:text-zinc-200"
      >
        <X size={13} />
      </button>
    </>
  )
}

function EmptyState({
  onNewSession,
  onOpenFolder,
  onOpenHistory,
  onOpenBuilder,
  onOpenSettings,
  needsApiKey
}: {
  onNewSession: () => void
  onOpenFolder: () => void
  onOpenHistory: () => void
  onOpenBuilder: () => void
  onOpenSettings: () => void
  needsApiKey: boolean
}): React.JSX.Element {
  const [version, setVersion] = useState('')

  useEffect(() => {
    void window.api.invoke('app:getVersion').then(setVersion).catch(() => undefined)
  }, [])

  const actions = [
    { icon: <Plus size={14} />, label: 'New session', shortcut: '⌘N', onClick: onNewSession, primary: true },
    { icon: <FolderOpen size={14} />, label: 'Open a folder', onClick: onOpenFolder },
    { icon: <History size={14} />, label: 'Terminal history / restore by session ID', onClick: onOpenHistory },
    { icon: <Users size={14} />, label: 'Agent profiles', onClick: onOpenBuilder },
    { icon: <SettingsIcon size={14} />, label: 'Settings', onClick: onOpenSettings }
  ]

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-8">
      <p className="text-[20px] font-medium text-zinc-300">{APP_NAME}</p>
      <p className="mt-0.5 text-[11.5px] text-zinc-600">{version ? `Version ${version}` : ''}</p>

      <div className="mt-7 flex w-[300px] flex-col gap-0.5">
        {actions.map((action) => (
          <button
            key={action.label}
            onClick={action.onClick}
            className={`flex h-9 items-center gap-2.5 rounded-md px-3 text-[13px] ${
              action.primary
                ? 'bg-deck-raised text-zinc-100 hover:bg-deck-raised/70'
                : 'text-zinc-400 hover:bg-deck-raised hover:text-zinc-200'
            }`}
          >
            <span className="shrink-0 text-zinc-500">{action.icon}</span>
            {action.label}
            {action.shortcut && <span className="ml-auto font-mono text-[11px] text-zinc-600">{action.shortcut}</span>}
          </button>
        ))}
      </div>

      {needsApiKey && (
        <button
          onClick={onOpenSettings}
          className="mt-6 text-[11.5px] text-zinc-600 underline-offset-2 hover:text-zinc-400 hover:underline"
        >
          Add an API key in Settings
        </button>
      )}
    </div>
  )
}

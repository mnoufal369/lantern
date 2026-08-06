import { useState } from 'react'
import { FolderOpen, Plus } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { useProfilesStore } from '@/stores/useProfilesStore'
import { useSessionsStore } from '@/stores/useSessionsStore'

interface Props {
  onClose: () => void
  onOpenBuilder: () => void
}

export default function NewSessionModal({ onClose, onOpenBuilder }: Props): React.JSX.Element {
  const profiles = useProfilesStore((s) => s.profiles)
  const createSession = useSessionsStore((s) => s.createSession)
  const [profileId, setProfileId] = useState(profiles[0]?.id ?? '')
  const [cwd, setCwd] = useState(profiles[0]?.defaultCwd ?? '')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  const pickFolder = async (): Promise<void> => {
    const folder = await window.api.invoke('dialog:pickFolder')
    if (folder) {
      setCwd(folder)
    }
  }

  const start = async (): Promise<void> => {
    if (!profileId || !cwd) {
      setError('Pick an agent profile and a project folder.')
      return
    }
    setCreating(true)
    try {
      await createSession(profileId, cwd)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create session')
      setCreating(false)
    }
  }

  return (
    <Modal title="New Session" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-zinc-400">Agent profile</label>
          <div className="grid grid-cols-2 gap-2">
            {profiles.map((profile) => (
              <button
                key={profile.id}
                onClick={() => {
                  setProfileId(profile.id)
                  if (profile.defaultCwd && !cwd) {
                    setCwd(profile.defaultCwd)
                  }
                }}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm ${
                  profileId === profile.id
                    ? 'border-deck-accent bg-deck-accent/10 text-zinc-100'
                    : 'border-deck-border text-zinc-300 hover:bg-deck-raised'
                }`}
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: profile.color }} />
                <span className="truncate">{profile.name}</span>
              </button>
            ))}
            <button
              onClick={() => {
                onClose()
                onOpenBuilder()
              }}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-deck-border px-3 py-2 text-xs text-zinc-500 hover:bg-deck-raised hover:text-zinc-300"
            >
              <Plus size={13} /> New profile
            </button>
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-zinc-400">Project folder</label>
          <div className="flex gap-2">
            <input
              value={cwd}
              onChange={(e) => setCwd(e.target.value)}
              placeholder="/path/to/project"
              className="selectable flex-1 rounded-lg border border-deck-border bg-deck-raised px-3 py-2 font-mono text-xs text-zinc-100 outline-none focus:border-deck-accent"
            />
            <button
              onClick={() => void pickFolder()}
              className="flex items-center gap-1.5 rounded-lg border border-deck-border px-3 py-2 text-xs text-zinc-300 hover:bg-deck-raised"
            >
              <FolderOpen size={13} /> Browse
            </button>
          </div>
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}

        <div className="flex justify-end pt-1">
          <button
            onClick={() => void start()}
            disabled={creating}
            className="rounded-lg bg-deck-accent px-4 py-2 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {creating ? 'Starting…' : 'Start session'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

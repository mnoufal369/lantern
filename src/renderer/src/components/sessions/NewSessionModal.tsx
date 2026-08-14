import { useEffect, useState } from 'react'
import { Clock, FolderOpen, Globe, HardDrive, Loader2, Plus } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { useProfilesStore } from '@/stores/useProfilesStore'
import { useSessionsStore } from '@/stores/useSessionsStore'
import { useSettingsStore } from '@/stores/useSettingsStore'

function shortPath(p: string): string {
  return p.replace(/^\/Users\/[^/]+/, '~')
}

interface Props {
  onClose: () => void
  onOpenBuilder: () => void
  initialCwd?: string
}

export default function NewSessionModal({ onClose, onOpenBuilder, initialCwd }: Props): React.JSX.Element {
  const profiles = useProfilesStore((s) => s.profiles)
  const createSession = useSessionsStore((s) => s.createSession)
  const activeMeta = useSessionsStore((s) => (s.activeId ? s.sessions[s.activeId]?.meta : undefined))
  const simple = useSettingsStore((s) => s.settings?.uiMode === 'simple')
  const recentFolders = useSettingsStore((s) => s.settings?.recentFolders ?? [])
  const recentRepos = useSettingsStore((s) => s.settings?.recentRepos ?? [])
  // Start from what the user is already doing: same agent, same folder as the
  // active session — one click to confirm instead of re-picking paths.
  const [profileId, setProfileId] = useState(
    activeMeta?.profileId ??
      (simple
        ? (profiles.find((p) => p.id === 'prof_default_explainer')?.id ?? profiles[0]?.id ?? '')
        : (profiles[0]?.id ?? ''))
  )
  const [source, setSource] = useState<'local' | 'remote'>(
    initialCwd || activeMeta ? 'local' : simple ? 'remote' : 'local'
  )
  const [cwd, setCwd] = useState(initialCwd ?? activeMeta?.cwd ?? profiles[0]?.defaultCwd ?? '')

  // Recents are recorded by the main process as sessions get created — re-read
  // them every time the dialog opens so the chips are never stale.
  useEffect(() => {
    void useSettingsStore.getState().refresh()
  }, [])

  const [repoUrl, setRepoUrl] = useState('')
  const [branch, setBranch] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  const githubOrg = useSettingsStore((s) => s.settings?.githubOrg ?? '')
  const [orgRepos, setOrgRepos] = useState<string[]>([])

  // If the dialog opens straight onto the repository tab, start from the org.
  useEffect(() => {
    if (source === 'remote' && githubOrg && repoUrl.trim() === '') {
      setRepoUrl(`https://github.com/${githubOrg}/`)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [githubOrg])

  useEffect(() => {
    if (githubOrg) {
      window.api
        .invoke('git:orgRepos')
        .then(setOrgRepos)
        .catch(() => setOrgRepos([]))
    }
  }, [githubOrg])

  // Typing after the org prefix filters its repos: "api" → your-org/api-server, …
  const repoSuggestions = (() => {
    if (orgRepos.length === 0) {
      return []
    }
    const typed = repoUrl
      .toLowerCase()
      .replace(/^https?:\/\/(www\.)?github\.com\//, '')
      .replace(new RegExp(`^${githubOrg.toLowerCase()}/?`), '')
    return orgRepos
      .filter((name) => !typed || name.toLowerCase().includes(typed))
      .filter((name) => `https://github.com/${name}` !== repoUrl.trim())
      .slice(0, 6)
  })()

  const pickFolder = async (): Promise<void> => {
    const folder = await window.api.invoke('dialog:pickFolder')
    if (folder) {
      setCwd(folder)
    }
  }

  const start = async (): Promise<void> => {
    setError('')
    if (!profileId) {
      setError('Pick an agent.')
      return
    }
    setCreating(true)
    try {
      if (source === 'remote') {
        if (!repoUrl.trim()) {
          setError('Paste a repository link (e.g. https://github.com/you/project).')
          setCreating(false)
          return
        }
        const meta = await window.api.invoke('sessions:createFromRepo', {
          profileId,
          repoUrl: repoUrl.trim(),
          branch: branch.trim() || undefined
        })
        useSessionsStore.setState((state) => ({
          sessions: { ...state.sessions, [meta.id]: { meta, blocks: [], historyLoaded: true } },
          order: [meta.id, ...state.order],
          activeId: meta.id
        }))
      } else {
        if (!cwd) {
          setError('Pick a project folder.')
          setCreating(false)
          return
        }
        await createSession(profileId, cwd)
      }
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': Error: /, '') : 'Failed to create session')
      setCreating(false)
    }
  }

  return (
    <Modal title="New Session" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-zinc-400">
            {simple ? 'Who should help you?' : 'Agent profile'}
          </label>
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
            {!simple && (
              <button
                onClick={() => {
                  onClose()
                  onOpenBuilder()
                }}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-deck-border px-3 py-2 text-xs text-zinc-500 hover:bg-deck-raised hover:text-zinc-300"
              >
                <Plus size={13} /> New profile
              </button>
            )}
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-zinc-400">
            {simple ? 'What should it look at?' : 'Project source'}
          </label>
          <div className="mb-2 flex rounded-lg border border-deck-border bg-deck-raised p-0.5">
            <button
              onClick={() => setSource('local')}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-xs ${
                source === 'local' ? 'bg-deck-accent text-deck-on-accent' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <HardDrive size={13} /> Folder on this Mac
            </button>
            <button
              onClick={() => {
                setSource('remote')
                if (repoUrl.trim() === '' && githubOrg) {
                  setRepoUrl(`https://github.com/${githubOrg}/`)
                }
              }}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-xs ${
                source === 'remote' ? 'bg-deck-accent text-deck-on-accent' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Globe size={13} /> Online repository
            </button>
          </div>

          {source === 'local' ? (
            <div>
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
              {recentFolders.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {recentFolders.map((folder) => (
                    <button
                      key={folder}
                      onClick={() => setCwd(folder)}
                      title={folder}
                      className="flex items-center gap-1 rounded-full border border-deck-border px-2.5 py-1 font-mono text-[10.5px] text-zinc-400 hover:border-deck-accent/60 hover:text-zinc-200"
                    >
                      <Clock size={10} />
                      {shortPath(folder).split('/').slice(-2).join('/')}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div>
              <div className="flex gap-2">
                <input
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void start()}
                  placeholder="https://github.com/your-team/your-app"
                  className="selectable flex-1 rounded-lg border border-deck-border bg-deck-raised px-3 py-2 font-mono text-xs text-zinc-100 outline-none focus:border-deck-accent"
                />
                <input
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void start()}
                  placeholder="branch or #PR"
                  title="Land on a branch (release/2.4) or a pull request (#123 or pr/123)"
                  className="selectable w-36 rounded-lg border border-deck-border bg-deck-raised px-3 py-2 font-mono text-xs text-zinc-100 outline-none focus:border-deck-accent"
                />
              </div>
              <p className="mt-1.5 text-[11px] text-zinc-600">
                Lantern fetches it for you: no cloning, no terminal, no running the app. Leave the second field empty
                for the default branch, or paste a branch name or PR number (#123). Private repos use the git access
                already on this machine.
              </p>
              {!githubOrg && (
                <p className="mt-1.5 text-[11px] text-zinc-600">
                  Tip: set your <b>GitHub organisation</b> in Settings, and this field then pre-fills with your org and
                  suggests its repositories as you type.
                </p>
              )}
              {githubOrg && orgRepos.length === 0 && (
                <p className="mt-1.5 text-[11px] text-zinc-600">
                  Repo suggestions for <span className="font-mono">{githubOrg}</span> need the GitHub CLI on this
                  machine: <span className="font-mono">brew install gh</span> ·{' '}
                  <span className="font-mono">gh auth login</span>. If both are done, check{' '}
                  <span className="font-mono">gh repo list {githubOrg}</span> works in a terminal.
                </p>
              )}
              {repoSuggestions.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {repoSuggestions.map((name) => (
                    <button
                      key={name}
                      onClick={() => setRepoUrl(`https://github.com/${name}`)}
                      title={`https://github.com/${name}`}
                      className="flex items-center gap-1 rounded-full border border-deck-accent/30 bg-deck-accent/5 px-2.5 py-1 font-mono text-[10.5px] text-zinc-300 hover:border-deck-accent/70 hover:bg-deck-accent/15"
                    >
                      <Globe size={10} />
                      {name}
                    </button>
                  ))}
                </div>
              )}
              {recentRepos.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {recentRepos.map((repo) => (
                    <button
                      key={`${repo.url}@${repo.branch ?? ''}`}
                      onClick={() => {
                        setRepoUrl(repo.url)
                        setBranch(repo.branch ?? '')
                      }}
                      title={repo.url}
                      className="flex items-center gap-1 rounded-full border border-deck-border px-2.5 py-1 font-mono text-[10.5px] text-zinc-400 hover:border-deck-accent/60 hover:text-zinc-200"
                    >
                      <Clock size={10} />
                      {repo.url.replace(/^https?:\/\/(www\.)?/, '').replace(/\.git$/, '')}
                      {repo.branch ? ` @ ${repo.branch}` : ''}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}

        <div className="flex justify-end pt-1">
          <button
            onClick={() => void start()}
            disabled={creating}
            className="flex items-center gap-2 rounded-lg bg-deck-accent px-4 py-2 text-xs font-medium text-deck-on-accent hover:opacity-90 disabled:opacity-60"
          >
            {creating && <Loader2 size={12} className="animate-spin" />}
            {creating ? (source === 'remote' ? 'Fetching repository…' : 'Starting…') : 'Start session'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { useProfilesStore } from '@/stores/useProfilesStore'
import { PROFILE_COLORS, DEFAULT_MODEL, FALLBACK_MODELS } from '@shared/constants'
import type { AgentProfile, McpServerConfigUi, PermissionMode } from '@shared/types'

function newProfile(): AgentProfile {
  return {
    id: `prof_${Math.random().toString(36).slice(2, 10)}`,
    name: '',
    icon: 'bot',
    color: PROFILE_COLORS[Math.floor(Math.random() * PROFILE_COLORS.length)],
    systemPrompt: { mode: 'append', text: '' },
    model: DEFAULT_MODEL,
    permissionMode: 'default',
    allowedTools: [],
    disallowedTools: [],
    mcpServers: {},
    createdAt: Date.now(),
    updatedAt: Date.now()
  }
}

const PERMISSION_MODES: { value: PermissionMode; label: string; hint: string }[] = [
  { value: 'plan', label: 'Plan', hint: 'plans before acting' },
  { value: 'default', label: 'Ask', hint: 'asks before risky tools' },
  { value: 'acceptEdits', label: 'Auto-edit', hint: 'auto-approves file edits' },
  { value: 'bypassPermissions', label: 'Full auto', hint: 'never asks, careful!' }
]

export default function AgentBuilder({ onClose }: { onClose: () => void }): React.JSX.Element {
  const profiles = useProfilesStore((s) => s.profiles)
  const save = useProfilesStore((s) => s.save)
  const remove = useProfilesStore((s) => s.remove)
  const [editing, setEditing] = useState<AgentProfile | null>(null)

  if (editing) {
    return (
      <ProfileEditor
        profile={editing}
        onCancel={() => setEditing(null)}
        onSave={async (profile) => {
          await save(profile)
          setEditing(null)
        }}
      />
    )
  }

  return (
    <Modal title="Agent Profiles" onClose={onClose} wide>
      <div className="grid grid-cols-2 gap-3">
        {profiles.map((profile) => (
          <div
            key={profile.id}
            className="group flex items-start gap-3 rounded-lg border border-deck-border bg-deck-raised p-3"
          >
            <span
              className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white"
              style={{ backgroundColor: profile.color }}
            >
              {profile.name.slice(0, 1).toUpperCase() || '?'}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-zinc-100">{profile.name}</p>
              <p className="text-[11px] text-zinc-500">
                {profile.model} · {PERMISSION_MODES.find((m) => m.value === profile.permissionMode)?.label}
              </p>
              <p className="mt-0.5 line-clamp-2 text-[11px] text-zinc-600">
                {profile.systemPrompt.text || 'No custom instructions'}
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => setEditing(profile)}
                  className="rounded border border-deck-border px-2 py-0.5 text-[11px] text-zinc-300 hover:bg-deck-panel"
                >
                  Edit
                </button>
                <button
                  onClick={() => {
                    if (window.confirm(`Delete profile "${profile.name}"?`)) {
                      void remove(profile.id)
                    }
                  }}
                  className="hidden rounded border border-red-900/50 px-2 py-0.5 text-[11px] text-red-400 hover:bg-red-950/40 group-hover:block"
                >
                  <Trash2 size={11} />
                </button>
              </div>
            </div>
          </div>
        ))}
        <button
          onClick={() => setEditing(newProfile())}
          className="flex min-h-24 items-center justify-center gap-2 rounded-lg border border-dashed border-deck-border text-sm text-zinc-500 hover:bg-deck-raised hover:text-zinc-300"
        >
          <Plus size={15} /> New agent profile
        </button>
      </div>
    </Modal>
  )
}

function ProfileEditor({
  profile: initial,
  onCancel,
  onSave
}: {
  profile: AgentProfile
  onCancel: () => void
  onSave: (profile: AgentProfile) => Promise<void>
}): React.JSX.Element {
  const [profile, setProfile] = useState(initial)
  const [allowedDraft, setAllowedDraft] = useState('')
  const patch = (partial: Partial<AgentProfile>): void => {
    setProfile((p) => ({ ...p, ...partial, updatedAt: Date.now() }))
  }

  const pickDefaultCwd = async (): Promise<void> => {
    const folder = await window.api.invoke('dialog:pickFolder')
    if (folder) {
      patch({ defaultCwd: folder })
    }
  }

  return (
    <Modal title={initial.name ? `Edit ${initial.name}` : 'New Agent Profile'} onClose={onCancel} wide>
      <div className="space-y-4">
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-zinc-400">Name</label>
            <input
              value={profile.name}
              onChange={(e) => patch({ name: e.target.value })}
              placeholder="e.g. Refactor Bot"
              className="selectable w-full rounded-lg border border-deck-border bg-deck-raised px-3 py-2 text-sm text-zinc-100 outline-none focus:border-deck-accent"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-400">Color</label>
            <div className="flex gap-1.5 pt-1.5">
              {PROFILE_COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => patch({ color })}
                  className={`h-6 w-6 rounded-full ${profile.color === color ? 'ring-2 ring-white/70 ring-offset-2 ring-offset-deck-panel' : ''}`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-zinc-400">Model</label>
            <select
              value={profile.model}
              onChange={(e) => patch({ model: e.target.value })}
              className="w-full rounded-lg border border-deck-border bg-deck-raised px-3 py-2 text-sm text-zinc-100 outline-none focus:border-deck-accent"
            >
              {FALLBACK_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.displayName}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-zinc-400">Max budget per session (USD)</label>
            <input
              type="number"
              min={0}
              step={0.5}
              value={profile.maxBudgetUsd ?? ''}
              placeholder="unlimited"
              onChange={(e) => patch({ maxBudgetUsd: e.target.value === '' ? undefined : Number(e.target.value) })}
              className="w-full rounded-lg border border-deck-border bg-deck-raised px-3 py-2 text-sm text-zinc-100 outline-none focus:border-deck-accent"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-400">Permission mode</label>
          <div className="flex gap-1 rounded-lg border border-deck-border bg-deck-raised p-1">
            {PERMISSION_MODES.map((mode) => (
              <button
                key={mode.value}
                onClick={() => patch({ permissionMode: mode.value })}
                title={mode.hint}
                className={`flex-1 rounded-md px-2 py-1.5 text-xs ${
                  profile.permissionMode === mode.value
                    ? 'bg-deck-accent text-deck-on-accent'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="text-xs font-medium text-zinc-400">System prompt</label>
            <div className="flex gap-1 text-[11px]">
              <button
                onClick={() => patch({ systemPrompt: { ...profile.systemPrompt, mode: 'append' } })}
                className={profile.systemPrompt.mode === 'append' ? 'text-deck-accent-text' : 'text-zinc-500'}
              >
                Extend Claude Code
              </button>
              <span className="text-zinc-700">|</span>
              <button
                onClick={() => patch({ systemPrompt: { ...profile.systemPrompt, mode: 'replace' } })}
                className={profile.systemPrompt.mode === 'replace' ? 'text-deck-accent-text' : 'text-zinc-500'}
              >
                Replace entirely
              </button>
            </div>
          </div>
          <textarea
            value={profile.systemPrompt.text}
            onChange={(e) => patch({ systemPrompt: { ...profile.systemPrompt, text: e.target.value } })}
            rows={4}
            placeholder="Extra instructions for this agent…"
            className="selectable w-full resize-y rounded-lg border border-deck-border bg-deck-raised px-3 py-2 text-sm text-zinc-100 outline-none focus:border-deck-accent"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-400">
            Always-allowed tools <span className="text-zinc-600">(e.g. Read, Bash(npm run *))</span>
          </label>
          <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-deck-border bg-deck-raised p-2">
            {profile.allowedTools.map((rule) => (
              <span
                key={rule}
                className="flex items-center gap-1 rounded bg-deck-panel px-2 py-0.5 font-mono text-[11px] text-zinc-300"
              >
                {rule}
                <button
                  onClick={() => patch({ allowedTools: profile.allowedTools.filter((r) => r !== rule) })}
                  className="text-zinc-500 hover:text-red-400"
                >
                  ×
                </button>
              </span>
            ))}
            <input
              value={allowedDraft}
              onChange={(e) => setAllowedDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && allowedDraft.trim()) {
                  patch({ allowedTools: [...profile.allowedTools, allowedDraft.trim()] })
                  setAllowedDraft('')
                }
              }}
              placeholder="add rule + ⏎"
              className="selectable min-w-28 flex-1 bg-transparent font-mono text-[11px] text-zinc-100 outline-none placeholder:text-zinc-600"
            />
          </div>
        </div>

        <McpServersEditor
          servers={profile.mcpServers}
          onChange={(mcpServers) => patch({ mcpServers })}
        />

        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-400">Default project folder</label>
          <div className="flex gap-2">
            <input
              value={profile.defaultCwd ?? ''}
              onChange={(e) => patch({ defaultCwd: e.target.value || undefined })}
              placeholder="optional"
              className="selectable flex-1 rounded-lg border border-deck-border bg-deck-raised px-3 py-2 font-mono text-xs text-zinc-100 outline-none focus:border-deck-accent"
            />
            <button
              onClick={() => void pickDefaultCwd()}
              className="rounded-lg border border-deck-border px-3 text-xs text-zinc-300 hover:bg-deck-raised"
            >
              Browse
            </button>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-deck-border pt-3">
          <button
            onClick={onCancel}
            className="rounded-lg border border-deck-border px-3 py-1.5 text-xs text-zinc-300 hover:bg-deck-raised"
          >
            Cancel
          </button>
          <button
            onClick={() => void onSave(profile)}
            disabled={!profile.name.trim()}
            className="rounded-lg bg-deck-accent px-4 py-1.5 text-xs font-medium text-deck-on-accent hover:opacity-90 disabled:opacity-40"
          >
            Save profile
          </button>
        </div>
      </div>
    </Modal>
  )
}

function McpServersEditor({
  servers,
  onChange
}: {
  servers: Record<string, McpServerConfigUi>
  onChange: (servers: Record<string, McpServerConfigUi>) => void
}): React.JSX.Element {
  const [name, setName] = useState('')
  const [command, setCommand] = useState('')

  const add = (): void => {
    if (!name.trim() || !command.trim()) {
      return
    }
    const [cmd, ...args] = command.trim().split(/\s+/)
    onChange({ ...servers, [name.trim()]: { type: 'stdio', command: cmd, args } })
    setName('')
    setCommand('')
  }

  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-zinc-400">
        MCP servers <span className="text-zinc-600">(extend this agent with extra tools)</span>
      </label>
      <div className="space-y-1.5 rounded-lg border border-deck-border bg-deck-raised p-2">
        {Object.entries(servers).map(([serverName, config]) => (
          <div key={serverName} className="flex items-center gap-2 text-[11.5px]">
            <span className="font-medium text-zinc-300">{serverName}</span>
            <span className="truncate font-mono text-zinc-500">
              {config.type === 'stdio' ? `${config.command} ${config.args.join(' ')}` : config.url}
            </span>
            <button
              onClick={() => {
                const next = { ...servers }
                delete next[serverName]
                onChange(next)
              }}
              className="ml-auto text-zinc-500 hover:text-red-400"
            >
              ×
            </button>
          </div>
        ))}
        <div className="flex gap-1.5">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="name"
            className="selectable w-24 rounded border border-deck-border bg-deck-panel px-2 py-1 font-mono text-[11px] text-zinc-100 outline-none"
          />
          <input
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
            placeholder="npx -y @some/mcp-server"
            className="selectable flex-1 rounded border border-deck-border bg-deck-panel px-2 py-1 font-mono text-[11px] text-zinc-100 outline-none"
          />
          <button onClick={add} className="rounded border border-deck-border px-2 text-[11px] text-zinc-300 hover:bg-deck-panel">
            Add
          </button>
        </div>
      </div>
    </div>
  )
}

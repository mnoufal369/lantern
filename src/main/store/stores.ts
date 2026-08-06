import { safeStorage } from 'electron'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import Store from 'electron-store'
import type { AgentProfile, AppSettings, AuthStatus, SessionMeta } from '@shared/types'
import { DEFAULT_MAX_CONCURRENT_SESSIONS, DEFAULT_MODEL } from '@shared/constants'

const profileStore = new Store<{ profiles: AgentProfile[] }>({
  name: 'profiles',
  defaults: { profiles: [] }
})

const sessionStore = new Store<{ sessions: SessionMeta[] }>({
  name: 'sessions',
  defaults: { sessions: [] }
})

interface PersistedSettings {
  /** API key encrypted with Electron safeStorage (keychain-backed), base64. */
  apiKeyEnc: string
  theme: 'dark'
  maxConcurrentSessions: number
}

const settingsStore = new Store<{ settings: PersistedSettings }>({
  name: 'settings',
  defaults: {
    settings: {
      apiKeyEnc: '',
      theme: 'dark',
      maxConcurrentSessions: DEFAULT_MAX_CONCURRENT_SESSIONS
    }
  }
})

function encryptKey(plain: string): string {
  if (plain === '') {
    return ''
  }
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.encryptString(plain).toString('base64')
  }
  return `plain:${Buffer.from(plain, 'utf8').toString('base64')}`
}

function decryptKey(stored: string): string {
  if (stored === '') {
    return ''
  }
  try {
    if (stored.startsWith('plain:')) {
      return Buffer.from(stored.slice(6), 'base64').toString('utf8')
    }
    return safeStorage.decryptString(Buffer.from(stored, 'base64'))
  } catch {
    return ''
  }
}

export const ProfileStore = {
  list(): AgentProfile[] {
    return profileStore.get('profiles')
  },
  save(profile: AgentProfile): AgentProfile {
    const profiles = profileStore.get('profiles')
    const index = profiles.findIndex((p) => p.id === profile.id)
    if (index >= 0) {
      profiles[index] = profile
    } else {
      profiles.push(profile)
    }
    profileStore.set('profiles', profiles)
    return profile
  },
  delete(profileId: string): void {
    profileStore.set(
      'profiles',
      profileStore.get('profiles').filter((p) => p.id !== profileId)
    )
  },
  addAllowedTool(profileId: string, rule: string): void {
    const profiles = profileStore.get('profiles')
    const profile = profiles.find((p) => p.id === profileId)
    if (profile && !profile.allowedTools.includes(rule)) {
      profile.allowedTools.push(rule)
      profileStore.set('profiles', profiles)
    }
  },
  seedDefaults(): void {
    if (profileStore.get('profiles').length > 0) {
      return
    }
    const now = Date.now()
    const defaults: AgentProfile[] = [
      {
        id: 'prof_default_dev',
        name: 'Dev Agent',
        icon: 'bot',
        color: '#6366f1',
        systemPrompt: { mode: 'append', text: '' },
        model: DEFAULT_MODEL,
        permissionMode: 'default',
        allowedTools: [],
        disallowedTools: [],
        mcpServers: {},
        createdAt: now,
        updatedAt: now
      },
      {
        id: 'prof_default_planner',
        name: 'Planner',
        icon: 'book-open',
        color: '#22c55e',
        systemPrompt: {
          mode: 'append',
          text: 'Prefer analysis and planning. Explain your approach before making changes.'
        },
        model: DEFAULT_MODEL,
        permissionMode: 'plan',
        allowedTools: [],
        disallowedTools: [],
        mcpServers: {},
        createdAt: now,
        updatedAt: now
      }
    ]
    profileStore.set('profiles', defaults)
  }
}

export const SessionStore = {
  list(): SessionMeta[] {
    return sessionStore.get('sessions')
  },
  save(meta: SessionMeta): void {
    const sessions = sessionStore.get('sessions')
    const index = sessions.findIndex((s) => s.id === meta.id)
    if (index >= 0) {
      sessions[index] = meta
    } else {
      sessions.unshift(meta)
    }
    sessionStore.set('sessions', sessions)
  }
}

export const Settings = {
  /** Renderer-safe view — the API key itself never leaves the main process. */
  get(): AppSettings {
    const persisted = settingsStore.get('settings')
    return {
      apiKey: '',
      hasApiKey: persisted.apiKeyEnc !== '',
      theme: persisted.theme,
      maxConcurrentSessions: persisted.maxConcurrentSessions
    }
  },
  /** Decrypted key for the session runtime only. */
  getApiKey(): string {
    return decryptKey(settingsStore.get('settings').apiKeyEnc)
  },
  set(patch: Partial<AppSettings>): AppSettings {
    const persisted = settingsStore.get('settings')
    if (patch.apiKey !== undefined) {
      persisted.apiKeyEnc = encryptKey(patch.apiKey.trim())
    }
    if (patch.maxConcurrentSessions !== undefined) {
      persisted.maxConcurrentSessions = Math.max(1, Math.min(10, patch.maxConcurrentSessions))
    }
    settingsStore.set('settings', persisted)
    return Settings.get()
  },
  authStatus(): AuthStatus {
    if (settingsStore.get('settings').apiKeyEnc !== '') {
      return { source: 'settings-key', detail: 'API key from AgentDeck Settings (encrypted at rest)' }
    }
    if (process.env.ANTHROPIC_API_KEY) {
      return { source: 'env-key', detail: 'ANTHROPIC_API_KEY from your environment' }
    }
    try {
      const raw = readFileSync(join(homedir(), '.claude.json'), 'utf8')
      const parsed = JSON.parse(raw) as { oauthAccount?: { emailAddress?: string } }
      const email = parsed.oauthAccount?.emailAddress
      if (email) {
        return { source: 'claude-login', detail: email }
      }
    } catch {
      // No Claude Code config on this machine.
    }
    return { source: 'none', detail: '' }
  }
}

import { safeStorage } from 'electron'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import Store from 'electron-store'
import type { AgentProfile, AppSettings, AuthStatus, SessionMeta } from '@shared/types'
import { DEFAULT_MAX_CONCURRENT_SESSIONS, DEFAULT_MODEL } from '@shared/constants'

const profileStore = new Store<{ profiles: AgentProfile[]; seedVersion: number }>({
  name: 'profiles',
  defaults: { profiles: [], seedVersion: 0 }
})

const SEED_VERSION = 2

const HUMAN_TONE =
  'Tone: write like a warm, friendly colleague, not a machine. Use contractions, first person and everyday words. Short sentences. Be encouraging without being fake. Never sound like a manual.'

const sessionStore = new Store<{ sessions: SessionMeta[] }>({
  name: 'sessions',
  defaults: { sessions: [] }
})

interface PersistedSettings {
  /** API key encrypted with Electron safeStorage (keychain-backed), base64. */
  apiKeyEnc: string
  theme: 'dark' | 'light'
  maxConcurrentSessions: number
  uiMode: 'pro' | 'simple'
  onboarded: boolean
  customInstructions?: string
}

const settingsStore = new Store<{ settings: PersistedSettings }>({
  name: 'settings',
  defaults: {
    settings: {
      apiKeyEnc: '',
      theme: 'dark',
      customInstructions: '',
      maxConcurrentSessions: DEFAULT_MAX_CONCURRENT_SESSIONS,
      uiMode: 'pro',
      onboarded: false
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
    const now = Date.now()
    const base = {
      systemPrompt: { mode: 'append' as const, text: '' },
      model: DEFAULT_MODEL,
      permissionMode: 'default' as const,
      allowedTools: [] as string[],
      disallowedTools: [] as string[],
      mcpServers: {},
      createdAt: now,
      updatedAt: now
    }
    const defaults: AgentProfile[] = [
      { ...base, id: 'prof_default_dev', name: 'Dev Agent', icon: 'bot', color: '#6366f1' },
      {
        ...base,
        id: 'prof_default_planner',
        name: 'Planner',
        icon: 'book-open',
        color: '#22c55e',
        permissionMode: 'plan',
        systemPrompt: {
          mode: 'append',
          text: 'Prefer analysis and planning. Explain your approach before making changes.'
        }
      },
      {
        ...base,
        id: 'prof_default_qa',
        name: 'QA Agent',
        icon: 'bug',
        color: '#f59e0b',
        allowedTools: ['Read', 'Glob', 'Grep'],
        systemPrompt: {
          mode: 'append',
          text: `You are a QA specialist. Hunt for bugs, edge cases, missing validation and risky code paths. When asked to verify behaviour, prefer reading code and running existing tests. Report findings as a clear numbered list with severity (high/medium/low), the affected file, and a concrete reproduction or reasoning. Do not modify code unless explicitly asked. ${HUMAN_TONE}`
        }
      },
      {
        ...base,
        id: 'prof_default_consultant',
        name: 'Consultant',
        icon: 'briefcase',
        color: '#06b6d4',
        allowedTools: ['Read', 'Glob', 'Grep'],
        systemPrompt: {
          mode: 'append',
          text: `You are a technical consultant reviewing a codebase for a client. Answer questions about how the product works, assess quality and risks, and produce clear structured summaries a business audience can read. Avoid jargon unless asked; define terms when you must use them. Never modify files — you are read-only unless the user explicitly instructs otherwise. ${HUMAN_TONE}`
        }
      },
      {
        ...base,
        id: 'prof_default_explainer',
        name: 'Explainer',
        icon: 'sparkles',
        color: '#ec4899',
        allowedTools: ['Read', 'Glob', 'Grep'],
        systemPrompt: {
          mode: 'append',
          text: `You are a friendly guide for someone who does not code — a patient, upbeat human explaining things over coffee. Plain everyday language, real-world analogies, zero jargon (if a technical word is unavoidable, explain it in one short phrase). When they ask "can it do X" or "where does Y happen", investigate the code yourself and answer in human terms. Never show raw code unless they ask; describe behaviour instead. React to what they say like a person would ("Good question — let me look."). ${HUMAN_TONE}`
        }
      }
    ]
    const existing = profileStore.get('profiles')
    const missing = defaults.filter((d) => !existing.some((p) => p.id === d.id))
    if (existing.length === 0) {
      profileStore.set('profiles', defaults)
    } else if (missing.length > 0) {
      profileStore.set('profiles', [...existing, ...missing])
    }

    if (profileStore.get('seedVersion') !== SEED_VERSION) {
      const refreshed = profileStore.get('profiles').map((profile) => {
        const seed = defaults.find((d) => d.id === profile.id)
        return seed ? { ...profile, systemPrompt: seed.systemPrompt, updatedAt: now } : profile
      })
      profileStore.set('profiles', refreshed)
      profileStore.set('seedVersion', SEED_VERSION)
    }
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
      maxConcurrentSessions: persisted.maxConcurrentSessions,
      customInstructions: persisted.customInstructions ?? '',
      uiMode: persisted.uiMode ?? 'pro',
      onboarded: persisted.onboarded ?? false
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
    if (patch.uiMode !== undefined) {
      persisted.uiMode = patch.uiMode
    }
    if (patch.theme !== undefined) {
      persisted.theme = patch.theme
    }
    if (patch.customInstructions !== undefined) {
      persisted.customInstructions = patch.customInstructions
    }
    if (patch.onboarded !== undefined) {
      persisted.onboarded = patch.onboarded
    }
    settingsStore.set('settings', persisted)
    return Settings.get()
  },
  authStatus(): AuthStatus {
    if (settingsStore.get('settings').apiKeyEnc !== '') {
      return { source: 'settings-key', detail: 'API key from Pilot Settings (encrypted at rest)' }
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

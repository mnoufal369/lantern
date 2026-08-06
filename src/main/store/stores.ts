import Store from 'electron-store'
import type { AgentProfile, AppSettings, SessionMeta } from '@shared/types'
import { DEFAULT_MAX_CONCURRENT_SESSIONS, DEFAULT_MODEL } from '@shared/constants'

const profileStore = new Store<{ profiles: AgentProfile[] }>({
  name: 'profiles',
  defaults: { profiles: [] }
})

const sessionStore = new Store<{ sessions: SessionMeta[] }>({
  name: 'sessions',
  defaults: { sessions: [] }
})

const settingsStore = new Store<{ settings: AppSettings }>({
  name: 'settings',
  defaults: {
    settings: {
      apiKey: '',
      theme: 'dark',
      maxConcurrentSessions: DEFAULT_MAX_CONCURRENT_SESSIONS
    }
  }
})

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
  get(): AppSettings {
    return settingsStore.get('settings')
  },
  set(patch: Partial<AppSettings>): AppSettings {
    const merged = { ...settingsStore.get('settings'), ...patch }
    settingsStore.set('settings', merged)
    return merged
  }
}

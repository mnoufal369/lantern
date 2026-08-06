import { create } from 'zustand'
import type { AgentProfile } from '@shared/types'

interface ProfilesState {
  profiles: AgentProfile[]
  initialized: boolean
  init: () => Promise<void>
  save: (profile: AgentProfile) => Promise<AgentProfile>
  remove: (profileId: string) => Promise<void>
}

export const useProfilesStore = create<ProfilesState>((set, get) => ({
  profiles: [],
  initialized: false,

  init: async () => {
    if (get().initialized) {
      return
    }
    const profiles = await window.api.invoke('profiles:list')
    set({ profiles, initialized: true })
  },

  save: async (profile) => {
    const saved = await window.api.invoke('profiles:save', { profile })
    set((state) => {
      const existing = state.profiles.findIndex((p) => p.id === saved.id)
      const profiles = [...state.profiles]
      if (existing >= 0) {
        profiles[existing] = saved
      } else {
        profiles.push(saved)
      }
      return { profiles }
    })
    return saved
  },

  remove: async (profileId) => {
    await window.api.invoke('profiles:delete', { profileId })
    set((state) => ({ profiles: state.profiles.filter((p) => p.id !== profileId) }))
  }
}))

import { create } from 'zustand'
import type { AppSettings } from '@shared/types'

interface SettingsState {
  settings: AppSettings | null
  init: () => Promise<void>
  update: (patch: Partial<AppSettings>) => Promise<void>
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: null,

  init: async () => {
    if (get().settings) {
      return
    }
    const settings = await window.api.invoke('app:getSettings')
    set({ settings })
  },

  update: async (patch) => {
    const settings = await window.api.invoke('app:setSettings', { settings: patch })
    set({ settings })
  }
}))

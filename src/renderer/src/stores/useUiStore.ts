import { create } from 'zustand'

/** Small cross-component UI state: dialogs that can be opened from anywhere. */
interface UiState {
  renameSessionId: string | null
  openRename: (sessionId: string) => void
  closeRename: () => void
}

export const useUiStore = create<UiState>((set) => ({
  renameSessionId: null,
  openRename: (sessionId) => set({ renameSessionId: sessionId }),
  closeRename: () => set({ renameSessionId: null })
}))

import { create } from 'zustand'
import type { PermissionDecision, PermissionRequest } from '@shared/types'

interface PermissionsState {
  pending: PermissionRequest[]
  push: (request: PermissionRequest) => void
  resolve: (requestId: string, decision: PermissionDecision) => Promise<void>
  removeResolved: (requestId: string) => void
}

export const usePermissionsStore = create<PermissionsState>((set) => ({
  pending: [],

  push: (request) => {
    set((state) => ({ pending: [...state.pending, request] }))
  },

  resolve: async (requestId, decision) => {
    await window.api.invoke('permissions:respond', { requestId, decision })
    set((state) => ({ pending: state.pending.filter((r) => r.requestId !== requestId) }))
  },

  removeResolved: (requestId) => {
    set((state) => ({ pending: state.pending.filter((r) => r.requestId !== requestId) }))
  }
}))

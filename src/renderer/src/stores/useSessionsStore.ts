import { create } from 'zustand'
import type { PastedImage, SessionMeta, SessionStats, SessionStatus, UiEvent } from '@shared/types'
import { applyEvents, type TranscriptBlock } from '@/lib/transcript'

export interface SessionEntry {
  meta: SessionMeta
  blocks: TranscriptBlock[]
  historyLoaded: boolean
}

interface SessionsState {
  sessions: Record<string, SessionEntry>
  order: string[]
  activeId: string | null
  initialized: boolean

  init: () => Promise<void>
  createSession: (profileId: string, cwd: string) => Promise<string>
  forkSession: (sessionId: string) => Promise<string>
  setActive: (sessionId: string | null) => void
  sendMessage: (sessionId: string, text: string, images?: PastedImage[]) => Promise<void>
  interrupt: (sessionId: string) => Promise<void>
  archive: (sessionId: string) => Promise<void>
  deleteSession: (sessionId: string) => Promise<void>
  reopen: (sessionId: string) => Promise<void>
  rename: (sessionId: string, title: string) => Promise<void>
  setColor: (sessionId: string, color: string | null) => Promise<void>
  setModel: (sessionId: string, model: string) => Promise<void>
  setPermissionMode: (sessionId: string, mode: SessionMeta['permissionMode']) => Promise<void>
  applyEventBatch: (sessionId: string, events: UiEvent[]) => void
  applyStatus: (sessionId: string, status: SessionStatus, stats: SessionStats, filesTouched: string[]) => void
}

export const useSessionsStore = create<SessionsState>((set, get) => ({
  sessions: {},
  order: [],
  activeId: null,
  initialized: false,

  init: async () => {
    if (get().initialized) {
      return
    }
    const metas = await window.api.invoke('sessions:list')
    const sessions: Record<string, SessionEntry> = {}
    const order: string[] = []
    for (const meta of metas) {
      sessions[meta.id] = { meta, blocks: [], historyLoaded: false }
      order.push(meta.id)
    }
    set({ sessions, order, initialized: true })
    const remembered = localStorage.getItem('pilot.activeSession')
    const target =
      (remembered && sessions[remembered] && !sessions[remembered].meta.archived ? remembered : null) ??
      order.find((id) => !sessions[id].meta.archived) ??
      null
    if (target) {
      get().setActive(target)
    }
  },

  createSession: async (profileId, cwd) => {
    const meta = await window.api.invoke('sessions:create', { profileId, cwd })
    set((state) => ({
      sessions: { ...state.sessions, [meta.id]: { meta, blocks: [], historyLoaded: true } },
      order: [meta.id, ...state.order],
      activeId: meta.id
    }))
    return meta.id
  },

  forkSession: async (sessionId) => {
    const meta = await window.api.invoke('sessions:fork', { sessionId })
    const events = await window.api.invoke('sessions:history', { sessionId: meta.id })
    set((state) => ({
      sessions: { ...state.sessions, [meta.id]: { meta, blocks: applyEvents([], events), historyLoaded: true } },
      order: [meta.id, ...state.order],
      activeId: meta.id
    }))
    return meta.id
  },

  setActive: (sessionId) => {
    set({ activeId: sessionId })
    if (!sessionId) {
      localStorage.removeItem('pilot.activeSession')
      return
    }
    localStorage.setItem('pilot.activeSession', sessionId)
    const entry = get().sessions[sessionId]
    if (entry && !entry.historyLoaded) {
      window.api.invoke('sessions:history', { sessionId }).then((events) => {
        set((state) => {
          const current = state.sessions[sessionId]
          if (!current || current.historyLoaded) {
            return state
          }
          return {
            sessions: {
              ...state.sessions,
              [sessionId]: {
                ...current,
                blocks: applyEvents([], events),
                historyLoaded: true
              }
            }
          }
        })
      })
    }
  },

  sendMessage: async (sessionId, text, images) => {
    await window.api.invoke('sessions:send', { sessionId, text, images })
  },

  interrupt: async (sessionId) => {
    await window.api.invoke('sessions:interrupt', { sessionId })
  },

  archive: async (sessionId) => {
    await window.api.invoke('sessions:archive', { sessionId })
    set((state) => {
      const entry = state.sessions[sessionId]
      if (!entry) {
        return state
      }
      return {
        sessions: {
          ...state.sessions,
          [sessionId]: { ...entry, meta: { ...entry.meta, archived: true } }
        },
        activeId: state.activeId === sessionId ? null : state.activeId
      }
    })
  },

  deleteSession: async (sessionId) => {
    await window.api.invoke('sessions:delete', { sessionId })
    set((state) => {
      const sessions = { ...state.sessions }
      delete sessions[sessionId]
      return {
        sessions,
        order: state.order.filter((id) => id !== sessionId),
        activeId: state.activeId === sessionId ? null : state.activeId
      }
    })
  },

  reopen: async (sessionId) => {
    const meta = await window.api.invoke('sessions:reopen', { sessionId })
    set((state) => ({
      sessions: {
        ...state.sessions,
        [sessionId]: { ...state.sessions[sessionId], meta }
      },
      activeId: sessionId
    }))
  },

  rename: async (sessionId, title) => {
    await window.api.invoke('sessions:rename', { sessionId, title })
    set((state) => {
      const entry = state.sessions[sessionId]
      if (!entry) {
        return state
      }
      return {
        sessions: { ...state.sessions, [sessionId]: { ...entry, meta: { ...entry.meta, title } } }
      }
    })
  },

  setColor: async (sessionId, color) => {
    await window.api.invoke('sessions:setColor', { sessionId, color })
    set((state) => {
      const entry = state.sessions[sessionId]
      if (!entry) {
        return state
      }
      return {
        sessions: { ...state.sessions, [sessionId]: { ...entry, meta: { ...entry.meta, color: color ?? undefined } } }
      }
    })
  },

  setModel: async (sessionId, model) => {
    await window.api.invoke('sessions:setModel', { sessionId, model })
    set((state) => {
      const entry = state.sessions[sessionId]
      if (!entry) {
        return state
      }
      return {
        sessions: { ...state.sessions, [sessionId]: { ...entry, meta: { ...entry.meta, model } } }
      }
    })
  },

  setPermissionMode: async (sessionId, mode) => {
    await window.api.invoke('sessions:setPermissionMode', { sessionId, mode })
    set((state) => {
      const entry = state.sessions[sessionId]
      if (!entry) {
        return state
      }
      return {
        sessions: { ...state.sessions, [sessionId]: { ...entry, meta: { ...entry.meta, permissionMode: mode } } }
      }
    })
  },

  applyEventBatch: (sessionId, events) => {
    set((state) => {
      const entry = state.sessions[sessionId]
      if (!entry) {
        return state
      }
      return {
        sessions: {
          ...state.sessions,
          [sessionId]: { ...entry, blocks: applyEvents(entry.blocks, events) }
        }
      }
    })
  },

  applyStatus: (sessionId, status, stats, filesTouched) => {
    set((state) => {
      const entry = state.sessions[sessionId]
      if (!entry) {
        return state
      }
      return {
        sessions: {
          ...state.sessions,
          [sessionId]: {
            ...entry,
            meta: { ...entry.meta, status, stats, filesTouched, lastActiveAt: Date.now() }
          }
        }
      }
    })
  }
}))

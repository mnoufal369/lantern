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
  setPinned: (sessionId: string, pinned: boolean) => Promise<void>
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
    // Claimed before the await: otherwise StrictMode's double-mount runs two
    // inits, and the second wipes blocks the first had already fetched.
    set({ initialized: true })
    const metas = await window.api.invoke('sessions:list')
    set((state) => {
      const sessions: Record<string, SessionEntry> = {}
      const order: string[] = []
      for (const meta of metas) {
        // Keep anything already in the store — a session created while this was
        // in flight (the CLI opening a folder) must not be dropped.
        sessions[meta.id] = state.sessions[meta.id] ?? { meta, blocks: [], historyLoaded: false }
        order.push(meta.id)
      }
      for (const id of state.order) {
        if (!sessions[id]) {
          sessions[id] = state.sessions[id]
          order.unshift(id)
        }
      }
      return { sessions, order }
    })
    const sessions = get().sessions
    const order = get().order
    // Something focused a session while we were loading; leave it alone.
    if (get().activeId) {
      return
    }
    const remembered = localStorage.getItem('lantern.activeSession')
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
      order: [meta.id, ...state.order]
    }))
    get().setActive(meta.id)
    return meta.id
  },

  forkSession: async (sessionId) => {
    const meta = await window.api.invoke('sessions:fork', { sessionId })
    const events = await window.api.invoke('sessions:history', { sessionId: meta.id })
    set((state) => ({
      sessions: { ...state.sessions, [meta.id]: { meta, blocks: applyEvents([], events), historyLoaded: true } },
      order: [meta.id, ...state.order]
    }))
    get().setActive(meta.id)
    return meta.id
  },

  setActive: (sessionId) => {
    // Looking at a session means it is open. Without this, selecting a closed
    // session leaves it displayed but absent from the list, because the list
    // only shows open ones — you would be reading something with no row.
    if (sessionId && get().sessions[sessionId]?.meta.archived) {
      void get().reopen(sessionId)
      return
    }
    set({ activeId: sessionId })
    if (!sessionId) {
      localStorage.removeItem('lantern.activeSession')
      return
    }
    localStorage.setItem('lantern.activeSession', sessionId)
    const entry = get().sessions[sessionId]
    if (entry && !entry.historyLoaded) {
      window.api
        .invoke('sessions:history', { sessionId })
        .then((events) => {
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
        .catch(() => {
          // Mark it loaded anyway: an empty conversation is wrong, but a
          // permanently blank pane that never retries is worse.
          set((state) => {
            const current = state.sessions[sessionId]
            return current
              ? { sessions: { ...state.sessions, [sessionId]: { ...current, historyLoaded: true } } }
              : state
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
        [sessionId]: state.sessions[sessionId]
          ? { ...state.sessions[sessionId], meta }
          : { meta, blocks: [], historyLoaded: false }
      },
      order: state.order.includes(sessionId) ? state.order : [sessionId, ...state.order]
    }))
    // Hand off rather than setting activeId here: selecting is what loads the
    // transcript, and reopening used to skip it — so a reopened session came
    // back empty even though its transcript was sitting on disk. `meta` is
    // un-archived by now, so this cannot bounce back into reopen.
    get().setActive(sessionId)
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

  setPinned: async (sessionId, pinned) => {
    await window.api.invoke('sessions:setPinned', { sessionId, pinned })
    set((state) => {
      const entry = state.sessions[sessionId]
      if (!entry) {
        return state
      }
      return {
        sessions: { ...state.sessions, [sessionId]: { ...entry, meta: { ...entry.meta, pinned } } }
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

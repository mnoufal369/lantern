import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionMeta } from '@shared/types'

/**
 * Selecting and reopening are the plumbing that decides what you are looking at,
 * and both have now shipped broken once: a closed session could be displayed
 * with no row in the list, and a reopened one came back with an empty
 * conversation because reopening skipped the transcript fetch.
 */
const invoke = vi.fn()

vi.stubGlobal('window', { api: { invoke } })
vi.stubGlobal('localStorage', {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined
})

const { useSessionsStore } = await import('./useSessionsStore')

function meta(id: string, archived: boolean): SessionMeta {
  return {
    id,
    profileId: 'p1',
    title: 'Resolve SSO login',
    cwd: '/tmp/project',
    model: 'sonnet',
    permissionMode: 'default',
    status: { kind: 'idle' },
    stats: { totalCostUsd: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, turns: 0 },
    filesTouched: [],
    createdAt: 1,
    lastActiveAt: 1,
    archived
  }
}

function seed(archived: boolean): void {
  useSessionsStore.setState({
    sessions: { s1: { meta: meta('s1', archived), blocks: [], historyLoaded: false } },
    order: ['s1'],
    activeId: null
  })
}

describe('selecting a session', () => {
  beforeEach(() => {
    invoke.mockReset()
    invoke.mockImplementation((channel: string) => {
      if (channel === 'sessions:reopen') {
        return Promise.resolve(meta('s1', false))
      }
      if (channel === 'sessions:history') {
        return Promise.resolve([{ t: 'user-text', id: 'u1', text: 'hello' }])
      }
      return Promise.resolve(undefined)
    })
  })

  it('loads the transcript of an open session', async () => {
    seed(false)
    useSessionsStore.getState().setActive('s1')
    await vi.waitFor(() => expect(useSessionsStore.getState().sessions.s1.historyLoaded).toBe(true))
    expect(useSessionsStore.getState().activeId).toBe('s1')
    expect(useSessionsStore.getState().sessions.s1.blocks.length).toBeGreaterThan(0)
  })

  it('reopens a closed session rather than displaying it closed', async () => {
    seed(true)
    useSessionsStore.getState().setActive('s1')
    await vi.waitFor(() => expect(useSessionsStore.getState().sessions.s1.meta.archived).toBe(false))
    expect(invoke).toHaveBeenCalledWith('sessions:reopen', { sessionId: 's1' })
    expect(useSessionsStore.getState().activeId).toBe('s1')
  })

  it('loads the transcript when reopening — the bug that made a reopened session look empty', async () => {
    seed(true)
    await useSessionsStore.getState().reopen('s1')
    await vi.waitFor(() => expect(useSessionsStore.getState().sessions.s1.historyLoaded).toBe(true))
    expect(invoke).toHaveBeenCalledWith('sessions:history', { sessionId: 's1' })
    expect(useSessionsStore.getState().sessions.s1.blocks.length).toBeGreaterThan(0)
  })
})

import { app, Notification, shell, type BrowserWindow } from 'electron'
import { existsSync } from 'node:fs'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { ClaudeHistoryItem, PastedImage, SessionMeta, SessionStatus, UiEvent } from '@shared/types'
import { IDLE_RUNTIME_TIMEOUT_MS, META_SAVE_DEBOUNCE_MS } from '@shared/constants'
import { PermissionBroker } from '../permissions/PermissionBroker'
import { ProfileStore, SessionStore, Settings } from '../store/stores'
import { importClaudeTranscript, listClaudeSessions } from './ClaudeHistory'
import { loadTranscriptEvents, SessionRuntime } from './SessionRuntime'

const BUSY_KINDS: SessionStatus['kind'][] = ['thinking', 'running-tool', 'waiting-permission']

/**
 * Owns all live SessionRuntimes and their persistence. Sessions restored
 * from disk stay cold until the user sends a message, at which point a
 * runtime is started with `resume` pointing at the SDK session. Runtimes
 * that error out are replaced transparently on the next message, and idle
 * runtimes are reaped so child processes don't accumulate.
 */
export class SessionManager {
  private runtimes = new Map<string, SessionRuntime>()
  private metas = new Map<string, SessionMeta>()
  readonly broker: PermissionBroker
  private counter = 0
  private saveTimers = new Map<string, NodeJS.Timeout>()
  private prevStatusKind = new Map<string, SessionStatus['kind']>()
  private reaper: NodeJS.Timeout

  constructor(private getWindow: () => BrowserWindow | null) {
    this.broker = new PermissionBroker({
      sendToRenderer: (request) => this.send('permission:request', request),
      notifyResolved: (requestId) => this.send('permission:resolved', { requestId }),
      onWaitingChanged: (sessionId, waiting) => {
        this.runtimes.get(sessionId)?.setWaitingPermission(waiting)
        if (waiting) {
          const window = this.getWindow()
          if (window && !window.isFocused()) {
            window.flashFrame(true)
          }
        }
      },
      persistAlwaysAllow: (sessionId, rule) => {
        const meta = this.metas.get(sessionId)
        if (meta) {
          ProfileStore.addAllowedTool(meta.profileId, rule)
        }
      },
      recordDecision: (sessionId, toolUseId, decision) => {
        this.runtimes.get(sessionId)?.recordDecision(toolUseId, decision)
      }
    })

    for (const meta of SessionStore.list()) {
      meta.status = { kind: 'idle' }
      this.metas.set(meta.id, meta)
    }

    this.reaper = setInterval(() => this.reapIdleRuntimes(), 60_000)
  }

  private send(channel: string, payload: unknown): void {
    this.getWindow()?.webContents.send(channel, payload)
  }

  /** Sessions mid-turn right now — used to warn before quitting or restarting. */
  busyCount(): number {
    return this.runningCount()
  }

  private runningCount(): number {
    let count = 0
    for (const runtime of this.runtimes.values()) {
      if (BUSY_KINDS.includes(runtime.meta.status.kind)) {
        count++
      }
    }
    return count
  }

  /** Debounced disk write — status flips several times per tool call. */
  private persistMeta(meta: SessionMeta, immediate = false): void {
    const existing = this.saveTimers.get(meta.id)
    if (existing) {
      clearTimeout(existing)
      this.saveTimers.delete(meta.id)
    }
    if (immediate) {
      SessionStore.save(meta)
      return
    }
    this.saveTimers.set(
      meta.id,
      setTimeout(() => {
        this.saveTimers.delete(meta.id)
        SessionStore.save(meta)
      }, META_SAVE_DEBOUNCE_MS)
    )
  }

  /** Native notification when the app is in the background and an agent needs the user. */
  private maybeNotify(meta: SessionMeta, status: SessionStatus): void {
    const window = this.getWindow()
    if (window?.isFocused() || !Notification.isSupported()) {
      return
    }
    const prev = this.prevStatusKind.get(meta.id)
    const title = meta.title || 'Pilot session'
    let body: string | null = null
    if (status.kind === 'waiting-permission' && prev !== 'waiting-permission') {
      body = 'The agent needs your approval to continue.'
    } else if (
      (status.kind === 'idle' || status.kind === 'done') &&
      (prev === 'thinking' || prev === 'running-tool')
    ) {
      body = `Finished — $${meta.stats.totalCostUsd.toFixed(2)} total this session.`
    } else if (status.kind === 'error' && prev !== 'error') {
      body = 'The agent hit an error and stopped.'
    }
    if (!body) {
      return
    }
    const notification = new Notification({ title, body, silent: false })
    notification.on('click', () => {
      window?.show()
      window?.focus()
      this.send('session:focus', { sessionId: meta.id })
    })
    notification.show()
  }

  list(): SessionMeta[] {
    return [...this.metas.values()].sort((a, b) => b.lastActiveAt - a.lastActiveAt)
  }

  create(profileId: string, cwd: string): SessionMeta {
    const profile = ProfileStore.list().find((p) => p.id === profileId)
    if (!profile) {
      throw new Error('Agent profile not found')
    }
    if (this.runningCount() >= Settings.get().maxConcurrentSessions) {
      throw new Error(
        `Concurrent session limit reached (${Settings.get().maxConcurrentSessions}). Interrupt or archive a running session first.`
      )
    }

    const meta: SessionMeta = {
      id: `sess_${Date.now()}_${++this.counter}`,
      profileId,
      title: '',
      cwd,
      model: profile.model,
      permissionMode: profile.permissionMode,
      status: { kind: 'idle' },
      stats: { totalCostUsd: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, turns: 0 },
      filesTouched: [],
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
      archived: false
    }
    this.metas.set(meta.id, meta)
    this.startRuntime(meta)
    this.persistMeta(meta, true)
    return meta
  }

  /** Root of a fork family, so tabs opened from any member share one naming pool. */
  private rootOf(sessionId: string): string {
    const seen = new Set<string>()
    let current = sessionId
    let parentId = this.metas.get(current)?.forkedFrom
    while (parentId && !seen.has(current)) {
      seen.add(current)
      current = parentId
      parentId = this.metas.get(current)?.forkedFrom
    }
    return current
  }

  /** "New tab", then "New tab (2)", skipping names already used in this family. */
  private nextTabTitle(parentId: string): string {
    const root = this.rootOf(parentId)
    const taken = new Set(
      [...this.metas.values()].filter((m) => !m.archived && this.rootOf(m.id) === root).map((m) => m.title)
    )
    let title = 'New tab'
    let n = 2
    while (taken.has(title)) {
      title = `New tab (${n})`
      n += 1
    }
    return title
  }

  /**
   * Branches a session into a second tab: the agent keeps the conversation so far but
   * runs in its own process, so both tabs can work at the same time without one
   * overwriting the other's history.
   */
  async fork(sessionId: string): Promise<SessionMeta> {
    const parent = this.metas.get(sessionId)
    if (!parent) {
      throw new Error('Session not found')
    }
    if (!parent.sdkSessionId) {
      throw new Error('Send a message in this session first, then it can be branched.')
    }
    if (this.runningCount() >= Settings.get().maxConcurrentSessions) {
      throw new Error(
        `Concurrent session limit reached (${Settings.get().maxConcurrentSessions}). Interrupt or archive a running session first.`
      )
    }

    const meta: SessionMeta = {
      ...parent,
      id: `sess_${Date.now()}_${++this.counter}`,
      title: this.nextTabTitle(parent.id),
      // A tab starts untagged; the colour belongs to the tab, not to the family.
      color: undefined,
      forkPending: true,
      forkedFrom: parent.id,
      status: { kind: 'idle' },
      stats: { totalCostUsd: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, turns: 0 },
      filesTouched: [],
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
      archived: false
    }

    // Carry the visible history across too, so the new tab reads as a continuation.
    const events = await importClaudeTranscript(parent.sdkSessionId).catch(() => [])
    const transcriptDir = path.join(app.getPath('userData'), 'transcripts')
    await mkdir(transcriptDir, { recursive: true })
    await writeFile(path.join(transcriptDir, `${meta.id}.json`), JSON.stringify(events), 'utf8')

    this.metas.set(meta.id, meta)
    this.startRuntime(meta)
    this.persistMeta(meta, true)
    return meta
  }

  private startRuntime(meta: SessionMeta): SessionRuntime {
    const profile = ProfileStore.list().find((p) => p.id === meta.profileId) ?? ProfileStore.list()[0]
    if (!profile) {
      throw new Error('Agent profile not found')
    }
    const runtime = new SessionRuntime(meta, profile, {
      broker: this.broker,
      emitEvents: (sessionId, events) => this.send('session:events', { sessionId, events }),
      emitStatus: (sessionMeta) => {
        this.send('session:status', {
          sessionId: sessionMeta.id,
          status: sessionMeta.status,
          stats: sessionMeta.stats,
          filesTouched: sessionMeta.filesTouched
        })
        this.maybeNotify(sessionMeta, sessionMeta.status)
        this.prevStatusKind.set(sessionMeta.id, sessionMeta.status.kind)
        this.persistMeta(sessionMeta)
      },
      emitGitChanged: (sessionId) => this.send('git:changed', { sessionId }),
      getApiKey: () => Settings.getApiKey(),
      getCustomInstructions: () => Settings.get().customInstructions
    })
    this.runtimes.set(meta.id, runtime)
    runtime.start()
    return runtime
  }

  async sendMessage(sessionId: string, text: string, images?: PastedImage[]): Promise<void> {
    const meta = this.metas.get(sessionId)
    if (!meta) {
      throw new Error('Session not found')
    }
    let runtime = this.runtimes.get(sessionId)
    // A runtime whose stream ended (error or otherwise) can't accept input —
    // replace it and resume the SDK session in a fresh process.
    if (runtime?.isDead()) {
      runtime.dispose()
      this.runtimes.delete(sessionId)
      runtime = undefined
    }
    if (!runtime) {
      if (this.runningCount() >= Settings.get().maxConcurrentSessions) {
        throw new Error(
          `Concurrent session limit reached (${Settings.get().maxConcurrentSessions}). Interrupt or archive a running session first.`
        )
      }
      runtime = this.startRuntime(meta)
      await runtime.loadTranscript()
    }
    runtime.sendMessage(text, images)
  }

  async interrupt(sessionId: string): Promise<void> {
    this.broker.cancelPending(sessionId, 'Interrupted by user')
    await this.runtimes.get(sessionId)?.interrupt()
  }

  archive(sessionId: string): void {
    const meta = this.metas.get(sessionId)
    if (!meta) {
      return
    }
    const runtime = this.runtimes.get(sessionId)
    if (runtime) {
      runtime.dispose()
      this.runtimes.delete(sessionId)
    }
    this.broker.disposeSession(sessionId)
    meta.archived = true
    meta.status = { kind: 'idle' }
    this.persistMeta(meta, true)
  }

  /** Permanently removes a session: meta, transcript, and its managed workspace if unused. */
  async deleteSession(sessionId: string): Promise<void> {
    const meta = this.metas.get(sessionId)
    if (!meta) {
      return
    }
    const runtime = this.runtimes.get(sessionId)
    if (runtime) {
      runtime.dispose()
      this.runtimes.delete(sessionId)
    }
    this.broker.disposeSession(sessionId)
    this.metas.delete(sessionId)
    SessionStore.remove(sessionId)

    const transcript = path.join(app.getPath('userData'), 'transcripts', `${sessionId}.json`)
    await rm(transcript, { force: true }).catch(() => undefined)

    const workspacesRoot = path.join(app.getPath('userData'), 'workspaces')
    const isManaged = meta.cwd.startsWith(workspacesRoot + path.sep)
    const stillUsed = [...this.metas.values()].some((m) => m.cwd === meta.cwd)
    if (isManaged && !stillUsed && existsSync(meta.cwd)) {
      await shell.trashItem(meta.cwd).catch(() => undefined)
    }
  }

  reopen(sessionId: string): SessionMeta {
    const meta = this.metas.get(sessionId)
    if (!meta) {
      throw new Error('Session not found')
    }
    meta.archived = false
    this.persistMeta(meta, true)
    return meta
  }

  async history(sessionId: string): Promise<UiEvent[]> {
    const runtime = this.runtimes.get(sessionId)
    if (runtime) {
      return runtime.getEventLog()
    }
    return this.metas.has(sessionId) ? loadTranscriptEvents(sessionId) : []
  }

  async setModel(sessionId: string, model: string): Promise<void> {
    const meta = this.metas.get(sessionId)
    if (meta) {
      meta.model = model
      this.persistMeta(meta, true)
    }
    // The meta change is the source of truth (applied on next engine start) —
    // a dead or busy engine must not make the click look like it did nothing.
    try {
      await this.runtimes.get(sessionId)?.setModel(model)
    } catch (error) {
      console.warn('setModel: live engine did not accept the change', error)
    }
  }

  async setPermissionMode(sessionId: string, mode: string): Promise<void> {
    const meta = this.metas.get(sessionId)
    if (meta) {
      meta.permissionMode = mode as SessionMeta['permissionMode']
      this.persistMeta(meta, true)
    }
    try {
      await this.runtimes.get(sessionId)?.setPermissionMode(mode)
    } catch (error) {
      console.warn('setPermissionMode: live engine did not accept the change', error)
    }
  }

  rename(sessionId: string, title: string): void {
    const meta = this.metas.get(sessionId)
    if (meta) {
      meta.title = title.trim() || meta.title
      this.persistMeta(meta, true)
    }
  }

  setColor(sessionId: string, color: string | null): void {
    const meta = this.metas.get(sessionId)
    if (meta) {
      if (color) {
        meta.color = color
      } else {
        delete meta.color
      }
      this.persistMeta(meta, true)
    }
  }

  getMeta(sessionId: string): SessionMeta | undefined {
    return this.metas.get(sessionId)
  }

  /** `pilot <dir>` CLI entry: focus the existing tab for a folder or open a new one. */
  openPath(dir: string, forceNew = false): void {
    const existing = [...this.metas.values()].find((m) => !m.archived && m.cwd === dir)
    if (existing && !forceNew) {
      this.send('session:focus', { sessionId: existing.id })
      return
    }
    const profile = ProfileStore.list()[0]
    if (!profile) {
      return
    }
    try {
      const meta = this.create(profile.id, dir)
      Settings.recordRecentFolder(dir)
      this.send('session:created', meta)
    } catch (error) {
      // Most likely the concurrency limit — the window is focused, that's enough.
      console.warn('openPath could not create a session', error)
    }
  }

  /** Past Claude Code sessions from the shared store, minus ones Pilot already owns. */
  async listTerminalHistory(): Promise<ClaudeHistoryItem[]> {
    const known = new Set([...this.metas.values()].map((m) => m.sdkSessionId).filter(Boolean))
    const sessions = await listClaudeSessions()
    return sessions.filter((s) => !known.has(s.sdkSessionId))
  }

  /** Adopts a terminal session: imports its transcript and makes it resumable in Pilot. */
  async importTerminal(sdkSessionId: string): Promise<SessionMeta> {
    const item = (await listClaudeSessions()).find((s) => s.sdkSessionId === sdkSessionId)
    if (!item) {
      throw new Error('Session not found in the Claude store')
    }
    const profile = ProfileStore.list()[0]
    const meta: SessionMeta = {
      id: `sess_${Date.now()}_${++this.counter}`,
      sdkSessionId,
      profileId: profile.id,
      title: item.title.length > 60 ? `${item.title.slice(0, 60)}…` : item.title,
      cwd: item.cwd,
      model: profile.model,
      permissionMode: profile.permissionMode,
      status: { kind: 'idle' },
      stats: { totalCostUsd: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, turns: 0 },
      filesTouched: [],
      createdAt: item.lastModified,
      lastActiveAt: item.lastModified,
      archived: false
    }

    const events = await importClaudeTranscript(sdkSessionId)
    const transcriptDir = path.join(app.getPath('userData'), 'transcripts')
    await mkdir(transcriptDir, { recursive: true })
    await writeFile(path.join(transcriptDir, `${meta.id}.json`), JSON.stringify(events), 'utf8')

    this.metas.set(meta.id, meta)
    this.persistMeta(meta, true)
    return meta
  }

  /** Disposes runtimes that have sat idle past the timeout — they resume on the next message. */
  private reapIdleRuntimes(): void {
    const now = Date.now()
    for (const [sessionId, runtime] of this.runtimes) {
      const { status, lastActiveAt } = runtime.meta
      const idle = !BUSY_KINDS.includes(status.kind)
      if (idle && now - lastActiveAt > IDLE_RUNTIME_TIMEOUT_MS) {
        runtime.dispose()
        this.runtimes.delete(sessionId)
      }
    }
  }

  disposeAll(): void {
    clearInterval(this.reaper)
    for (const timer of this.saveTimers.values()) {
      clearTimeout(timer)
    }
    SessionStore.saveAll([...this.metas.values()])
    for (const runtime of this.runtimes.values()) {
      runtime.dispose()
    }
    this.runtimes.clear()
  }
}

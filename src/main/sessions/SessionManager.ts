import { app, type BrowserWindow } from 'electron'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { ClaudeHistoryItem, PastedImage, SessionMeta, UiEvent } from '@shared/types'
import { PermissionBroker } from '../permissions/PermissionBroker'
import { ProfileStore, SessionStore, Settings } from '../store/stores'
import { importClaudeTranscript, listClaudeSessions } from './ClaudeHistory'
import { SessionRuntime } from './SessionRuntime'

/**
 * Owns all live SessionRuntimes and their persistence. Sessions restored
 * from disk stay cold until the user sends a message, at which point a
 * runtime is started with `resume` pointing at the SDK session.
 */
export class SessionManager {
  private runtimes = new Map<string, SessionRuntime>()
  private metas = new Map<string, SessionMeta>()
  readonly broker: PermissionBroker
  private counter = 0

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
      }
    })

    for (const meta of SessionStore.list()) {
      meta.status = { kind: 'idle' }
      this.metas.set(meta.id, meta)
    }
  }

  private send(channel: string, payload: unknown): void {
    this.getWindow()?.webContents.send(channel, payload)
  }

  private runningCount(): number {
    let count = 0
    for (const runtime of this.runtimes.values()) {
      const kind = runtime.meta.status.kind
      if (kind === 'thinking' || kind === 'running-tool' || kind === 'waiting-permission') {
        count++
      }
    }
    return count
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
    SessionStore.save(meta)
    return meta
  }

  private startRuntime(meta: SessionMeta): SessionRuntime {
    const profile = ProfileStore.list().find((p) => p.id === meta.profileId)
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
        SessionStore.save(sessionMeta)
      },
      emitGitChanged: (sessionId) => this.send('git:changed', { sessionId }),
      getApiKey: () => Settings.getApiKey()
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
    if (!runtime) {
      if (this.runningCount() >= Settings.get().maxConcurrentSessions) {
        throw new Error('Concurrent session limit reached')
      }
      runtime = this.startRuntime(meta)
      await runtime.loadTranscript()
    }
    runtime.sendMessage(text, images)
  }

  async interrupt(sessionId: string): Promise<void> {
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
    SessionStore.save(meta)
  }

  reopen(sessionId: string): SessionMeta {
    const meta = this.metas.get(sessionId)
    if (!meta) {
      throw new Error('Session not found')
    }
    meta.archived = false
    SessionStore.save(meta)
    return meta
  }

  async history(sessionId: string): Promise<UiEvent[]> {
    const runtime = this.runtimes.get(sessionId)
    if (runtime) {
      return runtime.getEventLog()
    }
    const meta = this.metas.get(sessionId)
    if (!meta) {
      return []
    }
    const probe = new SessionRuntime(meta, ProfileStore.list()[0], {
      broker: this.broker,
      emitEvents: () => undefined,
      emitStatus: () => undefined,
      emitGitChanged: () => undefined,
      getApiKey: () => ''
    })
    await probe.loadTranscript()
    return probe.getEventLog()
  }

  async setModel(sessionId: string, model: string): Promise<void> {
    const meta = this.metas.get(sessionId)
    if (meta) {
      meta.model = model
      SessionStore.save(meta)
    }
    await this.runtimes.get(sessionId)?.setModel(model)
  }

  async setPermissionMode(sessionId: string, mode: string): Promise<void> {
    const meta = this.metas.get(sessionId)
    if (meta) {
      meta.permissionMode = mode as SessionMeta['permissionMode']
      SessionStore.save(meta)
    }
    await this.runtimes.get(sessionId)?.setPermissionMode(mode)
  }

  rename(sessionId: string, title: string): void {
    const meta = this.metas.get(sessionId)
    if (meta) {
      meta.title = title.trim() || meta.title
      SessionStore.save(meta)
    }
  }

  getMeta(sessionId: string): SessionMeta | undefined {
    return this.metas.get(sessionId)
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
    SessionStore.save(meta)
    return meta
  }

  disposeAll(): void {
    for (const runtime of this.runtimes.values()) {
      runtime.dispose()
    }
    this.runtimes.clear()
  }
}

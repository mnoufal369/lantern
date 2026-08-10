import { query, type Options, type PermissionUpdate, type Query, type SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'
import { app } from 'electron'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { AgentProfile, PastedImage, SessionMeta, SessionStats, SessionStatus, UiEvent } from '@shared/types'
import { FILE_EDIT_TOOLS, STREAM_FLUSH_MS } from '@shared/constants'
import { AsyncQueue } from './AsyncQueue'
import { Normalizer } from './normalize'
import type { PermissionBroker } from '../permissions/PermissionBroker'

export interface RuntimeDeps {
  broker: PermissionBroker
  emitEvents: (sessionId: string, events: UiEvent[]) => void
  emitStatus: (meta: SessionMeta) => void
  emitGitChanged: (sessionId: string) => void
  getApiKey: () => string
  getCustomInstructions: () => string
}

function transcriptPath(sessionId: string): string {
  return path.join(app.getPath('userData'), 'transcripts', `${sessionId}.json`)
}

/** Reads a persisted event log without spinning up a runtime. */
export async function loadTranscriptEvents(sessionId: string): Promise<UiEvent[]> {
  try {
    const raw = await readFile(transcriptPath(sessionId), 'utf8')
    return JSON.parse(raw) as UiEvent[]
  } catch {
    return []
  }
}

/** Milliseconds of quiet before an in-turn transcript snapshot is written. */
const TRANSCRIPT_SNAPSHOT_MS = 2000

/**
 * Owns one long-lived SDK query stream: pushes user messages in via an
 * AsyncQueue, consumes normalized events out, coalesces streaming deltas,
 * derives sidebar status, and persists the event log for reopening.
 */
export class SessionRuntime {
  readonly meta: SessionMeta
  private queue = new AsyncQueue<SDKUserMessage>()
  private activeQuery: Query | null = null
  private normalizer = new Normalizer()
  private abort = new AbortController()
  private eventLog: UiEvent[] = []
  private pendingFlush: UiEvent[] = []
  private flushTimer: NodeJS.Timeout | null = null
  private messageCounter = 0
  private waitingPermission = false
  /** Cumulative cost reported by the *current* agent process. */
  private processCost = 0
  /** Cost accumulated by earlier processes of this session (from disk). */
  private baseCostUsd = 0
  private disposed = false
  private streamEnded = false
  private snapshotTimer: NodeJS.Timeout | null = null

  constructor(
    meta: SessionMeta,
    private profile: AgentProfile,
    private deps: RuntimeDeps
  ) {
    this.meta = meta
    this.baseCostUsd = meta.stats.totalCostUsd
  }

  /** True once the SDK stream has ended — the runtime must be replaced, not reused. */
  isDead(): boolean {
    return this.streamEnded || this.disposed
  }

  start(): void {
    const options = this.buildOptions()
    this.activeQuery = query({ prompt: this.queue, options })
    void this.consume(this.activeQuery)
  }

  private buildOptions(): Options {
    const globalInstructions = this.deps.getCustomInstructions().trim()
    const profileText = this.profile.systemPrompt.text.trim()
    const combined = [profileText, globalInstructions].filter(Boolean).join('\n\n')
    const systemPrompt =
      this.profile.systemPrompt.mode === 'replace' && profileText !== ''
        ? combined
        : combined !== ''
          ? ({ type: 'preset', preset: 'claude_code', append: combined } as const)
          : ({ type: 'preset', preset: 'claude_code' } as const)

    const options: Options = {
      model: this.meta.model || this.profile.model,
      cwd: this.meta.cwd,
      systemPrompt,
      permissionMode: this.meta.permissionMode || this.profile.permissionMode,
      allowedTools: this.profile.allowedTools.length > 0 ? this.profile.allowedTools : undefined,
      disallowedTools: this.profile.disallowedTools.length > 0 ? this.profile.disallowedTools : undefined,
      mcpServers: Object.keys(this.profile.mcpServers).length > 0 ? this.profile.mcpServers : undefined,
      maxBudgetUsd: this.profile.maxBudgetUsd,
      includePartialMessages: true,
      abortController: this.abort,
      env: {
        ...process.env,
        ...(this.deps.getApiKey().trim() !== '' ? { ANTHROPIC_API_KEY: this.deps.getApiKey() } : {}),
        CLAUDE_AGENT_SDK_CLIENT_APP: `pilot/${app.getVersion()}`
      },
      canUseTool: (toolName, input, context) =>
        this.deps.broker.request(this.meta.id, toolName, input, {
          signal: context.signal,
          suggestions: context.suggestions as PermissionUpdate[] | undefined,
          title: context.title,
          toolUseId: context.toolUseID
        }),
      resume: this.meta.sdkSessionId,
      pathToClaudeCodeExecutable: resolvePackagedCli()
    }

    if ((this.meta.permissionMode || this.profile.permissionMode) === 'bypassPermissions') {
      ;(options as Record<string, unknown>).allowDangerouslySkipPermissions = true
    }

    return options
  }

  private async consume(stream: Query): Promise<void> {
    try {
      for await (const message of stream) {
        const events = this.normalizer.reduce(message)
        if (events.length > 0) {
          this.handleEvents(events)
        }
      }
      if (!this.disposed) {
        this.setStatus({ kind: 'done' })
      }
    } catch (error) {
      if (!this.disposed) {
        const messageText = error instanceof Error ? error.message : String(error)
        this.handleEvents([{ t: 'session-error', message: messageText }])
        this.setStatus({ kind: 'error', message: messageText })
      }
    } finally {
      this.streamEnded = true
    }
  }

  /** Records a permission verdict into the transcript against its tool block. */
  recordDecision(toolUseId: string, decision: 'allowed' | 'denied'): void {
    this.handleEvents([{ t: 'permission-decision', id: toolUseId, decision }])
  }

  private handleEvents(events: UiEvent[]): void {
    for (const event of events) {
      switch (event.t) {
        case 'system-init':
          this.meta.sdkSessionId = event.sdkSessionId
          break
        case 'text':
        case 'thinking':
          if (this.meta.status.kind !== 'thinking' && !this.waitingPermission) {
            this.setStatus({ kind: 'thinking' })
          }
          break
        case 'tool-start': {
          if (!this.waitingPermission) {
            this.setStatus({ kind: 'running-tool', toolName: event.toolName })
          }
          if (FILE_EDIT_TOOLS.includes(event.toolName)) {
            const filePath = (event.input as { file_path?: string })?.file_path
            if (filePath && !this.meta.filesTouched.includes(filePath)) {
              this.meta.filesTouched.push(filePath)
            }
          }
          break
        }
        case 'tool-result':
          if (!this.waitingPermission && this.meta.status.kind !== 'thinking') {
            this.setStatus({ kind: 'thinking' })
          }
          this.deps.emitGitChanged(this.meta.id)
          break
        case 'turn-complete': {
          const turnCost = Math.max(0, event.costUsd - this.processCost)
          this.processCost = event.costUsd
          event.costUsd = turnCost
          this.meta.stats = {
            totalCostUsd: this.baseCostUsd + this.processCost,
            inputTokens: this.meta.stats.inputTokens + event.usage.inputTokens,
            outputTokens: this.meta.stats.outputTokens + event.usage.outputTokens,
            cacheReadTokens: this.meta.stats.cacheReadTokens + event.usage.cacheReadTokens,
            turns: this.meta.stats.turns + 1
          }
          this.setStatus(event.isError ? { kind: 'error', message: event.errorMessage ?? 'turn failed' } : { kind: 'idle' })
          void this.persistTranscript()
          break
        }
        default:
          break
      }
    }
    this.enqueue(events)
  }

  private enqueue(events: UiEvent[]): void {
    this.eventLog.push(...events)
    this.pendingFlush.push(...events)
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => {
        this.flushTimer = null
        const batch = this.pendingFlush
        this.pendingFlush = []
        if (batch.length > 0) {
          this.deps.emitEvents(this.meta.id, batch)
        }
      }, STREAM_FLUSH_MS)
    }
    // Snapshot mid-turn too, so a crash loses at most a couple of seconds.
    if (!this.snapshotTimer) {
      this.snapshotTimer = setTimeout(() => {
        this.snapshotTimer = null
        void this.persistTranscript()
      }, TRANSCRIPT_SNAPSHOT_MS)
    }
  }

  private setStatus(status: SessionStatus): void {
    this.meta.status = status
    this.meta.lastActiveAt = Date.now()
    this.deps.emitStatus(this.meta)
  }

  setWaitingPermission(waiting: boolean): void {
    this.waitingPermission = waiting
    if (waiting) {
      this.setStatus({ kind: 'waiting-permission' })
    } else if (this.meta.status.kind === 'waiting-permission') {
      this.setStatus({ kind: 'thinking' })
    }
  }

  sendMessage(text: string, images?: PastedImage[]): void {
    if (this.meta.title === '' || this.meta.title === 'New session') {
      const base = text.trim() !== '' ? text : 'Screenshot'
      this.meta.title = base.length > 48 ? `${base.slice(0, 48)}…` : base
    }
    const userEvent: UiEvent = {
      t: 'user-text',
      id: `usr_${++this.messageCounter}`,
      text,
      images: images?.map((img) => `data:${img.mediaType};base64,${img.base64}`)
    }
    this.handleEvents([userEvent])
    this.setStatus({ kind: 'thinking' })

    const content =
      images && images.length > 0
        ? [
            ...images.map((img) => ({
              type: 'image' as const,
              source: { type: 'base64' as const, media_type: img.mediaType, data: img.base64 }
            })),
            ...(text.trim() !== '' ? [{ type: 'text' as const, text }] : [])
          ]
        : text
    this.queue.push({
      type: 'user',
      message: { role: 'user', content },
      parent_tool_use_id: null
    } as SDKUserMessage)
  }

  async interrupt(): Promise<void> {
    try {
      await this.activeQuery?.interrupt()
    } catch {
      // Interrupting an idle session is a no-op.
    }
    this.setStatus({ kind: 'idle' })
  }

  async setModel(model: string): Promise<void> {
    await this.activeQuery?.setModel(model)
  }

  async setPermissionMode(mode: string): Promise<void> {
    await this.activeQuery?.setPermissionMode(mode as Parameters<Query['setPermissionMode']>[0])
  }

  getEventLog(): UiEvent[] {
    return this.eventLog
  }

  async loadTranscript(): Promise<void> {
    try {
      const raw = await readFile(transcriptPath(this.meta.id), 'utf8')
      this.eventLog = JSON.parse(raw) as UiEvent[]
    } catch {
      this.eventLog = []
    }
  }

  private async persistTranscript(): Promise<void> {
    try {
      const dir = path.dirname(transcriptPath(this.meta.id))
      await mkdir(dir, { recursive: true })
      await writeFile(transcriptPath(this.meta.id), JSON.stringify(this.eventLog), 'utf8')
    } catch (error) {
      console.error('Failed to persist transcript', error)
    }
  }

  updateStats(stats: SessionStats): void {
    this.meta.stats = stats
  }

  dispose(): void {
    this.disposed = true
    if (this.snapshotTimer) {
      clearTimeout(this.snapshotTimer)
      this.snapshotTimer = null
    }
    this.queue.end()
    this.abort.abort()
    try {
      this.activeQuery?.close()
    } catch {
      // Already closed.
    }
    // Synchronous on purpose: dispose runs on quit, when async writes race the process exit.
    try {
      const file = transcriptPath(this.meta.id)
      mkdirSync(path.dirname(file), { recursive: true })
      writeFileSync(file, JSON.stringify(this.eventLog), 'utf8')
    } catch (error) {
      console.error('Failed to persist transcript on dispose', error)
    }
  }
}

/**
 * In a packaged app the SDK lives in app.asar.unpacked (child processes
 * cannot run from inside an asar archive). Point the SDK at the unpacked
 * native binary explicitly; in dev the default resolution is used.
 */
function resolvePackagedCli(): string | undefined {
  if (!app.isPackaged) {
    return undefined
  }
  const binaryName = process.platform === 'win32' ? 'claude.exe' : 'claude'
  const candidates = [
    path.join(
      process.resourcesPath,
      'app.asar.unpacked',
      'node_modules',
      '@anthropic-ai',
      `claude-agent-sdk-${process.platform}-${process.arch}`,
      binaryName
    )
  ]
  return candidates.find((candidate) => existsSync(candidate))
}

import { query, type Options, type PermissionUpdate, type Query, type SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'
import { app } from 'electron'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { AgentProfile, SessionMeta, SessionStats, SessionStatus, UiEvent } from '@shared/types'
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
}

function transcriptPath(sessionId: string): string {
  return path.join(app.getPath('userData'), 'transcripts', `${sessionId}.json`)
}

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
  private lastTotalCost = 0
  private disposed = false

  constructor(
    meta: SessionMeta,
    private profile: AgentProfile,
    private deps: RuntimeDeps
  ) {
    this.meta = meta
  }

  start(): void {
    const options = this.buildOptions()
    this.activeQuery = query({ prompt: this.queue, options })
    void this.consume(this.activeQuery)
  }

  private buildOptions(): Options {
    const systemPrompt =
      this.profile.systemPrompt.mode === 'replace' && this.profile.systemPrompt.text.trim() !== ''
        ? this.profile.systemPrompt.text
        : this.profile.systemPrompt.text.trim() !== ''
          ? ({ type: 'preset', preset: 'claude_code', append: this.profile.systemPrompt.text } as const)
          : ({ type: 'preset', preset: 'claude_code' } as const)

    const options: Options = {
      model: this.profile.model,
      cwd: this.meta.cwd,
      systemPrompt,
      permissionMode: this.profile.permissionMode,
      allowedTools: this.profile.allowedTools.length > 0 ? this.profile.allowedTools : undefined,
      disallowedTools: this.profile.disallowedTools.length > 0 ? this.profile.disallowedTools : undefined,
      mcpServers: Object.keys(this.profile.mcpServers).length > 0 ? this.profile.mcpServers : undefined,
      maxBudgetUsd: this.profile.maxBudgetUsd,
      includePartialMessages: true,
      abortController: this.abort,
      env: {
        ...process.env,
        ANTHROPIC_API_KEY: this.deps.getApiKey(),
        CLAUDE_AGENT_SDK_CLIENT_APP: 'agentdeck/0.1.0'
      },
      canUseTool: (toolName, input, context) =>
        this.deps.broker.request(this.meta.id, toolName, input, {
          signal: context.signal,
          suggestions: context.suggestions as PermissionUpdate[] | undefined,
          title: context.title
        }),
      resume: this.meta.sdkSessionId,
      pathToClaudeCodeExecutable: resolvePackagedCli()
    }

    if (this.profile.permissionMode === 'bypassPermissions') {
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
    }
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
          const turnCost = Math.max(0, event.costUsd - this.lastTotalCost)
          this.lastTotalCost = event.costUsd
          event.costUsd = turnCost
          this.meta.stats = {
            totalCostUsd: this.lastTotalCost,
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

  sendMessage(text: string): void {
    if (this.meta.title === '' || this.meta.title === 'New session') {
      this.meta.title = text.length > 48 ? `${text.slice(0, 48)}…` : text
    }
    const userEvent: UiEvent = { t: 'user-text', id: `usr_${++this.messageCounter}`, text }
    this.handleEvents([userEvent])
    this.setStatus({ kind: 'thinking' })
    this.queue.push({
      type: 'user',
      message: { role: 'user', content: text },
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
    this.queue.end()
    this.abort.abort()
    try {
      this.activeQuery?.close()
    } catch {
      // Already closed.
    }
    void this.persistTranscript()
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
  const candidates = [
    path.join(
      process.resourcesPath,
      'app.asar.unpacked',
      'node_modules',
      '@anthropic-ai',
      `claude-agent-sdk-${process.platform}-${process.arch}`,
      'claude'
    )
  ]
  return candidates.find((candidate) => existsSync(candidate))
}

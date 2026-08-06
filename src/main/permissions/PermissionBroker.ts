import type { PermissionResult, PermissionUpdate } from '@anthropic-ai/claude-agent-sdk'
import type { PermissionDecision, PermissionRequest } from '@shared/types'
import { PERMISSION_TIMEOUT_MS } from '@shared/constants'

interface PendingRequest {
  resolve: (result: PermissionResult) => void
  timeout: NodeJS.Timeout
  sessionId: string
  suggestions?: PermissionUpdate[]
  toolName: string
  input: Record<string, unknown>
}

interface BrokerDeps {
  sendToRenderer: (request: PermissionRequest) => void
  notifyResolved: (requestId: string) => void
  onWaitingChanged: (sessionId: string, waiting: boolean) => void
  persistAlwaysAllow: (sessionId: string, rule: string) => void
}

/** Derives a human-readable always-allow rule in Claude Code rule syntax. */
export function deriveAlwaysAllowRule(toolName: string, input: Record<string, unknown>): string {
  if (toolName === 'Bash' && typeof input.command === 'string') {
    const words = input.command.trim().split(/\s+/).slice(0, 2).join(' ')
    return `Bash(${words}:*)`
  }
  return toolName
}

function bashPrefixOf(rule: string): string | null {
  const match = /^Bash\((.+):\*\)$/.exec(rule)
  return match ? match[1] : null
}

/**
 * Bridges the SDK's canUseTool callback to renderer permission dialogs.
 * Holds pending promises keyed by requestId; "always allow" decisions are
 * remembered in-memory per session and persisted to the agent profile.
 */
export class PermissionBroker {
  private pending = new Map<string, PendingRequest>()
  private sessionAlwaysAllow = new Map<string, Set<string>>()
  private counter = 0

  constructor(private deps: BrokerDeps) {}

  private matchesAlwaysAllow(sessionId: string, toolName: string, input: Record<string, unknown>): boolean {
    const rules = this.sessionAlwaysAllow.get(sessionId)
    if (!rules) {
      return false
    }
    if (rules.has(toolName)) {
      return true
    }
    if (toolName === 'Bash' && typeof input.command === 'string') {
      const command = input.command.trim()
      for (const rule of rules) {
        const prefix = bashPrefixOf(rule)
        if (prefix && command.startsWith(prefix)) {
          return true
        }
      }
    }
    return false
  }

  request(
    sessionId: string,
    toolName: string,
    input: Record<string, unknown>,
    context: { signal: AbortSignal; suggestions?: PermissionUpdate[]; title?: string }
  ): Promise<PermissionResult> {
    if (this.matchesAlwaysAllow(sessionId, toolName, input)) {
      return Promise.resolve({ behavior: 'allow', updatedInput: input })
    }

    const requestId = `perm_${++this.counter}`

    return new Promise<PermissionResult>((resolve) => {
      const timeout = setTimeout(() => {
        this.finish(requestId, {
          behavior: 'deny',
          message: 'Timed out waiting for user approval in AgentDeck'
        })
      }, PERMISSION_TIMEOUT_MS)

      this.pending.set(requestId, { resolve, timeout, sessionId, suggestions: context.suggestions, toolName, input })
      this.deps.onWaitingChanged(sessionId, true)

      context.signal.addEventListener('abort', () => {
        this.finish(requestId, { behavior: 'deny', message: 'Operation aborted' })
      })

      this.deps.sendToRenderer({
        requestId,
        sessionId,
        toolName,
        input,
        displayTitle: context.title ?? `Use ${toolName}`,
        alwaysAllowRule: deriveAlwaysAllowRule(toolName, input)
      })
    })
  }

  respond(requestId: string, decision: PermissionDecision): void {
    const entry = this.pending.get(requestId)
    if (!entry) {
      return
    }

    if (decision.kind === 'deny') {
      this.finish(requestId, {
        behavior: 'deny',
        message: decision.reason ?? 'User denied this action in AgentDeck'
      })
      return
    }

    if (decision.kind === 'allow-always') {
      const rule = deriveAlwaysAllowRule(entry.toolName, entry.input)
      let rules = this.sessionAlwaysAllow.get(entry.sessionId)
      if (!rules) {
        rules = new Set()
        this.sessionAlwaysAllow.set(entry.sessionId, rules)
      }
      rules.add(rule)
      this.deps.persistAlwaysAllow(entry.sessionId, rule)
      this.finish(requestId, {
        behavior: 'allow',
        updatedInput: entry.input,
        updatedPermissions: entry.suggestions
      })
      return
    }

    this.finish(requestId, { behavior: 'allow', updatedInput: entry.input })
  }

  private finish(requestId: string, result: PermissionResult): void {
    const entry = this.pending.get(requestId)
    if (!entry) {
      return
    }
    clearTimeout(entry.timeout)
    this.pending.delete(requestId)
    const stillWaiting = [...this.pending.values()].some((p) => p.sessionId === entry.sessionId)
    if (!stillWaiting) {
      this.deps.onWaitingChanged(entry.sessionId, false)
    }
    this.deps.notifyResolved(requestId)
    entry.resolve(result)
  }

  disposeSession(sessionId: string): void {
    for (const [requestId, entry] of this.pending) {
      if (entry.sessionId === sessionId) {
        this.finish(requestId, { behavior: 'deny', message: 'Session closed' })
      }
    }
    this.sessionAlwaysAllow.delete(sessionId)
  }
}

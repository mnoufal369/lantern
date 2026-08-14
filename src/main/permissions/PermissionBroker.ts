import type { PermissionResult, PermissionUpdate } from '@anthropic-ai/claude-agent-sdk'
import type { PermissionDecision, PermissionRequest } from '@shared/types'
import { PERMISSION_TIMEOUT_MS } from '@shared/constants'

interface PendingRequest {
  resolve: (result: PermissionResult) => void
  timeout: NodeJS.Timeout
  sessionId: string
  toolUseId: string
  suggestions?: PermissionUpdate[]
  toolName: string
  input: Record<string, unknown>
}

interface BrokerDeps {
  sendToRenderer: (request: PermissionRequest) => void
  notifyResolved: (requestId: string) => void
  onWaitingChanged: (sessionId: string, waiting: boolean) => void
  persistAlwaysAllow: (sessionId: string, rule: string) => void
  recordDecision: (sessionId: string, toolUseId: string, decision: 'allowed' | 'denied') => void
}

/**
 * Shell control characters that make a command compound (chaining,
 * substitution, redirection). Commands containing any of these never match a
 * prefix rule and never produce one — they must be approved one by one.
 */
const SHELL_CONTROL = /[;&|`$<>\n]/

/** First words whose prefix would grant far more than the user saw approved. */
const RISKY_FIRST_WORDS = new Set([
  'rm', 'rmdir', 'mv', 'dd', 'mkfs', 'shred',
  'sudo', 'su', 'doas',
  'chmod', 'chown', 'chgrp',
  'kill', 'killall', 'pkill', 'shutdown', 'reboot', 'halt',
  'curl', 'wget', 'nc', 'ncat',
  'sh', 'bash', 'zsh', 'fish', 'eval', 'exec', 'source', 'osascript',
  'crontab', 'launchctl', 'systemctl'
])

/**
 * Derives the rule an "always allow" click will remember, in Claude Code
 * rule syntax. Safe commands get a two-word prefix rule (`Bash(git status:*)`);
 * risky or compound commands get an exact-match rule for that one command.
 */
export function deriveAlwaysAllowRule(toolName: string, input: Record<string, unknown>): string {
  if (toolName === 'Bash' && typeof input.command === 'string') {
    const command = input.command.trim()
    const firstWord = command.split(/\s+/)[0] ?? ''
    if (SHELL_CONTROL.test(command) || RISKY_FIRST_WORDS.has(firstWord)) {
      return `Bash(${command})`
    }
    const words = command.split(/\s+/).slice(0, 2).join(' ')
    return `Bash(${words}:*)`
  }
  return toolName
}

/**
 * Whether a Bash command is covered by a remembered rule. Prefix rules only
 * match on a word boundary ("git status" does not cover "git statusx") and
 * never match compound commands ("git status; rm -rf ~" always re-prompts).
 */
export function commandMatchesRule(command: string, rule: string): boolean {
  const trimmed = command.trim()
  const prefixRule = /^Bash\((.+):\*\)$/.exec(rule)
  if (prefixRule) {
    if (SHELL_CONTROL.test(trimmed)) {
      return false
    }
    const prefix = prefixRule[1]
    return trimmed === prefix || trimmed.startsWith(`${prefix} `)
  }
  const exactRule = /^Bash\((.+)\)$/.exec(rule)
  if (exactRule) {
    return trimmed === exactRule[1]
  }
  return false
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
    if (rules.has(toolName) && toolName !== 'Bash') {
      return true
    }
    if (toolName === 'Bash' && typeof input.command === 'string') {
      for (const rule of rules) {
        if (commandMatchesRule(input.command, rule)) {
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
    context: {
      signal: AbortSignal
      suggestions?: PermissionUpdate[]
      title?: string
      toolUseId: string
    }
  ): Promise<PermissionResult> {
    if (this.matchesAlwaysAllow(sessionId, toolName, input)) {
      this.deps.recordDecision(sessionId, context.toolUseId, 'allowed')
      return Promise.resolve({ behavior: 'allow', updatedInput: input })
    }

    const requestId = `perm_${++this.counter}`

    return new Promise<PermissionResult>((resolve) => {
      const timeout = setTimeout(() => {
        this.finish(requestId, {
          behavior: 'deny',
          message: 'Timed out waiting for user approval in Lantern'
        })
      }, PERMISSION_TIMEOUT_MS)

      this.pending.set(requestId, {
        resolve,
        timeout,
        sessionId,
        toolUseId: context.toolUseId,
        suggestions: context.suggestions,
        toolName,
        input
      })
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
        message: decision.reason ?? 'User denied this action in Lantern'
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
    this.deps.recordDecision(entry.sessionId, entry.toolUseId, result.behavior === 'allow' ? 'allowed' : 'denied')
    entry.resolve(result)
  }

  /** Denies every pending request for a session without touching its remembered rules. */
  cancelPending(sessionId: string, reason: string): void {
    for (const [requestId, entry] of this.pending) {
      if (entry.sessionId === sessionId) {
        this.finish(requestId, { behavior: 'deny', message: reason })
      }
    }
  }

  disposeSession(sessionId: string): void {
    this.cancelPending(sessionId, 'Session closed')
    this.sessionAlwaysAllow.delete(sessionId)
  }
}

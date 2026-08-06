export interface McpStdioServerConfig {
  type: 'stdio'
  command: string
  args: string[]
  env?: Record<string, string>
}

export interface McpRemoteServerConfig {
  type: 'http' | 'sse'
  url: string
  headers?: Record<string, string>
}

export type McpServerConfigUi = McpStdioServerConfig | McpRemoteServerConfig

export type PermissionMode = 'default' | 'plan' | 'acceptEdits' | 'bypassPermissions'

export interface AgentProfile {
  id: string
  name: string
  icon: string
  color: string
  systemPrompt: { mode: 'append' | 'replace'; text: string }
  model: string
  permissionMode: PermissionMode
  allowedTools: string[]
  disallowedTools: string[]
  mcpServers: Record<string, McpServerConfigUi>
  defaultCwd?: string
  maxBudgetUsd?: number
  createdAt: number
  updatedAt: number
}

export type SessionStatus =
  | { kind: 'idle' }
  | { kind: 'thinking' }
  | { kind: 'running-tool'; toolName: string }
  | { kind: 'waiting-permission' }
  | { kind: 'done' }
  | { kind: 'error'; message: string }

export interface SessionStats {
  totalCostUsd: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  turns: number
}

export interface SessionMeta {
  id: string
  sdkSessionId?: string
  profileId: string
  title: string
  cwd: string
  model: string
  permissionMode: PermissionMode
  status: SessionStatus
  stats: SessionStats
  filesTouched: string[]
  createdAt: number
  lastActiveAt: number
  archived: boolean
}

export interface TodoItem {
  text: string
  status: 'pending' | 'in_progress' | 'completed'
}

export interface TurnUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
}

/**
 * Normalized transcript events. The renderer never sees raw SDK message
 * shapes — src/main/sessions/normalize.ts converts them into this union.
 */
export type UiEvent =
  | { t: 'user-text'; id: string; text: string }
  | { t: 'text'; id: string; delta: string; done?: boolean }
  | { t: 'thinking'; id: string; delta: string; done?: boolean }
  | { t: 'tool-start'; id: string; toolName: string; input: unknown; parentToolUseId?: string }
  | { t: 'tool-result'; id: string; output: string; isError: boolean }
  | { t: 'permission-decision'; id: string; decision: 'allowed' | 'denied' }
  | { t: 'todo'; items: TodoItem[] }
  | { t: 'turn-complete'; costUsd: number; usage: TurnUsage; isError: boolean; errorMessage?: string }
  | { t: 'system-init'; sdkSessionId: string; model: string; tools: string[]; mcpServers: { name: string; status: string }[] }
  | { t: 'session-error'; message: string }

export interface PermissionRequest {
  requestId: string
  sessionId: string
  toolName: string
  input: unknown
  displayTitle: string
  alwaysAllowRule: string
}

export type PermissionDecision =
  | { kind: 'allow-once' }
  | { kind: 'allow-always' }
  | { kind: 'deny'; reason?: string }

export interface GitFileChange {
  path: string
  index: string
  workingDir: string
  kind: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked' | 'conflicted'
}

export interface GitStatusSummary {
  isRepo: boolean
  branch?: string
  ahead?: number
  behind?: number
  files: GitFileChange[]
  /** True when the session lives in a dockPilot-managed workspace (safe to switch branches). */
  managed?: boolean
}

export type UiMode = 'pro' | 'simple'

export type Persona = 'developer' | 'qa' | 'consultant' | 'curious'

export interface AppSettings {
  /** Always empty when sent to the renderer — the key never leaves the main process. */
  apiKey: string
  hasApiKey: boolean
  theme: 'dark'
  maxConcurrentSessions: number
  uiMode: UiMode
  onboarded: boolean
}

export interface AuthStatus {
  source: 'settings-key' | 'env-key' | 'claude-login' | 'none'
  detail: string
}

export interface ModelInfo {
  id: string
  displayName: string
}

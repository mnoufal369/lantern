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
  /** Tokens in the model's context as of the last completed turn. */
  contextTokens?: number
  /** Context window of the serving model, when known. */
  contextWindow?: number
}

export interface SessionMeta {
  id: string
  sdkSessionId?: string
  /** Set on a fork until its first reply, when the SDK hands back its own session id. */
  forkPending?: boolean
  /** The session this one was forked from, if any. */
  forkedFrom?: string
  /** Optional colour tag shown on the session's tab. */
  color?: string
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
  | { t: 'user-text'; id: string; text: string; images?: string[] }
  | { t: 'text'; id: string; delta: string; done?: boolean }
  | { t: 'thinking'; id: string; delta: string; done?: boolean }
  | { t: 'tool-start'; id: string; toolName: string; input: unknown; parentToolUseId?: string }
  | { t: 'tool-result'; id: string; output: string; isError: boolean }
  | { t: 'permission-decision'; id: string; decision: 'allowed' | 'denied' }
  | { t: 'todo'; items: TodoItem[] }
  | {
      t: 'turn-complete'
      costUsd: number
      usage: TurnUsage
      /** Cumulative token totals for this agent process (from modelUsage) — more reliable than per-turn usage. */
      cumulativeUsage?: TurnUsage
      /** The serving model's context window size, when reported. */
      contextWindow?: number
      isError: boolean
      errorMessage?: string
    }
  | { t: 'system-init'; sdkSessionId: string; model: string; tools: string[]; mcpServers: { name: string; status: string }[]; slashCommands?: string[] }
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
  /** True when the session lives in a Pilot-managed workspace (safe to switch branches). */
  managed?: boolean
}

export type UiMode = 'pro' | 'simple'

export type Persona = 'developer' | 'qa' | 'consultant' | 'curious'

/** Where a self-update has got to. The app keeps running until `ready` is acted on. */
export type UpdatePhase = 'downloading' | 'preparing' | 'ready' | 'installing' | 'error'

export interface UpdateProgress {
  phase: UpdatePhase
  /** 0–100 when the size is known; absent for stage-only progress. */
  percent?: number
  /** One human line, e.g. "Downloading — 42 of 180 MB". */
  detail?: string
  version?: string
  reason?: string
}

export interface RecentRepo {
  url: string
  branch?: string
}

export interface AppSettings {
  /** Always empty when sent to the renderer — the key never leaves the main process. */
  apiKey: string
  hasApiKey: boolean
  theme: 'dark' | 'light'
  maxConcurrentSessions: number
  uiMode: UiMode
  onboarded: boolean
  /** Global style/behaviour instructions appended to every agent's system prompt. */
  customInstructions: string
  recentFolders: string[]
  recentRepos: RecentRepo[]
  /** GitHub org (or user) used to prefill the repo field and power suggestions. */
  githubOrg: string
}

export interface AuthStatus {
  source: 'settings-key' | 'env-key' | 'claude-login' | 'none'
  detail: string
}

export interface ModelInfo {
  id: string
  displayName: string
}

/** A past Claude Code session found in the shared ~/.claude store (terminal or otherwise). */
export interface ClaudeHistoryItem {
  sdkSessionId: string
  title: string
  cwd: string
  lastModified: number
  gitBranch?: string
}

/** An image pasted into the composer, base64-encoded for the model. */
export interface PastedImage {
  mediaType: string
  base64: string
}

import type {
  PastedImage,
  AgentProfile,
  AppSettings,
  AuthStatus,
  ClaudeHistoryItem,
  GitStatusSummary,
  ModelInfo,
  PermissionDecision,
  PermissionRequest,
  SessionMeta,
  SessionStats,
  SessionStatus,
  UiEvent,
  UpdateProgress
} from './types'

/**
 * Request/response channels (ipcRenderer.invoke / ipcMain.handle).
 * Single source of truth for channel names and payload types.
 */
export interface IpcApi {
  'sessions:create': (req: { profileId: string; cwd: string }) => SessionMeta
  'sessions:createFromRepo': (req: { profileId: string; repoUrl: string; branch?: string }) => SessionMeta
  'sessions:exportTranscript': (req: { sessionId: string; markdown: string }) => string | null
  'sessions:send': (req: { sessionId: string; text: string; images?: PastedImage[] }) => void
  'sessions:interrupt': (req: { sessionId: string }) => void
  'sessions:archive': (req: { sessionId: string }) => void
  'sessions:delete': (req: { sessionId: string }) => void
  'sessions:reopen': (req: { sessionId: string }) => SessionMeta
  'sessions:list': (req?: undefined) => SessionMeta[]
  'sessions:history': (req: { sessionId: string }) => UiEvent[]
  'sessions:setModel': (req: { sessionId: string; model: string }) => void
  'sessions:setPermissionMode': (req: { sessionId: string; mode: string }) => void
  'sessions:rename': (req: { sessionId: string; title: string }) => void
  /** Colour tag for the session's tab; null clears it. */
  'sessions:setColor': (req: { sessionId: string; color: string | null }) => void
  'permissions:respond': (req: { requestId: string; decision: PermissionDecision }) => void
  'history:list': (req?: undefined) => ClaudeHistoryItem[]
  /** Looks up one session by pasted id (older than the listing reaches); null if unknown. */
  'history:find': (req: { sdkSessionId: string }) => ClaudeHistoryItem | null
  'history:import': (req: { sdkSessionId: string }) => SessionMeta
  'profiles:list': (req?: undefined) => AgentProfile[]
  'profiles:save': (req: { profile: AgentProfile }) => AgentProfile
  'profiles:delete': (req: { profileId: string }) => void
  'models:list': (req?: undefined) => ModelInfo[]
  /** Repo names (owner/name) of the configured GitHub org, for New Session suggestions. */
  'git:orgRepos': (req?: undefined) => string[]
  'git:status': (req: { sessionId: string }) => GitStatusSummary
  'git:remoteBranches': (req: { sessionId: string }) => string[]
  'git:checkoutBranch': (req: { sessionId: string; branch: string }) => GitStatusSummary
  'git:diffFile': (req: { sessionId: string; path: string }) => string
  'git:revertFile': (req: { sessionId: string; path: string }) => void
  'dialog:pickFolder': (req?: undefined) => string | null
  'shell:revealInFinder': (req: { path: string }) => void
  'app:getSettings': (req?: undefined) => AppSettings
  'app:setSettings': (req: { settings: Partial<AppSettings> }) => AppSettings
  'app:getAuthStatus': (req?: undefined) => AuthStatus
  'app:getVersion': (req?: undefined) => string
  /** Branches a session: same conversation so far, own process from here on. */
  'sessions:fork': (req: { sessionId: string }) => SessionMeta
  'app:checkForUpdate': (req?: undefined) => {
    updateAvailable: boolean
    canSelfUpdate: boolean
    latestVersion?: string
  }
  /** Downloads (or rebuilds) the new version. The running app is untouched. */
  'app:prepareUpdate': (req?: undefined) => { started: boolean; reason?: string }
  /** Quits, swaps in the prepared build and relaunches. Only after the user agrees. */
  'app:installUpdate': (req?: undefined) => { started: boolean; reason?: string }
  /** How many sessions are mid-turn — used to warn before quitting or restarting. */
  'app:busyCount': (req?: undefined) => number
}

/**
 * Push channels (main -> renderer via webContents.send).
 */
export interface IpcEvents {
  'session:events': { sessionId: string; events: UiEvent[] }
  'session:status': { sessionId: string; status: SessionStatus; stats: SessionStats; filesTouched: string[] }
  'permission:request': PermissionRequest
  'permission:resolved': { requestId: string }
  'git:changed': { sessionId: string }
  /** Sent when the user clicks a native notification for this session. */
  'session:focus': { sessionId: string }
  /** A session was created by the main process (e.g. the `loods` CLI). */
  'session:created': SessionMeta
  /** Self-update progress: download percentage, build stage, ready, or failure. */
  'update:progress': UpdateProgress
}

export type IpcChannel = keyof IpcApi
export type IpcEventChannel = keyof IpcEvents

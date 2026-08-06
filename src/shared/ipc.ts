import type {
  AgentProfile,
  AppSettings,
  AuthStatus,
  GitStatusSummary,
  ModelInfo,
  PermissionDecision,
  PermissionRequest,
  SessionMeta,
  SessionStats,
  SessionStatus,
  UiEvent
} from './types'

/**
 * Request/response channels (ipcRenderer.invoke / ipcMain.handle).
 * Single source of truth for channel names and payload types.
 */
export interface IpcApi {
  'sessions:create': (req: { profileId: string; cwd: string }) => SessionMeta
  'sessions:createFromRepo': (req: { profileId: string; repoUrl: string; branch?: string }) => SessionMeta
  'sessions:exportTranscript': (req: { sessionId: string; markdown: string }) => string | null
  'sessions:send': (req: { sessionId: string; text: string }) => void
  'sessions:interrupt': (req: { sessionId: string }) => void
  'sessions:archive': (req: { sessionId: string }) => void
  'sessions:reopen': (req: { sessionId: string }) => SessionMeta
  'sessions:list': (req?: undefined) => SessionMeta[]
  'sessions:history': (req: { sessionId: string }) => UiEvent[]
  'sessions:setModel': (req: { sessionId: string; model: string }) => void
  'sessions:setPermissionMode': (req: { sessionId: string; mode: string }) => void
  'sessions:rename': (req: { sessionId: string; title: string }) => void
  'permissions:respond': (req: { requestId: string; decision: PermissionDecision }) => void
  'profiles:list': (req?: undefined) => AgentProfile[]
  'profiles:save': (req: { profile: AgentProfile }) => AgentProfile
  'profiles:delete': (req: { profileId: string }) => void
  'models:list': (req?: undefined) => ModelInfo[]
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
}

export type IpcChannel = keyof IpcApi
export type IpcEventChannel = keyof IpcEvents

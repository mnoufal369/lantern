import type { ModelInfo } from './types'

export const APP_NAME = 'Pilot'

/** Models offered in the UI; a session keeps any other model id it was created with. */
export const FALLBACK_MODELS: ModelInfo[] = [
  { id: 'claude-opus-5', displayName: 'Opus 5' },
  { id: 'claude-sonnet-5', displayName: 'Sonnet 5' },
  { id: 'claude-haiku-4-5', displayName: 'Haiku 4.5' }
]

export const DEFAULT_MODEL = 'claude-sonnet-5'

export const PROFILE_COLORS = [
  '#f97316', '#eab308', '#22c55e', '#06b6d4',
  '#3b82f6', '#8b5cf6', '#ec4899', '#ef4444'
]

export const PROFILE_ICONS = [
  'bot', 'rocket', 'wrench', 'bug', 'book-open', 'shield',
  'sparkles', 'terminal', 'flask-conical', 'pen-tool'
]

export const FILE_EDIT_TOOLS = ['Edit', 'Write', 'MultiEdit', 'NotebookEdit']

export const DEFAULT_MAX_CONCURRENT_SESSIONS = 5

export const PERMISSION_TIMEOUT_MS = 5 * 60 * 1000

/** Delta coalescing flush interval (ms) for streaming events to the renderer. */
export const STREAM_FLUSH_MS = 33

/** Idle runtimes (agent child processes) are disposed after this long; they resume on the next message. */
export const IDLE_RUNTIME_TIMEOUT_MS = 15 * 60 * 1000

/** Trailing debounce for persisting session metadata during rapid status flips. */
export const META_SAVE_DEBOUNCE_MS = 750

/** How many recent folders / repositories the new-session dialog remembers. */
export const MAX_RECENTS = 6

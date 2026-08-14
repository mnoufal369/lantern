import type { ModelInfo } from './types'

export const APP_NAME = 'Lantern'

/** Where colleagues clone from — also what the in-app update check pings. */
export const REPO_URL = 'https://github.com/mnoufal369/lantern.git'

/** Same repo, addressable in a browser — menu links, issue reports, release notes. */
export const REPO_WEB_URL = REPO_URL.replace(/\.git$/, '')

/** The one-liner shown to users when an update is available. */
export const UPDATE_COMMAND = 'git pull && yarn setup:mac'

/** Models offered in the UI; a session keeps any other model id it was created with. */
export const FALLBACK_MODELS: ModelInfo[] = [
  { id: 'claude-opus-5', displayName: 'Opus 5' },
  { id: 'claude-sonnet-5', displayName: 'Sonnet 5' },
  { id: 'claude-haiku-4-5', displayName: 'Haiku 4.5' }
]

export const DEFAULT_MODEL = 'claude-sonnet-5'

/** Muted, dusty tones — desaturated to sit beside the washed-white brand colour. */
export const PROFILE_COLORS = [
  '#c2836a', '#c3a765', '#94ab84', '#79a8a0',
  '#7e9cbf', '#9a95c9', '#b58aa8', '#a8a29a'
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

/** Assumed model context window for the header context meter. */
export const CONTEXT_WINDOW_TOKENS = 200_000

/** Idle runtimes (agent child processes) are disposed after this long; they resume on the next message. */
export const IDLE_RUNTIME_TIMEOUT_MS = 15 * 60 * 1000

/** Trailing debounce for persisting session metadata during rapid status flips. */
export const META_SAVE_DEBOUNCE_MS = 750

/** How many recent folders / repositories the new-session dialog remembers. */
export const MAX_RECENTS = 6

import { getSessionMessages, listSessions, type SDKMessage } from '@anthropic-ai/claude-agent-sdk'
import type { ClaudeHistoryItem, UiEvent } from '@shared/types'
import { Normalizer } from './normalize'

const MAX_IMPORTED_EVENTS = 2000

/**
 * Bridges to the shared ~/.claude session store that the terminal Claude Code
 * CLI also writes to — Pilot can list and adopt those conversations.
 */
export async function listClaudeSessions(): Promise<ClaudeHistoryItem[]> {
  const sessions = await listSessions({ limit: 200 })
  return sessions
    .filter((s) => s.cwd)
    .map((s) => ({
      sdkSessionId: s.sessionId,
      title: s.customTitle ?? s.summary ?? s.firstPrompt ?? 'Untitled session',
      cwd: s.cwd as string,
      lastModified: s.lastModified,
      gitBranch: s.gitBranch
    }))
}

interface SessionMessageLike {
  type: 'user' | 'assistant' | 'system'
  message: unknown
  parent_tool_use_id: string | null
}

/** Converts a stored CLI transcript into Pilot's normalized UiEvent log. */
export async function importClaudeTranscript(sdkSessionId: string): Promise<UiEvent[]> {
  const messages = (await getSessionMessages(sdkSessionId)) as SessionMessageLike[]
  const normalizer = new Normalizer()
  const events: UiEvent[] = []
  let userCounter = 0

  for (const message of messages) {
    if (message.type === 'user' && !message.parent_tool_use_id) {
      const content = (message.message as { content?: unknown })?.content
      const text =
        typeof content === 'string'
          ? content
          : Array.isArray(content)
            ? content
                .filter(
                  (b): b is { type: 'text'; text: string } =>
                    typeof b === 'object' && b !== null && (b as { type?: string }).type === 'text'
                )
                .map((b) => b.text)
                .join('\n')
            : ''
      if (text.trim() !== '' && !text.startsWith('<')) {
        events.push({ t: 'user-text', id: `hist_${++userCounter}`, text })
      }
    }
    events.push(...normalizer.reduce(message as unknown as SDKMessage))
  }

  return events.length > MAX_IMPORTED_EVENTS ? events.slice(-MAX_IMPORTED_EVENTS) : events
}

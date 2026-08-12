import type { TodoItem, TurnUsage, UiEvent } from '@shared/types'

export type TranscriptBlock =
  | { kind: 'user'; id: string; text: string; images?: string[] }
  | { kind: 'text'; id: string; text: string; done: boolean }
  | { kind: 'thinking'; id: string; text: string; done: boolean }
  | {
      kind: 'tool'
      id: string
      toolName: string
      input: unknown
      output?: string
      isError?: boolean
      permission?: 'allowed' | 'denied'
      children: TranscriptBlock[]
    }
  | { kind: 'todo'; id: string; items: TodoItem[] }
  | { kind: 'init'; id: string; model: string; tools: string[]; mcpServers: { name: string; status: string }[]; newNames: string[]; slashCommands: string[] }
  | { kind: 'turn'; id: string; costUsd: number; usage: TurnUsage; isError: boolean; errorMessage?: string }
  | { kind: 'error'; id: string; message: string }

let blockCounter = 0
const nextBlockId = (): string => `blk_${++blockCounter}`

type ToolBlock = TranscriptBlock & { kind: 'tool' }

/**
 * Returns a new array with the tool block `id` (at any nesting depth)
 * replaced by `update(block)`, rebuilding every ancestor along the path so
 * object identity changes and memoized components re-render. Null if absent.
 */
function updateToolBlock(
  blocks: TranscriptBlock[],
  id: string,
  update: (block: ToolBlock) => ToolBlock
): TranscriptBlock[] | null {
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]
    if (block.kind !== 'tool') {
      continue
    }
    if (block.id === id) {
      const next = [...blocks]
      next[i] = update(block)
      return next
    }
    const children = updateToolBlock(block.children, id, update)
    if (children) {
      const next = [...blocks]
      next[i] = { ...block, children }
      return next
    }
  }
  return null
}

/** Immutably appends a child to the tool block `parentId`; null if the parent is absent. */
function appendToolChild(blocks: TranscriptBlock[], parentId: string, child: TranscriptBlock): TranscriptBlock[] | null {
  return updateToolBlock(blocks, parentId, (parent) => ({ ...parent, children: [...parent.children, child] }))
}

/**
 * Applies a batch of normalized UiEvents to a transcript, returning a new
 * top-level array. Every touched block (and its ancestors) is replaced with
 * a new object — components are memoized on block identity, so in-place
 * mutation would leave them stale.
 */
export function applyEvents(blocks: TranscriptBlock[], events: UiEvent[]): TranscriptBlock[] {
  let next = [...blocks]

  for (const event of events) {
    switch (event.t) {
      case 'user-text':
        next.push({ kind: 'user', id: event.id, text: event.text, images: event.images })
        break

      case 'text':
      case 'thinking': {
        const existing = next.find(
          (b): b is TranscriptBlock & { kind: 'text' | 'thinking' } =>
            (b.kind === 'text' || b.kind === 'thinking') && b.id === event.id
        )
        if (existing) {
          next[next.indexOf(existing)] = {
            ...existing,
            text: existing.text + event.delta,
            done: event.done ?? existing.done
          }
        } else {
          next.push({
            kind: event.t === 'text' ? 'text' : 'thinking',
            id: event.id,
            text: event.delta,
            done: event.done ?? false
          })
        }
        break
      }

      case 'tool-start': {
        const block: TranscriptBlock = {
          kind: 'tool',
          id: event.id,
          toolName: event.toolName,
          input: event.input,
          children: []
        }
        const withChild = event.parentToolUseId ? appendToolChild(next, event.parentToolUseId, block) : null
        if (withChild) {
          next = withChild
        } else {
          next.push(block)
        }
        break
      }

      case 'tool-result': {
        next =
          updateToolBlock(next, event.id, (block) => ({ ...block, output: event.output, isError: event.isError })) ??
          next
        break
      }

      case 'permission-decision': {
        next = updateToolBlock(next, event.id, (block) => ({ ...block, permission: event.decision })) ?? next
        break
      }

      case 'todo': {
        const lastTodo = [...next].reverse().find((b) => b.kind === 'todo')
        if (lastTodo && lastTodo.kind === 'todo') {
          next[next.indexOf(lastTodo)] = { ...lastTodo, items: event.items }
        } else {
          next.push({ kind: 'todo', id: nextBlockId(), items: event.items })
        }
        break
      }

      case 'turn-complete':
        next.push({
          kind: 'turn',
          id: nextBlockId(),
          costUsd: event.costUsd,
          usage: event.usage,
          isError: event.isError,
          errorMessage: event.errorMessage
        })
        break

      case 'session-error':
        next.push({ kind: 'error', id: nextBlockId(), message: event.message })
        break

      case 'system-init': {
        const known = loadKnownNames()
        const names = [...event.tools, ...event.mcpServers.map((s) => `mcp:${s.name}`)]
        const newNames = names.filter((name) => !known.has(name))
        const existingIndex = next.findIndex((b) => b.kind === 'init')
        const initBlock: TranscriptBlock = {
          kind: 'init',
          id: existingIndex >= 0 ? next[existingIndex].id : nextBlockId(),
          model: event.model,
          tools: event.tools,
          mcpServers: event.mcpServers,
          newNames,
          slashCommands: event.slashCommands ?? []
        }
        // Resumed sessions carry a stale init from an old build — always adopt
        // the fresh engine handshake instead of keeping the first one seen.
        if (existingIndex >= 0) {
          next[existingIndex] = initBlock
        } else {
          next.push(initBlock)
        }
        if (newNames.length > 0) {
          newNames.forEach((name) => known.add(name))
          saveKnownNames(known)
        }
        if ((event.slashCommands?.length ?? 0) > 0) {
          saveCachedSlashCommands(event.slashCommands as string[])
        }
        break
      }
    }
  }

  return next
}

const SLASH_COMMANDS_KEY = 'pilot.slashCommands'

/** Claude Code's standard commands — shown until a session reports the real
 *  list (which also includes any custom commands on this machine). */
const DEFAULT_SLASH_COMMANDS = ['review', 'security-review', 'init', 'compact']

/** Last slash-command list any session reported — lets the / menu suggest
 *  commands even in sessions whose engine hasn't started yet. */
export function loadCachedSlashCommands(): string[] {
  try {
    const raw = localStorage.getItem(SLASH_COMMANDS_KEY)
    const cached = raw ? (JSON.parse(raw) as string[]) : []
    return cached.length > 0 ? cached : DEFAULT_SLASH_COMMANDS
  } catch {
    return DEFAULT_SLASH_COMMANDS
  }
}

function saveCachedSlashCommands(commands: string[]): void {
  try {
    localStorage.setItem(SLASH_COMMANDS_KEY, JSON.stringify(commands))
  } catch {
    // Non-fatal.
  }
}

const KNOWN_NAMES_KEY = 'pilot.knownToolNames'

function loadKnownNames(): Set<string> {
  try {
    const raw = localStorage.getItem(KNOWN_NAMES_KEY)
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    return new Set()
  }
}

function saveKnownNames(names: Set<string>): void {
  try {
    localStorage.setItem(KNOWN_NAMES_KEY, JSON.stringify([...names]))
  } catch {
    // Non-fatal.
  }
}

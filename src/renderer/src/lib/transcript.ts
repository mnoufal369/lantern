import type { TodoItem, TurnUsage, UiEvent } from '@shared/types'

export type TranscriptBlock =
  | { kind: 'user'; id: string; text: string }
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
  | { kind: 'init'; id: string; model: string; tools: string[]; mcpServers: { name: string; status: string }[]; newNames: string[] }
  | { kind: 'turn'; id: string; costUsd: number; usage: TurnUsage; isError: boolean; errorMessage?: string }
  | { kind: 'error'; id: string; message: string }

let blockCounter = 0
const nextBlockId = (): string => `blk_${++blockCounter}`

function findToolBlock(blocks: TranscriptBlock[], id: string): { block: TranscriptBlock & { kind: 'tool' } } | null {
  for (const block of blocks) {
    if (block.kind !== 'tool') {
      continue
    }
    if (block.id === id) {
      return { block }
    }
    const nested = findToolBlock(block.children, id)
    if (nested) {
      return nested
    }
  }
  return null
}

/**
 * Applies a batch of normalized UiEvents to a transcript, returning a new
 * top-level array. Blocks are mutated in place where streaming appends occur;
 * the array identity change is what triggers a re-render of the tail.
 */
export function applyEvents(blocks: TranscriptBlock[], events: UiEvent[]): TranscriptBlock[] {
  const next = [...blocks]

  for (const event of events) {
    switch (event.t) {
      case 'user-text':
        next.push({ kind: 'user', id: event.id, text: event.text })
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
        const parent = event.parentToolUseId ? findToolBlock(next, event.parentToolUseId) : null
        if (parent) {
          parent.block.children = [...parent.block.children, block]
        } else {
          next.push(block)
        }
        break
      }

      case 'tool-result': {
        const found = findToolBlock(next, event.id)
        if (found) {
          found.block.output = event.output
          found.block.isError = event.isError
        }
        break
      }

      case 'permission-decision': {
        const found = findToolBlock(next, event.id)
        if (found) {
          found.block.permission = event.decision
        }
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
        if (!next.some((b) => b.kind === 'init')) {
          next.push({
            kind: 'init',
            id: nextBlockId(),
            model: event.model,
            tools: event.tools,
            mcpServers: event.mcpServers,
            newNames
          })
        }
        if (newNames.length > 0) {
          newNames.forEach((name) => known.add(name))
          saveKnownNames(known)
        }
        break
      }
    }
  }

  return next
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

import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk'
import type { TodoItem, UiEvent } from '@shared/types'

interface ContentBlockLike {
  type: string
  id?: string
  name?: string
  input?: unknown
  text?: string
  thinking?: string
  tool_use_id?: string
  content?: unknown
  is_error?: boolean
}

function blocksOf(message: unknown): ContentBlockLike[] {
  const content = (message as { content?: unknown })?.content
  return Array.isArray(content) ? (content as ContentBlockLike[]) : []
}

function toolResultText(content: unknown): string {
  if (typeof content === 'string') {
    return content
  }
  if (Array.isArray(content)) {
    return content
      .map((block) => (typeof block === 'object' && block !== null && 'text' in block ? String((block as { text: unknown }).text) : ''))
      .join('\n')
  }
  return ''
}

/**
 * Stateful converter from raw SDKMessages to normalized UiEvents.
 * Tracks how much text was already streamed per content block so the final
 * assistant message only emits the unstreamed remainder (deduplication).
 */
export class Normalizer {
  private streamedLength = new Map<string, number>()
  private currentStreamMessageId = ''
  private toolNamesSeen = new Map<string, string>()

  reduce(message: SDKMessage): UiEvent[] {
    switch (message.type) {
      case 'system':
        if ('subtype' in message && message.subtype === 'init') {
          const init = message as unknown as {
            session_id: string
            model: string
            tools: string[]
            mcp_servers?: { name: string; status: string }[]
            slash_commands?: string[]
          }
          return [
            {
              t: 'system-init',
              sdkSessionId: init.session_id,
              model: init.model,
              tools: init.tools ?? [],
              mcpServers: init.mcp_servers ?? [],
              slashCommands: init.slash_commands ?? []
            }
          ]
        }
        return []

      case 'stream_event':
        return this.reduceStreamEvent(message as unknown as StreamEventLike)

      case 'assistant':
        return this.reduceAssistant(message)

      case 'user':
        return this.reduceUser(message)

      case 'result': {
        const result = message as unknown as {
          subtype: string
          is_error: boolean
          total_cost_usd: number
          usage: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number }
          modelUsage?: Record<
            string,
            {
              inputTokens?: number
              outputTokens?: number
              cacheReadInputTokens?: number
              cacheCreationInputTokens?: number
              contextWindow?: number
            }
          >
          errors?: string[]
        }
        // The per-turn `usage` only covers the main loop and can be zeroed;
        // modelUsage is the SDK's preferred (cumulative) accounting source.
        const models = Object.values(result.modelUsage ?? {})
        const cumulative =
          models.length > 0
            ? {
                inputTokens: models.reduce(
                  (sum, m) => sum + (m.inputTokens ?? 0) + (m.cacheCreationInputTokens ?? 0),
                  0
                ),
                outputTokens: models.reduce((sum, m) => sum + (m.outputTokens ?? 0), 0),
                cacheReadTokens: models.reduce((sum, m) => sum + (m.cacheReadInputTokens ?? 0), 0)
              }
            : undefined
        const contextWindow = models.reduce((max, m) => Math.max(max, m.contextWindow ?? 0), 0)
        return [
          {
            t: 'turn-complete',
            costUsd: result.total_cost_usd ?? 0,
            usage: {
              inputTokens: result.usage?.input_tokens ?? 0,
              outputTokens: result.usage?.output_tokens ?? 0,
              cacheReadTokens: result.usage?.cache_read_input_tokens ?? 0
            },
            ...(cumulative ? { cumulativeUsage: cumulative } : {}),
            ...(contextWindow > 0 ? { contextWindow } : {}),
            isError: result.subtype !== 'success',
            errorMessage: result.subtype !== 'success' ? (result.errors?.[0] ?? result.subtype) : undefined
          }
        ]
      }

      default:
        return []
    }
  }

  private blockKey(messageId: string, index: number): string {
    return `${messageId}:${index}`
  }

  private reduceStreamEvent(message: StreamEventLike): UiEvent[] {
    const event = message.event
    if (event.type === 'message_start') {
      this.currentStreamMessageId = event.message?.id ?? ''
      return []
    }
    if (message.parent_tool_use_id) {
      return []
    }
    if (event.type === 'content_block_delta' && event.delta && typeof event.index === 'number') {
      const key = this.blockKey(this.currentStreamMessageId, event.index)
      if (event.delta.type === 'text_delta' && event.delta.text) {
        this.streamedLength.set(key, (this.streamedLength.get(key) ?? 0) + event.delta.text.length)
        return [{ t: 'text', id: key, delta: event.delta.text }]
      }
      if (event.delta.type === 'thinking_delta' && event.delta.thinking) {
        this.streamedLength.set(key, (this.streamedLength.get(key) ?? 0) + event.delta.thinking.length)
        return [{ t: 'thinking', id: key, delta: event.delta.thinking }]
      }
    }
    return []
  }

  private reduceAssistant(message: SDKMessage & { type: 'assistant' }): UiEvent[] {
    const events: UiEvent[] = []
    const parentToolUseId = message.parent_tool_use_id ?? undefined
    const messageId = (message.message as { id?: string }).id ?? ''

    blocksOf(message.message).forEach((block, index) => {
      if (block.type === 'text' && typeof block.text === 'string') {
        if (parentToolUseId) {
          return
        }
        const key = this.blockKey(messageId, index)
        const streamed = this.streamedLength.get(key) ?? 0
        events.push({ t: 'text', id: key, delta: block.text.slice(streamed), done: true })
        this.streamedLength.delete(key)
      } else if (block.type === 'thinking' && typeof block.thinking === 'string') {
        if (parentToolUseId) {
          return
        }
        const key = this.blockKey(messageId, index)
        const streamed = this.streamedLength.get(key) ?? 0
        events.push({ t: 'thinking', id: key, delta: block.thinking.slice(streamed), done: true })
        this.streamedLength.delete(key)
      } else if (block.type === 'tool_use' && block.id && block.name) {
        this.toolNamesSeen.set(block.id, block.name)
        if (block.name === 'TodoWrite') {
          const todos = (block.input as { todos?: { content?: string; status?: TodoItem['status'] }[] })?.todos
          if (Array.isArray(todos)) {
            events.push({
              t: 'todo',
              items: todos.map((todo) => ({
                text: todo.content ?? '',
                status: todo.status ?? 'pending'
              }))
            })
          }
          return
        }
        events.push({
          t: 'tool-start',
          id: block.id,
          toolName: block.name,
          input: block.input,
          parentToolUseId
        })
      }
    })

    return events
  }

  private reduceUser(message: SDKMessage & { type: 'user' }): UiEvent[] {
    const events: UiEvent[] = []
    for (const block of blocksOf(message.message)) {
      if (block.type === 'tool_result' && block.tool_use_id) {
        if (this.toolNamesSeen.get(block.tool_use_id) === 'TodoWrite') {
          continue
        }
        events.push({
          t: 'tool-result',
          id: block.tool_use_id,
          output: toolResultText(block.content),
          isError: block.is_error === true
        })
      }
    }
    return events
  }
}

interface StreamEventLike {
  type: 'stream_event'
  parent_tool_use_id: string | null
  event: {
    type: string
    index?: number
    message?: { id?: string }
    delta?: { type: string; text?: string; thinking?: string }
  }
}

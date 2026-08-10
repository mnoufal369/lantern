import { describe, expect, it } from 'vitest'
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk'
import { Normalizer } from './normalize'

const msg = (value: unknown): SDKMessage => value as SDKMessage

describe('Normalizer', () => {
  it('converts system init into a system-init event', () => {
    const events = new Normalizer().reduce(
      msg({
        type: 'system',
        subtype: 'init',
        session_id: 'sdk-1',
        model: 'claude-sonnet-5',
        tools: ['Bash', 'Read'],
        mcp_servers: [{ name: 'figma', status: 'connected' }]
      })
    )
    expect(events).toEqual([
      {
        t: 'system-init',
        sdkSessionId: 'sdk-1',
        model: 'claude-sonnet-5',
        tools: ['Bash', 'Read'],
        mcpServers: [{ name: 'figma', status: 'connected' }]
      }
    ])
  })

  it('deduplicates streamed text against the final assistant message', () => {
    const normalizer = new Normalizer()
    normalizer.reduce(msg({ type: 'stream_event', parent_tool_use_id: null, event: { type: 'message_start', message: { id: 'm1' } } }))
    const delta = normalizer.reduce(
      msg({
        type: 'stream_event',
        parent_tool_use_id: null,
        event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hello ' } }
      })
    )
    expect(delta).toEqual([{ t: 'text', id: 'm1:0', delta: 'Hello ' }])

    const final = normalizer.reduce(
      msg({
        type: 'assistant',
        parent_tool_use_id: null,
        message: { id: 'm1', content: [{ type: 'text', text: 'Hello world' }] }
      })
    )
    expect(final).toEqual([{ t: 'text', id: 'm1:0', delta: 'world', done: true }])
  })

  it('suppresses subagent stream deltas but keeps nested tool starts with parent ids', () => {
    const normalizer = new Normalizer()
    const suppressed = normalizer.reduce(
      msg({
        type: 'stream_event',
        parent_tool_use_id: 'task-1',
        event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'inner' } }
      })
    )
    expect(suppressed).toEqual([])

    const nested = normalizer.reduce(
      msg({
        type: 'assistant',
        parent_tool_use_id: 'task-1',
        message: { id: 'm2', content: [{ type: 'tool_use', id: 'tu-9', name: 'Read', input: { file_path: '/x' } }] }
      })
    )
    expect(nested).toEqual([
      { t: 'tool-start', id: 'tu-9', toolName: 'Read', input: { file_path: '/x' }, parentToolUseId: 'task-1' }
    ])
  })

  it('turns TodoWrite into todo events and hides its tool result', () => {
    const normalizer = new Normalizer()
    const events = normalizer.reduce(
      msg({
        type: 'assistant',
        parent_tool_use_id: null,
        message: {
          id: 'm3',
          content: [
            { type: 'tool_use', id: 'todo-1', name: 'TodoWrite', input: { todos: [{ content: 'a', status: 'pending' }] } }
          ]
        }
      })
    )
    expect(events).toEqual([{ t: 'todo', items: [{ text: 'a', status: 'pending' }] }])

    const result = normalizer.reduce(
      msg({
        type: 'user',
        parent_tool_use_id: null,
        message: { content: [{ type: 'tool_result', tool_use_id: 'todo-1', content: 'ok' }] }
      })
    )
    expect(result).toEqual([])
  })

  it('reduces results into turn-complete with usage and error info', () => {
    const events = new Normalizer().reduce(
      msg({
        type: 'result',
        subtype: 'success',
        is_error: false,
        total_cost_usd: 0.42,
        usage: { input_tokens: 10, output_tokens: 20, cache_read_input_tokens: 5 }
      })
    )
    expect(events).toEqual([
      {
        t: 'turn-complete',
        costUsd: 0.42,
        usage: { inputTokens: 10, outputTokens: 20, cacheReadTokens: 5 },
        isError: false,
        errorMessage: undefined
      }
    ])

    const failed = new Normalizer().reduce(
      msg({ type: 'result', subtype: 'error_max_budget', is_error: true, total_cost_usd: 1, usage: {} })
    )
    expect(failed[0]).toMatchObject({ t: 'turn-complete', isError: true, errorMessage: 'error_max_budget' })
  })
})

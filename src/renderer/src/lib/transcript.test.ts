import { describe, expect, it } from 'vitest'
import { applyEvents, type TranscriptBlock } from './transcript'

const toolStart = (id: string, parent?: string): Parameters<typeof applyEvents>[1][number] => ({
  t: 'tool-start',
  id,
  toolName: 'Bash',
  input: { command: 'ls' },
  parentToolUseId: parent
})

describe('applyEvents', () => {
  it('appends user and streaming text blocks', () => {
    let blocks: TranscriptBlock[] = []
    blocks = applyEvents(blocks, [{ t: 'user-text', id: 'u1', text: 'hi' }])
    blocks = applyEvents(blocks, [{ t: 'text', id: 'm1:0', delta: 'Hel' }])
    blocks = applyEvents(blocks, [{ t: 'text', id: 'm1:0', delta: 'lo', done: true }])
    expect(blocks).toHaveLength(2)
    expect(blocks[1]).toMatchObject({ kind: 'text', text: 'Hello', done: true })
  })

  it('replaces the tool block object when its result arrives (memo-safe identity)', () => {
    const withTool = applyEvents([], [toolStart('t1')])
    const before = withTool[0]
    const after = applyEvents(withTool, [{ t: 'tool-result', id: 't1', output: 'done', isError: false }])
    expect(after[0]).not.toBe(before)
    expect(after[0]).toMatchObject({ kind: 'tool', output: 'done', isError: false })
    // The input array must not be mutated.
    expect((before as { output?: string }).output).toBeUndefined()
  })

  it('rebuilds ancestor identity for nested subagent tool results', () => {
    let blocks = applyEvents([], [toolStart('parent')])
    blocks = applyEvents(blocks, [toolStart('child', 'parent')])
    const parentBefore = blocks[0] as TranscriptBlock & { kind: 'tool' }
    expect(parentBefore.children).toHaveLength(1)

    const next = applyEvents(blocks, [{ t: 'tool-result', id: 'child', output: 'ok', isError: false }])
    const parentAfter = next[0] as TranscriptBlock & { kind: 'tool' }
    expect(parentAfter).not.toBe(parentBefore)
    expect(parentAfter.children[0]).toMatchObject({ output: 'ok' })
    expect((parentBefore.children[0] as { output?: string }).output).toBeUndefined()
  })

  it('replaces the block object on permission decisions', () => {
    const withTool = applyEvents([], [toolStart('t1')])
    const before = withTool[0]
    const after = applyEvents(withTool, [{ t: 'permission-decision', id: 't1', decision: 'denied' }])
    expect(after[0]).not.toBe(before)
    expect(after[0]).toMatchObject({ permission: 'denied' })
  })

  it('updates the latest todo block in place of appending', () => {
    let blocks = applyEvents([], [{ t: 'todo', items: [{ text: 'a', status: 'pending' }] }])
    blocks = applyEvents(blocks, [{ t: 'todo', items: [{ text: 'a', status: 'completed' }] }])
    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toMatchObject({ kind: 'todo', items: [{ status: 'completed' }] })
  })

  it('drops tool results for unknown ids without crashing', () => {
    const blocks = applyEvents([], [{ t: 'tool-result', id: 'ghost', output: 'x', isError: false }])
    expect(blocks).toHaveLength(0)
  })
})

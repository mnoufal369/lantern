import { describe, expect, it } from 'vitest'
import { extractSessionId } from './sessionId'

const ID = '2b1e34a5-9c7d-4f81-a0b3-6d5e8f1c2a94'

describe('extractSessionId', () => {
  it('accepts a bare id', () => {
    expect(extractSessionId(ID)).toBe(ID)
  })

  it('trims surrounding whitespace and quotes', () => {
    expect(extractSessionId(`  "${ID}"\n`)).toBe(ID)
  })

  it('lowercases so ids compare equal however they were pasted', () => {
    expect(extractSessionId(ID.toUpperCase())).toBe(ID)
  })

  it('finds the id in a transcript file path', () => {
    expect(extractSessionId(`~/.claude/projects/-Users-me-code-api/${ID}.jsonl`)).toBe(ID)
  })

  it('finds the id in a pasted resume command', () => {
    expect(extractSessionId(`claude --resume ${ID}`)).toBe(ID)
  })

  it('rejects text with no id', () => {
    expect(extractSessionId('')).toBeNull()
    expect(extractSessionId('fix the login bug')).toBeNull()
  })

  it('rejects malformed ids', () => {
    expect(extractSessionId('2b1e34a5-9c7d-4f81-a0b3-6d5e8f1c2a9')).toBeNull()
    expect(extractSessionId('2b1e34a5-9c7d-4f81-a0b3-6d5e8f1c2z94')).toBeNull()
  })
})

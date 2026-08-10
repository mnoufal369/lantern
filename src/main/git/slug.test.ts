import { describe, expect, it } from 'vitest'
import { isLikelyRepoUrl, parsePrNumber, workspaceSlug } from './slug'

describe('workspaceSlug', () => {
  it('builds a readable slug from https and ssh urls', () => {
    expect(workspaceSlug('https://github.com/acme/shop-api.git')).toMatch(/^acme-shop-api-[a-z0-9]{1,6}$/)
    expect(workspaceSlug('git@github.com:acme/shop-api.git')).toMatch(/^acme-shop-api-[a-z0-9]{1,6}$/)
  })

  it('never collides for distinct urls with identical name parts', () => {
    expect(workspaceSlug('https://github.com/a/b-c')).not.toBe(workspaceSlug('https://github.com/a-b/c'))
  })

  it('is stable for the same url', () => {
    expect(workspaceSlug('https://github.com/a/b')).toBe(workspaceSlug('https://github.com/a/b'))
  })
})

describe('parsePrNumber', () => {
  it('parses explicit PR references', () => {
    expect(parsePrNumber('#123')).toBe(123)
    expect(parsePrNumber('pr/45')).toBe(45)
    expect(parsePrNumber('PR-7')).toBe(7)
  })

  it('leaves branch names (including bare numbers) alone', () => {
    expect(parsePrNumber('release/2.4')).toBeNull()
    expect(parsePrNumber('123')).toBeNull()
    expect(parsePrNumber('feature/pr-handling')).toBeNull()
  })
})

describe('isLikelyRepoUrl', () => {
  it('accepts https and ssh remotes and rejects paths', () => {
    expect(isLikelyRepoUrl('https://github.com/a/b')).toBe(true)
    expect(isLikelyRepoUrl('git@github.com:a/b.git')).toBe(true)
    expect(isLikelyRepoUrl('/Users/me/project')).toBe(false)
    expect(isLikelyRepoUrl('not a url')).toBe(false)
  })
})

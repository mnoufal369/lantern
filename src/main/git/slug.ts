/** Pure helpers for workspace naming and branch/PR parsing (no Electron imports — unit tested). */

/** Stable short hash so distinct URLs never share a workspace directory. */
export function shortHash(value: string): string {
  let hash = 5381
  for (let i = 0; i < value.length; i++) {
    hash = ((hash << 5) + hash + value.charCodeAt(i)) >>> 0
  }
  return hash.toString(36).slice(0, 6)
}

/** "https://github.com/acme/shop-api.git" -> "acme-shop-api-x1y2z3" */
export function workspaceSlug(repoUrl: string): string {
  const cleaned = repoUrl
    .replace(/\.git$/, '')
    .replace(/^git@([^:]+):/, '$1/')
    .replace(/^[a-z+]+:\/\//i, '')
  const parts = cleaned.split('/').filter(Boolean)
  const slug = parts.slice(-2).join('-').replace(/[^a-zA-Z0-9._-]/g, '-')
  return `${slug || 'repo'}-${shortHash(repoUrl.trim())}`
}

export function isLikelyRepoUrl(value: string): boolean {
  return /^(https?:\/\/|git@)[^\s]+$/.test(value.trim())
}

/**
 * "#123", "pr/123" or "pr-123" -> 123. Used so QA can paste a PR number
 * where a branch is expected. A bare number could be a real branch name,
 * so it needs the explicit prefix; plain branch names return null.
 */
export function parsePrNumber(value: string): number | null {
  const match = /^(?:#|pr[/-])(\d+)$/i.exec(value.trim())
  return match ? Number(match[1]) : null
}

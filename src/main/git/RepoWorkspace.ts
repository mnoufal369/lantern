import { app } from 'electron'
import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { simpleGit } from 'simple-git'

const GIT_BINARY = existsSync('/usr/bin/git') ? '/usr/bin/git' : 'git'

/** "https://github.com/acme/shop-api.git" -> "acme-shop-api" */
function workspaceSlug(repoUrl: string): string {
  const cleaned = repoUrl
    .replace(/\.git$/, '')
    .replace(/^git@([^:]+):/, '$1/')
    .replace(/^[a-z+]+:\/\//i, '')
  const parts = cleaned.split('/').filter(Boolean)
  const slug = parts.slice(-2).join('-').replace(/[^a-zA-Z0-9._-]/g, '-')
  return slug || 'repo'
}

export function isLikelyRepoUrl(value: string): boolean {
  return /^(https?:\/\/|git@)[^\s]+$/.test(value.trim())
}

/**
 * Clones a remote repository (shallow) into AgentDeck's managed workspace
 * directory so non-technical users can ask questions about any repo without
 * touching git themselves. Reuses an existing clone and refreshes it.
 */
export async function prepareRepoWorkspace(repoUrl: string): Promise<string> {
  const url = repoUrl.trim()
  if (!isLikelyRepoUrl(url)) {
    throw new Error('That does not look like a repository URL (expected https://… or git@…)')
  }
  const workspacesDir = path.join(app.getPath('userData'), 'workspaces')
  await mkdir(workspacesDir, { recursive: true })
  const target = path.join(workspacesDir, workspaceSlug(url))

  if (existsSync(path.join(target, '.git'))) {
    try {
      const git = simpleGit({ baseDir: target, binary: GIT_BINARY })
      await git.fetch(['--depth', '1'])
      await git.pull()
    } catch {
      // Offline or diverged — the existing snapshot is still usable.
    }
    return target
  }

  try {
    await simpleGit({ binary: GIT_BINARY }).clone(url, target, ['--depth', '1'])
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (/authentication|denied|403|401/i.test(message)) {
      throw new Error(
        'Could not access this repository. If it is private, make sure your git credentials (or gh auth) are set up on this Mac.'
      )
    }
    throw new Error(`Could not fetch the repository: ${message.split('\n')[0]}`)
  }
  return target
}

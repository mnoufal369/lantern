import { app } from 'electron'
import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { simpleGit, type SimpleGit } from 'simple-git'
import { isLikelyRepoUrl, parsePrNumber, workspaceSlug } from './slug'

export { isLikelyRepoUrl } from './slug'

const GIT_BINARY = existsSync('/usr/bin/git') ? '/usr/bin/git' : 'git'

async function checkoutPr(git: SimpleGit, prNumber: number): Promise<void> {
  const local = `pr-${prNumber}`
  await git.fetch(['--depth', '1', 'origin', `pull/${prNumber}/head:${local}`])
  await git.checkout(local)
}

/**
 * Clones a remote repository (shallow) into Lantern's managed workspace
 * directory so non-technical users can ask questions about any repo without
 * touching git themselves. Reuses an existing clone and refreshes it.
 * The branch field also accepts a PR reference ("#123", "pr/123").
 */
export async function prepareRepoWorkspace(repoUrl: string, branch?: string): Promise<string> {
  const url = repoUrl.trim()
  if (!isLikelyRepoUrl(url)) {
    throw new Error('That does not look like a repository URL (expected https://… or git@…)')
  }
  const cleanBranch = branch?.trim() || undefined
  const prNumber = cleanBranch ? parsePrNumber(cleanBranch) : null
  if (cleanBranch && prNumber === null && !/^[\w./-]+$/.test(cleanBranch)) {
    throw new Error('That branch name contains unexpected characters')
  }
  const workspacesDir = path.join(app.getPath('userData'), 'workspaces')
  await mkdir(workspacesDir, { recursive: true })
  const suffix = cleanBranch ? `@${cleanBranch.replace(/[^\w.-]/g, '-')}` : ''
  const target = path.join(workspacesDir, workspaceSlug(url) + suffix)

  if (existsSync(path.join(target, '.git'))) {
    try {
      const git = simpleGit({ baseDir: target, binary: GIT_BINARY })
      if (prNumber !== null) {
        await checkoutPr(git, prNumber)
      } else if (cleanBranch) {
        await git.fetch(['--depth', '1', 'origin', cleanBranch])
        await git.checkout(cleanBranch)
        await git.pull()
      } else {
        await git.pull()
      }
    } catch {
      // Offline or diverged — the existing snapshot is still usable.
    }
    return target
  }

  try {
    const cloneArgs = ['--depth', '1', ...(cleanBranch && prNumber === null ? ['--branch', cleanBranch] : [])]
    await simpleGit({ binary: GIT_BINARY }).clone(url, target, cloneArgs)
    if (prNumber !== null) {
      await checkoutPr(simpleGit({ baseDir: target, binary: GIT_BINARY }), prNumber)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (/authentication|denied|403|401/i.test(message)) {
      throw new Error(
        'Could not access this repository. If it is private, make sure your git credentials (or gh auth) are set up on this Mac.'
      )
    }
    if (/Remote branch .* not found|couldn't find remote ref/i.test(message)) {
      throw new Error(
        prNumber !== null
          ? `Pull request #${prNumber} was not found in that repository.`
          : `Branch "${cleanBranch}" was not found in that repository.`
      )
    }
    throw new Error(`Could not fetch the repository: ${message.split('\n')[0]}`)
  }
  return target
}

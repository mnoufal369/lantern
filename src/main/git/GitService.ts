import { shell } from 'electron'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { simpleGit, type SimpleGit } from 'simple-git'
import type { GitFileChange, GitStatusSummary } from '@shared/types'

const GIT_BINARY = existsSync('/usr/bin/git') ? '/usr/bin/git' : 'git'

function classify(index: string, workingDir: string): GitFileChange['kind'] {
  if (index === '?' || workingDir === '?') {
    return 'untracked'
  }
  if (index === 'U' || workingDir === 'U') {
    return 'conflicted'
  }
  if (index === 'A' || workingDir === 'A') {
    return 'added'
  }
  if (index === 'D' || workingDir === 'D') {
    return 'deleted'
  }
  if (index === 'R' || workingDir === 'R') {
    return 'renamed'
  }
  return 'modified'
}

/** Read-mostly git integration scoped to a session's working directory. */
export class GitService {
  private clients = new Map<string, SimpleGit>()

  private client(cwd: string): SimpleGit {
    let client = this.clients.get(cwd)
    if (!client) {
      client = simpleGit({ baseDir: cwd, binary: GIT_BINARY, maxConcurrentProcesses: 2 })
      this.clients.set(cwd, client)
    }
    return client
  }

  async status(cwd: string): Promise<GitStatusSummary> {
    try {
      const git = this.client(cwd)
      if (!(await git.checkIsRepo())) {
        return { isRepo: false, files: [] }
      }
      const status = await git.status()
      const files: GitFileChange[] = status.files.map((file) => ({
        path: file.path,
        index: file.index,
        workingDir: file.working_dir,
        kind: classify(file.index.trim(), file.working_dir.trim())
      }))
      return {
        isRepo: true,
        branch: status.current ?? undefined,
        ahead: status.ahead,
        behind: status.behind,
        files
      }
    } catch {
      return { isRepo: false, files: [] }
    }
  }

  async diffFile(cwd: string, filePath: string): Promise<string> {
    const git = this.client(cwd)
    const status = await git.status()
    const entry = status.files.find((f) => f.path === filePath)
    if (entry && (entry.index === '?' || entry.working_dir === '?')) {
      return await git.raw(['diff', '--no-index', '--', '/dev/null', filePath]).catch((error: unknown) => {
        const output = (error as { message?: string })?.message ?? ''
        const start = output.indexOf('diff --git')
        return start >= 0 ? output.slice(start) : ''
      })
    }
    return await git.diff(['HEAD', '--', filePath]).catch(() => git.diff(['--', filePath]))
  }

  async remoteBranches(cwd: string): Promise<string[]> {
    try {
      const raw = await this.client(cwd).raw(['ls-remote', '--heads', 'origin'])
      return raw
        .split('\n')
        .map((line) => line.split('\t')[1]?.replace('refs/heads/', '').trim())
        .filter((name): name is string => Boolean(name))
        .sort()
    } catch {
      return []
    }
  }

  /** Local + remote branch names for a full (non-managed) repository. */
  async allBranches(cwd: string): Promise<string[]> {
    try {
      const git = this.client(cwd)
      const summary = await git.branch(['-a'])
      const names = new Set<string>()
      for (const name of summary.all) {
        names.add(name.replace(/^remotes\/origin\//, ''))
      }
      names.delete('HEAD')
      return [...names].sort()
    } catch {
      return []
    }
  }

  /** Shallow-fetch checkout for Pilot-managed workspaces. */
  async checkoutBranch(cwd: string, branch: string): Promise<void> {
    if (!/^[\w./-]+$/.test(branch)) {
      throw new Error('Invalid branch name')
    }
    const git = this.client(cwd)
    await git.fetch(['--depth', '1', 'origin', `${branch}:refs/remotes/origin/${branch}`])
    await git.checkout(['-B', branch, `origin/${branch}`])
  }

  /** Plain checkout for the user's own repositories — guarded against losing work. */
  async checkoutLocalBranch(cwd: string, branch: string): Promise<void> {
    if (!/^[\w./-]+$/.test(branch)) {
      throw new Error('Invalid branch name')
    }
    const git = this.client(cwd)
    const status = await git.status()
    const dirty = status.files.filter((f) => f.working_dir !== '?' && f.index !== '?')
    if (dirty.length > 0) {
      throw new Error(
        `You have ${dirty.length} uncommitted change${dirty.length > 1 ? 's' : ''} on ${status.current}. Commit or stash first, then switch.`
      )
    }
    await git.checkout(branch)
  }

  async revertFile(cwd: string, filePath: string): Promise<void> {
    const git = this.client(cwd)
    const status = await git.status()
    const entry = status.files.find((f) => f.path === filePath)
    if (entry && (entry.index === '?' || entry.working_dir === '?')) {
      await shell.trashItem(path.resolve(cwd, filePath))
      return
    }
    await git.checkout(['--', filePath])
  }
}

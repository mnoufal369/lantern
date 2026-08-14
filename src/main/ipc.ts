import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  installPrepared,
  latestReleaseVersion,
  prepareFromCheckout,
  prepareFromRelease,
  type PreparedUpdate
} from './updater'
import { allowQuitForUpdate } from './quitGuard'
import type { UpdateProgress } from '@shared/types'
import { prepareRepoWorkspace } from './git/RepoWorkspace'
import type { PastedImage, PermissionDecision } from '@shared/types'
import { FALLBACK_MODELS } from '@shared/constants'
import { isNewerVersion } from '@shared/version'
import type { SessionManager } from './sessions/SessionManager'
import { GitService } from './git/GitService'
import { ProfileStore, Settings } from './store/stores'
import type { AgentProfile, AppSettings } from '@shared/types'

export function registerIpc(manager: SessionManager): void {
  const gitService = new GitService()

  const cwdOf = (sessionId: string): string => {
    const meta = manager.getMeta(sessionId)
    if (!meta) {
      throw new Error('Session not found')
    }
    return meta.cwd
  }

  ipcMain.handle('sessions:create', (_e, req: { profileId: string; cwd: string }) => {
    const meta = manager.create(req.profileId, req.cwd)
    Settings.recordRecentFolder(req.cwd)
    return meta
  })

  ipcMain.handle('sessions:fork', (_e, req: { sessionId: string }) => manager.fork(req.sessionId))
  ipcMain.handle(
    'sessions:createFromRepo',
    async (_e, req: { profileId: string; repoUrl: string; branch?: string }) => {
      const workspace = await prepareRepoWorkspace(req.repoUrl, req.branch)
      const meta = manager.create(req.profileId, workspace)
      Settings.recordRecentRepo(req.repoUrl.trim(), req.branch?.trim() || undefined)
      return meta
    }
  )
  ipcMain.handle('sessions:exportTranscript', async (_e, req: { sessionId: string; markdown: string }) => {
    const meta = manager.getMeta(req.sessionId)
    const window = BrowserWindow.getFocusedWindow()
    if (!window) {
      return null
    }
    const result = await dialog.showSaveDialog(window, {
      defaultPath: `${(meta?.title ?? 'session').replace(/[^\w\s-]/g, '').slice(0, 40) || 'session'}.md`,
      filters: [{ name: 'Markdown', extensions: ['md'] }]
    })
    if (result.canceled || !result.filePath) {
      return null
    }
    await writeFile(result.filePath, req.markdown, 'utf8')
    return result.filePath
  })
  ipcMain.handle('sessions:send', (_e, req: { sessionId: string; text: string; images?: PastedImage[] }) =>
    manager.sendMessage(req.sessionId, req.text, req.images)
  )
  ipcMain.handle('sessions:interrupt', (_e, req: { sessionId: string }) => manager.interrupt(req.sessionId))
  ipcMain.handle('sessions:archive', (_e, req: { sessionId: string }) => manager.archive(req.sessionId))
  ipcMain.handle('sessions:delete', (_e, req: { sessionId: string }) => manager.deleteSession(req.sessionId))
  ipcMain.handle('sessions:reopen', (_e, req: { sessionId: string }) => manager.reopen(req.sessionId))
  ipcMain.handle('sessions:list', () => manager.list())
  ipcMain.handle('sessions:history', (_e, req: { sessionId: string }) => manager.history(req.sessionId))
  ipcMain.handle('sessions:setModel', (_e, req: { sessionId: string; model: string }) =>
    manager.setModel(req.sessionId, req.model)
  )
  ipcMain.handle('sessions:setPermissionMode', (_e, req: { sessionId: string; mode: string }) =>
    manager.setPermissionMode(req.sessionId, req.mode)
  )
  ipcMain.handle('sessions:rename', (_e, req: { sessionId: string; title: string }) =>
    manager.rename(req.sessionId, req.title)
  )

  ipcMain.handle('sessions:setColor', (_e, req: { sessionId: string; color: string | null }) =>
    manager.setColor(req.sessionId, req.color)
  )

  ipcMain.handle('permissions:respond', (_e, req: { requestId: string; decision: PermissionDecision }) =>
    manager.broker.respond(req.requestId, req.decision)
  )

  ipcMain.handle('history:list', () => manager.listTerminalHistory())
  ipcMain.handle('history:find', (_e, req: { sdkSessionId: string }) => manager.findTerminalSession(req.sdkSessionId))
  ipcMain.handle('history:import', (_e, req: { sdkSessionId: string }) => manager.importTerminal(req.sdkSessionId))

  ipcMain.handle('profiles:list', () => ProfileStore.list())
  ipcMain.handle('profiles:save', (_e, req: { profile: AgentProfile }) => ProfileStore.save(req.profile))
  ipcMain.handle('profiles:delete', (_e, req: { profileId: string }) => ProfileStore.delete(req.profileId))

  ipcMain.handle('models:list', () => FALLBACK_MODELS)

  const workspacesRoot = path.join(app.getPath('userData'), 'workspaces')
  const isManaged = (cwd: string): boolean => cwd.startsWith(workspacesRoot + path.sep)

  // Org repo list for New Session autocomplete — via `gh` (colleagues already
  // authenticate it for private repos). Cached; fails quiet to an empty list.
  let orgRepoCache: { org: string; at: number; repos: string[] } | null = null
  ipcMain.handle('git:orgRepos', () => {
    const org = Settings.get().githubOrg
    if (!org) {
      return []
    }
    if (orgRepoCache && orgRepoCache.org === org && Date.now() - orgRepoCache.at < 5 * 60 * 1000) {
      return orgRepoCache.repos
    }
    return new Promise<string[]>((resolvePromise) => {
      execFile(
        process.platform === 'win32' ? 'gh.exe' : 'gh',
        ['repo', 'list', org, '--limit', '100', '--json', 'nameWithOwner'],
        { timeout: 10_000 },
        (error, stdout) => {
          if (error) {
            resolvePromise(orgRepoCache?.org === org ? orgRepoCache.repos : [])
            return
          }
          try {
            const repos = (JSON.parse(stdout) as { nameWithOwner: string }[]).map((r) => r.nameWithOwner)
            orgRepoCache = { org, at: Date.now(), repos }
            resolvePromise(repos)
          } catch {
            resolvePromise([])
          }
        }
      )
    })
  })

  ipcMain.handle('git:status', async (_e, req: { sessionId: string }) => {
    const cwd = cwdOf(req.sessionId)
    const status = await gitService.status(cwd)
    return { ...status, managed: isManaged(cwd) }
  })
  ipcMain.handle('git:remoteBranches', (_e, req: { sessionId: string }) => {
    const cwd = cwdOf(req.sessionId)
    return isManaged(cwd) ? gitService.remoteBranches(cwd) : gitService.allBranches(cwd)
  })
  ipcMain.handle('git:checkoutBranch', async (_e, req: { sessionId: string; branch: string }) => {
    const cwd = cwdOf(req.sessionId)
    if (isManaged(cwd)) {
      await gitService.checkoutBranch(cwd, req.branch)
    } else {
      await gitService.checkoutLocalBranch(cwd, req.branch)
    }
    const status = await gitService.status(cwd)
    return { ...status, managed: isManaged(cwd) }
  })
  ipcMain.handle('git:diffFile', (_e, req: { sessionId: string; path: string }) =>
    gitService.diffFile(cwdOf(req.sessionId), req.path)
  )
  ipcMain.handle('git:revertFile', (_e, req: { sessionId: string; path: string }) =>
    gitService.revertFile(cwdOf(req.sessionId), req.path)
  )

  ipcMain.handle('dialog:pickFolder', async () => {
    const window = BrowserWindow.getFocusedWindow()
    const result = await dialog.showOpenDialog(window ?? new BrowserWindow({ show: false }), {
      properties: ['openDirectory', 'createDirectory']
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('shell:revealInFinder', (_e, req: { path: string }) => shell.showItemInFolder(req.path))

  ipcMain.handle('app:getSettings', () => Settings.get())
  ipcMain.handle('app:setSettings', (_e, req: { settings: Partial<AppSettings> }) => Settings.set(req.settings))
  ipcMain.handle('app:getAuthStatus', () => Settings.authStatus())
  ipcMain.handle('app:getVersion', () => app.getVersion())

  // Checkout installs (yarn setup:mac) update by rebuilding locally; zip
  // installs update by downloading the latest prebuilt release zip.
  const hasCheckout = (): boolean =>
    __BUILD_SOURCE_DIR__ !== '' &&
    existsSync(path.join(__BUILD_SOURCE_DIR__, '.git')) &&
    existsSync(path.join(__BUILD_SOURCE_DIR__, 'scripts', 'install-mac.sh'))
  const canSelfUpdate = (): boolean => process.platform === 'darwin' && (hasCheckout() || app.isPackaged)

  // A new version exists when the latest published release tag differs from
  // this build's version — releases are the channel, so commits to main
  // between releases never trigger false banners. Fails quiet when offline.
  ipcMain.handle('app:checkForUpdate', async () => {
    const latest = await latestReleaseVersion()
    return {
      updateAvailable: latest !== null && isNewerVersion(latest.version, app.getVersion()),
      canSelfUpdate: canSelfUpdate(),
      latestVersion: latest?.version
    }
  })

  ipcMain.handle('app:busyCount', () => manager.busyCount())

  const emitProgress = (progress: UpdateProgress): void => {
    BrowserWindow.getAllWindows()[0]?.webContents.send('update:progress', progress)
  }

  // Downloaded/built version waiting to be installed. Held in memory: if the
  // user quits before restarting, the next launch simply offers the update again.
  let prepared: PreparedUpdate | null = null
  let preparing = false

  /**
   * Step one of two: fetch or build the new version while the app keeps
   * running. Nothing is replaced here — when this finishes the renderer shows
   * "ready" and waits for the user.
   */
  ipcMain.handle('app:prepareUpdate', () => {
    if (!canSelfUpdate()) {
      return {
        started: false,
        reason: 'Self-update is not available on this platform yet — install the new version from a fresh installer.'
      }
    }
    if (preparing) {
      return { started: true }
    }
    preparing = true

    void (async () => {
      const version = (await latestReleaseVersion())?.version ?? ''
      const result = hasCheckout()
        ? await prepareFromCheckout(__BUILD_SOURCE_DIR__, version, emitProgress)
        : await prepareFromRelease(emitProgress)
      preparing = false
      if (result.ok) {
        prepared = result.prepared
        emitProgress({
          phase: 'ready',
          percent: 100,
          version: result.prepared.version || version,
          detail: 'Ready to install'
        })
      } else {
        prepared = null
        emitProgress({ phase: 'error', reason: result.reason })
      }
    })()

    return { started: true }
  })

  /** Step two: only ever reached by an explicit user action in the banner. */
  ipcMain.handle('app:installUpdate', () => {
    if (!prepared) {
      return { started: false, reason: 'Nothing is prepared yet — download the update first.' }
    }
    emitProgress({ phase: 'installing', version: prepared.version, detail: 'Restarting Lantern…' })
    // Let the app quit without the "agents are still working" guard: the user
    // has just been asked, and the installer waits for the process to exit.
    allowQuitForUpdate()
    return installPrepared(prepared, __BUILD_SOURCE_DIR__)
  })

}

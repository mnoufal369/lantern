import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { prepareRepoWorkspace } from './git/RepoWorkspace'
import type { PastedImage, PermissionDecision } from '@shared/types'
import { FALLBACK_MODELS } from '@shared/constants'
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

  ipcMain.handle('sessions:create', (_e, req: { profileId: string; cwd: string }) =>
    manager.create(req.profileId, req.cwd)
  )
  ipcMain.handle(
    'sessions:createFromRepo',
    async (_e, req: { profileId: string; repoUrl: string; branch?: string }) => {
      const workspace = await prepareRepoWorkspace(req.repoUrl, req.branch)
      return manager.create(req.profileId, workspace)
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

  ipcMain.handle('permissions:respond', (_e, req: { requestId: string; decision: PermissionDecision }) =>
    manager.broker.respond(req.requestId, req.decision)
  )

  ipcMain.handle('history:list', () => manager.listTerminalHistory())
  ipcMain.handle('history:import', (_e, req: { sdkSessionId: string }) => manager.importTerminal(req.sdkSessionId))

  ipcMain.handle('profiles:list', () => ProfileStore.list())
  ipcMain.handle('profiles:save', (_e, req: { profile: AgentProfile }) => ProfileStore.save(req.profile))
  ipcMain.handle('profiles:delete', (_e, req: { profileId: string }) => ProfileStore.delete(req.profileId))

  ipcMain.handle('models:list', () => FALLBACK_MODELS)

  const workspacesRoot = path.join(app.getPath('userData'), 'workspaces')
  const isManaged = (cwd: string): boolean => cwd.startsWith(workspacesRoot + path.sep)

  ipcMain.handle('git:status', async (_e, req: { sessionId: string }) => {
    const cwd = cwdOf(req.sessionId)
    const status = await gitService.status(cwd)
    return { ...status, managed: isManaged(cwd) }
  })
  ipcMain.handle('git:remoteBranches', (_e, req: { sessionId: string }) =>
    gitService.remoteBranches(cwdOf(req.sessionId))
  )
  ipcMain.handle('git:checkoutBranch', async (_e, req: { sessionId: string; branch: string }) => {
    const cwd = cwdOf(req.sessionId)
    if (!isManaged(cwd)) {
      throw new Error('Branch switching is only available for repositories Pilot fetched for you')
    }
    await gitService.checkoutBranch(cwd, req.branch)
    const status = await gitService.status(cwd)
    return { ...status, managed: true }
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
}

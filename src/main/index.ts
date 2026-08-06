import { app, BrowserWindow } from 'electron'
import { execSync } from 'node:child_process'
import { cpSync, existsSync } from 'node:fs'
import path from 'node:path'
import { registerIpc } from './ipc'
import { SessionManager } from './sessions/SessionManager'
import { ProfileStore } from './store/stores'

let mainWindow: BrowserWindow | null = null
let manager: SessionManager | null = null

/**
 * macOS GUI apps don't inherit the login shell's PATH; without this, the
 * agent's Bash tool and npx-based MCP servers can't find node, git, etc.
 */
function adoptLoginShellPath(): void {
  if (process.platform !== 'darwin') {
    return
  }
  try {
    const shellBin = process.env.SHELL ?? '/bin/zsh'
    const shellPath = execSync(`${shellBin} -ilc 'echo -n $PATH'`, { timeout: 4000 }).toString().trim()
    if (shellPath.length > 0) {
      process.env.PATH = shellPath
    }
  } catch (error) {
    console.warn('Could not adopt login shell PATH', error)
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1080,
    minHeight: 640,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#09090b',
    show: false,
    webPreferences: {
      preload: path.join(import.meta.dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  mainWindow.once('ready-to-show', () => mainWindow?.show())
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('http://localhost') && !url.startsWith('file://')) {
      event.preventDefault()
    }
  })
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(path.join(import.meta.dirname, '../renderer/index.html'))
  }
}

/** One-time migration: the app was renamed AgentDeck -> Crew; carry data over. */
function migrateLegacyAppData(): void {
  try {
    const newDir = app.getPath('userData')
    const oldDir = path.join(path.dirname(newDir), 'AgentDeck')
    if (!existsSync(path.join(newDir, 'settings.json')) && existsSync(oldDir)) {
      cpSync(oldDir, newDir, { recursive: true, errorOnExist: false, force: false })
    }
  } catch (error) {
    console.warn('Legacy data migration skipped', error)
  }
}

app.whenReady().then(() => {
  migrateLegacyAppData()
  adoptLoginShellPath()
  ProfileStore.seedDefaults()
  manager = new SessionManager(() => mainWindow)
  registerIpc(manager)
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  app.quit()
})

app.on('before-quit', () => {
  manager?.disposeAll()
})

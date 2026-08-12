import { app, BrowserWindow } from 'electron'
import { execSync } from 'node:child_process'
import { cpSync, existsSync, statSync } from 'node:fs'
import path from 'node:path'
import { registerIpc } from './ipc'
import { installAppMenu } from './menu'
import { SessionManager } from './sessions/SessionManager'
import { ProfileStore } from './store/stores'

let mainWindow: BrowserWindow | null = null
let manager: SessionManager | null = null
let pendingOpenPath: string | null = null
let rendererReady = false

/** pilot://open?path=%2FUsers%2F…&new=1 → { dir, forceNew } (or null). */
function pathFromDeepLink(url: string): { dir: string; forceNew: boolean } | null {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'pilot:') {
      return null
    }
    const dir = parsed.searchParams.get('path')
    return dir ? { dir, forceNew: parsed.searchParams.get('new') === '1' } : null
  } catch {
    return null
  }
}

/** Focus (or create) a session for a folder — the `pilot` CLI lands here. */
function openFolderInPilot(dir: string, forceNew = false): void {
  try {
    if (!existsSync(dir) || !statSync(dir).isDirectory()) {
      return
    }
  } catch {
    return
  }
  if (!rendererReady || !manager) {
    pendingOpenPath = dir
    return
  }
  if (mainWindow) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore()
    }
    mainWindow.show()
    mainWindow.focus()
  }
  manager.openPath(dir, forceNew)
}

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
    // Centres the 12px traffic lights in the 44px top bar so they line up with the title
    trafficLightPosition: { x: 19, y: 16 },
    backgroundColor: '#1e1e1e',
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

  mainWindow.webContents.once('did-finish-load', () => {
    // Give the renderer a beat to mount its IPC listeners before replaying
    // a deep link that arrived during startup.
    setTimeout(() => {
      rendererReady = true
      if (pendingOpenPath) {
        const dir = pendingOpenPath
        pendingOpenPath = null
        openFolderInPilot(dir)
      }
    }, 600)
  })
}

/** One-time migration: the app was renamed AgentDeck -> Crew -> Pilot; carry data over. */
function migrateLegacyAppData(): void {
  try {
    const newDir = app.getPath('userData')
    if (existsSync(path.join(newDir, 'settings.json'))) {
      return
    }
    for (const legacyName of ['dockPilot', 'Crew', 'AgentDeck']) {
      const oldDir = path.join(path.dirname(newDir), legacyName)
      if (existsSync(path.join(oldDir, 'settings.json'))) {
        cpSync(oldDir, newDir, { recursive: true, errorOnExist: false, force: false })
        return
      }
    }
  } catch (error) {
    console.warn('Legacy data migration skipped', error)
  }
}

// The `pilot` CLI opens pilot://open?path=… — macOS delivers it here whether
// the app is already running or not (possibly before ready).
app.on('open-url', (event, url) => {
  event.preventDefault()
  const link = pathFromDeepLink(url)
  if (link) {
    openFolderInPilot(link.dir, link.forceNew)
  }
})

app.whenReady().then(() => {
  migrateLegacyAppData()
  adoptLoginShellPath()
  ProfileStore.seedDefaults()
  app.setAsDefaultProtocolClient('pilot')
  installAppMenu()
  manager = new SessionManager(() => mainWindow)
  registerIpc(manager)
  createWindow()

  // `pilot <dir>` can also launch the app directly with --dir (Windows path).
  const dirFlag = process.argv.indexOf('--dir')
  if (dirFlag >= 0 && process.argv[dirFlag + 1]) {
    pendingOpenPath = process.argv[dirFlag + 1]
  }

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

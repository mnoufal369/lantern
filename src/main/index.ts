import { app, BrowserWindow, dialog } from 'electron'
import { allowQuit, isQuitAllowed } from './quitGuard'
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

/** loods://open?path=%2FUsers%2F…&new=1 → { dir, forceNew } (or null). */
function pathFromDeepLink(url: string): { dir: string; forceNew: boolean } | null {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'loods:') {
      return null
    }
    const dir = parsed.searchParams.get('path')
    return dir ? { dir, forceNew: parsed.searchParams.get('new') === '1' } : null
  } catch {
    return null
  }
}

/** Focus (or create) a session for a folder — the `loods` CLI lands here. */
function openFolderInLoods(dir: string, forceNew = false): void {
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
        openFolderInLoods(dir)
      }
    }, 600)
  })
}

/** What actually belongs to us in userData — the rest is Chromium's own cache. */
const OWNED_DATA = ['settings.json', 'profiles.json', 'sessions.json', 'transcripts']

/**
 * The app has been renamed AgentDeck -> Crew -> Pilot -> Loods, and each rename
 * moves userData to a new folder. Carry our own files across from the newest
 * previous name that has them.
 *
 * Called before any store is constructed, because a store writes its defaults
 * file on construction and would make the destination look already-populated.
 * Each item is copied only when it is missing at the destination, so an
 * interrupted migration finishes itself on the next launch.
 */
function migrateLegacyAppData(): void {
  const newDir = app.getPath('userData')
  const missing = OWNED_DATA.filter((item) => !existsSync(path.join(newDir, item)))
  if (missing.length === 0) {
    return
  }
  for (const legacyName of ['Pilot', 'dockPilot', 'Crew', 'AgentDeck']) {
    const oldDir = path.join(path.dirname(newDir), legacyName)
    if (!existsSync(path.join(oldDir, 'settings.json'))) {
      continue
    }
    for (const item of missing) {
      const from = path.join(oldDir, item)
      if (!existsSync(from)) {
        continue
      }
      // One unreadable item must not abandon the others.
      try {
        cpSync(from, path.join(newDir, item), { recursive: true, errorOnExist: false, force: false })
        console.log(`Carried ${item} over from ${legacyName}`)
      } catch (error) {
        console.warn(`Could not carry ${item} over from ${legacyName}`, error)
      }
    }
    return
  }
}

// The `loods` CLI opens loods://open?path=… — macOS delivers it here whether
// the app is already running or not (possibly before ready).
app.on('open-url', (event, url) => {
  event.preventDefault()
  const link = pathFromDeepLink(url)
  if (link) {
    openFolderInLoods(link.dir, link.forceNew)
  }
})

app.whenReady().then(() => {
  migrateLegacyAppData()
  adoptLoginShellPath()
  ProfileStore.seedDefaults()
  app.setAsDefaultProtocolClient('loods')
  installAppMenu()
  manager = new SessionManager(() => mainWindow)
  registerIpc(manager)
  createWindow()

  // `loods <dir>` can also launch the app directly with --dir (Windows path).
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

// Quitting while an agent is mid-turn loses that turn's work, so ask first.
// The updater's restart sets the flag beforehand and skips this.
app.on('before-quit', (event) => {
  const busy = manager?.busyCount() ?? 0
  if (busy > 0 && !isQuitAllowed()) {
    event.preventDefault()
    const plural = busy > 1
    const options = {
      type: 'warning' as const,
      buttons: ['Quit anyway', 'Keep working'],
      defaultId: 1,
      cancelId: 1,
      message: `${busy} agent${plural ? 's are' : ' is'} still working`,
      detail: `Quitting now stops ${plural ? 'them' : 'it'} mid-task. The conversation${
        plural ? 's are' : ' is'
      } saved either way — you can pick up where ${plural ? 'they' : 'it'} left off next time.`
    }
    void (mainWindow ? dialog.showMessageBox(mainWindow, options) : dialog.showMessageBox(options))
      .then(({ response }) => {
        if (response === 0) {
          allowQuit()
          app.quit()
        }
      })
    return
  }
  manager?.disposeAll()
})

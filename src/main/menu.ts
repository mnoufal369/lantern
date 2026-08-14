import { app, BrowserWindow, Menu, shell, type MenuItemConstructorOptions } from 'electron'
import { APP_NAME, REPO_WEB_URL } from '../shared/constants'

/**
 * The window owns the whole update flow — the check, the banner, the progress —
 * so the menu item just asks it to start one rather than duplicating any of it.
 */
function requestUpdateCheck(): void {
  const window = BrowserWindow.getAllWindows()[0]
  if (!window) {
    return
  }
  window.show()
  window.focus()
  window.webContents.send('update:checkRequested', { source: 'menu' })
}

const CHECK_FOR_UPDATES: MenuItemConstructorOptions = {
  label: 'Check for Updates…',
  click: () => requestUpdateCheck()
}

const HELP_LINKS: { label: string; url: string }[] = [
  { label: 'Documentation', url: `${REPO_WEB_URL}#readme` },
  { label: 'Report an Issue…', url: `${REPO_WEB_URL}/issues/new` },
  { label: 'Release Notes', url: `${REPO_WEB_URL}/releases` },
  { label: `${APP_NAME} on GitHub`, url: REPO_WEB_URL }
]

/**
 * Electron's stock menu leaves Help empty, so the app owns its whole menu bar.
 * Everything outside Help stays on built-in roles — those carry the standard
 * shortcuts (copy, paste, zoom, minimise) for free.
 */
export function installAppMenu(): void {
  const template: MenuItemConstructorOptions[] = [
    // Spelled out rather than `role: 'appMenu'` so Check for Updates can sit
    // directly under About, where macOS users look for it. The rest stay roles.
    ...(process.platform === 'darwin'
      ? [
          {
            label: APP_NAME,
            submenu: [
              { role: 'about' },
              CHECK_FOR_UPDATES,
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' }
            ]
          } as MenuItemConstructorOptions
        ]
      : []),
    { role: 'fileMenu' },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        // Windows and Linux have no app menu, so Help is where the item lives.
        ...(process.platform === 'darwin' ? [] : [CHECK_FOR_UPDATES, { type: 'separator' } as MenuItemConstructorOptions]),
        ...HELP_LINKS.map(({ label, url }) => ({
          label,
          click: () => void shell.openExternal(url)
        })),
        { type: 'separator' },
        {
          label: 'Reveal Logs in Finder',
          click: () => void shell.openPath(app.getPath('logs'))
        }
      ]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

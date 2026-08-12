import { app, Menu, shell, type MenuItemConstructorOptions } from 'electron'
import { APP_NAME, REPO_WEB_URL } from '../shared/constants'

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
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' } as MenuItemConstructorOptions] : []),
    { role: 'fileMenu' },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
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

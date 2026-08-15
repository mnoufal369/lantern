/**
 * Shared flag between the updater IPC and the app's before-quit handler.
 *
 * Quitting normally asks for confirmation when agents are mid-turn. The
 * updater's own restart must not hit that prompt — the user has just agreed to
 * it, and the installer is waiting for the process to exit.
 */
let quitAllowed = false

export function allowQuitForUpdate(): void {
  quitAllowed = true
}

/** The install never started, so the warning must come back. */
export function cancelQuitForUpdate(): void {
  quitAllowed = false
}

/** Also set once the user answers "Quit anyway" to the busy-sessions prompt. */
export function allowQuit(): void {
  quitAllowed = true
}

export function isQuitAllowed(): boolean {
  return quitAllowed
}

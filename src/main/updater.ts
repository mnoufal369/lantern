import { app } from 'electron'
import { execFile, spawn } from 'node:child_process'
import { createWriteStream, mkdirSync, openSync, rmSync, writeSync } from 'node:fs'
import https from 'node:https'
import path from 'node:path'
import { REPO_URL } from '@shared/constants'
import type { UpdateProgress } from '@shared/types'

/**
 * Self-update in two explicit halves, so the app never disappears under the
 * user:
 *
 *   prepare — download the release dmg (or rebuild the checkout). The app keeps
 *             running the whole time and reports progress.
 *   install — quit, swap /Applications/Lantern.app, relaunch. Only ever runs
 *             after the user asks for it.
 *
 * Everything is logged to userData/self-update.log for post-mortems.
 */

const REPO_SLUG = REPO_URL.replace(/^https:\/\/github\.com\//, '').replace(/\.git$/, '')

export type Emit = (progress: UpdateProgress) => void

export interface PreparedUpdate {
  kind: 'dmg' | 'checkout'
  version: string
  /** Staged dmg, for `kind: 'dmg'`. */
  file?: string
}

type PrepareResult = { ok: true; prepared: PreparedUpdate } | { ok: false; reason: string }

function logFd(): number {
  return openSync(path.join(app.getPath('userData'), 'self-update.log'), 'a')
}

/** Waits for the app to actually exit before touching the bundle — `sleep 1` was a guess. */
const WAIT_FOR_EXIT = `osascript -e 'quit app "Lantern"' >/dev/null 2>&1 || true
for _ in $(seq 1 60); do pgrep -x Lantern >/dev/null || break; sleep 0.25; done
if pgrep -x Lantern >/dev/null; then echo "✗ Lantern is still running — not touching the bundle"; exit 1; fi`

/** GitHub token from `gh` (preferred) or git's credential store — never prompts. */
async function githubToken(): Promise<string | null> {
  const viaGh = await new Promise<string | null>((resolve) => {
    execFile('gh', ['auth', 'token'], { timeout: 5000 }, (error, stdout) =>
      resolve(error ? null : stdout.trim() || null)
    )
  })
  if (viaGh) {
    return viaGh
  }
  return new Promise((resolve) => {
    const child = execFile(
      'git',
      ['credential', 'fill'],
      { timeout: 5000, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } },
      (error, stdout) => {
        if (error) {
          resolve(null)
          return
        }
        const match = /(?:^|\n)password=([^\n]+)/.exec(stdout)
        resolve(match ? match[1] : null)
      }
    )
    child.stdin?.write('protocol=https\nhost=github.com\n\n')
    child.stdin?.end()
  })
}

function getJson(url: string, token: string | null): Promise<unknown> {
  return new Promise((resolve, reject) => {
    https
      .get(
        url,
        {
          headers: {
            'User-Agent': 'Lantern-updater',
            Accept: 'application/vnd.github+json',
            ...(token ? { Authorization: `token ${token}` } : {})
          }
        },
        (res) => {
          if (res.statusCode !== 200) {
            res.resume()
            reject(new Error(`GitHub API ${res.statusCode} for ${url}`))
            return
          }
          let body = ''
          res.on('data', (chunk: Buffer) => (body += chunk.toString()))
          res.on('end', () => {
            try {
              resolve(JSON.parse(body))
            } catch (error) {
              reject(error as Error)
            }
          })
        }
      )
      .on('error', reject)
  })
}

/**
 * Downloads a release asset, reporting bytes as they arrive. The API 302s to
 * signed storage, which must be fetched WITHOUT the auth header.
 */
function downloadAsset(
  assetApiUrl: string,
  token: string | null,
  dest: string,
  onBytes?: (received: number, total: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const save = (res: NodeJS.ReadableStream & { headers?: Record<string, string | string[] | undefined> }): void => {
      const total = Number(res.headers?.['content-length'] ?? 0)
      let received = 0
      if (onBytes) {
        res.on('data', (chunk: Buffer) => {
          received += chunk.length
          onBytes(received, total)
        })
      }
      const file = createWriteStream(dest)
      res.pipe(file)
      file.on('finish', () => file.close(() => resolve()))
      file.on('error', reject)
    }
    https
      .get(
        assetApiUrl,
        {
          headers: {
            'User-Agent': 'Lantern-updater',
            Accept: 'application/octet-stream',
            ...(token ? { Authorization: `token ${token}` } : {})
          }
        },
        (res) => {
          if (res.statusCode === 302 || res.statusCode === 301) {
            const location = res.headers.location
            res.resume()
            if (!location) {
              reject(new Error('Redirect without location'))
              return
            }
            https
              .get(location, { headers: { 'User-Agent': 'Lantern-updater' } }, (res2) => {
                if (res2.statusCode !== 200) {
                  res2.resume()
                  reject(new Error(`Asset download failed (${res2.statusCode})`))
                  return
                }
                save(res2)
              })
              .on('error', reject)
          } else if (res.statusCode === 200) {
            save(res)
          } else {
            res.resume()
            reject(new Error(`Asset request failed (${res.statusCode})`))
          }
        }
      )
      .on('error', reject)
  })
}

interface ReleaseInfo {
  tag_name?: string
  assets?: { id: number; name: string }[]
}

async function latestRelease(token: string | null): Promise<ReleaseInfo> {
  return (await getJson(`https://api.github.com/repos/${REPO_SLUG}/releases/latest`, token)) as ReleaseInfo
}

/** Latest published release tag and bare version ("v0.7.1" / "0.7.1"), or null when unreachable. */
export async function latestReleaseVersion(): Promise<{ tag: string; version: string } | null> {
  try {
    const token = await githubToken()
    const tag = (await latestRelease(token)).tag_name ?? ''
    return tag ? { tag, version: tag.replace(/^v/, '') } : null
  } catch {
    return null
  }
}

function mb(bytes: number): string {
  return `${(bytes / 1_048_576).toFixed(0)} MB`
}

/** Fresh, empty staging directory under userData (survives a "Later" choice). */
function stagingDir(): string {
  const dir = path.join(app.getPath('userData'), 'updates')
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  return dir
}

/** Downloads the latest release's mac build. Does not touch the installed app. */
export async function prepareFromRelease(emit: Emit): Promise<PrepareResult> {
  // Public repo: unauthenticated works. A token (gh / git credentials) is used
  // when present — required only if the repo is ever private again.
  const token = await githubToken()

  let release: ReleaseInfo
  try {
    release = await latestRelease(token)
  } catch (error) {
    return {
      ok: false,
      reason: `Could not read the latest release: ${error instanceof Error ? error.message : 'unknown error'}`
    }
  }

  const version = (release.tag_name ?? '').replace(/^v/, '')
  const assets = release.assets ?? []
  const asset =
    assets.find((a) => a.name.endsWith(`${process.arch}.dmg`)) ??
    assets.find((a) => a.name.endsWith('.dmg')) ??
    assets.find((a) => a.name.includes('mac-') && a.name.endsWith('.zip'))
  if (!asset) {
    return { ok: false, reason: 'The latest release has no downloadable Mac build yet — try again later.' }
  }

  const file = path.join(stagingDir(), asset.name)
  emit({ phase: 'downloading', percent: 0, version, detail: 'Starting download…' })
  let lastTick = 0
  try {
    await downloadAsset(
      `https://api.github.com/repos/${REPO_SLUG}/releases/assets/${asset.id}`,
      token,
      file,
      (received, total) => {
        const now = Date.now()
        // The renderer only needs a few updates a second.
        if (now - lastTick < 200 && received !== total) {
          return
        }
        lastTick = now
        emit({
          phase: 'downloading',
          percent: total > 0 ? Math.min(99, Math.round((received / total) * 100)) : undefined,
          version,
          detail: total > 0 ? `Downloading — ${mb(received)} of ${mb(total)}` : `Downloading — ${mb(received)}`
        })
      }
    )
  } catch (error) {
    return { ok: false, reason: `Download failed: ${error instanceof Error ? error.message : 'unknown error'}` }
  }

  return { ok: true, prepared: { kind: 'dmg', version, file } }
}

/** Stage lines install-mac.sh prints, mapped to something a human wants to read. */
const BUILD_STAGES: { match: RegExp; detail: string; percent: number }[] = [
  { match: /Installing dependencies/i, detail: 'Installing dependencies…', percent: 35 },
  { match: /Building Lantern/i, detail: 'Building the new version…', percent: 70 },
  { match: /Prepared/i, detail: 'Build finished', percent: 95 }
]

/** Pulls and rebuilds the checkout this build came from. Does not touch the installed app. */
export function prepareFromCheckout(sourceDir: string, version: string, emit: Emit): Promise<PrepareResult> {
  return new Promise((resolve) => {
    emit({ phase: 'preparing', percent: 10, version, detail: 'Fetching the latest code…' })
    const fd = logFd()
    const child = spawn(
      '/bin/bash',
      ['-lc', `cd "${sourceDir}" && echo "── prepare $(date) ──" && git pull --ff-only && bash scripts/install-mac.sh --prepare`],
      { env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }
    )
    const onChunk = (buf: Buffer): void => {
      const text = buf.toString()
      try {
        writeSync(fd, text)
      } catch {
        // Logging is best effort.
      }
      for (const stage of BUILD_STAGES) {
        if (stage.match.test(text)) {
          emit({ phase: 'preparing', percent: stage.percent, version, detail: stage.detail })
        }
      }
    }
    child.stdout?.on('data', onChunk)
    child.stderr?.on('data', onChunk)
    child.on('error', (error) => resolve({ ok: false, reason: error.message }))
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ ok: true, prepared: { kind: 'checkout', version } })
      } else {
        resolve({
          ok: false,
          reason: `The build failed (exit ${code}). See self-update.log in Lantern's data folder.`
        })
      }
    })
  })
}

/**
 * Quits Lantern, swaps in the prepared build and relaunches. Detached so it
 * survives this process exiting. Only call after the user has agreed.
 */
export function installPrepared(prepared: PreparedUpdate, sourceDir: string): { started: boolean; reason?: string } {
  try {
    // /Applications/Lantern.app/Contents/MacOS/Lantern -> /Applications/Lantern.app
    const exe = app.getPath('exe')
    const currentBundle = exe.includes('.app/') ? `${exe.slice(0, exe.indexOf('.app/'))}.app` : ''
    const script =
      prepared.kind === 'checkout'
        ? `cd "${sourceDir}" && echo "── swap $(date) ──" && bash scripts/install-mac.sh --swap`
        : prepared.file?.endsWith('.dmg')
          ? // The bundle is found by pattern rather than by name: hardcoding it meant
            // that renaming the app broke every existing install's self-update.
            `echo "── dmg install ${prepared.version} $(date) ──"
VOL=$(hdiutil attach -nobrowse -readonly "${prepared.file}" | awk -F'\\t' '/\\/Volumes\\//{print $NF; exit}')
APP=$(find "$VOL" -maxdepth 1 -name "*.app" | head -1)
[ -n "$APP" ] || { echo "✗ No .app inside the dmg"; hdiutil detach "$VOL" >/dev/null 2>&1; exit 1; }
TARGET="/Applications/$(basename "$APP")"
${WAIT_FOR_EXIT}
rm -rf "$TARGET"
ditto "$APP" "$TARGET"
hdiutil detach "$VOL" >/dev/null 2>&1 || true
xattr -dr com.apple.quarantine "$TARGET" 2>/dev/null || true
codesign --verify --deep --strict "$TARGET" || { echo "✗ Signature check failed after install"; exit 1; }
# A renamed app installs beside the old bundle; drop the one we just replaced.
if [ "$TARGET" != "${currentBundle}" ] && [ -d "${currentBundle}" ]; then
  rm -rf "${currentBundle}" && echo "· removed the previous bundle at ${currentBundle}"
fi
open "$TARGET"
echo "✓ updated to ${prepared.version}"`
          : `cd "$(dirname "${prepared.file}")" && ditto -x -k "${prepared.file}" . && INSTALLER=$(find . -maxdepth 2 -name "Install Lantern.command" | head -1) && [ -n "$INSTALLER" ] && bash "$INSTALLER"`

    const fd = logFd()
    const child = spawn('/bin/bash', ['-lc', script], { detached: true, stdio: ['ignore', fd, fd] })
    child.unref()
    return { started: true }
  } catch (error) {
    return { started: false, reason: error instanceof Error ? error.message : 'Could not start the install' }
  }
}

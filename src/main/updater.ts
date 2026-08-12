import { app } from 'electron'
import { execFile, spawn } from 'node:child_process'
import { createWriteStream, mkdtempSync, openSync } from 'node:fs'
import https from 'node:https'
import os from 'node:os'
import path from 'node:path'
import { REPO_URL } from '@shared/constants'

/**
 * Self-update for installs WITHOUT a source checkout (zip installs): download
 * the latest prebuilt zip from the repo's GitHub Releases with the machine's
 * own GitHub credentials, then run the bundled installer script, which quits,
 * swaps /Applications/Pilot.app, de-quarantines and relaunches.
 */

const REPO_SLUG = REPO_URL.replace(/^https:\/\/github\.com\//, '').replace(/\.git$/, '')

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
            'User-Agent': 'Pilot-updater',
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

/** Downloads a release asset; the API 302s to signed storage, which must be fetched WITHOUT the auth header. */
function downloadAsset(assetApiUrl: string, token: string | null, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const save = (res: NodeJS.ReadableStream & { statusCode?: number }): void => {
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
            'User-Agent': 'Pilot-updater',
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
              .get(location, { headers: { 'User-Agent': 'Pilot-updater' } }, (res2) => {
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

/** Tag of the latest published release ("v0.5.7"), or null when unreachable. */
export async function latestReleaseTag(): Promise<string | null> {
  try {
    const token = await githubToken()
    return (await latestRelease(token)).tag_name ?? null
  } catch {
    return null
  }
}

export async function selfUpdateFromRelease(): Promise<{ started: boolean; reason?: string }> {
  // Public repo: unauthenticated works. A token (gh / git credentials) is
  // used when present — required only if the repo is ever private again.
  const token = await githubToken()

  let release: ReleaseInfo
  try {
    release = await latestRelease(token)
  } catch (error) {
    return {
      started: false,
      reason: `Could not read the latest release: ${error instanceof Error ? error.message : 'unknown error'}`
    }
  }

  // Prefer the dmg (the only mac asset going forward); fall back to the zip
  // that older releases carried.
  const assets = release.assets ?? []
  const asset =
    assets.find((a) => a.name.endsWith(`${process.arch}.dmg`)) ??
    assets.find((a) => a.name.endsWith('.dmg')) ??
    assets.find((a) => a.name.includes('mac-') && a.name.endsWith('.zip'))
  if (!asset) {
    return { started: false, reason: 'The latest release has no downloadable Mac build yet — try again later.' }
  }

  const dir = mkdtempSync(path.join(os.tmpdir(), 'pilot-update-'))
  const filePath = path.join(dir, asset.name)
  try {
    await downloadAsset(`https://api.github.com/repos/${REPO_SLUG}/releases/assets/${asset.id}`, token, filePath)
  } catch (error) {
    return {
      started: false,
      reason: `Download failed: ${error instanceof Error ? error.message : 'unknown error'}`
    }
  }

  // Install detached so it survives this process quitting mid-way. The dmg
  // path mounts, swaps /Applications/Pilot.app, de-quarantines and relaunches;
  // the zip path defers to the installer script older zips carry.
  const script = asset.name.endsWith('.dmg')
    ? `echo "── dmg self-update ${release.tag_name ?? ''} $(date) ──"
VOL=$(hdiutil attach -nobrowse -readonly "${filePath}" | awk -F'\\t' '/\\/Volumes\\//{print $NF; exit}')
[ -d "$VOL/Pilot.app" ] || { echo "✗ No Pilot.app in the dmg"; hdiutil detach "$VOL" >/dev/null 2>&1; rm -rf "${dir}"; exit 1; }
osascript -e 'quit app "Pilot"' >/dev/null 2>&1 || true
sleep 1
rm -rf /Applications/Pilot.app
ditto "$VOL/Pilot.app" /Applications/Pilot.app
hdiutil detach "$VOL" >/dev/null 2>&1 || true
xattr -dr com.apple.quarantine /Applications/Pilot.app 2>/dev/null || true
codesign --verify --deep --strict /Applications/Pilot.app || { echo "✗ Signature check failed after install"; rm -rf "${dir}"; exit 1; }
open /Applications/Pilot.app
echo "✓ updated"
rm -rf "${dir}"`
    : `echo "── zip self-update ${release.tag_name ?? ''} $(date) ──" && cd "${dir}" && ditto -x -k "${filePath}" . && INSTALLER=$(find . -maxdepth 2 -name "Install Pilot.command" | head -1) && [ -n "$INSTALLER" ] && bash "$INSTALLER"; STATUS=$?; rm -rf "${dir}"; exit $STATUS`
  const logFile = openSync(path.join(app.getPath('userData'), 'self-update.log'), 'a')
  const child = spawn('/bin/bash', ['-c', script], { detached: true, stdio: ['ignore', logFile, logFile] })
  child.unref()
  return { started: true }
}

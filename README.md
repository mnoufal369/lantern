# Pilot

**You talk. Pilot builds.**

Internal asset — not for external distribution or sale.

## Install on your Mac (recommended: build it yourself)

Apps you build locally are fully trusted by macOS — no "damaged" warnings, no Gatekeeper
fights. One-time requirements: [Git](https://git-scm.com) and [Node 20+](https://nodejs.org)
(`brew install node git`), plus access to this repository.

```bash
git clone https://github.com/mnoufal369/ai-pilot.git
cd ai-pilot
yarn setup:mac       # installs deps, builds, installs to /Applications, launches
```

Updating later: `git pull && yarn setup:mac`.

Pilot is what GitHub Desktop was to the git terminal — a native, interactive cockpit for terminal AI coding agents, powered by the same engine as Claude Code (the official Claude Agent SDK).

## Features

- **Agent chat cockpit** — streaming chat with rich tool visualization: file edits render as diffs, bash commands as terminal blocks, todo lists, nested subagent activity, per-turn cost/token footers, markdown with copy-button code snippets.
- **Agent builder** — create reusable agent profiles: name, color, model, system prompt (extend or replace Claude Code's), permission mode, always-allowed tools, MCP servers, default project folder.
- **Multi-session dashboard** — run several agents in parallel across projects; sidebar shows live status (thinking / running tool / needs permission), cost and tokens per session. Search sessions by name, rename with a double-click.
- **Permission control** — tool calls surface as native dialogs with rich previews (the diff it wants to apply, the command it wants to run): Deny / Allow once / Always allow. Flip between Plan / Ask / Auto-edit / Full-auto mid-session.
- **Git awareness** — per-session branch info, changed files with inline diffs, one-click revert, and a "files touched this session" tracker.
- **Keep talking while it works** — the composer stays live during a run; messages queue into the running turn. Interrupt any time with Esc.
- **Calls you back** — native notifications when an agent finishes, errors, or needs your approval while Pilot is in the background; click to jump to the session.
- **Cost control** — per-profile session budgets with a live budget bar, plus a usage view in Settings (7-day and all-time spend, per profile).
- **Safe "always allow"** — remembered Bash rules only match on word boundaries and never cover chained commands (`git status; rm -rf ~` always re-prompts); risky commands (`rm`, `curl`, `sudo`, …) are only ever remembered as exact matches.
- **QA niceties** — paste a PR number (`#123`) instead of a branch when fetching a repo, search inside a conversation (⌘F), copy the whole session as Markdown, recent folders/repos one click away, archived sessions restorable (or deletable with full cleanup).

## Auth

Sessions authenticate in this order:

1. API key set in **Settings** (stored locally)
2. `ANTHROPIC_API_KEY` from your environment
3. Your existing **Claude Code login** on this Mac (keychain)

## Windows (for QA teams)

```bash
# one-time: fetch the Windows agent runtime (not installed by yarn on macOS)
curl -sL https://registry.npmjs.org/@anthropic-ai/claude-agent-sdk-win32-x64/-/claude-agent-sdk-win32-x64-0.3.223.tgz -o /tmp/sdk-win32.tgz
mkdir -p node_modules/@anthropic-ai/claude-agent-sdk-win32-x64
tar -xzf /tmp/sdk-win32.tgz -C node_modules/@anthropic-ai/claude-agent-sdk-win32-x64 --strip-components=1

yarn dist:win     # cross-builds release/Pilot-Setup-<version>-x64.exe from macOS (--x64 matters!)
```

The installer bundles the Windows agent runtime (`claude.exe`) — no Docker, no local checkout, no dev setup. A QA workflow:

1. Install Pilot (one unsigned-installer SmartScreen prompt: *More info → Run anyway*).
2. Add auth: paste an API key in Settings, **or** log in once with the `claude` CLI if installed.
3. New Session → **Online repository** → paste the repo URL **and the branch under test** (e.g. `release/2.4`).
4. Pick the **QA Agent** and ask: "generate test cases for the checkout flow", "what changed on this branch that could break payments?", "is input validation complete on the signup form?"
5. **Export** the session as a Markdown report and attach it to the ticket.

Requirements on the Windows machine: [Git for Windows](https://git-scm.com/download/win) (for fetching repos).

## Development

```bash
yarn install          # Node 20+, engines are advisory (.yarnrc has --ignore-engines)
yarn dev              # run with HMR
yarn typecheck        # TS across main/preload/renderer
yarn test             # vitest unit tests (permission rules, normalizer, transcript reducer)
yarn dist             # build release/Pilot-<version>-arm64.dmg (unsigned)
yarn dist:share            # Apple Silicon  (~190 MB)
yarn dist:share:x64        # Intel only     (~190 MB)
yarn dist:share:universal  # runs on both   (~350 MB)
```

## Sharing a build with someone else

Each produces `release/Pilot-<version>-mac-<arch>.zip` containing `Pilot.app`,
`scripts/Install Pilot.command` and `scripts/Read me first.txt`.

Pick by who's receiving it. An arm64 zip will not launch on an Intel Mac at all, and vice versa.
The universal zip runs anywhere but carries both architectures of Electron *and* both ~270 MB agent
runtimes, so it's nearly twice the download — prefer a per-arch zip when you know the recipient's
Mac, and keep `universal` for when you don't.

Packaging refuses to ship a bundle whose signature doesn't verify.

### Cross-architecture notes

Yarn only installs the agent runtime for the machine you're on, so `scripts/fetch-agent-runtime.sh`
pulls the others from npm. The app chooses one at launch from `process.arch` (`resolvePackagedCli`
in `src/main/sessions/SessionRuntime.ts`), so every architecture the bundle can boot on needs its
own copy present and outside the asar — packaging fails the build if one is missing, since
otherwise sessions only break once a colleague on that architecture starts one. Conversely,
electron-builder bundles *every* runtime it finds in `node_modules`, so packaging prunes the ones a
build can't execute and re-signs afterwards (removing files invalidates the signature).

Two things to know if you touch the universal target:

- `mac.x64ArchFiles` must cover the agent runtimes. They're per-arch binaries that are byte-identical
  across both sub-builds, and `@electron/universal` aborts on such files unless told to leave them
  alone rather than `lipo` them together.
- `scripts/prefetch-electron.sh` downloads Electron's zips before electron-builder can. Its
  downloader gives up after 10 minutes, which a ~110 MB zip can't beat on a slow link, so a
  universal build would otherwise fail every time. It tries an npm mirror first and verifies
  against Electron's published `SHASUMS256.txt`, so a mirror can only serve the identical file or
  be rejected.

Two failure modes look similar but are not:

- **"Pilot is damaged and can't be opened"** — the *bundle signature is invalid*, and there is no
  "Open Anyway" override. This is what `mac.identity: null` produces: only the inner binary carries
  the linker's ad-hoc signature, so the bundle fails `codesign --verify` with *"code has no
  resources but signature indicates they must be present"*. Fixed by `mac.identity: "-"`, which
  ad-hoc signs the whole bundle. Check with `codesign --verify --deep --strict Pilot.app` — it must
  be silent. (`syspolicy_check distribution` is not the test to use here: it reports Fatal
  "Notary Ticket Missing" for *any* un-notarized build, good or broken.)
- **"macOS cannot verify the developer"** — merely unnotarized. Recoverable by the recipient via
  System Settings → Privacy & Security → **Open Anyway**.

So an ad-hoc signature doesn't remove the warning, but it *does* keep the recipient's approval
route available. The installer skips the warning entirely by clearing quarantine; it must be run
from Terminal (`bash "Install Pilot.command"`), since macOS 15+ removed the right-click → Open
bypass for double-clicked scripts. Interpreter-invoked scripts aren't gated.

Use `xattr -dr com.apple.quarantine`, never `xattr -cr` — the latter strips the `com.apple.cs.*`
attributes that hold signatures for non-Mach-O files, invalidating the bundle.

Removing the warning altogether needs Developer ID signing + notarization — see SIGNING.md.

## Architecture

- **Main process** (`src/main/`) — `SessionManager` holds N concurrent Agent SDK query streams (streaming-input mode, one long-lived query per session). `PermissionBroker` bridges the SDK's `canUseTool` callback to renderer dialogs. `GitService` wraps the system git. Streaming deltas are coalesced (~33ms) before crossing IPC.
- **Renderer** (`src/renderer/`) — React 19 + Tailwind 4 + zustand. Raw SDK messages never reach the renderer; `normalize.ts` converts them to a small `UiEvent` union.
- **Shared contract** (`src/shared/ipc.ts`) — typed IPC channels compiled into main, preload and renderer.
- **Packaging** — electron-builder with `asarUnpack` for the Agent SDK (it spawns a native `claude` binary that must live on real disk).

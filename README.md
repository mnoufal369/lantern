# Pilot · by Salesdock

**You talk. Pilot builds.**

Internal Salesdock asset — not for external distribution or sale.

Pilot is what GitHub Desktop was to the git terminal — a native, interactive cockpit for terminal AI coding agents, powered by the same engine as Claude Code (the official Claude Agent SDK).

## Features

- **Agent chat cockpit** — streaming chat with rich tool visualization: file edits render as diffs, bash commands as terminal blocks, todo lists, nested subagent activity, per-turn cost/token footers, markdown with copy-button code snippets.
- **Agent builder** — create reusable agent profiles: name, color, model, system prompt (extend or replace Claude Code's), permission mode, always-allowed tools, MCP servers, default project folder.
- **Multi-session dashboard** — run several agents in parallel across projects; sidebar shows live status (thinking / running tool / needs permission), cost and tokens per session. Search sessions by name, rename with a double-click.
- **Permission control** — tool calls surface as native dialogs with rich previews (the diff it wants to apply, the command it wants to run): Deny / Allow once / Always allow. Flip between Plan / Ask / Auto-edit / Full-auto mid-session.
- **Git awareness** — per-session branch info, changed files with inline diffs, one-click revert, and a "files touched this session" tracker.
- **Keep talking while it works** — the composer stays live during a run; messages queue into the running turn. Interrupt any time with Esc.

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
yarn dist             # build release/Pilot-<version>-arm64.dmg (unsigned)
```

The dmg is unsigned (local distribution). If macOS complains after copying to another machine:
`xattr -d com.apple.quarantine "/Applications/Pilot.app"` or right-click → Open.

## Architecture

- **Main process** (`src/main/`) — `SessionManager` holds N concurrent Agent SDK query streams (streaming-input mode, one long-lived query per session). `PermissionBroker` bridges the SDK's `canUseTool` callback to renderer dialogs. `GitService` wraps the system git. Streaming deltas are coalesced (~33ms) before crossing IPC.
- **Renderer** (`src/renderer/`) — React 19 + Tailwind 4 + zustand. Raw SDK messages never reach the renderer; `normalize.ts` converts them to a small `UiEvent` union.
- **Shared contract** (`src/shared/ipc.ts`) — typed IPC channels compiled into main, preload and renderer.
- **Packaging** — electron-builder with `asarUnpack` for the Agent SDK (it spawns a native `claude` binary that must live on real disk).

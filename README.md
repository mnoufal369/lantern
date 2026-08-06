# AgentDeck 🛰️

**Your deck for running and configuring AI agents on the Mac.**

AgentDeck is what GitHub Desktop was to the git terminal — a native, interactive cockpit for terminal AI coding agents, powered by the same engine as Claude Code (the official Claude Agent SDK).

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

## Development

```bash
yarn install          # Node 20+, engines are advisory (.yarnrc has --ignore-engines)
yarn dev              # run with HMR
yarn typecheck        # TS across main/preload/renderer
yarn dist             # build release/AgentDeck-<version>-arm64.dmg (unsigned)
```

The dmg is unsigned (local distribution). If macOS complains after copying to another machine:
`xattr -d com.apple.quarantine "/Applications/AgentDeck.app"` or right-click → Open.

## Architecture

- **Main process** (`src/main/`) — `SessionManager` holds N concurrent Agent SDK query streams (streaming-input mode, one long-lived query per session). `PermissionBroker` bridges the SDK's `canUseTool` callback to renderer dialogs. `GitService` wraps the system git. Streaming deltas are coalesced (~33ms) before crossing IPC.
- **Renderer** (`src/renderer/`) — React 19 + Tailwind 4 + zustand. Raw SDK messages never reach the renderer; `normalize.ts` converts them to a small `UiEvent` union.
- **Shared contract** (`src/shared/ipc.ts`) — typed IPC channels compiled into main, preload and renderer.
- **Packaging** — electron-builder with `asarUnpack` for the Agent SDK (it spawns a native `claude` binary that must live on real disk).

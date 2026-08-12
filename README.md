<div align="center">

<img src="resources/icon.svg" width="110" alt="Pilot logo">

# Pilot

**You talk. Pilot builds.**

A native desktop cockpit for AI coding agents — macOS & Windows.<br>
Powered by the same engine as Claude Code. No terminal required.

[![CI](https://github.com/mnoufal369/ai-pilot/actions/workflows/ci.yml/badge.svg)](https://github.com/mnoufal369/ai-pilot/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/mnoufal369/ai-pilot?color=29acc2)](https://github.com/mnoufal369/ai-pilot/releases/latest)
[![License: MIT](https://img.shields.io/badge/license-MIT-16998f.svg)](LICENSE)

[**Product page**](https://mnoufal369.github.io/ai-pilot/) · [**Download**](https://github.com/mnoufal369/ai-pilot/releases/latest) · [**Release notes**](CHANGELOG.md)

</div>

---

Pilot is what GitHub Desktop was to the git terminal: a beautiful, interactive
cockpit for terminal AI coding agents. Point an agent at a folder or paste a
repository URL, ask for what you want in plain words — and approve every
change before it happens. Built for developers **and** for the people around
the code: QA, consultants, product folks.

## Highlights

- 🪄 **Rich live transcript** — edits as red/green diffs, commands as terminal
  blocks, plans as checklists, copy buttons on everything, long output folds.
- 🛡️ **Approval-first** — see the exact diff or command before it runs:
  deny / allow once / always allow. Remembered rules are precise — chained
  commands (`a && b`) always re-ask. Four permission levels from Plan to
  Full auto.
- 🚀 **Ten repos, ten conversations** — sessions are tabs (⌘1–9), agents keep
  working in the background, notifications call you back, `pilot .` opens the
  current folder from a terminal.
- 🧑‍✈️ **Five ready-made agents** — Dev, Planner, QA (read-only), Consultant
  (read-only), Explainer (read-only) — plus a builder for your own: custom
  prompt, model, permissions, MCP servers, per-session budget.
- 🌍 **Any repo, branch or PR** — paste a URL and optionally `release/2.4` or
  `#123`; Pilot fetches it into its own workspace. Org repo suggestions as
  you type (via `gh`).
- 📊 **Cost, tokens & context always visible** — per-turn cost footers, a
  context-fill meter, budget bars, and a spend view (7-day / all-time / per
  agent).
- 🌱 **Simple mode** — plain language everywhere: approval dialogs in one
  sentence, friendly errors, no jargon. Same power underneath.
- 🔄 **Self-updating** — when a new version lands, a banner offers **Update
  now**: checkout installs rebuild themselves; zip installs download the
  latest release and swap themselves in.

## Install

### macOS

**Easiest** — download the `.dmg` from the
[latest release](https://github.com/mnoufal369/ai-pilot/releases/latest), drag
Pilot to Applications, and approve once via System Settings → Privacy &
Security → *Open Anyway* (builds are ad-hoc signed, not notarized). From then
on Pilot updates itself in-app with one click.

**From source** — fully trusted by macOS, zero prompts, and enables the
fastest self-update path:

```bash
git clone https://github.com/mnoufal369/ai-pilot.git
cd ai-pilot
yarn setup:mac    # installs deps, builds, installs to /Applications, launches
```

Requirements: [Node 20+](https://nodejs.org) and Git (`brew install node git`).
This also installs the `pilot` command — try `pilot .` in any project.

### Windows

Download `Pilot-Setup-<version>-x64.exe` from the
[latest release](https://github.com/mnoufal369/ai-pilot/releases/latest) and
run it (one SmartScreen prompt: *More info → Run anyway*). The agent runtime
is bundled; install [Git for Windows](https://git-scm.com/download/win) to
fetch repositories.

## Connect to Claude

Pilot authenticates in this order — Settings shows which one is active:

1. API key saved in **Settings** (encrypted with your OS keychain)
2. `ANTHROPIC_API_KEY` from your environment
3. Your existing **Claude Code login** on the machine

## Architecture

- **Main process** (`src/main/`) — `SessionManager` holds N concurrent Agent
  SDK query streams (one long-lived query per session). `PermissionBroker`
  bridges the SDK's `canUseTool` callback to native approval dialogs.
  `GitService` wraps system git. Streaming deltas coalesce (~33 ms) before
  crossing IPC; transcripts snapshot continuously.
- **Renderer** (`src/renderer/`) — React 19 + Tailwind 4 + zustand. Raw SDK
  messages never reach the renderer; `normalize.ts` converts them into a
  small typed `UiEvent` union.
- **Shared contract** (`src/shared/ipc.ts`) — typed IPC channels compiled
  into main, preload and renderer.
- **Security** — sandboxed renderer, context isolation, API keys encrypted
  via `safeStorage` and never exposed to the UI process, zero telemetry.
  See [SECURITY.md](SECURITY.md).

## Development

```bash
yarn install     # Node 20+ (engines are advisory; .yarnrc passes --ignore-engines)
yarn dev         # run with HMR
yarn typecheck   # TS across main/preload/renderer
yarn test        # vitest unit tests (permission rules, normalizer, transcript reducer)
```

### Building installers

```bash
yarn dist                   # macOS dmg (current arch)
yarn dist:share             # shareable mac zip: app + self-installer (arm64)
yarn dist:share:x64         # Intel build
yarn dist:share:universal   # both arches (~2× size)
bash scripts/fetch-agent-runtime.sh win32-x64 && yarn dist:win   # Windows installer
yarn release                # publish the built installers as a GitHub Release
```

Cross-arch notes, signing details and the "damaged app" explainer live in
[SIGNING.md](SIGNING.md) and the comments of `scripts/package-share.sh`.

## License

[MIT](LICENSE)

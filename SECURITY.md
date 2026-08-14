# Lantern Security Posture

## Credentials

- **API key encrypted at rest** with Electron `safeStorage` — the encryption key lives in your macOS keychain, so the settings file on disk contains only ciphertext.
- **The key never reaches the UI layer.** The renderer process only ever receives a `hasApiKey` boolean; the decrypted key exists solely in the main process and is passed to the agent subprocess via its environment.
- Claude Code login reuse reads only your account email (for display) from `~/.claude.json`; the actual OAuth credential stays in the keychain and is consumed directly by the official Claude runtime binary — Lantern never touches it.

## Process isolation

- Renderer runs with `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false` — the UI has no filesystem, network, or process access.
- All privileged operations go through a **typed, enumerated IPC contract** (`src/shared/ipc.ts`); the preload bridge exposes exactly two functions (`invoke`, `on`), nothing else.
- A strict CSP is set in `index.html` (`default-src 'self'`); the window denies all popups (`setWindowOpenHandler → deny`) and blocks navigation away from the app.
- No remote content is ever loaded — the app is fully local; the only network traffic is the agent runtime talking to `api.anthropic.com` over HTTPS.

## Agent containment

- Every tool call the agent makes flows through the SDK's permission chain; anything not explicitly allowed surfaces as a **human-in-the-loop dialog** with a faithful preview (the exact diff, the exact command).
- Permission modes are visible at all times in the composer; `Full auto` mode is visually flagged red and requires deliberate selection.
- "Always allow" rules are scoped to the agent profile and stored locally; denials are fed back to the model with reasons.
- Unattended permission requests **auto-deny after 5 minutes** (fail closed).
- Per-profile budget caps (`maxBudgetUsd`) hard-stop runaway sessions; a concurrency cap bounds process count.

## Data locality

- Sessions, transcripts, profiles and settings are stored only in `~/Library/Application Support/lantern/`.
- No telemetry, no analytics, no third-party services.

## Known limitations (v0.1)

- The dmg is unsigned/un-notarized (local distribution). Signing + notarization is required before public distribution.
- The agent subprocess inherits your user privileges — as with Claude Code itself, only point it at projects you trust it to modify, and prefer `Ask`/`Plan` modes for unfamiliar work.

#!/bin/bash
# Build Pilot from source and install it — locally built apps are fully
# trusted by macOS (no "damaged"/Gatekeeper warnings, ever).
#
#   install-mac.sh            build and install (what `yarn setup:mac` runs)
#   install-mac.sh --prepare  build only — never touches the running app
#   install-mac.sh --swap     quit, swap in the built app, relaunch
#
# The split lets the in-app updater build in the background and ask before
# restarting, instead of pulling the app out from under you.
set -e
cd "$(dirname "$0")/.."

MODE=all
case "${1:-}" in
  --prepare) MODE=prepare ;;
  --swap)    MODE=swap ;;
  "")        MODE=all ;;
  *) echo "usage: install-mac.sh [--prepare|--swap]"; exit 1 ;;
esac

# ── build ────────────────────────────────────────────────────────────────────
if [ "$MODE" != "swap" ]; then
  echo "── Pilot: build ──"

  if ! command -v node >/dev/null 2>&1; then
    echo "✗ Node.js is missing. Install it first:  brew install node   (or https://nodejs.org)"
    exit 1
  fi
  NODE_MAJOR=$(node -v | sed 's/v\([0-9]*\).*/\1/')
  if [ "$NODE_MAJOR" -lt 20 ]; then
    echo "✗ Node 20+ required — you have $(node -v). Update with:  brew upgrade node"
    exit 1
  fi
  if ! command -v yarn >/dev/null 2>&1; then
    echo "· Yarn not found — enabling it via corepack…"
    corepack enable >/dev/null 2>&1 || npm install -g yarn
  fi

  echo "· Installing dependencies (first run takes a few minutes)…"
  # A cancelled install leaves the Electron downloader orphaned, still pulling 110MB.
  pkill -f "electron/install.js" >/dev/null 2>&1 || true
  yarn install --ignore-engines --silent

  echo "· Building Pilot…"
  yarn build >/dev/null
  npx electron-builder --mac dir >/dev/null

  if [ ! -d release/mac-arm64/Pilot.app ]; then
    echo "✗ Build produced no app bundle at release/mac-arm64/Pilot.app"
    exit 1
  fi

  if [ "$MODE" = "prepare" ]; then
    echo "✓ Prepared — the new version is built and waiting to be installed."
    exit 0
  fi
fi

# ── swap ─────────────────────────────────────────────────────────────────────
echo "· Installing to /Applications…"
osascript -e 'quit app "Pilot"' >/dev/null 2>&1 || true
# Wait for the process to actually go away before replacing the bundle.
for _ in $(seq 1 60); do pgrep -x Pilot >/dev/null || break; sleep 0.25; done
if pgrep -x Pilot >/dev/null; then
  echo "✗ Pilot is still running — not touching the bundle. Quit it and rerun."
  exit 1
fi

rm -rf /Applications/Pilot.app
ditto release/mac-arm64/Pilot.app /Applications/Pilot.app

# Ad-hoc signature is enough for a self-built app, but macOS refuses to launch
# anything still flagged as downloaded.
xattr -dr com.apple.quarantine /Applications/Pilot.app 2>/dev/null || true

if ! codesign --verify --deep --strict /Applications/Pilot.app 2>/dev/null; then
  echo "✗ Signature check failed — macOS will refuse to open Pilot."
  echo "  Re-sign with:  codesign --force --deep --sign - /Applications/Pilot.app"
  exit 1
fi

# Install the `pilot` terminal command (like `code .`) — best effort.
for BIN_DIR in /opt/homebrew/bin /usr/local/bin "$HOME/.local/bin"; do
  if [ -d "$BIN_DIR" ] && [ -w "$BIN_DIR" ]; then
    cp scripts/pilot "$BIN_DIR/pilot" && chmod +x "$BIN_DIR/pilot"
    echo "· Installed the \`pilot\` command → $BIN_DIR/pilot  (try: pilot .)"
    break
  fi
done

open /Applications/Pilot.app
echo ""
echo "✓ Pilot is installed and running. Rerun this script anytime to update."

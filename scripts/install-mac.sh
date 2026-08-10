#!/bin/bash
# Build Pilot from source and install it — locally built apps are fully
# trusted by macOS (no "damaged"/Gatekeeper warnings, ever).
set -e
cd "$(dirname "$0")/.."

echo "── Pilot: build & install ──"

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

echo "· Installing to /Applications…"
osascript -e 'quit app "Pilot"' >/dev/null 2>&1 || true
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

open /Applications/Pilot.app
echo ""
echo "✓ Pilot is installed and running. Rerun this script anytime to update."

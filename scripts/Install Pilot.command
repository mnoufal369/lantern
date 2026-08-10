#!/bin/bash
# Installs Pilot on this Mac and clears the quarantine flag that makes
# macOS call unsigned AirDropped apps "damaged".
set -e
cd "$(dirname "$0")"

if [ ! -d "Pilot.app" ]; then
  echo "Pilot.app not found next to this installer. Unzip everything first."
  exit 1
fi

echo "Installing Pilot to /Applications…"
osascript -e 'quit app "Pilot"' >/dev/null 2>&1 || true
rm -rf /Applications/Pilot.app
ditto "Pilot.app" /Applications/Pilot.app
xattr -cr /Applications/Pilot.app 2>/dev/null || true

echo "Starting Pilot…"
open /Applications/Pilot.app
echo ""
echo "✓ Done — Pilot is installed. You can close this window."

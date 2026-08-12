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
xattr -dr com.apple.quarantine /Applications/Pilot.app 2>/dev/null || true

# "damaged and can't be opened" comes from a broken signature, not quarantine,
# and it has no Open Anyway override — so say what's actually wrong.
if ! codesign --verify --deep --strict /Applications/Pilot.app 2>/dev/null; then
  echo ""
  echo "✗ This copy of Pilot has an invalid signature — macOS will call it"
  echo "  \"damaged\". Please ask for a freshly built zip; nothing you do on"
  echo "  this Mac can fix it."
  exit 1
fi

echo "Starting Pilot…"
open /Applications/Pilot.app
echo ""
echo "✓ Done — Pilot is installed. You can close this window."

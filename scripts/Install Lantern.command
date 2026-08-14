#!/bin/bash
# Installs Lantern on this Mac and clears the quarantine flag that makes
# macOS call unsigned AirDropped apps "damaged".
set -e
cd "$(dirname "$0")"

if [ ! -d "Lantern.app" ]; then
  echo "Lantern.app not found next to this installer. Unzip everything first."
  exit 1
fi

echo "Installing Lantern to /Applications…"
osascript -e 'quit app "Lantern"' >/dev/null 2>&1 || true
rm -rf /Applications/Lantern.app
ditto "Lantern.app" /Applications/Lantern.app
xattr -dr com.apple.quarantine /Applications/Lantern.app 2>/dev/null || true

# "damaged and can't be opened" comes from a broken signature, not quarantine,
# and it has no Open Anyway override — so say what's actually wrong.
if ! codesign --verify --deep --strict /Applications/Lantern.app 2>/dev/null; then
  echo ""
  echo "✗ This copy of Lantern has an invalid signature — macOS will call it"
  echo "  \"damaged\". Please ask for a freshly built zip; nothing you do on"
  echo "  this Mac can fix it."
  exit 1
fi

echo "Starting Lantern…"
open /Applications/Lantern.app
echo ""
echo "✓ Done — Lantern is installed. You can close this window."

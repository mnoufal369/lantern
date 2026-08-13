#!/bin/bash
# Installs Loods on this Mac and clears the quarantine flag that makes
# macOS call unsigned AirDropped apps "damaged".
set -e
cd "$(dirname "$0")"

if [ ! -d "Loods.app" ]; then
  echo "Loods.app not found next to this installer. Unzip everything first."
  exit 1
fi

echo "Installing Loods to /Applications…"
osascript -e 'quit app "Loods"' >/dev/null 2>&1 || true
rm -rf /Applications/Loods.app
ditto "Loods.app" /Applications/Loods.app
xattr -dr com.apple.quarantine /Applications/Loods.app 2>/dev/null || true

# "damaged and can't be opened" comes from a broken signature, not quarantine,
# and it has no Open Anyway override — so say what's actually wrong.
if ! codesign --verify --deep --strict /Applications/Loods.app 2>/dev/null; then
  echo ""
  echo "✗ This copy of Loods has an invalid signature — macOS will call it"
  echo "  \"damaged\". Please ask for a freshly built zip; nothing you do on"
  echo "  this Mac can fix it."
  exit 1
fi

echo "Starting Loods…"
open /Applications/Loods.app
echo ""
echo "✓ Done — Loods is installed. You can close this window."

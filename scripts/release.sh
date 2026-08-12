#!/bin/bash
# Publish the current version's installers as a GitHub Release. Zip installs
# self-update by downloading the mac zip asset from the latest release, so
# run this as part of every ship.
set -e
cd "$(dirname "$0")/.."

VERSION=$(node -p "require('./package.json').version")
TAG="v$VERSION"
ASSETS=()
for FILE in \
  "release/Pilot-$VERSION-mac-arm64.zip" \
  "release/Pilot-$VERSION-arm64.dmg" \
  "release/Pilot-Setup-$VERSION-x64.exe"
do
  [ -f "$FILE" ] && ASSETS+=("$FILE")
done
[ ${#ASSETS[@]} -gt 0 ] || { echo "✗ No installers found for $VERSION — build first."; exit 1; }

if gh release view "$TAG" >/dev/null 2>&1; then
  echo "· Release $TAG exists — replacing assets…"
  gh release upload "$TAG" "${ASSETS[@]}" --clobber
else
  echo "· Creating release $TAG…"
  gh release create "$TAG" "${ASSETS[@]}" --title "Pilot $VERSION" --notes "See CHANGELOG.md" --latest
fi
echo "✓ $TAG published with: ${ASSETS[*]##*/}"

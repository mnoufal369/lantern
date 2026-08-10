#!/bin/bash
# electron-builder downloads Electron through got, which gives up after 10 minutes.
# On a slow link the ~120MB zips never finish in time, so fetch them with curl
# (resumable, no deadline), verify against Electron's published checksums, and
# drop them where @electron/get looks.
#   usage: bash scripts/prefetch-electron.sh x64 [arm64 …]
set -e
cd "$(dirname "$0")/.."

VERSION=$(node -p "require('./node_modules/electron/package.json').version")
[ $# -gt 0 ] || { echo "usage: $0 <x64|arm64> …"; exit 1; }

SUMS=$(mktemp -t electron-sums)
trap 'rm -f "$SUMS"' EXIT
curl -fsSL --retry 5 \
  "https://github.com/electron/electron/releases/download/v$VERSION/SHASUMS256.txt" -o "$SUMS"

for ARCH in "$@"; do
  FILE="electron-v$VERSION-darwin-$ARCH.zip"
  DEST=$(node -e "
    const {Cache} = require('./node_modules/@electron/get/dist/cjs/Cache.js');
    const au = require('./node_modules/@electron/get/dist/cjs/artifact-utils.js');
    const d = {version: '$VERSION', platform: 'darwin', arch: '$ARCH', artifactName: 'electron'};
    d.version = au.getArtifactVersion(d);
    au.getArtifactRemoteURL(d).then((url) =>
      console.log(new Cache().getCachePath(url, au.getArtifactFileName(d))))
  ")
  EXPECTED=$(grep " \*$FILE\$" "$SUMS" | cut -d' ' -f1)
  [ -n "$EXPECTED" ] || { echo "✗ No published checksum for $FILE"; exit 1; }

  if [ -f "$DEST" ] && [ "$(shasum -a 256 "$DEST" | cut -d' ' -f1)" = "$EXPECTED" ]; then
    echo "· darwin-$ARCH Electron already cached"
    continue
  fi

  echo "· Fetching darwin-$ARCH Electron ($VERSION)…"
  TMP="release/$FILE.part"
  mkdir -p release
  rm -f "$TMP"

  # GitHub's release CDN can crawl (~100KB/s here, i.e. 20+ min per zip). Try the
  # npmmirror copy first; the checksum below is GitHub's, so a mirror can only
  # ever serve us the identical file or be rejected.
  for SOURCE in \
    "https://registry.npmmirror.com/-/binary/electron/v$VERSION/$FILE" \
    "https://github.com/electron/electron/releases/download/v$VERSION/$FILE"
  do
    echo "  from ${SOURCE#https://}"
    if curl -fL --retry 5 --retry-all-errors --retry-delay 5 -C - -o "$TMP" "$SOURCE"; then
      break
    fi
    echo "  · that source failed, trying the next…"
  done
  [ -f "$TMP" ] || { echo "✗ Could not download $FILE from any source"; exit 1; }

  ACTUAL=$(shasum -a 256 "$TMP" | cut -d' ' -f1)
  if [ "$ACTUAL" != "$EXPECTED" ]; then
    echo "✗ Checksum mismatch for $FILE — refusing to cache it."
    echo "  expected $EXPECTED"
    echo "  actual   $ACTUAL"
    rm -f "$TMP"
    exit 1
  fi

  mkdir -p "$(dirname "$DEST")"
  mv "$TMP" "$DEST"
  echo "  ✓ verified and cached"
done

#!/bin/bash
# Yarn only installs the agent runtime for the machine you're on. Cross-arch and
# cross-platform builds need the others fetched by hand.
#   usage: bash scripts/fetch-agent-runtime.sh darwin-x64 [win32-x64 …]
set -e
cd "$(dirname "$0")/.."

VERSION=$(node -p "require('./node_modules/@anthropic-ai/claude-agent-sdk/package.json').version")
[ $# -gt 0 ] || { echo "usage: $0 <darwin-x64|darwin-arm64|win32-x64|…>"; exit 1; }

for TARGET in "$@"; do
  DEST="node_modules/@anthropic-ai/claude-agent-sdk-$TARGET"
  BINARY="claude"
  case "$TARGET" in win32-*) BINARY="claude.exe" ;; esac

  if [ -x "$DEST/$BINARY" ]; then
    echo "· $TARGET already present"
    continue
  fi

  echo "· Fetching $TARGET runtime ($VERSION)…"
  TGZ=$(mktemp -t agent-runtime)
  curl -fsSL --retry 3 \
    "https://registry.npmjs.org/@anthropic-ai/claude-agent-sdk-$TARGET/-/claude-agent-sdk-$TARGET-$VERSION.tgz" \
    -o "$TGZ"
  mkdir -p "$DEST"
  tar -xzf "$TGZ" -C "$DEST" --strip-components=1
  rm -f "$TGZ"

  [ -x "$DEST/$BINARY" ] || { echo "✗ $TARGET fetched but $BINARY is missing"; exit 1; }
  echo "  ✓ $DEST/$BINARY"
done

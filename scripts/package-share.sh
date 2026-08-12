#!/bin/bash
# Builds the zip you hand to a colleague: Pilot.app + the self-installing
# command + instructions. Refuses to ship a bundle macOS would call "damaged".
#   usage: bash scripts/package-share.sh [arm64|x64|universal]
set -e
cd "$(dirname "$0")/.."

ARCH="${1:-arm64}"
case "$ARCH" in
  arm64)     BUILD_FLAG="--arm64"    ; OUT_DIR="release/mac-arm64"     ; RUNTIMES="arm64" ;;
  x64)       BUILD_FLAG="--x64"      ; OUT_DIR="release/mac-x64"       ; RUNTIMES="x64" ;;
  universal) BUILD_FLAG="--universal"; OUT_DIR="release/mac-universal" ; RUNTIMES="arm64 x64" ;;
  *) echo "✗ Unknown arch \"$ARCH\" — use arm64, x64 or universal"; exit 1 ;;
esac
ELECTRON_ARCHES="$RUNTIMES"

VERSION=$(node -p "require('./package.json').version")
STAGE="release/share/Pilot $VERSION"
ZIP="release/Pilot-$VERSION-mac-$ARCH.zip"
SDK_DIR="Contents/Resources/app.asar.unpacked/node_modules/@anthropic-ai"

echo "── Packaging Pilot $VERSION ($ARCH) for sharing ──"

# The app picks an agent runtime at launch from process.arch, so every
# architecture it can boot on needs its own copy.
for RUNTIME in $RUNTIMES; do
  bash scripts/fetch-agent-runtime.sh "darwin-$RUNTIME"
done

# electron-builder's own download gives up after 10 minutes, which a slow link
# can't beat for a 120MB zip. Fetch and verify these ourselves first.
bash scripts/prefetch-electron.sh $ELECTRON_ARCHES

echo "· Building…"
yarn build >/dev/null
npx electron-builder --mac dir $BUILD_FLAG >/dev/null

echo "· Staging…"
rm -rf "release/share" "$ZIP"
mkdir -p "$STAGE"
ditto "$OUT_DIR/Pilot.app" "$STAGE/Pilot.app"
cp "scripts/Install Pilot.command" "$STAGE/Install Pilot.command"
cp "scripts/Read me first.txt" "$STAGE/Read me first.txt"
chmod +x "$STAGE/Install Pilot.command"

# electron-builder bundles every runtime present in node_modules. Each is ~270MB,
# so drop the ones this build can never execute.
for CANDIDATE in arm64 x64; do
  case " $RUNTIMES " in
    *" $CANDIDATE "*) ;;
    *) rm -rf "$STAGE/Pilot.app/$SDK_DIR/claude-agent-sdk-darwin-$CANDIDATE" ;;
  esac
done

# Pruning changed the bundle, so the build's signature no longer matches. Re-sign
# ad-hoc: enough for a self-built app, and it keeps the recipient's "Open Anyway"
# route working (a broken signature yields "damaged", which has no override).
echo "· Signing…"
codesign --force --deep --sign - "$STAGE/Pilot.app" 2>/dev/null

echo "· Verifying…"
if ! codesign --verify --deep --strict "$STAGE/Pilot.app" 2>/dev/null; then
  echo "✗ Bundle signature is invalid — recipients would see \"Pilot is damaged\"."
  exit 1
fi
echo "  signature valid ✓  ($(lipo -archs "$STAGE/Pilot.app/Contents/MacOS/Pilot"))"

# A build missing its runtime looks fine until someone starts a session and the
# agent fails to spawn — so fail here instead.
for RUNTIME in $RUNTIMES; do
  if [ ! -x "$STAGE/Pilot.app/$SDK_DIR/claude-agent-sdk-darwin-$RUNTIME/claude" ]; then
    echo "✗ Missing agent runtime for darwin-$RUNTIME — sessions would fail on that Mac."
    exit 1
  fi
  echo "  agent runtime darwin-$RUNTIME ✓"
done

echo "· Zipping…"
ditto -c -k --sequesterRsrc --keepParent "$STAGE" "$ZIP"
rm -rf "release/share"

echo ""
echo "✓ $ZIP  ($(du -h "$ZIP" | cut -f1))"
echo "  Send this file. Tell them to read \"Read me first.txt\" — the installer"
echo "  must be run from Terminal, since macOS blocks double-clicked scripts."

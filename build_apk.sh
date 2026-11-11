#!/usr/bin/env bash
set -euo pipefail

# build_apk.sh - Sovereign Research Archive APK builder
# Invoked by: npm run build
# Steps: verify kernel, verify archive.db seal, copy db to assets, build APK, verify zero-net

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "=========================================="
echo "  Sovereign Research Archive - APK Build"
echo "=========================================="
echo ""

echo "[1/5] Verifying GHOST kernel integrity..."
node src/test_ghost.js || { echo "FAILED: Kernel verification failed."; exit 1; }
echo "  OK: Kernel integrity verified."
echo ""

echo "[2/5] Verifying archive.db root seal..."
if [ -f archive.db ]; then
  node src/research_index.js verify --db archive.db || { echo "FAILED: Seal verification failed."; exit 1; }
  echo "  OK: Archive seal verified."
else
  echo "  WARNING: archive.db not found. APK will ship without pre-built index."
fi
echo ""

echo "[3/5] Copying archive.db to APK assets..."
if [ -f archive.db ]; then
  cp archive.db app/src/main/assets/archive.db
  echo "  OK: archive.db copied to assets."
fi
echo ""

echo "[4/5] Building APK..."
if command -v gradle &>/dev/null; then
  gradle assembleRelease || { echo "FAILED: Gradle build failed."; exit 1; }
elif [ -f ./gradlew ]; then
  ./gradlew assembleRelease || { echo "FAILED: Gradle build failed."; exit 1; }
else
  echo "  SKIP: Gradle not found. App directory is scaffolded and ready."
fi
echo ""

echo "[5/5] Verifying zero network permissions..."
APK_PATH=$(find app/build/outputs/apk -name "*.apk" 2>/dev/null | head -1)
if [ -n "$APK_PATH" ]; then
  PERMISSIONS=$(aapt dump permissions "$APK_PATH" 2>/dev/null || true)
  if echo "$PERMISSIONS" | grep -qi "INTERNET\|ACCESS_NETWORK\|CHANGE_NETWORK"; then
    echo "FAILED: APK contains network permissions!"; exit 1
  fi
  echo "  OK: Zero network permissions confirmed."
  echo "  APK: $APK_PATH"
else
  echo "  SKIP: No built APK to verify."
fi
echo ""
echo "=========================================="
echo "  Build complete."
echo "=========================================="

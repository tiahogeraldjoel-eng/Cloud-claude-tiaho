#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
# Coffre-Fort Vault (Android) — Script de compilation APK
# Usage : ./build.sh [debug|release]
# ──────────────────────────────────────────────────────────────
set -e
MODE="${1:-debug}"
DIR="$(cd "$(dirname "$0")" && pwd)"
OUT_DIR="$DIR/output"

echo "=========================================="
echo "  Coffre-Fort Vault — Build $MODE"
echo "=========================================="

check_sdk() {
  if [ -z "$ANDROID_HOME" ] && [ -z "$ANDROID_SDK_ROOT" ]; then
    echo "⚠  ANDROID_HOME non défini."
    echo "   Définissez-le : export ANDROID_HOME=/path/to/android/sdk"
    echo ""
    echo "   Vous pouvez aussi ouvrir ce dossier dans Android Studio"
    echo "   et utiliser Build > Build Bundle(s)/APK(s) > Build APK(s)"
    exit 1
  fi
}

build_debug() {
  echo "→ Compilation APK Debug..."
  cd "$DIR"
  ./gradlew assembleDebug --no-daemon --stacktrace
  mkdir -p "$OUT_DIR"
  cp app/build/outputs/apk/debug/app-debug.apk "$OUT_DIR/CoffreFortVault_debug.apk"
  echo "✓ APK Debug : $OUT_DIR/CoffreFortVault_debug.apk"
}

build_release() {
  echo "→ Compilation APK Release..."
  cd "$DIR"
  ./gradlew assembleRelease --no-daemon --stacktrace
  mkdir -p "$OUT_DIR"
  cp app/build/outputs/apk/release/app-release*.apk "$OUT_DIR/CoffreFortVault_release.apk"
  echo "✓ APK Release : $OUT_DIR/CoffreFortVault_release.apk"
}

chmod +x "$DIR/gradlew" 2>/dev/null || true

case "$MODE" in
  debug)   check_sdk; build_debug ;;
  release) check_sdk; build_release ;;
  studio)
    echo "→ Ouverture dans Android Studio..."
    if command -v studio &>/dev/null; then studio "$DIR"
    elif [ -d "/Applications/Android Studio.app" ]; then open -a "Android Studio" "$DIR"
    else echo "Ouvrez manuellement ce dossier dans Android Studio"; fi
    ;;
  *)
    echo "Usage: $0 [debug|release|studio]"
    exit 1
    ;;
esac

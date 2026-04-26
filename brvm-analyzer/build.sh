#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
# BRVM Analyser — Script de compilation APK
# Usage : ./build.sh [debug|release]
# ──────────────────────────────────────────────────────────────
set -e
MODE="${1:-debug}"
ANDROID_DIR="$(cd "$(dirname "$0")/android" && pwd)"
OUT_DIR="$(dirname "$0")/output"

echo "=========================================="
echo "  BRVM Analyser — Build $MODE"
echo "=========================================="

# Vérifications prérequis
check_sdk() {
  if [ -z "$ANDROID_HOME" ] && [ -z "$ANDROID_SDK_ROOT" ]; then
    echo "⚠  ANDROID_HOME non défini."
    echo "   Définissez-le : export ANDROID_HOME=/path/to/android/sdk"
    echo ""
    echo "   Vous pouvez aussi ouvrir le dossier 'android/' dans Android Studio"
    echo "   et utiliser Build > Build Bundle(s)/APK(s) > Build APK(s)"
    exit 1
  fi
}

build_debug() {
  echo "→ Compilation APK Debug..."
  cd "$ANDROID_DIR"
  ./gradlew assembleDebug --no-daemon --stacktrace
  mkdir -p "$OUT_DIR"
  cp app/build/outputs/apk/debug/app-debug.apk "$OUT_DIR/BRVM_Analyser_debug.apk"
  echo "✓ APK Debug : $OUT_DIR/BRVM_Analyser_debug.apk"
}

build_release() {
  echo "→ Compilation APK Release..."
  cd "$ANDROID_DIR"
  ./gradlew assembleRelease --no-daemon --stacktrace
  mkdir -p "$OUT_DIR"
  cp app/build/outputs/apk/release/app-release*.apk "$OUT_DIR/BRVM_Analyser_release.apk"
  echo "✓ APK Release : $OUT_DIR/BRVM_Analyser_release.apk"
}

install_apk() {
  APK="$OUT_DIR/BRVM_Analyser_${MODE}.apk"
  if [ -f "$APK" ]; then
    echo "→ Installation sur l'appareil connecté..."
    "$ANDROID_HOME/platform-tools/adb" install -r "$APK" && echo "✓ Installé avec succès"
  fi
}

# Rendre gradlew exécutable
chmod +x "$ANDROID_DIR/gradlew" 2>/dev/null || true

case "$MODE" in
  debug)   check_sdk; build_debug;   install_apk ;;
  release) check_sdk; build_release; install_apk ;;
  studio)
    echo "→ Ouverture dans Android Studio..."
    if command -v studio &>/dev/null; then studio "$ANDROID_DIR"
    elif [ -d "/Applications/Android Studio.app" ]; then open -a "Android Studio" "$ANDROID_DIR"
    else echo "Ouvrez manuellement le dossier 'android/' dans Android Studio"; fi
    ;;
  *)
    echo "Usage: $0 [debug|release|studio]"
    exit 1
    ;;
esac

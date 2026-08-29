#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
# Coffre-Fort Administratif Hors-Ligne — Script de compilation
# Compile l'application Python en exécutable autonome (PyInstaller).
#
# ⚠ PyInstaller ne fait pas de compilation croisée : exécutez ce
#   script sur le même OS que celui visé par l'exécutable final
#   (Linux → binaire Linux, Windows → .exe, macOS → binaire macOS).
#   Pour un .exe Windows depuis Linux/macOS, utilisez le workflow
#   GitHub Actions "Build Coffre-Fort Vault" (onglet Actions du dépôt).
#
# Usage : ./build.sh [onefile|onedir]
# ──────────────────────────────────────────────────────────────
set -e
MODE="${1:-onefile}"
DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=========================================="
echo "  Coffre-Fort Hors-Ligne — Build ($MODE)"
echo "=========================================="

cd "$DIR"

echo "→ Installation des dépendances..."
pip install -r requirements.txt

FLAG="--onefile"
if [ "$MODE" = "onedir" ]; then
  FLAG="--onedir"
fi

echo "→ Compilation avec PyInstaller ($FLAG)..."
pyinstaller $FLAG --windowed --noconfirm \
  --name "CoffreFortVault" \
  vault_app.py

echo "✓ Exécutable généré dans : $DIR/dist/"

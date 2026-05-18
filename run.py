#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
BRVM Analytics -- Point d'entree.
Lancer avec : python run.py
Acces : http://localhost:8000
"""
import sys
import subprocess
import io

# Force UTF-8 sur les terminaux Windows
if sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

def check_dependencies():
    required = ["fastapi", "uvicorn", "requests", "bs4", "pandas", "numpy", "apscheduler"]
    missing = []
    for pkg in required:
        try:
            __import__(pkg)
        except ImportError:
            missing.append(pkg)
    return missing

if __name__ == "__main__":
    print("=" * 60)
    print("  BRVM Analytics — Aide à la Décision")
    print("  Bourse Régionale des Valeurs Mobilières")
    print("=" * 60)

    missing = check_dependencies()
    if missing:
        print(f"\n[!] Dépendances manquantes: {', '.join(missing)}")
        print("    Installation en cours...")
        subprocess.run(
            [sys.executable, "-m", "pip", "install", "-r", "requirements.txt"],
            check=True
        )
        print("[OK] Dépendances installées\n")

    try:
        import uvicorn
        print("\n[OK] Serveur démarré sur http://localhost:8000")
        print("[OK] Documentation API: http://localhost:8000/docs")
        print("[i] Appuyez sur Ctrl+C pour arrêter\n")
        uvicorn.run(
            "app:app",
            host="0.0.0.0",
            port=8000,
            reload=False,
            log_level="info",
        )
    except KeyboardInterrupt:
        print("\n[i] Arrêt du serveur.")

#!/usr/bin/env bash
# Lanceur BRVM Analyzer
cd "$(dirname "$(readlink -f "$0")")"

# Ouvrir le navigateur après 2s (laisse le temps à Streamlit de démarrer)
(sleep 2 && xdg-open http://localhost:8501 2>/dev/null || python3 -m webbrowser http://localhost:8501) &

streamlit run app.py --server.port 8501 --server.headless true

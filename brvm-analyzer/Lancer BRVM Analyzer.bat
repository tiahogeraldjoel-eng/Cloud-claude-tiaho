@echo off
title BRVM Analyzer - Demarrage
color 1F
echo.
echo  ============================================
echo    BRVM ANALYZER - Lancement en cours...
echo  ============================================
echo.

:: Verifier que Python est installe
python --version >nul 2>&1
if errorlevel 1 (
    echo  [ERREUR] Python n'est pas installe sur ce PC.
    echo.
    echo  Telechargez Python sur : https://www.python.org/downloads/
    echo  Cochez "Add Python to PATH" lors de l'installation.
    echo.
    pause
    exit /b 1
)

echo  Python detecte. Installation des dependances...
echo.
pip install streamlit xlsxwriter pillow --quiet --disable-pip-version-check

echo.
echo  Demarrage de l'application...
echo  Le navigateur va s'ouvrir dans quelques secondes.
echo.
echo  Pour arreter : fermez cette fenetre ou appuyez Ctrl+C
echo  ============================================
echo.

:: Ouvrir le navigateur apres 3 secondes
start "" timeout /t 3 /nobreak >nul
start "" "http://localhost:8501"

:: Lancer Streamlit
streamlit run "%~dp0app.py" --server.port 8501 --server.headless true --browser.gatherUsageStats false

pause

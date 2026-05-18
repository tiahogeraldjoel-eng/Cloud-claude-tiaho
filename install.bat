@echo off
chcp 65001 >nul
echo ============================================================
echo   BRVM Analytics — Installation
echo ============================================================
echo.

:: Vérifier si Python est déjà installé
python --version >nul 2>&1
IF %ERRORLEVEL% EQU 0 (
    echo [OK] Python est déjà installé.
    python --version
    goto install_deps
)

echo [!] Python n'est pas installé. Installation via winget...
winget install -e --id Python.Python.3.12 --silent --accept-source-agreements --accept-package-agreements
IF %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERREUR] winget a échoué. Veuillez installer Python manuellement:
    echo   1. Rendez-vous sur https://www.python.org/downloads/
    echo   2. Téléchargez Python 3.12 pour Windows
    echo   3. Cochez "Add Python to PATH" lors de l'installation
    echo   4. Relancez ce script après l'installation
    pause
    exit /b 1
)

:: Recharger le PATH pour trouver le nouvel Python
set "PATH=%LOCALAPPDATA%\Programs\Python\Python312;%LOCALAPPDATA%\Programs\Python\Python312\Scripts;%PATH%"

echo.
echo [OK] Python installé avec succès.

:install_deps
echo.
echo [i] Installation des dépendances Python...
python -m pip install --upgrade pip --quiet
python -m pip install -r requirements.txt
IF %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERREUR] Échec de l'installation des dépendances.
    pause
    exit /b 1
)

echo.
echo ============================================================
echo   Installation terminée avec succès!
echo   Lancez l'application avec: start.bat
echo ============================================================
pause

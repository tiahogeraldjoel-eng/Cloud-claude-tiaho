@echo off
chcp 65001 >nul
echo ============================================================
echo   BRVM Analytics -- Demarrage
echo   Acces: http://localhost:8000
echo ============================================================
echo.

set PYTHON_CMD=C:\Users\hp\AppData\Local\Programs\Python\Python312\python.exe

IF NOT EXIST "%PYTHON_CMD%" (
    echo [ERREUR] Python introuvable. Lancez d'abord install.bat
    pause
    exit /b 1
)

echo [OK] Python 3.12 trouve
echo [i]  Demarrage du serveur...
echo [i]  Ouvrez http://localhost:8000 dans votre navigateur
echo [i]  Appuyez sur Ctrl+C pour arreter
echo.

cd /d "%~dp0"
"%PYTHON_CMD%" run.py

pause
